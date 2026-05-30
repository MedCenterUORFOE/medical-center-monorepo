import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getUserSession } from '@/lib/auth';

// -----------------------------------------------------------------------------
// ZOD VALIDATION SCHEMA
// -----------------------------------------------------------------------------
const bookAppointmentSchema = z.object({
  doctor_id: z.string().uuid("Invalid Doctor ID"),
  scheduled_time: z.string().datetime("Must be a valid ISO DateTime string"),
  reason: z.string().max(500, "Reason cannot exceed 500 characters").optional(),
});

// ============================================================================
// POST: Book a new medical consultation appointment
// ============================================================================
export async function POST(request: Request) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    // Strict Limit: 5 booking attempts per minute to prevent slot spamming
    if (!checkRateLimit(ip, 5, 60000)) { 
      return errorResponse('Too many booking attempts. Please slow down.', 429);
    }

    // === PRODUCTION AUTH & RBAC BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
    // Only Patients (Students & Academic Staff) book appointments via the mobile app
    if (session.role !== "STUDENT" && session.role !== "ACADEMIC_STAFF") {
      return apiErrors.forbidden("Only registered patients can book appointments.");
    }
    const patientId = session.id;

    const body = await request.json();
    const validatedData = bookAppointmentSchema.parse(body);
    const requestedTime = new Date(validatedData.scheduled_time);

    // 1. Validate the time is not in the past
    if (requestedTime < new Date()) {
      return errorResponse("Cannot book appointments in the past.", 400);
    }

    // 2. Verify Patient Profile exists
    const patientProfile = await prisma.patientProfile.findUnique({
      where: { user_id: patientId },
      include: { user: { select: { name: true } } }
    });

    if (!patientProfile) {
      return errorResponse("No verified medical profile on file. Please complete registration.", 403);
    }

    // 3. Verify Doctor exists
    const doctor = await prisma.doctor.findUnique({
      where: { doctor_id: validatedData.doctor_id },
      include: { staff: { include: { user: { select: { name: true } } } } }
    });

    if (!doctor) {
      return apiErrors.notFound("Selected doctor not found.");
    }

    // ====================================================================
    // --- THE GUARDRAIL: Check if appointments are paused globally ---
    // ====================================================================
    const pauseSetting = await prisma.systemSetting.findUnique({
      where: { key: "APPOINTMENTS_PAUSED" }
    });

    // If the setting exists and is set to "true", kick the request out immediately
    if (pauseSetting?.value === "true") {
      return errorResponse("Appointment booking is temporarily paused by the administration. Please try again later or visit the medical center for emergencies.", 503);
    }
    // ====================================================================

    // --- CONCURRENCY LOCK & TRANSACTION ---
    const result = await prisma.$transaction(async (tx) => {
      
      // A. Explicit Concurrency Check: Is the slot still open?
      const existingAppointment = await tx.appointment.findFirst({
        where: {
          doctor_id: validatedData.doctor_id,
          scheduled_time: requestedTime,
          status: 'SCHEDULED'
        }
      });

      if (existingAppointment) {
        throw new Error("SLOT_TAKEN");
      }

      // B. Create the Appointment
      const newAppointment = await tx.appointment.create({
        data: {
          patient_id: patientId,
          doctor_id: validatedData.doctor_id,
          scheduled_time: requestedTime,
          reason: validatedData.reason,
          status: 'SCHEDULED'
        }
      });

      const formattedTime = requestedTime.toLocaleString('en-US', { 
        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
      });

      // C. Dispatch In-App Notification to the Patient
      await tx.notification.create({
        data: {
          user_id: patientId,
          type: "APPOINTMENT_CONFIRMED",
          message: `Your appointment with ${doctor.staff.user.name} is confirmed for ${formattedTime}.`,
        }
      });

      // D. Dispatch In-App Notification to the Doctor
      await tx.notification.create({
        data: {
          user_id: doctor.doctor_id, // FIX: Used the shared primary key!
          type: "NEW_APPOINTMENT",
          message: `New appointment booked by ${patientProfile.user.name} for ${formattedTime}.`,
        }
      });

      // E. Write the Immutable Audit Ledger
      await tx.auditLog.create({
        data: {
          user_id: patientId,
          action: "BOOKED_APPOINTMENT",
          entity_type: "Appointment",
          entity_id: newAppointment.id,
          ip_address: ip,
          details: JSON.stringify({ 
            doctor_id: validatedData.doctor_id,
            scheduled_time: validatedData.scheduled_time 
          }),
        }
      });

      return newAppointment;
    });

    return successResponse(
      { appointment_id: result.id }, 
      "Appointment successfully booked.", 
      201
    );

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    
    // Catch the concurrency lock throw
    if (error instanceof Error && error.message === "SLOT_TAKEN") {
      return errorResponse("This time slot was just booked by another patient. Please select another time.", 409);
    }

    console.error("Appointment Booking Error:", error);
    return apiErrors.internal();
  }
}
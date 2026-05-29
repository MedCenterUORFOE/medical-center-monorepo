import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response'; // FIX: Restored errorResponse
import { checkRateLimit } from '@/lib/rate-limiter';
import { getUserSession } from '@/lib/auth';

const dayScheduleSchema = z.object({
  day_of_week: z.number().int().min(0).max(6, "Day must be between 0 (Sunday) and 6 (Saturday)"),
  start_time: z.string().datetime("Must be a valid ISO DateTime string"),
  end_time: z.string().datetime("Must be a valid ISO DateTime string"),
  is_available: z.boolean().default(true),
});

const availabilitySchema = z.object({
  schedule: z.array(dayScheduleSchema).max(7, "Cannot submit more than 7 days"),
});

// ============================================================================
// PUT: Update Weekly Availability Schedule for Doctors, Nurses, or Pharmacists
// ============================================================================
export async function PUT(request: Request) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    if (!checkRateLimit(ip, 20, 60000)) { 
      return errorResponse('Too many schedule updates. Please slow down.', 429);
    }

    // === PRODUCTION AUTH & RBAC BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
    if (session.role !== "DOCTOR" && session.role !== "NURSE" && session.role !== "PHARMACIST") {
      return apiErrors.forbidden("Only medical and pharmacy staff can set availability schedules.");
    }
    const staffId = session.id;
    const staffRole = session.role;

    const body = await request.json();
    const validatedData = availabilitySchema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      
      if (staffRole === "DOCTOR") {
        // Wipe old schedule
        await tx.doctorAvailability.deleteMany({
          where: { doctor_id: staffId }
        });

        // Insert new schedule
        if (validatedData.schedule.length > 0) {
          await tx.doctorAvailability.createMany({
            data: validatedData.schedule.map(day => ({
              doctor_id: staffId,
              day_of_week: day.day_of_week,
              start_time: new Date(day.start_time),
              end_time: new Date(day.end_time),
              is_available: day.is_available
            }))
          });
        }
      } else if (staffRole === "NURSE") {
        // Wipe old schedule
        await tx.nurseAvailability.deleteMany({
          where: { nurse_id: staffId }
        });

        // Insert new schedule
        if (validatedData.schedule.length > 0) {
          await tx.nurseAvailability.createMany({
            data: validatedData.schedule.map(day => ({
              nurse_id: staffId,
              day_of_week: day.day_of_week,
              start_time: new Date(day.start_time),
              end_time: new Date(day.end_time),
              is_available: day.is_available
            }))
          });
        }
      } else if (staffRole === "PHARMACIST") {
        // Wipe old schedule
        await tx.pharmacistAvailability.deleteMany({
          where: { pharmacist_id: staffId }
        });

        // Insert new schedule
        if (validatedData.schedule.length > 0) {
          await tx.pharmacistAvailability.createMany({
            data: validatedData.schedule.map(day => ({
              pharmacist_id: staffId,
              day_of_week: day.day_of_week,
              start_time: new Date(day.start_time),
              end_time: new Date(day.end_time),
              is_available: day.is_available
            }))
          });
        }
      }

      const entityTypeMap: Record<string, string> = {
        "DOCTOR": "DoctorAvailability",
        "NURSE": "NurseAvailability",
        "PHARMACIST": "PharmacistAvailability"
      };

      // Log the administrative action
      await tx.auditLog.create({
        data: {
          user_id: staffId,
          action: "UPDATED_AVAILABILITY_SCHEDULE",
          entity_type: entityTypeMap[staffRole] || "Availability",
          entity_id: staffId,
          ip_address: ip,
          details: JSON.stringify({ days_configured: validatedData.schedule.length }),
        }
      });

      return { scheduled_days: validatedData.schedule.length };
    });

    return successResponse(result, "Weekly availability schedule updated successfully.");

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error("Availability Update Error:", error);
    return apiErrors.internal();
  }
}
import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';

// ✅ App එකෙන් එවන දවස්/වෙලාවල් නිවැරදිද කියලා චෙක් කරන Validation එක
const rescheduleSchema = z.object({
  scheduled_time: z.string().datetime("Must be a valid ISO DateTime string"),
  reason: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { appointmentId: string } }
) {
  try {
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
    const { appointmentId } = params;
    const body = await request.json();
    const validatedData = rescheduleSchema.parse(body);

    // 1. දැනට තියෙන Appointment එක Database එකෙන් හොයාගන්නවා
    const existingAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId } // 👈 Prisma එකට අනුව 'id' පාවිච්චි කර ඇත
    });

    if (!existingAppointment) {
      return apiErrors.notFound("Appointment not found.");
    }

    // 2. ආරක්ෂක පරීක්ෂාව (තමන්ගේ ඒව විතරයි වෙනස් කරන්න පුළුවන්)
    if (['STUDENT', 'ACADEMIC_STAFF'].includes(session.role)) {
      if (existingAppointment.patient_id !== session.id) {
        return errorResponse("Forbidden. You can only reschedule your own appointments.", 403);
      }
    } else if (!["DOCTOR", "NURSE", "ADMIN"].includes(session.role)) {
      return apiErrors.forbidden("Unauthorized role.");
    }

    // 3. Database එක Update කිරීම සහ Audit Log එක ලිවීම
    const result = await prisma.$transaction(async (tx) => {
      
      const updatedAppointment = await tx.appointment.update({
        where: { id: appointmentId },
        data: { 
          scheduled_time: new Date(validatedData.scheduled_time),
          reason: validatedData.reason || existingAppointment.reason,
          status: 'SCHEDULED' // 👈 ආයෙත් Scheduled බවට පත් කරනවා
        }
      });

      const forwardedFor = request.headers.get('x-forwarded-for');
      const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';

      // Record එකක් තියාගන්නවා වෙලාව වෙනස් කළා කියලා
      await tx.auditLog.create({
        data: {
          user_id: session.id,
          action: "APPOINTMENT_RESCHEDULED",
          entity_type: "Appointment",
          entity_id: appointmentId,
          ip_address: ip,
          details: JSON.stringify({ 
            old_time: existingAppointment.scheduled_time, 
            new_time: validatedData.scheduled_time 
          }),
        }
      });

      return updatedAppointment;
    });

    return successResponse({ appointment: result }, "Appointment rescheduled successfully.");

  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.errors);
    console.error("❌ Reschedule Error:", error);
    return apiErrors.internal();
  }
}
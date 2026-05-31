// apps/web/app/api/appointments/[appointmentId]/status/route.ts
import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';

const updateStatusSchema = z.object({
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']),
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
    const validatedData = updateStatusSchema.parse(body);

    const existingAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId }
    });

    if (!existingAppointment) {
      return apiErrors.notFound("Appointment not found.");
    }

    // === CONDITIONAL RBAC ===
    if (['STUDENT', 'ACADEMIC_STAFF'].includes(session.role)) {
      // Rule A: Patients can ONLY cancel
      if (validatedData.status !== 'CANCELLED') {
        return errorResponse("Patients are only permitted to cancel appointments.", 403);
      }
      // Rule B: Patients can ONLY cancel THEIR OWN appointments
      if (existingAppointment.patient_id !== session.id) {
        return errorResponse("Forbidden. You can only cancel your own appointments.", 403);
      }
    } else if (!["DOCTOR", "NURSE", "ADMIN"].includes(session.role)) {
      return apiErrors.forbidden("Unauthorized role.");
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedAppointment = await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: validatedData.status }
      });

      const forwardedFor = request.headers.get('x-forwarded-for');
      const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';

      await tx.auditLog.create({
        data: {
          user_id: session.id,
          action: `APPOINTMENT_MARKED_${validatedData.status}`,
          entity_type: "Appointment",
          entity_id: appointmentId,
          ip_address: ip,
          details: JSON.stringify({ old_status: existingAppointment.status, new_status: validatedData.status }),
        }
      });

      return updatedAppointment;
    });

    return successResponse({ status: result.status }, `Appointment marked as ${result.status}.`);

  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.errors);
    return apiErrors.internal();
  }
}
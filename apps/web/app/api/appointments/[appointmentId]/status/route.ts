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
    // === AUTH & RBAC ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
    // Only Doctors, Nurses, and Admins can update appointment statuses
    const isMedicalStaff = ["DOCTOR", "NURSE", "ADMIN"].includes(session.role);
    if (!isMedicalStaff) {
      return apiErrors.forbidden("Only medical staff can update appointment statuses.");
    }
    
    const staffId = session.id;
    const { appointmentId } = params;

    const body = await request.json();
    const validatedData = updateStatusSchema.parse(body);

    // Verify appointment exists
    const existingAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId }
    });

    if (!existingAppointment) {
      return apiErrors.notFound("Appointment not found.");
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update the status
      const updatedAppointment = await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: validatedData.status }
      });

      // 2. Write Audit Log
      const forwardedFor = request.headers.get('x-forwarded-for');
      const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';

      await tx.auditLog.create({
        data: {
          user_id: staffId,
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
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error("Update Appointment Status Error:", error);
    return apiErrors.internal();
  }
}
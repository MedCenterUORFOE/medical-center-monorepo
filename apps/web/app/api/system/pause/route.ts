// apps/web/app/api/system/pause/route.ts

import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';

const togglePauseSchema = z.object({
  is_paused: z.boolean({ required_error: "is_paused boolean is required" }),
});

// ============================================================================
// PATCH: Toggle Global Appointment Booking Status
// ============================================================================
export async function PATCH(request: Request) {
  try {
    // === STRICT AUTH & RBAC ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
    // Only Admins and Doctors have the authority to pause the system
    if (session.role !== "ADMIN" && session.role !== "DOCTOR") {
      return apiErrors.forbidden("Only Administrators and Doctors can toggle system settings.");
    }
    const staffId = session.id;

    const body = await request.json();
    const validatedData = togglePauseSchema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Upsert the setting (Update if it exists, Create if it doesn't)
      const setting = await tx.systemSetting.upsert({
        where: { key: "APPOINTMENTS_PAUSED" },
        update: {
          value: String(validatedData.is_paused),
          updated_by: staffId
        },
        create: {
          key: "APPOINTMENTS_PAUSED",
          value: String(validatedData.is_paused),
          updated_by: staffId
        }
      });

      // 2. Write the Audit Log so we know WHO paused the system
      const forwardedFor = request.headers.get('x-forwarded-for');
      const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';

      await tx.auditLog.create({
        data: {
          user_id: staffId,
          action: "TOGGLED_APPOINTMENT_PAUSE",
          entity_type: "SystemSetting",
          entity_id: "APPOINTMENTS_PAUSED",
          ip_address: ip,
          details: JSON.stringify({ is_paused: validatedData.is_paused }),
        }
      });

      return setting;
    });

    const statusMessage = validatedData.is_paused 
      ? "Appointment booking has been PAUSED." 
      : "Appointment booking has been RESUMED.";

    return successResponse(
      { is_paused: result.value === "true" }, 
      statusMessage
    );

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error("Toggle Appointment Pause Error:", error);
    return apiErrors.internal();
  }
}
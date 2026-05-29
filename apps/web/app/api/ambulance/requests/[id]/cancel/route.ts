import { prisma } from '@medical-center/db';
import { sendPushNotification } from '@/lib/firebase-admin';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { z } from 'zod';
import { getUserSession } from '@/lib/auth';

// -----------------------------------------------------------------------------
// ZOD VALIDATION SCHEMA
// -----------------------------------------------------------------------------
const cancelSchema = z.object({
  reason: z.string().optional(),
});

// ============================================================================
// PATCH: Cancel an Emergency Request
// ============================================================================
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const requestId = params.id;
    const body = await request.json().catch(() => ({})); // Allow empty body
    const { reason } = cancelSchema.parse(body);

    // === PRODUCTION AUTH BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    const userId = session.id;

    // 1. Fetch the Request to ensure it exists and check its current state
    const emergencyRequest = await prisma.emergencyRequest.findUnique({
      where: { id: requestId },
      include: { 
        driver: { include: { user: true } },
        requester: true
      }
    });

    if (!emergencyRequest) {
      return apiErrors.notFound("Emergency request not found.");
    }

    if (['COMPLETED', 'CANCELLED'].includes(emergencyRequest.status)) {
      return errorResponse(`Cannot cancel a request that is already ${emergencyRequest.status}.`, 400);
    }

    // 2. Update the Request Status
    const updatedRequest = await prisma.emergencyRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED' }
    });

    // 3. Free up the Driver (If one was already assigned)
    if (emergencyRequest.driver_id) {
      await prisma.driverAvailability.update({
        where: { driver_id: emergencyRequest.driver_id },
        data: { is_available: true }
      });

      // 4a. Fire Push Notification to the Driver to stand down
      const driverToken = emergencyRequest.driver?.user?.fcm_token;
      if (driverToken) {
        await sendPushNotification({
          tokens: driverToken,
          title: "❌ Request Cancelled",
          body: "The emergency request has been cancelled. You are back online.",
          data: {
            type: "EMERGENCY_CANCELLED",
            request_id: requestId,
          }
        });
      }
    }

    // 4b. Fire Push Notification to the Patient to confirm cancellation
    const patientToken = emergencyRequest.requester?.fcm_token;
    if (patientToken) {
      await sendPushNotification({
        tokens: patientToken,
        title: "❌ Emergency Cancelled",
        body: reason ? `Cancellation reason: ${reason}` : "Your emergency request has been safely cancelled.",
        data: {
          type: "EMERGENCY_CANCELLED",
          request_id: requestId,
        }
      });
    }

    // 5. Audit Trail
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown-ip';
    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action: "EMERGENCY_CANCELLED",
        entity_type: "EmergencyRequest",
        entity_id: requestId,
        ip_address: ip,
        details: JSON.stringify({ reason }),
      }
    });

    return successResponse(updatedRequest, "Emergency request successfully cancelled.");

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    
    console.error("Emergency Cancellation Error:", error);
    return apiErrors.internal();
  }
}
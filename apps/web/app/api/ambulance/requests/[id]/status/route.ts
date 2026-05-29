import { prisma } from '@medical-center/db';
import { sendPushNotification } from '@/lib/firebase-admin';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { z } from 'zod';
import { getUserSession } from '@/lib/auth';

// -----------------------------------------------------------------------------
// ZOD VALIDATION SCHEMA
// -----------------------------------------------------------------------------
const statusSchema = z.object({
  status: z.enum(["ARRIVED", "COMPLETED"]),
  notes: z.string().optional(), // Optional notes when closing the run
});

// ============================================================================
// PATCH: Update Emergency Status (Arrived / Completed)
// ============================================================================
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const requestId = params.id;
    const body = await request.json();
    const { status, notes } = statusSchema.parse(body);
    
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown-ip';

    // === PRODUCTION AUTH BLOCK ===
    const session = await getUserSession();
    if (!session?.id || session.role !== 'DRIVER') return apiErrors.unauthorized();
    const userId = session.id;

    // 1. Verify Request and Driver Ownership
    const emergencyRequest = await prisma.emergencyRequest.findUnique({
      where: { id: requestId },
      include: { requester: true }
    });

    if (!emergencyRequest) {
      return apiErrors.notFound("Emergency request not found.");
    }
    
    // Security check: Only the assigned driver can update this request
    if (emergencyRequest.driver_id !== userId) {
      return apiErrors.unauthorized("You are not assigned to this emergency.");
    }

    // 2. Update the Request Status
    const updatedRequest = await prisma.emergencyRequest.update({
      where: { id: requestId },
      data: { status }
    });

    // 3. Handle specific lifecycle events
    if (status === 'COMPLETED') {
      // Create the official clinical Emergency Record
      await prisma.emergencyRecord.create({
        data: {
          request_id: requestId,
          hospital_name: "University Medical Center", // Defaulting for internal runs
          arrived_at: new Date(),
          notes: notes
        }
      });

      // Put the driver back ONLINE automatically!
      await prisma.driverAvailability.update({
        where: { driver_id: userId },
        data: { is_available: true }
      });
    }

    // 4. Fire Push Notification to the Patient
    const patientToken = emergencyRequest.requester?.fcm_token;

    if (patientToken) {
      const title = status === 'ARRIVED' ? "🚨 Ambulance Arrived" : "✅ Emergency Completed";
      const message = status === 'ARRIVED' 
        ? "Your ambulance is outside. Please proceed to the vehicle if possible."
        : "You have arrived at the medical center. Get well soon!";

      await sendPushNotification({
        tokens: patientToken,
        title: title,
        body: message,
        data: {
          type: "EMERGENCY_UPDATE",
          status: status,
          request_id: requestId,
        }
      });
    }

    // 5. Audit Trail
    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action: `EMERGENCY_STATUS_UPDATED_${status}`,
        entity_type: "EmergencyRequest",
        entity_id: requestId,
        ip_address: ip,
        details: notes ? JSON.stringify({ notes }) : undefined,
      }
    });

    return successResponse(updatedRequest, `Emergency status updated to ${status}.`);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    
    console.error("Emergency Status Update Error:", error);
    return apiErrors.internal();
  }
}
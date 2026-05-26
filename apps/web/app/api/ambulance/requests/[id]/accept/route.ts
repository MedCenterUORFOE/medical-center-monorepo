import { prisma } from '@medical-center/db';
import { sendPushNotification } from '@/lib/firebase-admin';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';

// ============================================================================
// POST: Driver Accepts an Emergency Request (Atomic Lock)
// ============================================================================
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const requestId = params.id;

    // === PRODUCTION AUTH BLOCK ===
    // const session = await getUserSession();
    // if (!session?.id || session.role !== 'DRIVER') return apiErrors.unauthorized();
    // const userId = session.id;

    // === LOCAL TESTING MOCK ===
    const userId = "test-driver-id";

    // 1. Get the Driver ID mapped to this User (Aligned with your schema)
    const driver = await prisma.ambulanceDriver.findUnique({
      where: { driver_id: userId }
    });

    if (!driver) {
      return apiErrors.notFound("Driver profile not found.");
    }

    // ------------------------------------------------------------------------
    // 2. THE ATOMIC LOCK (CRITICAL SECTION)
    // ------------------------------------------------------------------------
    const updateResult = await prisma.emergencyRequest.updateMany({
      where: {
        id: requestId,
        status: 'PENDING' // The lock: Only update if it is STILL pending!
      },
      data: {
        status: 'DISPATCHED', // Updated to match your schema's EmergencyStatus enum
        driver_id: driver.driver_id,
      }
    });

    // 3. Evaluate the Race Condition
    if (updateResult.count === 0) {
      const checkReq = await prisma.emergencyRequest.findUnique({ where: { id: requestId } });
      if (!checkReq) return apiErrors.notFound("Emergency request not found.");
      
      return errorResponse("Too late! Another driver already accepted this emergency.", 409);
    }

    // 4. Take the Driver offline
    await prisma.driverAvailability.updateMany({
      where: { driver_id: driver.driver_id },
      data: { is_available: false }
    });

    // 5. Fire Push Notification to the Patient
    const emergencyRequest = await prisma.emergencyRequest.findUnique({
      where: { id: requestId },
      include: { requester: true }
    });

    const patientToken = emergencyRequest?.requester?.fcm_token;

    if (patientToken) {
      await sendPushNotification({
        tokens: patientToken,
        title: "🚑 Ambulance Dispatched!",
        body: "A driver has accepted your emergency request and is en route.",
        data: {
          type: "EMERGENCY_UPDATE",
          status: "DISPATCHED",
          request_id: requestId,
        }
      });
    }

    // 6. Write the Audit Trail
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown-ip';
    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action: "EMERGENCY_ACCEPTED",
        entity_type: "EmergencyRequest",
        entity_id: requestId,
        ip_address: ip,
        details: JSON.stringify({ driver_id: driver.driver_id }),
      }
    });

    return successResponse(null, "Emergency secured. Please proceed to the location.");

  } catch (error) {
    console.error("Emergency Acceptance Error:", error);
    return apiErrors.internal();
  }
}
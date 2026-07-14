import { prisma } from '@medical-center/db';
import { sendPushNotification } from '@/lib/firebase-admin';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
import { z } from 'zod';
import { getUserSession } from '@/lib/auth';
import { verifyPatientStatus } from '@/lib/patient-verification';

// -----------------------------------------------------------------------------
// ZOD VALIDATION SCHEMA
// -----------------------------------------------------------------------------
const createEmergencySchema = z.object({
  pickup_lat: z.number({ required_error: "Latitude is required" }),
  pickup_lng: z.number({ required_error: "Longitude is required" }),
});

// ============================================================================
// POST: Create Emergency Request & Broadcast to Available Drivers
// ============================================================================
export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown-ip';

    // Rate Limit: 5 emergency requests per minute per IP to prevent spam/DDoS
    if (!checkRateLimit(ip, 5, 60000)) { 
      return errorResponse('Too many requests. Please wait a moment.', 429);
    }

    // === PRODUCTION AUTH BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
    if (session.role !== "STUDENT" && session.role !== "ACADEMIC_STAFF") {
      return apiErrors.forbidden("Only students and academic staff can request an ambulance.");
    }
    const requesterId = session.id;

    const body = await request.json();
    const validatedData = createEmergencySchema.parse(body);

    const patientStatusError = await verifyPatientStatus(requesterId);
    if (patientStatusError) return patientStatusError;

    // 1. Find all currently AVAILABLE drivers
    const availableDrivers = await prisma.driverAvailability.findMany({
      where: { is_available: true },
      include: {
        driver: {
          include: { user: true }
        }
      }
    });

    if (availableDrivers.length === 0) {
      console.warn(`No drivers available for Emergency SOS request`);
      return errorResponse("No drivers available", 404);
    }

    const assignedDriver = availableDrivers[0];

    // 2. Create the Emergency Request in the database with ASSIGNED status and driver_id
    const newRequest = await prisma.emergencyRequest.create({
      data: {
        requester_id: requesterId,
        patient_location_lat: validatedData.pickup_lat,
        patient_location_lng: validatedData.pickup_lng,
        driver_id: assignedDriver.driver_id,
        status: 'ASSIGNED',
      }
    });

    // Debugging: Add console.log right after the database operation as requested
    console.log("🟢 CREATED EMERGENCY REQUEST:", newRequest);

    // 3. Mark the assigned driver as unavailable
    await prisma.driverAvailability.update({
      where: { driver_id: assignedDriver.driver_id },
      data: { is_available: false }
    });

    // 4. Fire Push Notification to the assigned driver
    const token = assignedDriver.driver.user.fcm_token;
    if (token) {
      await sendPushNotification({
        tokens: token,
        title: `🚨 Emergency SOS Assigned!`,
        body: `You have been assigned to an emergency request. Tap to view location.`,
        data: {
          request_id: newRequest.id,
          type: "NEW_EMERGENCY",
          lat: String(validatedData.pickup_lat),
          lng: String(validatedData.pickup_lng)
        }
      });
    }

    // 5. Audit Trail
    await prisma.auditLog.create({
      data: {
        user_id: requesterId,
        action: "EMERGENCY_CREATED",
        entity_type: "EmergencyRequest",
        entity_id: newRequest.id,
        ip_address: ip,
        details: JSON.stringify({ assigned_driver_id: assignedDriver.driver_id })
      }
    });

    return successResponse(newRequest, "Emergency request created and driver assigned.", 201);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    
    console.error("Emergency Request Creation Error:", error);
    return apiErrors.internal();
  }
}
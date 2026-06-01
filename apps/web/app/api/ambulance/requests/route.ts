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

    // 1. Create the Emergency Request in the database
    const newRequest = await prisma.emergencyRequest.create({
      data: {
        requester_id: requesterId,
        patient_location_lat: validatedData.pickup_lat,
        patient_location_lng: validatedData.pickup_lng,
        status: 'PENDING',
      }
    });

    // 2. Find all currently AVAILABLE drivers
    const availableDrivers = await prisma.driverAvailability.findMany({
      where: { is_available: true },
      include: {
        driver: {
          include: { user: true }
        }
      }
    });

    if (availableDrivers.length === 0) {
      console.warn(`No drivers available for Emergency Request: ${newRequest.id}`);
      return successResponse(newRequest, "Emergency logged, but no drivers are currently online.", 201);
    }

    // 3. Extract Firebase FCM Tokens
    const tokens: string[] = [];
    availableDrivers.forEach(availability => {
      const token = availability.driver.user.fcm_token;
      if (token) tokens.push(token);
    });

    // 4. Broadcast via Firebase Cloud Messaging
    if (tokens.length > 0) {
      await sendPushNotification({
        tokens: tokens,
        title: `🚨 Emergency Request!`,
        body: `Tap to view location and accept.`,
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
      }
    });

    return successResponse(newRequest, "Emergency request created and broadcasted to fleet.", 201);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    
    console.error("Emergency Request Creation Error:", error);
    return apiErrors.internal();
  }
}
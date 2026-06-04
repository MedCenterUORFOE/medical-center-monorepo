import { prisma } from '@medical-center/db';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { z } from 'zod';
import { getUserSession } from '@/lib/auth';

// -----------------------------------------------------------------------------
// ZOD VALIDATION SCHEMA
// -----------------------------------------------------------------------------
const statusSchema = z.object({
  is_available: z.boolean({
    required_error: "is_available boolean is required",
  }),
});

// ============================================================================
// PATCH: Toggle Driver Online/Offline Status
// ============================================================================
export async function PATCH(request: Request) {
  try {
    // === PRODUCTION AUTH BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    if (session.role !== 'AMBULANCE_DRIVER') return apiErrors.forbidden();
    const userId = session.id;

    const body = await request.json();
    const { is_available } = statusSchema.parse(body);

    // 1. Find the Driver ID mapped to this User (Aligned with your schema)
    const driver = await prisma.ambulanceDriver.findUnique({
      where: { driver_id: userId }
    });

    if (!driver) {
      return apiErrors.notFound("Driver profile not found.");
    }

    // 2. Upsert the Availability Status
    const availability = await prisma.driverAvailability.upsert({
      where: { driver_id: driver.driver_id },
      update: { 
        is_available,
      },
      create: {
        driver_id: driver.driver_id,
        is_available,
      }
    });

    // 3. Log the Shift Change
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown-ip';
    
    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action: is_available ? "DRIVER_SHIFT_STARTED" : "DRIVER_SHIFT_ENDED",
        entity_type: "DriverAvailability",
        entity_id: driver.driver_id, // Updated to use driver_id instead of non-existent availability.id
        ip_address: ip,
        details: JSON.stringify({ is_available }),
      }
    });

    return successResponse(
      { is_available: availability.is_available }, 
      `You are now ${is_available ? 'ONLINE and receiving requests' : 'OFFLINE'}.`
    );

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    
    console.error("Driver Status Toggle Error:", error);
    return apiErrors.internal();
  }
}
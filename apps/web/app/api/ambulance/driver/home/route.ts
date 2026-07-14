import { prisma } from '@medical-center/db';
import { apiErrors, successResponse } from '@/lib/api-response';
import { getUserSessionFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const session = await getUserSessionFromRequest(request);
    if (!session?.id) return apiErrors.unauthorized();
    if (session.role !== 'AMBULANCE_DRIVER') return apiErrors.forbidden();

    const driverId = session.id;

    const driver = await prisma.ambulanceDriver.findUnique({
      where: { driver_id: driverId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            fcm_token: true,
          },
        },
      },
    });

    if (!driver) {
      return apiErrors.notFound('Driver profile not found.');
    }

    const availability = await prisma.driverAvailability.findUnique({
      where: { driver_id: driverId },
    });

    const activeRequest = await prisma.emergencyRequest.findFirst({
      where: {
        driver_id: driverId,
        status: {
          in: ['DISPATCHED', 'ARRIVED'],
        },
      },
      orderBy: { created_at: 'desc' },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    const pendingRequests = await prisma.emergencyRequest.findMany({
      where: {
        status: 'PENDING',
      },
      orderBy: { created_at: 'desc' },
      take: 10,
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    return successResponse(
      {
        driver,
        availability,
        active_request: activeRequest,
        pending_requests: pendingRequests,
        pending_count: pendingRequests.length,
      },
      'Driver home data retrieved successfully.'
    );
  } catch (error) {
    console.error('Driver Home Fetch Error:', error);
    return apiErrors.internal();
  }
}
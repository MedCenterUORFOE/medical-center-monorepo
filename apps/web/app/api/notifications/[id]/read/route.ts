
import { prisma } from '@medical-center/db';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
// import { getUserSession } from '@/lib/auth';

// ============================================================================
// PATCH: Mark a specific notification as read
// ============================================================================
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    // Higher limit to allow users to quickly tap through multiple notifications
    if (!checkRateLimit(ip, 120, 60000)) { 
      return errorResponse('Too many requests. Please slow down.', 429);
    }

    // === PRODUCTION AUTH BLOCK ===
    // const session = await getUserSession();
    // if (!session?.id) return apiErrors.unauthorized();
    // const userId = session.id;

    // === LOCAL TESTING MOCK ===
    const userId = "test-student-id"; 
    const { id } = params;

    // 1. Verify ownership to prevent users from marking other people's notifications as read
    const notification = await prisma.notification.findUnique({
      where: { id: id }
    });

    if (!notification) {
      return apiErrors.notFound("Notification not found.");
    }

    if (notification.user_id !== userId) {
      return apiErrors.forbidden("Unauthorized. You do not own this notification.");
    }

    // 2. Flip the state
    const updatedNotification = await prisma.notification.update({
      where: { id: id },
      data: { is_read: true }
    });

    return successResponse(
      { id: updatedNotification.id, is_read: updatedNotification.is_read }, 
      "Notification marked as read."
    );

  } catch (error) {
    console.error("Notification Update Error:", error);
    return apiErrors.internal();
  }
}
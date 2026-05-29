import { prisma } from '@medical-center/db';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getUserSession } from '@/lib/auth';

// ============================================================================
// GET: Fetch User Notifications & Unread Count
// ============================================================================
export async function GET(request: Request) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    // Limit: 60 feed refreshes per minute
    if (!checkRateLimit(ip, 60, 60000)) { 
      return errorResponse('Too many refresh attempts. Please slow down.', 429);
    }

    // === PRODUCTION AUTH BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    const userId = session.id;

    // 1. Fetch the user's notifications, newest first
    const notifications = await prisma.notification.findMany({
      where: { user_id: userId },
      orderBy: { sent_at: 'desc' },
      take: 50 // Sensible cap for a mobile feed to ensure fast load times
    });

    // 2. Calculate the unread badge counter on the server
    const unreadCount = notifications.reduce((count, notification) => {
      return count + (notification.is_read ? 0 : 1);
    }, 0);

    return successResponse(
      { 
        unread_count: unreadCount,
        notifications: notifications 
      }, 
      "Notifications retrieved successfully."
    );

  } catch (error) {
    console.error("Notifications Fetch Error:", error);
    return apiErrors.internal();
  }
}
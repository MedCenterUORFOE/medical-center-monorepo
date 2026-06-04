import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limiter';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';

// Validate that they are only passing valid status strings
const statusUpdateSchema = z.object({
  status: z.enum(['VERIFIED', 'UNVERIFIED', 'SUSPENDED']),
});

export async function PATCH(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    if (!checkRateLimit(ip, 30, 900000)) { // 30 status changes per 15 mins
      return errorResponse('Too many requests. Please try again later.', 429);
    }

    // === PRODUCTION AUTH BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    if (session.role !== "ADMIN") return apiErrors.forbidden();
    const adminId = session.id;

    const { userId } = params;

    // --- SELF-LOCKOUT PROTECTION ---
    // Prevent an Admin from accidentally suspending their own account
    if (userId === adminId) {
      return errorResponse("Action denied: You cannot alter your own account status.", 403);
    }

    const body = await request.json();
    const { status } = statusUpdateSchema.parse(body);

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true, status: true }
    });

    if (!targetUser) {
      return apiErrors.notFound("User not found.");
    }

    if (targetUser.status === status) {
      return errorResponse(`User is already marked as ${status}`, 400);
    }

    // --- THE SECURE TRANSACTION ---
    const updatedUser = await prisma.$transaction(async (tx) => {
      
      const user = await tx.user.update({
        where: { id: userId },
        data: { status },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
        }
      });

      // Write to the immutable compliance ledger
      await tx.auditLog.create({
        data: {
          user_id: adminId, 
          action: "USER_STATUS_CHANGED",
          entity_type: "User",
          entity_id: userId,
          ip_address: ip,
          details: JSON.stringify({ 
            message: `Admin changed user status from ${targetUser.status} to ${status}.`,
            target_role: targetUser.role
          }),
        }
      });

      return user;
    });

    return successResponse(
      { user: updatedUser }, 
      `User account has been successfully updated to ${status}.`
    );

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error("Status Update Error:", error);
    return apiErrors.internal();
  }
}
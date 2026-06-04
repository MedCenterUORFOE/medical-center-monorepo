import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import bcrypt from 'bcryptjs';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getUserSession } from '@/lib/auth';

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters long"),
});

export async function PATCH(request: Request) {
  try {
    // --- RATE LIMITING PROTECTION ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';

    if (!checkRateLimit(ip, 5, 900000)) {
      return errorResponse('Too many attempts. Please try again later.', 429);
    }

    // === PRODUCTION AUTH BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    const userId = session.id;

    const body = await request.json();
    const { oldPassword, newPassword } = changePasswordSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password_hash: true }
    });

    if (!user || !user.password_hash) {
      return apiErrors.badRequest('Account does not have a local password to change.');
    }

    const isPasswordValid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isPasswordValid) {
      return apiErrors.unauthorized('Incorrect current password');
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (isSamePassword) {
      return apiErrors.badRequest('New password must be different from the old password');
    }

    const saltRounds = 10;
    const newHashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // THE SECURE TRANSACTION
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { password_hash: newHashedPassword },
      });

      await tx.auditLog.create({
        data: {
          user_id: userId,
          action: "PASSWORD_CHANGED",
          entity_type: "User",
          entity_id: userId,
          ip_address: ip,
          details: JSON.stringify({ message: "User securely updated their local password" }),
        }
      });
    });

    return successResponse(null, 'Password updated securely.');

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.errors);
    }
    console.error("Change Password Error:", error);
    return apiErrors.internal();
  }
}
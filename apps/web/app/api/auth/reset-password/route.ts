import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@medical-center/db';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limiter';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';

const resetSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters long"),
});

export async function PATCH(request: Request) {
  try {
    // --- RATE LIMITING PROTECTION ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';

    if (!checkRateLimit(ip, 5, 900000)) {
      return errorResponse('Too many reset attempts. Please try again later.', 429);
    }

    const body = await request.json();
    const { token, newPassword } = resetSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { reset_token: token } });

    if (!user || !user.reset_expires || user.reset_expires < new Date()) {
      return apiErrors.badRequest('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // THE SECURE TRANSACTION
    await prisma.$transaction(async (tx) => {
      
      await tx.user.update({
        where: { id: user.id },
        data: {
          password_hash: hashedPassword,
          reset_token: null, 
          reset_expires: null,
        },
      });

      await tx.auditLog.create({
        data: {
          user_id: user.id,
          action: "PASSWORD_RESET",
          entity_type: "User",
          entity_id: user.id,
          ip_address: ip,
          details: JSON.stringify({ message: "User reset their password via email recovery token" }),
        }
      });
      
    });

    return successResponse(null, 'Password has been reset successfully.');
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.errors);
    }
    console.error("Reset Password Error:", error);
    return apiErrors.internal();
  }
}
/**
 * SET PASSWORD ENDPOINT (POST /api/auth/set-password)
 * Purpose: Allows users who signed up via Google (null password) to set a local password.
 * * * --- AUTHENTICATION TESTING STRATEGY ---
 * DEVELOPMENT MODE: Hardcoded `userId`.
 * PRODUCTION MODE: Uncomment `getUserSession()` before deployment.
 */

import { NextResponse } from 'next/server';
import prisma from '@medical-center/db';
import { z } from 'zod';
import bcrypt from 'bcryptjs'; 
import { checkRateLimit } from '@/lib/rate-limiter';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
// import { getUserSession } from '@/lib/auth';

const setPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters long"),
});

export async function POST(request: Request) {
  try {
    // --- RATE LIMITING PROTECTION ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';

    if (!checkRateLimit(ip, 5, 900000)) {
      return errorResponse('Too many attempts. Please try again later.', 429);
    }

    // === PRODUCTION AUTH BLOCK ===
    // const session = await getUserSession();
    // if (!session?.id) return apiErrors.unauthorized();
    // const userId = session.id;
    
    // === LOCAL TESTING MOCK ===
    const userId = "test-user-id"; 

    const body = await request.json();
    const { newPassword } = setPasswordSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password_hash: true }
    });

    if (!user) {
      return apiErrors.notFound('User not found');
    }

    if (user.password_hash !== null) {
      return apiErrors.badRequest('Password already exists. Please use the Change Password flow.');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // THE SECURE TRANSACTION
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { password_hash: hashedPassword },
      });

      await tx.auditLog.create({
        data: {
          user_id: userId,
          action: "LOCAL_CREDENTIALS_ESTABLISHED",
          entity_type: "User",
          entity_id: userId,
          ip_address: ip,
          details: JSON.stringify({ message: "User set a local password for their OAuth-created account" }),
        }
      });
    });

    return successResponse(null, 'Password successfully set.');

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.errors);
    }
    console.error("Set Password Error:", error);
    return apiErrors.internal();
  }
}
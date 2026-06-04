
import crypto from 'crypto';
import { prisma } from '@medical-center/db';
import { resend } from '@/lib/resend';
import { checkRateLimit } from '@/lib/rate-limiter';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';



export async function POST(request: Request) {
  try {
    // --- RATE LIMITING PROTECTION ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';

    if (!checkRateLimit(ip, 3, 900000)) {
      return errorResponse('Too many password reset requests. Please try again in 15 minutes.', 429);
    }

    const { email } = await request.json();
    if (!email) {
      return apiErrors.badRequest('Email is required');
    }

    const user = await prisma.user.findUnique({ where: { email } });
    
    // Security Best Practice: Never reveal if an email exists in your DB
    if (!user) {
      return successResponse(null, 'If an account exists, a reset link has been sent.');
    }

    // Google OAuth users don't have local passwords to reset
    if (!user.password_hash && user.googleId) {
      return apiErrors.badRequest('This account uses Google Sign-In.');
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour expiration

    // THE SECURE TRANSACTION
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { reset_token: resetToken, reset_expires: tokenExpiry },
      });

      await tx.auditLog.create({
        data: {
          user_id: user.id,
          action: "PASSWORD_RESET_REQUESTED",
          entity_type: "User",
          entity_id: user.id,
          ip_address: ip,
          details: JSON.stringify({ message: "Password reset email generated and sent." }),
        }
      });
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const resetLink = `${appUrl}/reset-password?token=${resetToken}`;

    await resend.emails.send({
      from: 'Medical Center <support@resend.dev>',
      to: email,
      subject: 'Password Reset Request',
      html: `<p>Click <a href="${resetLink}">here</a> to reset your password. This link expires in 1 hour.</p>`
    });

    return successResponse(null, 'If an account exists, a reset link has been sent.');

  } catch (error) {
    console.error("Forgot Password Error:", error);
    return apiErrors.internal();
  }
}
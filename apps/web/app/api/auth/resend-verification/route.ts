
import crypto from 'crypto';
import { prisma } from '@medical-center/db';
import { Resend } from 'resend';
import { checkRateLimit } from '@/lib/rate-limiter';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    if (!checkRateLimit(ip, 3, 900000)) {
      return errorResponse('Too many requests. Try again later.', 429);
    }

    const { email } = await request.json();
    if (!email) return apiErrors.badRequest('Email is required');

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) return successResponse(null, 'If an account exists, a new link has been sent.');

    if (user.status === 'VERIFIED') {
      return errorResponse('This account is already verified. Please log in.', 400);
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { verification_token: verificationToken, verification_expires: tokenExpiry },
      });

      await tx.auditLog.create({
        data: {
          user_id: user.id,
          action: "VERIFICATION_RESENT",
          entity_type: "User",
          entity_id: user.id,
          ip_address: ip,
          details: JSON.stringify({ message: "User requested a new verification email." }),
        }
      });
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const verifyLink = `${appUrl}/api/auth/verify?token=${verificationToken}`;

    await resend.emails.send({
      from: 'Medical Center <onboarding@resend.dev>',
      to: email,
      subject: 'Verify your Medical Center account',
      html: `
        <div style="padding: 20px;">
          <h2>Verify your account, ${user.name}</h2>
          <p>Click below to verify. This link expires in 24 hours.</p>
          <a href="${verifyLink}">Verify Email</a>
        </div>
      `
    });

    return successResponse(null, 'If an account exists, a new link has been sent.');

  } catch (error) {
    console.error('Resend Verification Error:', error);
    return apiErrors.internal();
  }
}
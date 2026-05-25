
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '@medical-center/db';
import { Resend } from 'resend';
import { checkRateLimit } from '@/lib/rate-limiter';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';

const resend = new Resend(process.env.RESEND_API_KEY);

// --- SECURITY: EXPLICIT WHITELIST ---
// Only these roles are allowed to use the public self-registration form.
const ALLOWED_PUBLIC_ROLES = ['STUDENT', 'ACADEMIC_STAFF'];

export async function POST(request: Request) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';

    if (!checkRateLimit(ip, 5, 3600000)) {
      return errorResponse('Too many registration attempts. Please try again later.', 429);
    }

    const body = await request.json();
    const { email, password, name, role } = body;

    if (!email || !password || !name || !role) {
      return apiErrors.badRequest('Missing required fields');
    }

    // --- THE PRIVILEGE ESCALATION BLOCKER ---
    if (!ALLOWED_PUBLIC_ROLES.includes(role)) {
      return errorResponse(
        'Unauthorized role selection. Clinical and Admin staff accounts must be provisioned internally.', 
        403
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return errorResponse('A user with this email already exists', 409);
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); 

    // --- SECURE TRANSACTION & AUDIT LOG ---
    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          role,
          password_hash: hashedPassword, 
          status: 'UNVERIFIED',
          is_profile_complete: false,
          verification_token: verificationToken,
          verification_expires: tokenExpiry,
        },
      });

      await tx.auditLog.create({
        data: {
          user_id: user.id,
          action: "USER_REGISTERED_PUBLIC",
          entity_type: "User",
          entity_id: user.id,
          ip_address: ip,
          details: JSON.stringify({ message: `User self-registered as ${role}.` }),
        }
      });

      return user;
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const verifyLink = `${appUrl}/api/auth/verify?token=${verificationToken}`;

    const { error: emailError } = await resend.emails.send({
      from: 'Medical Center <onboarding@resend.dev>', 
      to: email, 
      subject: 'Verify your Medical Center account',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Welcome to the Medical Center, ${name}!</h2>
          <p>Please verify your email address by clicking the link below:</p>
          <a href="${verifyLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Verify Email</a>
          <p style="margin-top: 20px; font-size: 12px; color: #666;">This link will expire in 24 hours.</p>
        </div>
      `
    });

    if (emailError) {
      console.error('Resend failed to send email:', emailError);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userWithoutPassword } = newUser;

    return successResponse(
      { user: userWithoutPassword }, 
      'Registration successful. Please check your email to verify your account.', 
      201
    );

  } catch (error) {
    console.error('Registration Error:', error);
    return apiErrors.internal();
  }
}
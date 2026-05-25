
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from '@medical-center/db';
import { checkRateLimit } from '@/lib/rate-limiter';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';

export async function POST(request: Request) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    if (!checkRateLimit(ip, 10, 300000)) {
      return errorResponse('Too many login attempts. Try again in 5 minutes.', 429);
    }

    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return apiErrors.badRequest('Email and password are required');
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.password_hash) {
      return apiErrors.unauthorized('Invalid credentials');
    }

    // --- STATUS GATEKEEPER ---
    if (user.status === 'SUSPENDED') {
      return apiErrors.forbidden('This account has been suspended or deleted.');
    }
    if (user.status === 'UNVERIFIED') {
      // We pass the extra data in the `errors` parameter of your errorResponse
      return errorResponse('Please verify your email before logging in.', 403, { requiresVerification: true });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return apiErrors.unauthorized('Invalid credentials');
    }

    const jwtPayload = {
      id: user.id,
      email: user.email,
      role: user.role, 
    };

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const token = await new SignJWT(jwtPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d') 
      .sign(secret);

    // --- CENTRALIZED SUCCESS RESPONSE ---
    const response = successResponse({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        is_profile_complete: user.is_profile_complete
      }
    }, 'Login successful');

    response.cookies.set('session_token', token, { 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, 
    });

    return response;

  } catch (error) {
    console.error('Login Error:', error);
    return apiErrors.internal();
  }
}
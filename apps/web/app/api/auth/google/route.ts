import { NextRequest } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '@medical-center/db'; 
import { SignJWT } from 'jose';
import { checkRateLimit } from '@/lib/rate-limiter';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage' 
);

export async function POST(request: NextRequest) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    if (!checkRateLimit(ip, 10, 300000)) {
      return errorResponse('Too many login attempts. Try again in 5 minutes.', 429);
    }

    const body = await request.json();
    const { code } = body;

    if (!code) {
      return apiErrors.badRequest('OAuth authorization code is required');
    }

    // 1. Exchange the authorization code for Google Tokens
    const { tokens } = await googleClient.getToken(code);
    
    // 2. Verify the ID token to extract the user's Google profile
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return apiErrors.unauthorized('Invalid Google token payload');
    }

    const { email, name, picture, sub: googleId } = payload;

    // 3. Database Sync: Find or Create the User
    let user = await prisma.user.findUnique({
      where: { email },
    });

    let isNewUser = false;

    if (!user) {
      // Create a new user record. 
      // Because Google verifies emails, we can safely bypass the UNVERIFIED status.
      user = await prisma.user.create({
        data: {
          email,
          name: name || 'Unknown User',
          role: 'STUDENT', 
          profile_picture: picture,
          is_profile_complete: false, 
          status: 'VERIFIED', // Implicitly verified by Google
          googleId: googleId, 
        },
      });
      isNewUser = true;

      // Log the Oauth Creation for compliance
      await prisma.auditLog.create({
        data: {
          user_id: user.id,
          action: "USER_REGISTERED_OAUTH",
          entity_type: "User",
          entity_id: user.id,
          ip_address: ip,
          details: JSON.stringify({ message: "User registered via Google Sign-In." }),
        }
      });
    }

    // --- STATUS GATEKEEPER ---
    if (user.status === 'SUSPENDED') {
      return apiErrors.forbidden('This account has been suspended or deleted.');
    }

    // 4. JWT Generator
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const secretKey = new TextEncoder().encode(process.env.JWT_SECRET!);
        
    const sessionToken = await new SignJWT(tokenPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d') // Aligned with standard login
      .sign(secretKey);

    // 5. Set the token as a secure HttpOnly cookie & return safe user data
    const response = successResponse({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_profile_complete: user.is_profile_complete,
        hasPassword: user.password_hash !== null, 
      },
      isNewUser,
    }, 'Authentication successful');

    response.cookies.set('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;

  } catch (error) {
    console.error('Google OAuth Exchange Error:', error);
    return apiErrors.internal('Authentication failed during Google communication');
  }
}
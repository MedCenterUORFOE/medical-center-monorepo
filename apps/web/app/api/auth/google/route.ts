import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '@medical-center/db'; // Adjust if your db package name is different
import { successResponse, apiErrors } from '@/lib/api-response';
import jwt from 'jsonwebtoken';

// Initialize the Google Client
// 'postmessage' is the required redirect_uri when doing frontend-to-backend code exchange
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage' 
);

export async function POST(request: NextRequest) {
  try {
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

    const { email, name, picture } = payload;

    // 3. Database Sync: Find or Create the User
    let user = await prisma.user.findUnique({
      where: { email },
    });

    let isNewUser = false;

    if (!user) {
      // Create a new user record. 
      // We assign them a default role (e.g., 'STUDENT') and flag them for the onboarding flow.
      user = await prisma.user.create({
        data: {
          email,
          name: name || 'Unknown User',
          role: 'STUDENT', 
          profile_picture: picture,
          is_profile_complete: false, // This triggers the frontend to show the onboarding screen
        },
      });
      isNewUser = true;
    }

    // 4. JWT Generator: Create your secure session token
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const sessionToken = jwt.sign(tokenPayload, process.env.JWT_SECRET!, {
      expiresIn: '1d', 
    });

    // 5. Set the token as a secure HttpOnly cookie
    const response = NextResponse.json({
      success: true,
      statusCode: 200,
      message: 'Authentication successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          is_profile_complete: user.is_profile_complete,
        },
        isNewUser,
      }
    });

    response.cookies.set('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 1 day
    });

    return response;

  } catch (error) {
    console.error('Google OAuth Exchange Error:', error);
    return apiErrors.internal('Authentication failed during Google communication');
  }
}
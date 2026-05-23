import { NextResponse } from 'next/server';
import { prisma } from '@medical-center/db';

export async function GET(request: Request) {
  try {
    // 1. Extract the token from the URL query parameters
    // Example URL: https://yourdomain.com/api/auth/verify?token=abc123def456
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      // Redirecting to a frontend error page is better UX than showing a blank JSON screen
      return NextResponse.redirect(new URL('/login?error=MissingToken', request.url));
    }

    // 2. Look up the user by the unique verification token
    const user = await prisma.user.findUnique({
      where: { verification_token: token },
    });

    if (!user) {
      return NextResponse.redirect(new URL('/login?error=InvalidToken', request.url));
    }

    // 3. Security Check: Has the token expired?
    if (user.verification_expires && user.verification_expires < new Date()) {
      return NextResponse.redirect(new URL('/login?error=TokenExpired', request.url));
    }

    // 4. THE MAGIC: Verify the user and wipe the temporary tokens
    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'VERIFIED',
        verification_token: null,
        verification_expires: null,
      },
    });

    // 5. Redirect the user back to the login page with a success message
    // Your frontend can look for the ?verified=true parameter and show a green toast notification!
    return NextResponse.redirect(new URL('/login?verified=true', request.url));

  } catch (error) {
    console.error('Email Verification Error:', error);
    // Fallback error redirect
    return NextResponse.redirect(new URL('/login?error=InternalError', request.url));
  }
}
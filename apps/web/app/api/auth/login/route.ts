import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';

import { prisma } from '@medical-center/db';

export async function POST(request: Request) {
  try {
    // 1. Grab the email and password from the incoming request
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // 2. Find the user in the database
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password_hash) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // 3. Check if the password matches the hash
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // 4. Create the JWT Payload (The VIP Badge)
    // We embed their ID and Role so the middleware can read it later without hitting the DB again
    const jwtPayload = {
      userId: user.id,
      role: user.role, 
    };

    // 5. Cryptographically sign the token using jose
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const token = await new SignJWT(jwtPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d') // Token expires in 7 days
      .sign(secret);

    // 6. Set the HTTP-Only Cookie (For the Web Portal)
    // HTTP-Only means malicious JavaScript cannot steal this cookie
    cookies().set({
      name: 'umc_session',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
    });

    // 7. Return the token in JSON (For the Mobile Apps to save in SecureStore)
    return NextResponse.json({
      message: 'Login successful',
      token: token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
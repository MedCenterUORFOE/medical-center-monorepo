import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@medical-center/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name, role } = body;

    // 1. Basic validation
    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { error: 'Missing required fields (email, password, name, role)' }, 
        { status: 400 }
      );
    }

    // 2. Check if the user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists' }, 
        { status: 409 }
      );
    }

    // 3. THE MAGIC: Hash the password before saving
    // The '10' is the salt rounds. It dictates how many times the algorithm 
    // runs, making it exponentially harder for hackers to brute-force.
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 4. Save the user to the database
    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        role,
        password_hash: hashedPassword, // Store the hash, NEVER the plain text!
        status: 'VERIFIED', // Defaulting to verified for your testing purposes
      },
    });

    // 5. Strip the password out before sending the success response
    // We don't want to send even the hashed password back to the frontend
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userWithoutPassword } = newUser;

    return NextResponse.json({
      message: 'User registered successfully',
      user: userWithoutPassword
    }, { status: 201 });

  } catch (error) {
    console.error('Registration Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
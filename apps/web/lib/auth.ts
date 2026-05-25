import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

// Define the shape of the data we expect inside our JWT
export interface SessionPayload {
  id: string;
  email: string;
  role: string;
}

export async function getUserSession(): Promise<SessionPayload | null> {
  try {
    // 1. Grab the cookie store
    const cookieStore = await cookies();
    
    // 2. Look for the specific session token we set during login
    const token = cookieStore.get('session_token')?.value;

    // If there is no token, the user is not logged in
    if (!token) {
      return null;
    }

    // 3. Verify the token using the exact same secret key we used to sign it
    const secretKey = new TextEncoder().encode(process.env.JWT_SECRET!);
    
    const { payload } = await jwtVerify(token, secretKey);

    // 4. Return the typed payload
    return {
      id: payload.id as string,
      email: payload.email as string,
      role: payload.role as string,
    };

  } catch (error) {
    // If the token is expired or tampered with, jose throws an error.
    // We catch it and return null, treating the user as unauthenticated.
    console.error('Session verification failed:', error);
    return null;
  }
}


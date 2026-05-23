import { successResponse } from '@/lib/api-response';

export async function POST() {
  const response = successResponse(null, 'Logged out successfully');
  
  // Clear the session cookie by setting its expiration to the past
  response.cookies.set('session_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0, 
  });

  return response;
}
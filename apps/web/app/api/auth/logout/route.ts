
import { successResponse } from '@/lib/api-response';

export async function POST() {
  // 1. Create the base response
  const response = successResponse(null, 'Logged out successfully');

  // 2. Clear the session cookie with identical attributes to your login set
  // It is critical that path, domain, and secure flags match exactly what you set on login
  response.cookies.delete('session_token'); // Simplified: this automatically clears it
  
  // OR, if your specific proxy/environment requires manual expiration:
  response.cookies.set('session_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0), // Sets to 1970-01-01
  });

  // 3. Optional: Add security headers to prevent caching of the session
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');

  return response;
}
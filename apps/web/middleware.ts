import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// 1. The Whitelist: The ONLY routes allowed without a token
const publicRoutes = [
  // UI Routes
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/setup-account', 
  
  // API Routes
  '/api/health',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/google',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify',
  '/api/auth/resend-verification',
  '/api/webhooks' // <-- Protected by exact match or sub-directory logic now
];

// 2. The VIP List: Specific roles required for specific folders
const roleAccessMap: Record<string, string[]> = {
  // UI Routes (Slashes removed from keys for proper exact matching)
  '/admin': ['ADMIN'],
  '/dashboard/doctor': ['DOCTOR'],
  '/dashboard/nurse': ['NURSE'],
  '/dashboard/pharmacist': ['PHARMACIST'],
  '/inventory': ['PHARMACIST', 'NURSE', 'ADMIN'],
  
  // API Routes
  '/api/admin': ['ADMIN'],
  '/api/doctor': ['DOCTOR'], 
  '/api/nurse': ['NURSE'],
  '/api/inventory': ['PHARMACIST', 'NURSE', 'ADMIN'],
  '/api/medicines': ['ADMIN', 'DOCTOR', 'NURSE', 'PHARMACIST'], 
  '/api/dispensations': ['ADMIN', 'NURSE', 'PHARMACIST'],       
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- A. IS IT ON THE WHITELIST? ---
  // FIX: Safely checks for exact match OR sub-directory match
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next();
  }

  // --- B. THE BULLETPROOF CHECK ---
  const isApiRoute = pathname.startsWith('/api/');
  
  // FIX: Applies the same exact match OR sub-directory match logic to VIP routes
  const requiredRoles = Object.entries(roleAccessMap).find(([route]) => 
    pathname === route || pathname.startsWith(route + '/')
  )?.[1];

  // If it is NOT an API route, and it doesn't have a specific role requirement, 
  // it's a standard public UI page (like the homepage). Let them through.
  if (!isApiRoute && !requiredRoles) {
    return NextResponse.next();
  }

  // If we made it here, the route REQUIRES a token. Period.

  // --- C. EXTRACT THE TOKEN ---
  let token: string | undefined;
  const authHeader = request.headers.get('authorization');
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    token = request.cookies.get('session_token')?.value;
  }

  // --- D. NO TOKEN? KICK THEM OUT ---
  if (!token) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized - Token Missing' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // --- E. VERIFY THE TOKEN ---
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    const userRole = payload.role as string;

    // --- F. CHECK VIP ROLES (If applicable) ---
    if (requiredRoles && !requiredRoles.includes(userRole)) {
      if (isApiRoute) {
        return NextResponse.json({ error: 'Forbidden - Insufficient Privileges' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    // --- G. PASS THE USER ID TO THE BACKEND ---
    const requestHeaders = new Headers(request.headers);
    
    requestHeaders.set('x-user-id', payload.id as string);
    requestHeaders.set('x-user-role', payload.role as string);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

  } catch (error) {
    // Token was tampered with, fake, or expired
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized - Invalid Token' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
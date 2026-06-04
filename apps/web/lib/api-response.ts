import { NextResponse } from 'next/server';

// Standard Success Response
export function successResponse<T>(data: T, message: string = 'Success', status: number = 200) {
  return NextResponse.json(
    {
      success: true,
      status: 'healthy', // Restores your explicit health tracking state
      statusCode: status, // Application-level status verification
      message,
      data,
    },
    { status } // Network-level HTTP Header status
  );
}

// Standard Error Response
export function errorResponse(message: string, status: number = 400, errors?: unknown) {
  return NextResponse.json(
    {
      success: false,
      status: 'unhealthy', // Tells the client explicitly that something is broken
      statusCode: status,
      message,
      errors: errors || null,
    },
    { status }
  );
}

// Common HTTP Errors (Shortcuts)
export const apiErrors = {
  badRequest: (msg = 'Bad Request') => errorResponse(msg, 400),
  unauthorized: (msg = 'Unauthorized') => errorResponse(msg, 401),
  forbidden: (msg = 'Forbidden') => errorResponse(msg, 403),
  notFound: (msg = 'Not Found') => errorResponse(msg, 404),
  internal: (msg = 'Database connection failed') => errorResponse(msg, 500),
};
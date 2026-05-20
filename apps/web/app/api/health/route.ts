import { successResponse, apiErrors } from '@/lib/api-response';
import { prisma } from '@medical-center/db';

export async function GET() {
  try {
    // Ping the database with a simple query
    await prisma.$queryRaw`SELECT 1`;
    
    // Test our new centralized success formatting utility
    return successResponse(
      { database: 'connected', timestamp: new Date().toISOString() },
      'Server is fully operational'
    );
  } catch (error) {
    console.error('Health Check Failed:', error);
    // Test our centralized error utility shortcut
    return apiErrors.internal('Database connection failed');
  }
}
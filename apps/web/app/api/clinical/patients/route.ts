import { NextRequest } from 'next/server';
import { prisma } from '@medical-center/db';
import { checkRateLimit } from '@/lib/rate-limiter';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    // 60 requests per minute. Typeahead searches are spammy, so we give it a generous but capped limit.
    if (!checkRateLimit(ip, 60, 60000)) { 
      return errorResponse('Too many search requests. Please pause for a moment.', 429);
    }

    // 1. Extract the search query
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q')?.trim() || '';

    // If the search is empty or too short, return a 400 Bad Request
    // FIX: Re-indented to match the surrounding 4-space block level
    if (query.length < 2) {
      return errorResponse('Enter at least 2 characters to search', 400);
    }

    // 2. The Multi-Table Search Query
    // We are looking for Students or Academic Staff who match the query 
    // by Name, NIC, or their specific University IDs.
    const patients = await prisma.user.findMany({
      where: {
        role: { in: ['STUDENT', 'ACADEMIC_STAFF'] },
        status: { not: 'SUSPENDED' }, // Never show deleted/suspended accounts
        is_profile_complete: true,    // Only show people who finished onboarding
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { nic: { contains: query, mode: 'insensitive' } },
          // Check inside the related Student table for Reg Numbers
          { student: { university_reg_number: { contains: query, mode: 'insensitive' } } },
          // Check inside the related Staff table for Staff IDs
          { academicStaff: { university_staff_id: { contains: query, mode: 'insensitive' } } },
        ]
      },
      take: 10, // Hard cap at 10 results to keep the UI snappy and the database happy
      select: {
        id: true,
        name: true,
        role: true,
        nic: true,
        profile_picture: true,
        // Pull in the specific university details based on their role
        student: {
          select: { university_reg_number: true, faculty: true }
        },
        academicStaff: {
          select: { university_staff_id: true, department: true }
        },
        // Pull in a tiny preview of their clinical profile (e.g., to show an allergy warning icon on the search card)
        patientProfile: {
          select: { blood_group: true }
        }
      },
    });

    return successResponse({ patients }, 'Patients retrieved successfully');

  } catch (error) {
    console.error("Patient Search Error:", error);
    return apiErrors.internal();
  }
}
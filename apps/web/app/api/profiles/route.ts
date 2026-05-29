import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { jwtVerify } from 'jose';

const createProfileSchema = z.object({
  user_id: z.string().uuid("Invalid user ID"),
  blood_group: z.string().optional(),
  allergies: z.string().optional(),
  special_notes: z.string().optional(), 
  height: z.coerce.number().positive().optional(), 
  weight: z.coerce.number().positive().optional(),
  date_of_birth: z.coerce.date().optional(),
});

export async function POST(request: Request) {
  try {
    // --- ACTIVE RBAC SECURITY BLOCK ---
    const requestHeaders = new Headers(request.headers);
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.substring(7) || requestHeaders.get('cookie')?.split('session_token=')[1]?.split(';')[0];
    
    if (!token) return apiErrors.unauthorized();

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    
    if (payload.role !== "NURSE" && payload.role !== "DOCTOR" && payload.role !== "ADMIN") {
      return apiErrors.forbidden("Medical Staff Only");
    }
    // ----------------------------------

    const body = await request.json();
    const validatedData = createProfileSchema.parse(body);

    // 1. Verify the user actually exists
    const userExists = await prisma.user.findUnique({
      where: { id: validatedData.user_id }
    });

    if (!userExists) {
      return apiErrors.notFound("Associated user account not found.");
    }

    // 2. Prevent duplicate profiles
    const profileExists = await prisma.patientProfile.findUnique({
      where: { user_id: validatedData.user_id }
    });

    if (profileExists) {
      return errorResponse("A clinical profile already exists for this patient. Use PUT to update.", 409);
    }

    // 3. Create the profile
    const newProfile = await prisma.patientProfile.create({
      data: {
        user_id: validatedData.user_id,
        blood_group: validatedData.blood_group,
        allergies: validatedData.allergies,
        special_notes: validatedData.special_notes,
        height: validatedData.height,
        weight: validatedData.weight,
        date_of_birth: validatedData.date_of_birth,
      }
    });

    return successResponse({ profile: newProfile }, "Patient clinical profile created successfully.", 201);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error("Clinical Profile Creation Error:", error);
    return apiErrors.internal();
  }
}
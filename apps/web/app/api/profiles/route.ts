// apps/web/app/api/profiles/route.ts

import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';
import { verifyPatientStatus } from '@/lib/patient-verification';

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
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();

    const body = await request.json();
    const validatedData = createProfileSchema.parse(body);

    const isMedicalStaff = ["NURSE", "DOCTOR", "ADMIN"].includes(session.role);

    // ========================================================================
    // CONDITIONAL RBAC LOGIC
    // ========================================================================
    if (!isMedicalStaff) {
      // Rule A: Patients can ONLY create their own profile
      if (validatedData.user_id !== session.id) {
        return apiErrors.forbidden("You can only create a profile for yourself.");
      }

      // Rule B: Patients CANNOT set restricted medical fields during creation
      if (validatedData.blood_group || validatedData.allergies || validatedData.special_notes) {
        return apiErrors.forbidden("Only medical staff can set blood group, allergies, or special notes.");
      }
    }
    // ========================================================================

    // 1. Verify the user actually exists
    const userExists = await prisma.user.findUnique({
      where: { id: validatedData.user_id }
    });

    if (!userExists) {
      return apiErrors.notFound("Associated user account not found.");
    }

    if (isMedicalStaff) {
      const patientStatusError = await verifyPatientStatus(validatedData.user_id);
      if (patientStatusError) return patientStatusError;
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

import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
// import { getUserSession } from '@/lib/auth';

const clinicalProfileSchema = z.object({
  blood_group: z.string().optional(),
  allergies: z.string().optional(),
  special_notes: z.string().optional(), 
  height: z.coerce.number().positive().optional(), 
  weight: z.coerce.number().positive().optional(),
  date_of_birth: z.coerce.date().optional(),
});

// ============================================================================
// GET: Fetch Base Identity & Clinical Profile (No Medical Records)
// ============================================================================
export async function GET(
  request: Request,
  { params }: { params: { patientId: string } }
) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    // Limit: 60 profile views per hour per IP to prevent scraping
    if (!checkRateLimit(ip, 60, 3600000)) { 
      return errorResponse('Too many profile fetch attempts. Please slow down.', 429);
    }

    // === PRODUCTION AUTH & RBAC BLOCK ===
    // const session = await getUserSession();
    // if (!session?.id) return apiErrors.unauthorized();
    // 
    // if (session.role !== "NURSE" && session.role !== "DOCTOR" && session.role !== "ADMIN") {
    //   return apiErrors.forbidden("Medical Staff Only");
    // }

    const { patientId } = params;

    // Fetch the 360-degree view of the patient (Excluding clinical history)
    const patientData = await prisma.user.findUnique({
      where: { 
        id: patientId,
        status: { not: 'SUSPENDED' } 
      },
      select: {
        id: true,
        name: true,
        email: true,
        nic: true,
        phone: true,
        role: true,
        profile_picture: true,
        student: true,
        academicStaff: true,
        patientProfile: true,
      }
    });

    if (!patientData) {
      return apiErrors.notFound("Patient not found or account suspended.");
    }

    return successResponse({ patient: patientData }, "Patient profile retrieved successfully.");

  } catch (error) {
    console.error("Profile Fetch Error:", error);
    return apiErrors.internal();
  }
}

// ============================================================================
// PUT / PATCH: Update Patient Baseline Clinical Data (Nurses/Doctors)
// ============================================================================
export async function PUT(
  request: Request,
  { params }: { params: { patientId: string } } 
) {
  try {
    // === PRODUCTION AUTH & RBAC BLOCK ===
    // const session = await getUserSession();
    // if (!session?.id) return apiErrors.unauthorized();
    // 
    // if (session.role !== "NURSE" && session.role !== "DOCTOR" && session.role !== "ADMIN") {
    //   return apiErrors.forbidden("Medical Staff Only");
    // }
    // const staffId = session.id;

    // === LOCAL TESTING MOCK ===
    const staffId = "test-nurse-id"; 
    const { patientId } = params;

    const body = await request.json();
    const validatedData = clinicalProfileSchema.parse(body);

    const patientExists = await prisma.patientProfile.findUnique({
      where: { user_id: patientId }
    });

    if (!patientExists) {
      return apiErrors.notFound("Patient profile not found.");
    }

    const result = await prisma.$transaction(async (tx) => {
      
      const updatedProfile = await tx.patientProfile.update({
        where: { user_id: patientId },
        data: {
          ...(validatedData.blood_group !== undefined && { blood_group: validatedData.blood_group }),
          ...(validatedData.allergies !== undefined && { allergies: validatedData.allergies }),
          ...(validatedData.special_notes !== undefined && { special_notes: validatedData.special_notes }),
          ...(validatedData.height !== undefined && { height: validatedData.height }),
          ...(validatedData.weight !== undefined && { weight: validatedData.weight }),
          ...(validatedData.date_of_birth !== undefined && { date_of_birth: validatedData.date_of_birth }),
        }
      });

      const forwardedFor = request.headers.get('x-forwarded-for');
      const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
      const changedKeys = Object.keys(validatedData).filter(key => validatedData[key as keyof typeof validatedData] !== undefined);

      await tx.auditLog.create({
        data: {
          user_id: staffId, 
          action: "UPDATED_CLINICAL_PROFILE",
          entity_type: "PatientProfile",
          entity_id: patientId, 
          ip_address: ip,
          details: JSON.stringify({ 
            message: "Medical staff updated patient baseline data",
            updated_fields: changedKeys 
          }),
        }
      });

      return updatedProfile;
    });

    return successResponse(result, "Patient clinical profile updated.");

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error("Clinical Profile Update Error:", error);
    return apiErrors.internal();
  }
}

// Map PATCH to PUT for complete frontend compatibility
export const PATCH = PUT;
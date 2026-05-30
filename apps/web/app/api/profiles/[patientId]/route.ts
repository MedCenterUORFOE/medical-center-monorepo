import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
import { jwtVerify } from 'jose';

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

    // --- SMART RBAC SECURITY BLOCK ---
    const requestHeaders = new Headers(request.headers);
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.substring(7) || requestHeaders.get('cookie')?.split('session_token=')[1]?.split(';')[0];
    
    if (!token) return apiErrors.unauthorized();

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    
    const isMedicalStaff = ["NURSE", "DOCTOR", "ADMIN"].includes(payload.role as string);
    const isOwnProfile = payload.id === params.patientId;

    // If they aren't staff, AND it's not their own profile, kick them out.
    if (!isMedicalStaff && !isOwnProfile) {
      return apiErrors.forbidden("You do not have permission to view this medical profile.");
    }
    // ----------------------------------

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
// PUT / PATCH: Upsert Patient Baseline Clinical Data (Nurses/Doctors)
// ============================================================================
export async function PUT(
  request: Request,
  { params }: { params: { patientId: string } } 
) {
  try {
    // --- STRICT RBAC SECURITY BLOCK ---
    const requestHeaders = new Headers(request.headers);
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.substring(7) || requestHeaders.get('cookie')?.split('session_token=')[1]?.split(';')[0];
    
    if (!token) return apiErrors.unauthorized();

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    
    if (payload.role !== "NURSE" && payload.role !== "DOCTOR" && payload.role !== "ADMIN") {
      return apiErrors.forbidden("Medical Staff Only");
    }
    
    // Dynamically grab the REAL staff ID for the Audit Log!
    const staffId = payload.id as string; 
    const { patientId } = params;
    // ----------------------------------

    const body = await request.json();
    const validatedData = clinicalProfileSchema.parse(body);

    // Check if the base USER exists, not the profile shell!
    const userExists = await prisma.user.findUnique({
      where: { id: patientId }
    });

    if (!userExists) {
      return apiErrors.notFound("Patient account not found.");
    }

    const result = await prisma.$transaction(async (tx) => {
      
      // THE BULLETPROOF UPSERT
      const upsertedProfile = await tx.patientProfile.upsert({
        where: { user_id: patientId },
        update: {
          // If the shell exists (Good Student), update it
          ...(validatedData.blood_group !== undefined && { blood_group: validatedData.blood_group }),
          ...(validatedData.allergies !== undefined && { allergies: validatedData.allergies }),
          ...(validatedData.special_notes !== undefined && { special_notes: validatedData.special_notes }),
          ...(validatedData.height !== undefined && { height: validatedData.height }),
          ...(validatedData.weight !== undefined && { weight: validatedData.weight }),
          ...(validatedData.date_of_birth !== undefined && { date_of_birth: validatedData.date_of_birth }),
        },
        create: {
          // If the shell is missing (Lazy Student), create it from scratch
          user_id: patientId,
          blood_group: validatedData.blood_group,
          allergies: validatedData.allergies,
          special_notes: validatedData.special_notes,
          height: validatedData.height,
          weight: validatedData.weight,
          date_of_birth: validatedData.date_of_birth,
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
            message: "Medical staff upserted patient baseline data",
            updated_fields: changedKeys 
          }),
        }
      });

      return upsertedProfile;
    });

    return successResponse(result, "Patient clinical profile successfully saved.");

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
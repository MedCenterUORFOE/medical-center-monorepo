// apps/web/app/api/certificates/request/route.ts

import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getUserSession } from '@/lib/auth';
import { verifyPatientStatus } from '@/lib/patient-verification';

const certificateRequestSchema = z.object({
  record_id: z.string().uuid("Invalid Medical Record ID"),
  doctor_id: z.string().uuid("Invalid Doctor ID"),
  // FIX: Array is now optional and defaults to empty. Students do not have to tag anyone.
  recipient_staff_ids: z.array(z.string()).optional().default([]),
});

// ============================================================================
// POST: Submit a Medical Certificate Leave Request
// ============================================================================
export async function POST(request: Request) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    if (!checkRateLimit(ip, 10, 60000)) { 
      return errorResponse('Too many requests. Please try again later.', 429);
    }

    // === PRODUCTION AUTH & RBAC BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
    if (session.role !== "STUDENT" && session.role !== "ACADEMIC_STAFF") {
      return apiErrors.forbidden("Only patients can request medical certificates.");
    }
    const patientId = session.id;

    const body = await request.json();
    const validatedData = certificateRequestSchema.parse(body);

    // ====================================================================
    // DUPLICATION GUARDRAIL: Check if a request already exists
    // ====================================================================
    const existingRequest = await prisma.medicalCertificateRequest.findUnique({
      where: { record_id: validatedData.record_id }
    });

    if (existingRequest) {
      return errorResponse(
        "A medical certificate has already been requested for this visit.", 
        409 
      );
    }
    // ====================================================================

    // Verify the underlying medical record belongs to this patient
    const medicalRecord = await prisma.medicalRecord.findUnique({
      where: { id: validatedData.record_id }
    });

    if (!medicalRecord || medicalRecord.patient_id !== patientId) {
      return apiErrors.forbidden("Unauthorized. You can only request certificates for your own medical records.");
    }

    const patientStatusError = await verifyPatientStatus(patientId);
    if (patientStatusError) return patientStatusError;

    const result = await prisma.$transaction(async (tx) => {
      
      // 1. Create the Base Request
      const certRequest = await tx.medicalCertificateRequest.create({
        data: {
          patient_id: patientId,
          doctor_id: validatedData.doctor_id,
          record_id: validatedData.record_id,
          status: "PENDING"
        }
      });

      // 2. Map the array of tagged Academic Staff directly via createMany
      // FIX: Guard clause added so Prisma doesn't crash if the array is empty
      if (validatedData.recipient_staff_ids.length > 0) {
        await tx.extraCertificateRecipient.createMany({
          data: validatedData.recipient_staff_ids.map(staffId => ({
            request_id: certRequest.id,
            staff_id: staffId
          }))
        });
      }

      // 3. Notify the Doctor that a request is waiting for them
      await tx.notification.create({
        data: {
          user_id: validatedData.doctor_id,
          type: "NEW_CERTIFICATE_REQUEST",
          message: `A new medical certificate request requires your approval.`,
        }
      });

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          user_id: patientId,
          action: "REQUESTED_MEDICAL_CERTIFICATE",
          entity_type: "MedicalCertificateRequest",
          entity_id: certRequest.id,
          ip_address: ip,
        }
      });

      return certRequest;
    });

    return successResponse({ request_id: result.id }, "Medical certificate request submitted successfully.", 201);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error("Certificate Request Error:", error);
    return apiErrors.internal();
  }
}

// ============================================================================
// GET: Fetch Pending Medical Certificate Requests for Doctor
// ============================================================================
export async function GET(request: Request) {
  try {
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    if (session.role !== "DOCTOR") {
      return apiErrors.forbidden("Unauthorized. Doctor access only.");
    }

    const pendingRequests = await prisma.medicalCertificateRequest.findMany({
      where: {
        doctor_id: session.id,
        status: "PENDING"
      },
      include: {
        patient: {
          include: {
            user: {
              select: { name: true, nic: true }
            }
          }
        },
        record: {
          select: {
            visit_date_time: true,
            diagnosis: true,
            symptoms: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    return successResponse({ requests: pendingRequests }, "Pending certificate requests retrieved successfully.");

  } catch (error) {
    console.error("Fetch Pending Certificates Error:", error);
    return apiErrors.internal();
  }
}
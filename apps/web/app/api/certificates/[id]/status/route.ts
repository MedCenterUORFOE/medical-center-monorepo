import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
import { sendPushNotification } from '@/lib/firebase-admin';
import { getUserSession } from '@/lib/auth';
import { verifyPatientStatus } from '@/lib/patient-verification';

const certificateStatusSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  doctor_notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.status === "REJECTED" && (!data.doctor_notes || data.doctor_notes.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Doctor notes are strictly required when rejecting a certificate.",
      path: ["doctor_notes"],
    });
  }
});

// ============================================================================
// PATCH: Approve/Reject Certificate
// ============================================================================
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    if (!checkRateLimit(ip, 30, 60000)) { 
      return errorResponse('Too many status updates. Please slow down.', 429);
    }

    // === PRODUCTION AUTH & RBAC BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    if (session.role !== "DOCTOR") return apiErrors.forbidden("Only doctors can approve certificates.");
    const doctorId = session.id;

    const requestId = params.id;

    const body = await request.json();
    const validatedData = certificateStatusSchema.parse(body);

    // 1. Fetch the request and patient details
    const certRequest = await prisma.medicalCertificateRequest.findUnique({
      where: { id: requestId },
      include: {
        patient: { include: { user: { select: { name: true, fcm_token: true } } } },
      }
    });

    if (!certRequest) return apiErrors.notFound("Certificate request not found.");
    if (certRequest.status !== "PENDING") return errorResponse("This request has already been processed.", 400);

    const patientStatusError = await verifyPatientStatus(certRequest.patient_id);
    if (patientStatusError) return patientStatusError;

    const result = await prisma.$transaction(async (tx) => {
      
      // 2. Update Request Status
      const updatedRequest = await tx.medicalCertificateRequest.update({
        where: { id: requestId },
        data: {
          status: validatedData.status,
          doctor_notes: validatedData.doctor_notes
        }
      });

      // 3. Notify the Patient (In-App DB Notification)
      await tx.notification.create({
        data: {
          user_id: certRequest.patient_id,
          type: `CERTIFICATE_${validatedData.status}`,
          message: `Your medical certificate request has been ${validatedData.status.toLowerCase()}.`,
        }
      });

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          user_id: doctorId,
          action: `CERTIFICATE_STATUS_CHANGED_${validatedData.status}`,
          entity_type: "MedicalCertificateRequest",
          entity_id: requestId,
          ip_address: ip,
        }
      });

      return updatedRequest;
    });

    // ------------------------------------------------------------------------
    // FIREBASE PUSH NOTIFICATION (Real-time ping to the Patient's Phone)
    // ------------------------------------------------------------------------
    const patientToken = certRequest.patient.user.fcm_token;
    if (patientToken) {
      const title = validatedData.status === "APPROVED" 
        ? "📄 Certificate Approved" 
        : "❌ Certificate Rejected";
      
      const bodyText = validatedData.status === "APPROVED"
        ? "Your medical certificate has been approved. The PDF will be generated shortly."
        : "Your certificate request was rejected. Tap to view doctor notes.";

      await sendPushNotification({
        tokens: patientToken,
        title: title,
        body: bodyText,
        data: {
          type: "CERTIFICATE_UPDATE",
          status: validatedData.status,
          request_id: requestId,
        }
      });
    }

    return successResponse({ status: result.status }, `Certificate request successfully marked as ${validatedData.status}.`);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error("Certificate Assessment Error:", error);
    return apiErrors.internal();
  }
}
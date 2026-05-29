import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
import { resend } from '@/lib/resend';
import { supabase } from '@/lib/supabase';
import { sendPushNotification } from '@/lib/firebase-admin';
import { getUserSession } from '@/lib/auth';

const certificateStatusSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  doctor_notes: z.string().optional(),
  file_path: z.string().optional(), 
}).superRefine((data, ctx) => {
  if (data.status === "REJECTED" && (!data.doctor_notes || data.doctor_notes.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Doctor notes are strictly required when rejecting a certificate.",
      path: ["doctor_notes"],
    });
  }
  if (data.status === "APPROVED" && !data.file_path) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A generated file path is required to approve and dispatch the certificate.",
      path: ["file_path"],
    });
  }
});

// ============================================================================
// PATCH: Approve/Reject Certificate and Trigger Auto-Send Email Worker
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

    // 1. Fetch the request along with the tagged recipients' emails and patient details
    const certRequest = await prisma.medicalCertificateRequest.findUnique({
      where: { id: requestId },
      include: {
        patient: { include: { user: { select: { name: true, email: true, fcm_token: true } } } },
        recipients: { include: { staff: { include: { user: { select: { email: true } } } } } }
      }
    });

    if (!certRequest) return apiErrors.notFound("Certificate request not found.");
    if (certRequest.status !== "PENDING") return errorResponse("This request has already been processed.", 400);

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
        ? "Your medical certificate has been approved and dispatched."
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

    // ------------------------------------------------------------------------
    // THE AUTO-SEND EMAIL WORKER (Executes only on Approval)
    // ------------------------------------------------------------------------
    if (validatedData.status === "APPROVED" && validatedData.file_path) {
      
      // A. Fetch the private PDF Buffer from Supabase Storage
      const { data: fileData, error: storageError } = await supabase.storage
        .from('medical-documents') 
        .download(validatedData.file_path);

      if (storageError || !fileData) {
        console.error("Failed to download PDF buffer from Supabase:", storageError);
        return errorResponse("Certificate approved, but failed to fetch PDF for dispatch.", 500);
      }

      const pdfBuffer = Buffer.from(await fileData.arrayBuffer());

      // B. Extract the tagged academic staff emails
      const targetEmails = certRequest.recipients
        .map(recipient => recipient.staff.user.email)
        .filter(email => email !== null) as string[];

      // C. Dispatch the email
      if (targetEmails.length > 0) {
        try {
          await resend.emails.send({
            from: 'Medical Center <noreply@ruhuna-medical.com>', 
            to: targetEmails,
            subject: `Medical Leave Certificate: ${certRequest.patient.user.name}`,
            text: `Please find the authorized medical leave certificate attached for ${certRequest.patient.user.name}.`,
            attachments: [
              {
                filename: `Medical_Certificate_${certRequest.patient.user.name.replace(/\s+/g, '_')}.pdf`,
                content: pdfBuffer,
              }
            ]
          });

          await prisma.extraCertificateRecipient.updateMany({
            where: { request_id: requestId },
            data: { sent_at: new Date() }
          });

        } catch (emailError) {
          console.error("Resend Dispatch Error:", emailError);
        }
      }
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
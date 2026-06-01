// apps/web/app/api/certificates/[id]/generate/route.ts

import { prisma } from '@medical-center/db';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response'; 
import { supabase } from '@/lib/supabase';
import { generatePDF } from '@/lib/pdf-generator'; 
import { getUserSession } from '@/lib/auth';
import { verifyPatientStatus } from '@/lib/patient-verification';
import { resend } from '@/lib/resend'; // <-- ADDED FOR EMAIL DISPATCH

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // === PRODUCTION AUTH BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    if (session.role !== "DOCTOR") return apiErrors.forbidden("Only doctors can generate certificates.");

    const { id } = params; // Certificate Request ID

    // ====================================================================
    // DUPLICATION GUARDRAIL: Check if a certificate was already generated
    // ====================================================================
    const existingCert = await prisma.medicalCertificate.findUnique({
      where: { request_id: id } 
    });

    if (existingCert) {
      return errorResponse(
        "A medical certificate has already been generated for this request.", 
        409 
      );
    }
    // ====================================================================

    // 1. Fetch Request Details (Include recipients for email dispatch)
    const requestData = await prisma.medicalCertificateRequest.findUnique({
      where: { id },
      include: { 
        patient: { include: { user: true } }, 
        record: true,
        recipients: { include: { staff: { include: { user: { select: { email: true } } } } } }
      }
    });

    if (!requestData) return apiErrors.notFound();

    const patientStatusError = await verifyPatientStatus(requestData.patient_id);
    if (patientStatusError) return patientStatusError;
    
    // GUARDRAIL: Ensure it was actually approved before generating a PDF!
    if (requestData.status !== "APPROVED") {
        return errorResponse("Cannot generate a certificate for an unapproved request.", 400);
    }

    const targetEmails = requestData.recipients
      .map((recipient) => recipient.staff.user.email)
      .filter((email): email is string => Boolean(email));

    console.log("[certificate/generate] Recipient email mapping", {
      requestId: id,
      recipientRows: requestData.recipients.length,
      staffIds: requestData.recipients.map((r) => r.staff_id),
      mappedEmails: targetEmails,
      unresolved: requestData.recipients
        .filter((r) => !r.staff?.user?.email)
        .map((r) => ({ staff_id: r.staff_id, email: r.staff?.user?.email ?? null })),
    });

    if (targetEmails.length === 0) {
      return errorResponse(
        "No recipient email addresses found for this certificate request. Tag at least one academic staff member with a valid email before generating.",
        400
      );
    }

    // 2. Generate PDF Buffer
    const pdfBuffer = await generatePDF({
      patientName: requestData.patient.user.name,
      diagnosis: requestData.record.diagnosis,
      date: new Date().toISOString()
    });

    // 3. Upload to Supabase
    const path = `certificates/${id}.pdf`;
    await supabase.storage.from('medical-documents').upload(path, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true
    });

    // 4. Record the file path in the database
    const cert = await prisma.medicalCertificate.create({
      data: {
        request_id: id,
        doctor_id: requestData.doctor_id,
        record_id: requestData.record_id,
        file_url: path
      }
    });

    // ------------------------------------------------------------------------
    // THE AUTO-SEND EMAIL WORKER
    // ------------------------------------------------------------------------
    console.log("[certificate/generate] Dispatching via Resend", {
      requestId: id,
      to: targetEmails,
      from: "Medical Center <onboarding@resend.dev>",
    });

    try {
      const { data: emailData, error: emailError } = await resend.emails.send({
        from: "Medical Center <onboarding@resend.dev>",
        to: targetEmails,
        subject: `Medical Leave Certificate: ${requestData.patient.user.name}`,
        text: `Please find the authorized medical leave certificate attached for ${requestData.patient.user.name}.`,
        attachments: [
          {
            filename: `Medical_Certificate_${requestData.patient.user.name.replace(/\s+/g, '_')}.pdf`,
            content: pdfBuffer,
          },
        ],
      });

      if (emailError) {
        console.error("[certificate/generate] Resend API error:", emailError);
        return errorResponse(
          "Certificate was saved, but email dispatch failed. Please check Resend configuration and try again.",
          500,
          emailError
        );
      }

      console.log("[certificate/generate] Resend accepted message", {
        requestId: id,
        resendId: emailData?.id,
        to: targetEmails,
      });

      await prisma.extraCertificateRecipient.updateMany({
        where: { request_id: id },
        data: { sent_at: new Date() },
      });
    } catch (emailError) {
      console.error("[certificate/generate] Resend dispatch exception:", emailError);
      return errorResponse(
        "Certificate was saved, but email dispatch failed unexpectedly.",
        500,
        emailError
      );
    }

    return successResponse(
      cert,
      "Certificate generated, saved, and dispatched to recipients."
    );
  } catch (error) {
    console.error("Generate PDF Error:", error); 
    return apiErrors.internal();
  }
}
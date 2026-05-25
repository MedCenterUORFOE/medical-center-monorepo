import { prisma } from '@medical-center/db';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
import { supabase } from '@/lib/supabase';

// ============================================================================
// GET: Generate a secure, 5-minute signed URL for private medical documents
// ============================================================================
export async function GET(request: Request) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    if (!checkRateLimit(ip, 30, 60000)) { 
      return errorResponse('Too many download requests. Please slow down.', 429);
    }

    // === PRODUCTION AUTH & RBAC BLOCK ===
    // const session = await getUserSession();
    // if (!session?.id) return apiErrors.unauthorized();
    // const userId = session.id;
    // const userRole = session.role;

    // === LOCAL TESTING MOCK ===
    const userId = "test-student-id"; 
    const userRole: string = "STUDENT";

    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('file_path');

    if (!filePath) {
      return errorResponse("The 'file_path' query parameter is required.", 400);
    }

    const [report, certificate] = await Promise.all([
      prisma.medicalReport.findFirst({
        where: { file_url: { endsWith: filePath } },
        include: { medical_record: true }
      }),
      prisma.medicalCertificate.findFirst({
        where: { file_url: { endsWith: filePath } },
        include: { 
          record: true,
          request: { include: { recipients: true } }
        }
      })
    ]);

    if (!report && !certificate) {
      return apiErrors.notFound("File record not found in the database.");
    }

    let isAuthorized = false;

    if (userRole === "DOCTOR" || userRole === "NURSE" || userRole === "ADMIN") {
      isAuthorized = true;
    } else {
      if (report && report.medical_record.patient_id === userId) {
        isAuthorized = true;
      }
      
      if (certificate) {
        if (certificate.record.patient_id === userId) {
          isAuthorized = true; 
        } else {
          const isTaggedRecipient = certificate.request.recipients.some(
            (recipient) => recipient.staff_id === userId
          );
          if (isTaggedRecipient) {
            isAuthorized = true;
          }
        }
      }
    }

    if (!isAuthorized) {
      await prisma.auditLog.create({
        data: {
          user_id: userId,
          action: "UNAUTHORIZED_FILE_ACCESS_ATTEMPT",
          entity_type: report ? "MedicalReport" : "MedicalCertificate",
          entity_id: report ? report.id : certificate!.id,
          ip_address: ip,
          details: JSON.stringify({ file_path: filePath }),
        }
      });
      return apiErrors.forbidden("You do not have permission to view this document.");
    }

    const { data, error } = await supabase.storage
      .from('medical-documents') 
      .createSignedUrl(filePath, 300);

    if (error || !data) {
      console.error("Supabase URL Signing Error:", error);
      return errorResponse("Failed to generate secure access token for file.", 500);
    }

    return successResponse(
      { signed_url: data.signedUrl, expires_in: 300 }, 
      "Secure download link generated."
    );

  } catch (error) {
    console.error("Signed URL Generator Error:", error);
    return apiErrors.internal();
  }
}
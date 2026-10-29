//apps\web\app\api\records\[recordId]\upload-report\route.ts

import { prisma } from '@medical-center/db';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { supabase } from '@/lib/supabase';
import { getUserSession } from '@/lib/auth';
import { verifyPatientStatus } from '@/lib/patient-verification';
//import { checkRateLimit } from '@/lib/rate-limiter';

export async function POST(
  request: Request,
  { params }: { params: { recordId: string } }
) {
  try {
    const { recordId } = params;

    // === PRODUCTION AUTH BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();

    const PATIENT_ROLES = ["STUDENT", "ACADEMIC_STAFF"];
    const STAFF_ROLES = ["DOCTOR", "NURSE"];
    const isPatient = PATIENT_ROLES.includes(session.role);
    const isStaff = STAFF_ROLES.includes(session.role);

    if (!isPatient && !isStaff) {
      return apiErrors.forbidden("You do not have permission to upload medical reports.");
    }

    // Fetch record first — needed for ownership checks below
    const targetRecord = await prisma.medicalRecord.findUnique({
      where: { id: recordId }
    });

    if (!targetRecord) {
      return apiErrors.notFound("Medical record not found.");
    }

    // Patients may only upload to their own record
    if (isPatient && targetRecord.patient_id !== session.id) {
      return apiErrors.forbidden("You can only upload reports to your own medical records.");
    }

    // Doctors may only upload to records they are assigned to
    if (session.role === "DOCTOR" && targetRecord.doctor_id !== session.id) {
      return apiErrors.forbidden("You do not have permission to upload reports to this specific record.");
    }

    // Only verify patient status when staff uploads on behalf of a patient
    if (isStaff) {
      const patientStatusError = await verifyPatientStatus(targetRecord.patient_id);
      if (patientStatusError) return patientStatusError;
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const fileType = formData.get('type') as string | null; // e.g., "BLOOD_TEST"

    if (!file) return errorResponse("No file uploaded", 400);
    if (!fileType) return errorResponse("Report type is required", 400);

    // 2. Upload to Supabase Storage -> medical-documents/reports/<recordId>/...
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `reports/${recordId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('medical-documents')
      .upload(fileName, file, { contentType: file.type });

    if (uploadError) {
      console.error('[upload-report] Supabase storage upload failed:', uploadError);
      throw uploadError;
    }

    // 3. Save to DB and Notify
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const report = await tx.medicalReport.create({
          data: {
            record_id: recordId,
            file_url: fileName,
            type: fileType
          }
        });

        // Notify the doctor who owns this record (skip if they uploaded it themselves)
        if (targetRecord.doctor_id && targetRecord.doctor_id !== session.id) {
          await tx.notification.create({
            data: {
              user_id: targetRecord.doctor_id,
              type: "NEW_REPORT_UPLOADED",
              message: `New ${fileType} report uploaded to record ${recordId}.`
            }
          });
        }

        return report;
      });
    } catch (dbError) {
      // Roll back the orphaned file if the DB write failed
      console.error('[upload-report] DB transaction failed, removing uploaded file:', dbError);
      const { error: removeError } = await supabase.storage
        .from('medical-documents')
        .remove([fileName]);
      if (removeError) {
        console.error('[upload-report] Failed to clean up orphaned file:', removeError);
      }
      throw dbError;
    }

    return successResponse(result, "Report uploaded successfully.", 201);
  } catch (error) {
    console.error('[upload-report] Unexpected error:', error);
    return apiErrors.internal();
  }
}
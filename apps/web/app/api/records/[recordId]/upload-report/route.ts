import { prisma } from '@medical-center/db';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { supabase } from '@/lib/supabase';
//import { checkRateLimit } from '@/lib/rate-limiter';



export async function POST(
  request: Request,
  { params }: { params: { recordId: string } }
) {
  try {
    const { recordId } = params;
    
    // 1. Authenticate and verify user has access to this record
    // [Insert Production Auth Block Here]

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const fileType = formData.get('type') as string; // e.g., "BLOOD_TEST"

    if (!file) return errorResponse("No file uploaded", 400);

    // 2. Upload to Supabase Storage
    const fileName = `${recordId}/${Date.now()}-${file.name}`;
    
    // FIX: Removed 'data: uploadData' to fix unused variable linting error
    const { error: uploadError } = await supabase.storage
      .from('medical-documents')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    // 3. Save to DB and Notify
    const result = await prisma.$transaction(async (tx) => {
      const report = await tx.medicalReport.create({
        data: {
          record_id: recordId,
          file_url: fileName,
          type: fileType
        }
      });

      // Notify the Doctor who owns this record
      const record = await tx.medicalRecord.findUnique({ where: { id: recordId } });
      
      if (record) {
        await tx.notification.create({
          data: {
            user_id: record.doctor_id,
            type: "NEW_REPORT_UPLOADED",
            message: `New ${fileType} report uploaded to record ${recordId}.`
          }
        });
      }
      return report;
    });

    return successResponse(result, "Report uploaded successfully.", 201);
  } catch (error) {
    return apiErrors.internal();
  }
}
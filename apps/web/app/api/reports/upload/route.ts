// apps/web/app/api/reports/upload/route.ts

import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';

// -----------------------------------------------------------------------------
// ZOD VALIDATION SCHEMA
// -----------------------------------------------------------------------------
const uploadReportSchema = z.object({
  record_id: z.string().uuid("Invalid record ID"),
  // FIX: Changed from .url() to .min(1) to accept relative Supabase bucket paths
  file_url: z.string().min(1, "File path is required"), 
  type: z.string().min(2, "Report type is required (e.g., X-RAY)"),
});

// ============================================================================
// POST: Save Medical Report & Notify Doctor
// ============================================================================
export async function POST(request: Request) {
  try {
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    const userId = session.id;

    const body = await request.json();
    const validatedData = uploadReportSchema.parse(body);

    // 1. Verify the Medical Record exists
    const medicalRecord = await prisma.medicalRecord.findUnique({
      where: { id: validatedData.record_id },
      include: { patient: { include: { user: true } } }
    });

    if (!medicalRecord) {
      return apiErrors.notFound("Medical record not found.");
    }

    // SECURITY: Ensure the person uploading is actually the patient who owns the record
    if (medicalRecord.patient_id !== userId && session.role === "STUDENT") {
      return apiErrors.forbidden("You do not have permission to attach reports to this record.");
    }

    // 2. Transaction: Create the report AND notify the doctor simultaneously
    const result = await prisma.$transaction(async (tx) => {
      
      // A. Save the report
      const newReport = await tx.medicalReport.create({
        data: {
          record_id: validatedData.record_id,
          file_url: validatedData.file_url,
          type: validatedData.type,
        }
      });

      // B. Dispatch the interactive notification
      const patientName = medicalRecord.patient.user.name;
      
      await tx.notification.create({
        data: {
          user_id: medicalRecord.doctor_id, // Send it straight to the attending doctor
          type: "NEW_REPORT",
          message: `New ${validatedData.type} uploaded by ${patientName}.`,
          action_url: `/doctor/reports/${newReport.id}` // The clickable link!
        }
      });

      return newReport;
    });

    return successResponse({ report: result }, "Report uploaded and doctor notified successfully.", 201);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error("Report Upload Error:", error);
    return apiErrors.internal();
  }
}
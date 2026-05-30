// apps/web/app/api/reports/[id]/route.ts

import { prisma } from '@medical-center/db';
import { successResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';

// ============================================================================
// GET: Fetch Specific Medical Report & Context
// ============================================================================
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Strict Authentication
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    if (session.role !== "DOCTOR") {
      return apiErrors.forbidden("Only doctors can access clinical report details.");
    }

    const { id } = params;

    // 2. The Prisma Magic Query
    const reportData = await prisma.medicalReport.findUnique({
      where: { id },
      include: {
        medical_record: {
          select: {
            id: true,
            diagnosis: true,
            symptoms: true,
            visit_date_time: true,
            doctor_id: true, // We need this for the security check below
            // Reach further into the Patient Profile
            patient: {
              select: {
                blood_group: true,
                allergies: true,
                user: {
                  select: {
                    name: true,
                    profile_picture: true,
                  }
                }
              }
            }
          }
        }
      }
    });

    // 3. Validation & Security Guardrails
    if (!reportData) {
      return apiErrors.notFound("Report not found.");
    }

    // Ensure the doctor requesting the report is actually the doctor assigned to the record
    if (reportData.medical_record.doctor_id !== session.id) {
      return apiErrors.forbidden("Unauthorized. You are not the attending physician for this record.");
    }

    // 4. Return the massive, beautifully structured payload
    return successResponse({ report: reportData }, "Report retrieved successfully.");

  } catch (error) {
    console.error("Fetch Report Detail Error:", error);
    return apiErrors.internal();
  }
}
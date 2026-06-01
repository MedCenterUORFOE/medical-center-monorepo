// apps/web/app/api/clinical/reports/route.ts

import { prisma } from '@medical-center/db';
import { successResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';

// ============================================================================
// GET: Fetch All Reports for the Logged-in Doctor
// ============================================================================
export async function GET() {
  try {
    // 1. Strict Authentication
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
    if (session.role !== "DOCTOR") {
      return apiErrors.forbidden("Only doctors can access the clinical reports dashboard.");
    }

    const doctorId = session.id;

    // 2. Fetch all reports tied to this specific doctor
    const reports = await prisma.medicalReport.findMany({
      where: {
        medical_record: {
          doctor_id: doctorId // Prisma automatically traverses the relation to filter!
        }
      },
      orderBy: {
        upload_time: 'desc' // Newest reports at the top of the feed
      },
      include: {
        medical_record: {
          select: {
            id: true,
            visit_date_time: true,
            diagnosis: true,
            patient: {
              select: {
                user: {
                  select: { name: true }
                }
              }
            }
          }
        }
      }
    });

    // 3. Format the response to make the frontend developer's life easy
    const formattedReports = reports.map(report => ({
      report_id: report.id,
      record_id: report.record_id,
      type: report.type,
      file_url: report.file_url,
      upload_time: report.upload_time,
      patient_name: report.medical_record.patient.user.name,
      visit_date: report.medical_record.visit_date_time,
      diagnosis: report.medical_record.diagnosis
    }));

    return successResponse({ reports: formattedReports }, "Clinical reports retrieved successfully.");

  } catch (error) {
    console.error("Fetch Clinical Reports Error:", error);
    return apiErrors.internal();
  }
}
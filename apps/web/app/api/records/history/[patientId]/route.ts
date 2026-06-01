// apps/web/app/api/records/history/[patientId]/route.ts

import { prisma } from '@medical-center/db';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getUserSession } from '@/lib/auth';

// ============================================================================
// GET: Fetch Complete Medical History Timeline for a Patient
// ============================================================================
export async function GET(
  request: Request,
  { params }: { params: { patientId: string } }
) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    if (!checkRateLimit(ip, 60, 3600000)) { 
      return errorResponse('Too many history fetch attempts. Please slow down.', 429);
    }

    // === PRODUCTION AUTH & RBAC BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
    const { patientId } = params;

    // ========================================================================
    // STRICT CONDITIONAL RBAC LOGIC
    // ========================================================================
    const isMedicalStaff = ["NURSE", "DOCTOR", "ADMIN"].includes(session.role);
    const isOwner = session.id === patientId;

    // Rule: You must either be a recognized medical staff member, OR you must own this record.
    if (!isMedicalStaff && !isOwner) {
      return apiErrors.forbidden("Unauthorized access to medical records. You can only view your own history.");
    }
    // ========================================================================

    // Verify patient profile actually exists
    const patientExists = await prisma.patientProfile.findUnique({
      where: { user_id: patientId }
    });

    if (!patientExists) {
      return apiErrors.notFound("Patient profile not found.");
    }

    // Fetch chronological medical records, including the diagnosing doctor's name
    const medicalHistory = await prisma.medicalRecord.findMany({
      where: { patient_id: patientId },
      orderBy: { visit_date_time: 'desc' },
      include: {
        doctor: {
          include: {
            staff: {
              include: {
                user: {
                  select: { name: true }
                }
              }
            }
          }
        },
        prescription: {
          include: { items: true }
        },
        reports: true,
      }
    });

    // Transform payload to flatten the doctor's name for easier frontend consumption
    const formattedHistory = medicalHistory.map(record => ({
      ...record,
      doctor_name: record.doctor.staff.user.name,
      doctor: undefined // Strip the deeply nested object
    }));

    // ========================================================================
    // SILENT READ AUDIT LOG (Compliance Feature)
    // If a staff member looks at a patient's history, log the access. 
    // We don't log when patients look at their own data to save DB space.
    // ========================================================================
    if (isMedicalStaff && !isOwner) {
        await prisma.auditLog.create({
            data: {
                user_id: session.id,
                action: "READ_MEDICAL_HISTORY",
                entity_type: "PatientProfile",
                entity_id: patientId,
                ip_address: ip,
                details: JSON.stringify({ message: "Staff accessed patient medical history" })
            }
        });
    }

    return successResponse({ history: formattedHistory }, "Medical history retrieved successfully.");

  } catch (error) {
    console.error("Medical History Fetch Error:", error);
    return apiErrors.internal();
  }
}
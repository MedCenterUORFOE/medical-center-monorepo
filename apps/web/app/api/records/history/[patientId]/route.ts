
import { prisma } from '@medical-center/db';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
// import { getUserSession } from '@/lib/auth';

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
    // const session = await getUserSession();
    // if (!session?.id) return apiErrors.unauthorized();
    // 
    // // Only medical staff OR the actual patient can view this history
    // if (session.role !== "NURSE" && session.role !== "DOCTOR" && session.id !== params.patientId) {
    //   return apiErrors.forbidden("Unauthorized access to medical records.");
    // }

    // === LOCAL TESTING MOCK ===
    // (Bypassing auth check for local Postman testing)

    const { patientId } = params;

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

    return successResponse({ history: formattedHistory }, "Medical history retrieved successfully.");

  } catch (error) {
    console.error("Medical History Fetch Error:", error);
    return apiErrors.internal();
  }
}
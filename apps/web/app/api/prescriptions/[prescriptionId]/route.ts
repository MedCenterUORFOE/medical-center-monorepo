import { prisma } from '@medical-center/db';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: { prescriptionId: string } }
) {
  try {
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();

    const { prescriptionId } = params;

    // 1. Fetch the Prescription AND the parent record ID (so we know who owns it)
    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        items: true,
        // We only select the patient_id from the record for the security check, 
        // we DO NOT fetch the private symptoms or diagnosis!
        record: {
          select: { 
            patient_id: true,
            visit_date_time: true,
            doctor: {
              select: { staff: { select: { user: { select: { name: true } } } } }
            }
          }
        }
      }
    });

    if (!prescription) {
      return apiErrors.notFound("Prescription not found.");
    }

    // ========================================================================
    // STRICT CONDITIONAL RBAC LOGIC
    // ========================================================================
    // Notice we added PHARMACIST here!
    const isMedicalStaff = ["NURSE", "DOCTOR", "PHARMACIST", "ADMIN"].includes(session.role);
    const isOwner = session.id === prescription.record.patient_id;

    if (!isMedicalStaff && !isOwner) {
      return apiErrors.forbidden("You do not have permission to view this prescription.");
    }
    // ========================================================================

    // Format the payload to be clean for the frontend
    const formattedPrescription = {
      id: prescription.id,
      date: prescription.record.visit_date_time,
      doctor_name: prescription.record.doctor.staff.user.name,
      items: prescription.items
    };

    return successResponse({ prescription: formattedPrescription }, "Prescription retrieved successfully.");

  } catch (error) {
    console.error("Prescription Fetch Error:", error);
    return apiErrors.internal();
  }
}
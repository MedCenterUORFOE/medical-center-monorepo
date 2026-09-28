import { prisma } from '@medical-center/db';
import { successResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';

// ============================================================================
// GET: Fetch Active Prescriptions Awaiting Fulfillment (INTERNAL items with remaining qty > 0)
// ============================================================================
export async function GET() {
  try {
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
    if (session.role !== "NURSE" && session.role !== "PHARMACIST" && session.role !== "ADMIN") {
      return apiErrors.forbidden("Unauthorized. Medical and Pharmacy staff only.");
    }

    const currentDate = new Date();

    // Fetch prescriptions, medical records, patient details, and medicine inventory batches
    const prescriptions = await prisma.prescription.findMany({
      where: { is_fulfilled: false },
      select: {
        id: true,
        issued_timestamp: true,
        medical_record: {
          select: {
            patient: { select: { user: { select: { name: true, nic: true } } } },
            doctor: { select: { staff: { select: { user: { select: { name: true } } } } } },
          },
        },
        items: {
          select: {
            id: true,
            prescription_id: true,
            medicine_id: true,
            external_medicine_name: true,
            dosage: true,
            quantity: true,
            instructions: true,
            source: true,
            dispensations: { select: { quantity: true } },
            medicine: {
              select: {
                id: true,
                name: true,
                unit: true,
                inventory_batches: {
                  where: { stock_quantity: { gt: 0 }, expiry_date: { gt: currentDate } },
                  orderBy: { expiry_date: 'asc' },
                  select: { id: true, batch_number: true, stock_quantity: true, expiry_date: true },
                },
              },
            },
          },
        },
      },
      orderBy: { issued_timestamp: 'desc' },
    });

    // Process and filter active prescriptions on the server layer
    const formattedPrescriptions = prescriptions.map((p) => {
      const items = p.items.map((item) => {
        const dispensedQty = item.dispensations.reduce((sum, d) => sum + d.quantity, 0);
        const remainingQty = Math.max(0, item.quantity - dispensedQty);
        
        return {
          id: item.id,
          prescription_id: item.prescription_id,
          medicine_id: item.medicine_id,
          medicine_name: item.medicine?.name || item.external_medicine_name || 'Unknown Medicine',
          dosage: item.dosage,
          quantity: item.quantity,
          instructions: item.instructions,
          source: item.source,
          dispensed_qty: dispensedQty,
          remaining_qty: remainingQty,
          medicine: item.medicine ? {
            id: item.medicine.id,
            name: item.medicine.name,
            unit: item.medicine.unit,
            inventory_batches: item.medicine.inventory_batches.map(b => ({
              id: b.id,
              batch_number: b.batch_number,
              stock_quantity: b.stock_quantity,
              expiry_date: b.expiry_date.toISOString().split('T')[0]
            }))
          } : null
        };
      });

      const isAwaitingFulfillment = items.some(
        (item) => item.source === 'INTERNAL' && item.remaining_qty > 0
      );

      return {
        id: p.id,
        created_at: p.issued_timestamp.toISOString(),
        patient_name: p.medical_record.patient.user.name,
        patient_nic: p.medical_record.patient.user.nic,
        doctor_name: p.medical_record.doctor.staff.user.name,
        items,
        is_active: isAwaitingFulfillment
      };
    }).filter(p => p.is_active);

    return successResponse(
      { prescriptions: formattedPrescriptions },
      "Active prescriptions retrieved successfully."
    );
  } catch (error) {
    console.error("Prescriptions listing error:", error);
    return apiErrors.internal();
  }
}

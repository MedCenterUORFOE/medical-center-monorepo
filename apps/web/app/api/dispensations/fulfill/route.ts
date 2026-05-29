import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getUserSession } from '@/lib/auth';

// -----------------------------------------------------------------------------
// ZOD VALIDATION SCHEMA
// -----------------------------------------------------------------------------
const dispensationSubLotSchema = z.object({
  inventory_batch_id: z.string().uuid("Invalid Batch ID"),
  quantity: z.number().int().positive("Dispensed quantity must be positive"),
});

const fulfillPrescriptionSchema = z.object({
  prescription_item_id: z.string().uuid("Invalid Prescription Item ID"),
  dispensations: z.array(dispensationSubLotSchema).min(1, "At least one batch must be selected"),
});

// ============================================================================
// POST: Fulfill a prescription item by drawing from physical inventory batches
// ============================================================================
export async function POST(request: Request) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    // Limit: 50 dispensations per minute per Nurse/Pharmacist
    if (!checkRateLimit(ip, 50, 60000)) { 
      return errorResponse('Too many fulfillment requests. Please slow down.', 429);
    }

    // === PRODUCTION AUTH & RBAC BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
    // Only Nurses, Pharmacists (and Admins) fulfill actual physical stock
    if (session.role !== "NURSE" && session.role !== "PHARMACIST" && session.role !== "ADMIN") {
      return apiErrors.forbidden("Unauthorized. Only Nurses and Pharmacists can dispense physical inventory.");
    }
    const staffId = session.id;

    const body = await request.json();
    const validatedData = fulfillPrescriptionSchema.parse(body);

    // 1. Verify the Prescription Item exists and requires internal fulfillment
    const prescriptionItem = await prisma.prescriptionItem.findUnique({
      where: { id: validatedData.prescription_item_id },
      include: { dispensations: true }
    });

    if (!prescriptionItem) {
      return apiErrors.notFound("Prescription item not found.");
    }

    if (prescriptionItem.source === "EXTERNAL") {
      return errorResponse("External prescriptions cannot be fulfilled from internal inventory.", 400);
    }

    // 2. Check if it's already fulfilled to prevent double-dispensing
    const alreadyDispensed = prescriptionItem.dispensations.reduce((sum, item) => sum + item.quantity, 0);
    const incomingDispensationTotal = validatedData.dispensations.reduce((sum, item) => sum + item.quantity, 0);

    if (alreadyDispensed + incomingDispensationTotal > prescriptionItem.quantity) {
      return errorResponse(
        `Cannot over-dispense. Required: ${prescriptionItem.quantity}, Already Dispensed: ${alreadyDispensed}, Attempted: ${incomingDispensationTotal}`, 
        400
      );
    }

    // --- THE FULFILLMENT TRANSACTION ---
    const result = await prisma.$transaction(async (tx) => {
      
      const createdDispensations = [];

      // Loop through the "7+3" split lot payload
      for (const subLot of validatedData.dispensations) {
        
        // A. Verify the batch exists and has enough stock
        const batch = await tx.inventoryBatch.findUnique({
          where: { id: subLot.inventory_batch_id }
        });

        if (!batch || batch.stock_quantity < subLot.quantity) {
          throw new Error(`Batch ${subLot.inventory_batch_id} has insufficient stock (Available: ${batch?.stock_quantity || 0}, Requested: ${subLot.quantity}).`);
        }

        // B. Decrement the physical stock atomically
        await tx.inventoryBatch.update({
          where: { id: subLot.inventory_batch_id },
          data: {
            stock_quantity: { decrement: subLot.quantity }
          }
        });

        // C. Log the specific physical item given to the patient
        const dispensedItem = await tx.dispensedItem.create({
          data: {
            prescription_item_id: validatedData.prescription_item_id,
            inventory_batch_id: subLot.inventory_batch_id,
            quantity: subLot.quantity,
          }
        });

        createdDispensations.push(dispensedItem);
      }

      // D. Write the Immutable Audit Ledger
      await tx.auditLog.create({
        data: {
          user_id: staffId,
          action: "FULFILLED_PRESCRIPTION",
          entity_type: "PrescriptionItem",
          entity_id: validatedData.prescription_item_id,
          ip_address: ip,
          details: JSON.stringify({ 
            total_dispensed: incomingDispensationTotal,
            batches_touched: validatedData.dispensations.length
          }),
        }
      });

      return createdDispensations;
    });

    return successResponse(result, "Prescription items successfully dispensed and inventory updated.", 201);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    
    // Catch our custom thrown error from inside the transaction (Insufficient stock)
    if (error instanceof Error && error.message.includes('insufficient stock')) {
      return errorResponse(error.message, 409);
    }

    console.error("Dispensation Fulfillment Error:", error);
    return apiErrors.internal();
  }
}
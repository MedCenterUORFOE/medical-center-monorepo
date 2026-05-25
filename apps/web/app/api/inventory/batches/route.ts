import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
// import { getUserSession } from '@/lib/auth';

// -----------------------------------------------------------------------------
// ZOD SCHEMAS
// -----------------------------------------------------------------------------
const createBatchSchema = z.object({
  medicine_id: z.string().uuid("Invalid Medicine ID format"),
  batch_number: z.string().min(1, "Manufacturer batch number is required"),
  stock_quantity: z.number().int().positive("Stock must be a positive integer"),
  expiry_date: z.coerce.date(),
});

const updateBatchSchema = z.object({
  medicine_id: z.string().uuid("Invalid Medicine ID format"),
  batch_number: z.string().min(1, "Manufacturer batch number is required"),
  added_quantity: z.number().int().positive("Added stock must be a positive integer"),
});

// ============================================================================
// POST: Log a BRAND NEW physical inventory delivery
// ============================================================================
export async function POST(request: Request) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    if (!checkRateLimit(ip, 30, 60000)) { 
      return errorResponse('Too many requests. Please slow down.', 429);
    }

    // === PRODUCTION AUTH & RBAC BLOCK ===
    // const session = await getUserSession();
    // if (!session?.id) return apiErrors.unauthorized();
    // 
    // if (session.role !== "NURSE" && session.role !== "PHARMACIST" && session.role !== "ADMIN") {
    //   return apiErrors.forbidden("Unauthorized. Only Nurses and Pharmacists can log physical inventory deliveries.");
    // }
    // const initiatorId = session.id;

    // === LOCAL TESTING MOCK ===
    const initiatorId = "test-pharmacist-id"; 

    const body = await request.json();
    const validatedData = createBatchSchema.parse(body);

    const medicineExists = await prisma.medicine.findUnique({
      where: { id: validatedData.medicine_id }
    });

    if (!medicineExists) {
      return apiErrors.notFound("Medicine catalog item not found.");
    }

    const result = await prisma.$transaction(async (tx) => {
      const newBatch = await tx.inventoryBatch.create({
        data: {
          medicine_id: validatedData.medicine_id,
          batch_number: validatedData.batch_number,
          stock_quantity: validatedData.stock_quantity,
          expiry_date: validatedData.expiry_date,
        }
      });

      await tx.auditLog.create({
        data: {
          user_id: initiatorId,
          action: "LOGGED_INVENTORY_BATCH",
          entity_type: "InventoryBatch",
          entity_id: newBatch.id,
          ip_address: ip,
          details: JSON.stringify({ 
            medicine_id: validatedData.medicine_id,
            quantity_added: validatedData.stock_quantity,
            is_new_batch: true
          }),
        }
      });

      return newBatch;
    });

    return successResponse(result, "Physical inventory batch logged successfully.", 201);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    
    // Prisma Unique Constraint Violation (P2002) 
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return errorResponse("This exact batch number already exists. Use the Restock feature to add more.", 409);
    }
    
    console.error("Inventory Batch Creation Error:", error);
    return apiErrors.internal();
  }
}

// ============================================================================
// PATCH: Restock an EXISTING inventory batch
// ============================================================================
export async function PATCH(request: Request) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    if (!checkRateLimit(ip, 30, 60000)) { 
      return errorResponse('Too many requests. Please slow down.', 429);
    }

    // === PRODUCTION AUTH & RBAC BLOCK ===
    // const session = await getUserSession();
    // if (!session?.id) return apiErrors.unauthorized();
    // 
    // if (session.role !== "NURSE" && session.role !== "PHARMACIST" && session.role !== "ADMIN") {
    //   return apiErrors.forbidden("Unauthorized. Only Nurses and Pharmacists can restock inventory.");
    // }
    // const initiatorId = session.id;

    // === LOCAL TESTING MOCK ===
    const initiatorId = "test-pharmacist-id"; 

    const body = await request.json();
    const validatedData = updateBatchSchema.parse(body);

    // 1. Verify the batch actually exists using the unique compound key
    const existingBatch = await prisma.inventoryBatch.findUnique({
      where: {
        medicine_id_batch_number: {
          medicine_id: validatedData.medicine_id,
          batch_number: validatedData.batch_number,
        }
      }
    });

    if (!existingBatch) {
      return apiErrors.notFound("Batch not found. Please log this as a new delivery first.");
    }

    // 2. Perform the atomic update
    const result = await prisma.$transaction(async (tx) => {
      
      const updatedBatch = await tx.inventoryBatch.update({
        where: { id: existingBatch.id },
        data: {
          stock_quantity: { increment: validatedData.added_quantity } // Atomic increment
        }
      });

      await tx.auditLog.create({
        data: {
          user_id: initiatorId,
          action: "RESTOCKED_INVENTORY_BATCH",
          entity_type: "InventoryBatch",
          entity_id: updatedBatch.id,
          ip_address: ip,
          details: JSON.stringify({ 
            medicine_id: validatedData.medicine_id,
            quantity_added: validatedData.added_quantity,
            new_total: updatedBatch.stock_quantity
          }),
        }
      });

      return updatedBatch;
    });

    return successResponse(
      result, 
      `Successfully added ${validatedData.added_quantity} units to batch ${validatedData.batch_number}.`
    );

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    
    console.error("Inventory Batch Update Error:", error);
    return apiErrors.internal();
  }
}

// ============================================================================
// GET: Fetch specific physical inventory batches (Read Inventory Levels)
// ============================================================================
export async function GET(request: Request) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    if (!checkRateLimit(ip, 100, 60000)) { 
      return errorResponse('Too many requests. Please slow down.', 429);
    }

    // === PRODUCTION AUTH & RBAC BLOCK ===
    // const session = await getUserSession();
    // if (!session?.id) return apiErrors.unauthorized();
    // 
    // if (session.role !== "NURSE" && session.role !== "PHARMACIST" && session.role !== "ADMIN") {
    //   return apiErrors.forbidden("Unauthorized. Only Pharmacy/Nursing staff can view batch details.");
    // }

    const { searchParams } = new URL(request.url);
    const medicineId = searchParams.get('medicine_id');
    const hideEmpty = searchParams.get('hide_empty') === 'true'; // e.g., ?hide_empty=true

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereClause: any = {};
    
    if (medicineId) {
      whereClause.medicine_id = medicineId;
    }
    
    if (hideEmpty) {
      whereClause.stock_quantity = { gt: 0 };
    }

    const batches = await prisma.inventoryBatch.findMany({
      where: whereClause,
      include: {
        medicine: {
          select: { name: true, unit: true, category: true } // Bring in the abstract catalog details
        }
      },
      // FEFO (First-Expire-First-Out): Sort by expiry date so the soonest expiring batches are at the top
      orderBy: { expiry_date: 'asc' }, 
    });

    return successResponse(
      { batches }, 
      "Inventory batches retrieved successfully."
    );

  } catch (error) {
    console.error("Inventory Batch Fetch Error:", error);
    return apiErrors.internal();
  }
}
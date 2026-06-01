import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getUserSession } from '@/lib/auth';

// ============================================================================
// GET: Fetch Medicine Catalog with Aggregated Active Stock
// ============================================================================
export async function GET(request: Request) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    // Limit: 100 requests per minute to support fast typeahead searching
    if (!checkRateLimit(ip, 100, 60000)) { 
      return errorResponse('Too many catalog searches. Please slow down.', 429);
    }

    // === PRODUCTION AUTH & RBAC BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
    // Only medical staff and pharmacists should be browsing the internal catalog
    if (session.role !== "DOCTOR" && session.role !== "NURSE" && session.role !== "PHARMACIST" && session.role !== "ADMIN") {
      return apiErrors.forbidden("Unauthorized. Medical and Pharmacy staff only.");
    }

    // Parse the search query (e.g., ?search=para)
    const { searchParams } = new URL(request.url);
    const searchQuery = searchParams.get('search') || "";

    const currentDate = new Date();

    // 1. Fetch medicines matching the search string, including their valid batches
    const medicines = await prisma.medicine.findMany({
      where: {
        name: {
          contains: searchQuery,
          mode: 'insensitive', // Case-insensitive search
        }
      },
      include: {
        inventory_batches: {
          where: {
            stock_quantity: { gt: 0 }, // Only fetch batches that have stock
            expiry_date: { gt: currentDate } // CRITICAL: Exclude expired batches
          },
          select: {
            stock_quantity: true
          }
        }
      },
      take: 20, // Limit results for fast typeahead performance
      orderBy: { name: 'asc' }
    });

    // 2. Aggregate the stock mathematically on the server layer
    const aggregatedCatalog = medicines.map((med) => {
      // Sum up the quantities across all valid batches for this specific medicine
      const totalAvailableStock = med.inventory_batches.reduce((sum, batch) => sum + batch.stock_quantity, 0);

      return {
        id: med.id,
        name: med.name,
        category: med.category,
        unit: med.unit,
        total_available_stock: totalAvailableStock,
        // Pre-formatted string to satisfy Member B's exact UI requirement
        display_string: `${med.name} - Available: ${totalAvailableStock} ${med.unit}`
      };
    });

    return successResponse(
      { catalog: aggregatedCatalog }, 
      "Medicine catalog aggregated successfully."
    );

  } catch (error) {
    console.error("Medicine Catalog Fetch Error:", error);
    return apiErrors.internal();
  }
}

// -----------------------------------------------------------------------------
// ZOD SCHEMA FOR POST
// -----------------------------------------------------------------------------
const createMedicineSchema = z.object({
  name: z.string().min(2, "Medicine name is required"),
  category: z.string().min(2, "Category is required (e.g., Antibiotic, Painkiller)"),
  unit: z.string().min(1, "Unit is required (e.g., Tablets, ml, mg)"),
});

// ============================================================================
// POST: Add a new abstract medicine to the global catalog
// ============================================================================
export async function POST(request: Request) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    if (!checkRateLimit(ip, 20, 60000)) { 
      return errorResponse('Too many requests. Please slow down.', 429);
    }

    // === PRODUCTION AUTH & RBAC BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
    // Only Doctors, Nurses, Pharmacists, and Admins can define new catalog concepts
    if (session.role !== "DOCTOR" && session.role !== "NURSE" && session.role !== "PHARMACIST" && session.role !== "ADMIN") {
      return apiErrors.forbidden("Unauthorized. Only authorized staff can expand the medical catalog.");
    }
    const initiatorId = session.id;

    const body = await request.json();
    const validatedData = createMedicineSchema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the new abstract medicine
      const newMedicine = await tx.medicine.create({
        data: {
          name: validatedData.name,
          category: validatedData.category,
          unit: validatedData.unit,
        }
      });

      // 2. Log the action
      await tx.auditLog.create({
        data: {
          user_id: initiatorId,
          action: "CREATED_CATALOG_ITEM",
          entity_type: "Medicine",
          entity_id: newMedicine.id,
          ip_address: ip,
          details: JSON.stringify({ name: validatedData.name }),
        }
      });

      return newMedicine;
    });

    return successResponse(result, "New medicine added to catalog.", 201);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error("Catalog Creation Error:", error);
    return apiErrors.internal();
  }
}
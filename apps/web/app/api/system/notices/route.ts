// apps/web/app/api/system/notices/route.ts

import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';

// -----------------------------------------------------------------------------
// ZOD VALIDATION SCHEMA
// -----------------------------------------------------------------------------
const RoleEnum = z.enum([
  'STUDENT', 'ACADEMIC_STAFF', 'DOCTOR', 
  'NURSE', 'ADMIN', 'AMBULANCE_DRIVER', 'PHARMACIST'
]);

const createNoticeSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100, "Title is too long"),
  message: z.string().min(5, "Message must be at least 5 characters"),
  target_roles: z.array(RoleEnum).min(1, "You must select at least one target audience"),
  expires_at: z.coerce.date().optional(),
});

// ============================================================================
// GET: Fetch Active Notices (For the user's dashboard)
// ============================================================================
export async function GET() {
  try {
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
   // Explicitly cast the session string to the exact types Prisma expects
const userRole = session.role as "STUDENT" | "ACADEMIC_STAFF" | "DOCTOR" | "NURSE" | "ADMIN" | "AMBULANCE_DRIVER" | "PHARMACIST";

    const notices = await prisma.systemNotice.findMany({
      where: {
        is_active: true,
        target_roles: {
          has: userRole // Only pulls notices meant for this user's specific role
        },
        OR: [
          { expires_at: null },
          { expires_at: { gt: new Date() } } 
        ]
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        title: true,
        message: true,
        created_at: true,
        creator: { select: { name: true, role: true } } 
      }
    });

    return successResponse({ notices }, "Notices retrieved successfully.");

  } catch (error) {
    console.error("Fetch Notices Error:", error);
    return apiErrors.internal();
  }
}

// ============================================================================
// POST: Create a New System Notice
// ============================================================================
export async function POST(request: Request) {
  try {
    // === STRICT AUTH & RBAC ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
    // Only Admins and Doctors can create notices
    if (session.role !== "ADMIN" && session.role !== "DOCTOR") {
      return apiErrors.forbidden("Only Administrators and Doctors can post system notices.");
    }
    const staffId = session.id;

    const body = await request.json();
    const validatedData = createNoticeSchema.parse(body);

    // ====================================================================
    // --- THE HIERARCHY GUARDRAIL ---
    // Doctors can group-send to anyone... except Admins.
    // ====================================================================
    if (session.role === "DOCTOR" && validatedData.target_roles.includes("ADMIN")) {
      return apiErrors.forbidden("Doctors do not have permission to broadcast notices to Administrators.");
    }
    // ====================================================================

    const result = await prisma.$transaction(async (tx) => {
      
      const newNotice = await tx.systemNotice.create({
        data: {
          title: validatedData.title,
          message: validatedData.message,
          target_roles: validatedData.target_roles,
          expires_at: validatedData.expires_at,
          created_by: staffId
        }
      });

      const forwardedFor = request.headers.get('x-forwarded-for');
      const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';

      await tx.auditLog.create({
        data: {
          user_id: staffId,
          action: "CREATED_SYSTEM_NOTICE",
          entity_type: "SystemNotice",
          entity_id: newNotice.id,
          ip_address: ip,
          details: JSON.stringify({ 
            title: validatedData.title, 
            targets: validatedData.target_roles 
          }),
        }
      });

      return newNotice;
    });

    return successResponse({ notice: result }, "System notice posted successfully.", 201);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error("Create Notice Error:", error);
    return apiErrors.internal();
  }
}
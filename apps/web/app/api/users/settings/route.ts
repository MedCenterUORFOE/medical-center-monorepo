/**
 * PROFILE SETTINGS ENDPOINT (PATCH /api/users/settings)
 * * --- AUTHENTICATION TESTING STRATEGY ---
 * * DEVELOPMENT MODE (Current):
 * Hardcoded `const userId = "test-user-id"`.
 * Ensure a user with this ID exists and has completed their profile.
 * * PRODUCTION MODE:
 * Uncomment `getUserSession()` and extract `session.id`.
 * ---------------------------------------
 */


import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
// import { getUserSession } from '@/lib/auth';

const settingsSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-z0-9_]+$/).optional(),
  phone: z.string().min(10).optional(),
  nic: z.string().min(10).optional(),

  emergency_contact_name: z.string().min(2).optional(),
  emergency_contact_number: z.string().min(10).optional(),
  university_email: z.string().email().optional(),
  department: z.string().optional(),

  university_reg_number: z.string().optional(),
  faculty: z.string().optional(),
  year_of_study: z.coerce.number().optional(),
  batch: z.string().optional(),

  university_staff_id: z.string().optional(),
  position: z.string().optional(),
});

export async function PATCH(request: Request) {
  try {
    // === PRODUCTION AUTH BLOCK ===
    // const session = await getUserSession();
    // if (!session?.id) return apiErrors.unauthorized();
    // const userId = session.id;
    
    // === LOCAL TESTING MOCK ===
    const userId = "test-user-id"; 

    const body = await request.json();
    const validatedData = settingsSchema.parse(body);

    if (validatedData.username) {
      const existingUser = await prisma.user.findUnique({
        where: { username: validatedData.username }
      });

      if (existingUser && existingUser.id !== userId) {
        return errorResponse("Username is already taken", 400);
      }
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (!currentUser) {
      return apiErrors.notFound("User not found");
    }

    await prisma.$transaction(async (tx) => {
      
      if (validatedData.username || validatedData.phone || validatedData.nic) {
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(validatedData.username && { username: validatedData.username }), 
            ...(validatedData.phone && { phone: validatedData.phone }),
            ...(validatedData.nic && { nic: validatedData.nic }),
          },
        });
      }

      if (currentUser.role === "STUDENT") {
        await tx.student.update({
          where: { student_id: userId },
          data: {
            ...(validatedData.university_reg_number && { university_reg_number: validatedData.university_reg_number }),
            ...(validatedData.university_email && { university_email: validatedData.university_email }),
            ...(validatedData.faculty && { faculty: validatedData.faculty }),
            ...(validatedData.department && { department: validatedData.department }),
            ...(validatedData.year_of_study && { year_of_study: validatedData.year_of_study }),
            ...(validatedData.batch && { batch: validatedData.batch }),
            ...(validatedData.emergency_contact_name && { emergency_contact_name: validatedData.emergency_contact_name }),
            ...(validatedData.emergency_contact_number && { emergency_contact_number: validatedData.emergency_contact_number }),
          }
        });
      } else if (currentUser.role === "ACADEMIC_STAFF") {
        await tx.academicStaff.update({
          where: { academic_staff_id: userId },
          data: {
            ...(validatedData.university_staff_id && { university_staff_id: validatedData.university_staff_id }),
            ...(validatedData.university_email && { university_email: validatedData.university_email }),
            ...(validatedData.department && { department: validatedData.department }),
            ...(validatedData.position && { position: validatedData.position }),
            ...(validatedData.emergency_contact_name && { emergency_contact_name: validatedData.emergency_contact_name }),
            ...(validatedData.emergency_contact_number && { emergency_contact_number: validatedData.emergency_contact_number }),
          }
        });
      }

      const forwardedFor = request.headers.get('x-forwarded-for');
      const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';

      const changedKeys = Object.keys(validatedData).filter(key => validatedData[key as keyof typeof validatedData] !== undefined);

      await tx.auditLog.create({
        data: {
          user_id: userId,
          action: "SETTINGS_UPDATED",
          entity_type: "User",
          entity_id: userId,
          ip_address: ip,
          details: JSON.stringify({ 
            message: "User updated their personal settings",
            updated_fields: changedKeys 
          }),
        }
      });
    });

    return successResponse(null, "Settings successfully updated.");

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error("Settings Update Error:", error);
    return apiErrors.internal();
  }
}
/**
 * PROFILE COMPLETION ENDPOINT (PATCH /api/users/complete-profile)
 * * --- AUTHENTICATION TESTING STRATEGY ---
 * * DEVELOPMENT MODE (Current):
 * To enable rapid API testing via Postman/Thunder Client without needing to 
 * generate a fresh JWT every 15 minutes, the session validation is currently 
 * commented out. We are using a hardcoded `const userId = "test-user-id"`.
 * Ensure a user with this ID exists in your local database to test the 
 * Prisma transaction and Zod validation.
 * * PRODUCTION MODE (Action Required Before Deployment):
 * 1. Delete or comment out: `const userId = "test-user-id";`
 * 2. Uncomment the `getUserSession()` block.
 * 3. Ensure the extracted `session.id` is passed to the Prisma transaction.
 * ---------------------------------------
 */

import { NextResponse } from 'next/server';
import prisma from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
// import { getUserSession } from '@/lib/auth';

const completeProfileSchema = z.object({
  role: z.enum(["STUDENT", "ACADEMIC_STAFF"]),
  
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be less than 20 characters")
    .regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores"),
  
  phone: z.string().min(10, "Valid phone number required"),
  nic: z.string().min(10, "NIC is required"),
  emergency_contact_name: z.string().min(2, "Emergency contact name required"),
  emergency_contact_number: z.string().min(10, "Emergency contact number required"),
  
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
    const validatedData = completeProfileSchema.parse(body);

    const existingUser = await prisma.user.findUnique({
      where: { username: validatedData.username }
    });

    if (existingUser && existingUser.id !== userId) {
      return errorResponse("Username is already taken", 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          username: validatedData.username,
          phone: validatedData.phone,
          nic: validatedData.nic,
          role: validatedData.role, 
          is_profile_complete: true,
        },
      });

      // Create the EMPTY Patient Profile Shell (Clinical fields handled by Medical Staff)
      await tx.patientProfile.upsert({
        where: { user_id: userId },
        update: {}, 
        create: { user_id: userId }
      });

      if (validatedData.role === "STUDENT") {
        await tx.student.upsert({
          where: { student_id: userId },
          update: {
            university_reg_number: validatedData.university_reg_number!,
            university_email: validatedData.university_email,
            faculty: validatedData.faculty!,
            department: validatedData.department,
            year_of_study: validatedData.year_of_study!,
            batch: validatedData.batch!,
            emergency_contact_name: validatedData.emergency_contact_name,
            emergency_contact_number: validatedData.emergency_contact_number,
          },
          create: {
            student_id: userId,
            university_reg_number: validatedData.university_reg_number!,
            university_email: validatedData.university_email,
            faculty: validatedData.faculty!,
            department: validatedData.department,
            year_of_study: validatedData.year_of_study!,
            batch: validatedData.batch!,
            emergency_contact_name: validatedData.emergency_contact_name,
            emergency_contact_number: validatedData.emergency_contact_number,
          }
        });
      } else if (validatedData.role === "ACADEMIC_STAFF") {
        await tx.academicStaff.upsert({
          where: { academic_staff_id: userId },
          update: {
            university_staff_id: validatedData.university_staff_id!,
            university_email: validatedData.university_email,
            department: validatedData.department!,
            position: validatedData.position!,
            emergency_contact_name: validatedData.emergency_contact_name,
            emergency_contact_number: validatedData.emergency_contact_number,
          },
          create: {
            academic_staff_id: userId,
            university_staff_id: validatedData.university_staff_id!,
            university_email: validatedData.university_email,
            department: validatedData.department!,
            position: validatedData.position!,
            emergency_contact_name: validatedData.emergency_contact_name,
            emergency_contact_number: validatedData.emergency_contact_number,
          }
        });
      }

      const forwardedFor = request.headers.get('x-forwarded-for');
      const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';

      await tx.auditLog.create({
        data: {
          user_id: userId,
          action: "PROFILE_COMPLETED",
          entity_type: "User",
          entity_id: userId,
          ip_address: ip,
          details: JSON.stringify({ 
            message: "Initial profile completion",
            role: validatedData.role 
          }),
        }
      });

      return user;
    });

    return successResponse(
      { user: { id: result.id, is_profile_complete: result.is_profile_complete } }, 
      "Profile successfully completed."
    );

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error("Profile Completion Error:", error);
    return apiErrors.internal();
  }
}
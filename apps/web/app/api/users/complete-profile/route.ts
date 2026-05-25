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

import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
// import { getUserSession } from '@/lib/auth';

const completeProfileSchema = z.object({
  role: z.enum(["STUDENT", "ACADEMIC_STAFF", "DOCTOR", "NURSE", "PHARMACIST", "AMBULANCE_DRIVER"]), // FIX: Updated to AMBULANCE_DRIVER
  
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be less than 20 characters")
    .regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores")
    .optional(),
  
  phone: z.string().min(10, "Valid phone number required"),
  nic: z.string().min(10, "NIC is required"),
  
  // These are optional because Medical Staff and Drivers don't have these fields in the DB schema
  emergency_contact_name: z.string().optional(),
  emergency_contact_number: z.string().optional(),
  university_email: z.string().email().optional(),

  // --- NESTED PAYLOADS (Mapped to Frontend Structure) ---
  student_details: z.object({
    university_reg_number: z.string(),
    faculty: z.string(),
    department: z.string().optional(),
    year_of_study: z.coerce.number(),
    batch: z.string(),
  }).optional(),

  academic_staff_details: z.object({
    university_staff_id: z.string(),
    department: z.string(),
    position: z.string(),
  }).optional(),

  medical_staff_details: z.object({
    license_number: z.string().min(4, "Valid license number is required"),
    university_staff_id: z.string().optional(),
  }).optional(),

  doctor_details: z.object({
    specialization: z.string().min(2, "Specialization is required"),
  }).optional(),

  driver_details: z.object({
    vehicle_registration: z.string().min(4, "Vehicle registration is required"),
    university_staff_id: z.string().optional(),
  }).optional(),

}).superRefine((data, ctx) => {
  // Strict conditional validation ensuring the correct nested object is provided
  if (data.role === "STUDENT" && !data.student_details) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "student_details object is required", path: ["student_details"] });
  }
  if (data.role === "ACADEMIC_STAFF" && !data.academic_staff_details) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "academic_staff_details object is required", path: ["academic_staff_details"] });
  }
  
  const medicalRoles = ["DOCTOR", "NURSE", "PHARMACIST"];
  if (medicalRoles.includes(data.role) && !data.medical_staff_details) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "medical_staff_details object is required", path: ["medical_staff_details"] });
  }
  if (data.role === "DOCTOR" && !data.doctor_details) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "doctor_details object is required for doctors", path: ["doctor_details"] });
  }

  // FIX: Updated to AMBULANCE_DRIVER
  if (data.role === "AMBULANCE_DRIVER" && !data.driver_details) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "driver_details object is required", path: ["driver_details"] });
  }
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

    if (validatedData.username) {
      const existingUser = await prisma.user.findUnique({
        where: { username: validatedData.username }
      });

      if (existingUser && existingUser.id !== userId) {
        return errorResponse("Username is already taken", 400);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          ...(validatedData.username && { username: validatedData.username }),
          phone: validatedData.phone,
          nic: validatedData.nic,
          role: validatedData.role, 
          is_profile_complete: true,
        },
      });

      // Create the EMPTY Patient Profile Shell (Clinical fields handled by Medical Staff later)
      await tx.patientProfile.upsert({
        where: { user_id: userId },
        update: {}, 
        create: { user_id: userId }
      });

      // --- SUBTYPE ROUTING ---
      if (validatedData.role === "STUDENT") {
        const sd = validatedData.student_details!;
        await tx.student.upsert({
          where: { student_id: userId },
          update: {
            university_reg_number: sd.university_reg_number,
            university_email: validatedData.university_email,
            faculty: sd.faculty,
            department: sd.department,
            year_of_study: sd.year_of_study,
            batch: sd.batch,
            emergency_contact_name: validatedData.emergency_contact_name,
            emergency_contact_number: validatedData.emergency_contact_number,
          },
          create: {
            student_id: userId,
            university_reg_number: sd.university_reg_number,
            university_email: validatedData.university_email,
            faculty: sd.faculty,
            department: sd.department,
            year_of_study: sd.year_of_study,
            batch: sd.batch,
            emergency_contact_name: validatedData.emergency_contact_name || "",
            emergency_contact_number: validatedData.emergency_contact_number || "",
          }
        });
      } else if (validatedData.role === "ACADEMIC_STAFF") {
        const ad = validatedData.academic_staff_details!;
        await tx.academicStaff.upsert({
          where: { academic_staff_id: userId },
          update: {
            university_staff_id: ad.university_staff_id,
            university_email: validatedData.university_email,
            department: ad.department,
            position: ad.position,
            emergency_contact_name: validatedData.emergency_contact_name,
            emergency_contact_number: validatedData.emergency_contact_number,
          },
          create: {
            academic_staff_id: userId,
            university_staff_id: ad.university_staff_id,
            university_email: validatedData.university_email,
            department: ad.department,
            position: ad.position,
            emergency_contact_name: validatedData.emergency_contact_name || "",
            emergency_contact_number: validatedData.emergency_contact_number || "",
          }
        });
      } else if (["DOCTOR", "NURSE", "PHARMACIST"].includes(validatedData.role)) {
        // We use UPDATE here because the Admin Provisioning route already created the rows!
        const md = validatedData.medical_staff_details!;
        await tx.medicalCenterStaff.update({
          where: { staff_id: userId },
          data: {
            license_number: md.license_number,
            university_staff_id: md.university_staff_id,
          }
        });

        if (validatedData.role === "DOCTOR") {
          const dd = validatedData.doctor_details!;
          await tx.doctor.update({
            where: { doctor_id: userId },
            data: { specialization: dd.specialization }
          });
        }
      } else if (validatedData.role === "AMBULANCE_DRIVER") { // FIX: Updated to AMBULANCE_DRIVER
        const dd = validatedData.driver_details!;
        await tx.ambulanceDriver.update({
          where: { driver_id: userId },
          data: {
            vehicle_registration: dd.vehicle_registration,
            university_staff_id: dd.university_staff_id,
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
//apps/web/app/api/users/complete-profile/route.ts
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


 /*
import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';
import { verifyPatientStatus } from '@/lib/patient-verification';

// 1. DYNAMIC SCHEMA FACTORY
// We pass the secure database role into this function to build the exact validation rules needed.
const buildProfileSchema = (secureRole: string) => {
  return z.object({
    // Notice: 'role' is completely removed from the incoming payload!

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
    // We use the 'secureRole' from the database, ignoring anything the client might have tried to inject.
    if (secureRole === "STUDENT" && !data.student_details) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "student_details object is required", path: ["student_details"] });
    }
    if (secureRole === "ACADEMIC_STAFF" && !data.academic_staff_details) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "academic_staff_details object is required", path: ["academic_staff_details"] });
    }
    
    const medicalRoles = ["DOCTOR", "NURSE", "PHARMACIST"];
    if (medicalRoles.includes(secureRole) && !data.medical_staff_details) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "medical_staff_details object is required", path: ["medical_staff_details"] });
    }
    if (secureRole === "DOCTOR" && !data.doctor_details) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "doctor_details object is required for doctors", path: ["doctor_details"] });
    }

    // FIX: Updated to AMBULANCE_DRIVER
    if (secureRole === "AMBULANCE_DRIVER" && !data.driver_details) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "driver_details object is required", path: ["driver_details"] });
    }
  });
};

export async function PATCH(request: Request) {
  try {
    // === PRODUCTION AUTH BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    const userId = session.id;
    
    // === FETCH TRUE ROLE & STATUS FROM DB ===
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, is_profile_complete: true }
    });

    if (!currentUser) return apiErrors.unauthorized("User not found in database");
    
    // THE RESTORED GUARDRAIL
    if (currentUser.is_profile_complete) {
      return errorResponse("This profile is already complete.", 400);
    }

    const trueRole = currentUser.role;

    const patientStatusError = await verifyPatientStatus(userId);
    if (patientStatusError) return patientStatusError;

    const body = await request.json();
    const schema = buildProfileSchema(trueRole);
    const validatedData = schema.parse(body);

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
          // Notice: We completely removed 'role: validatedData.role' here. 
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
      if (trueRole === "STUDENT") {
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
      } else if (trueRole === "ACADEMIC_STAFF") {
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
      } else if (["DOCTOR", "NURSE", "PHARMACIST"].includes(trueRole)) {
        // We use UPDATE here because the Admin Provisioning route already created the rows!
        const md = validatedData.medical_staff_details!;
        await tx.medicalCenterStaff.update({
          where: { staff_id: userId },
          data: {
            license_number: md.license_number,
            university_staff_id: md.university_staff_id,
          }
        });

        if (trueRole === "DOCTOR") {
          const dd = validatedData.doctor_details!;
          await tx.doctor.update({
            where: { doctor_id: userId },
            data: { specialization: dd.specialization }
          });
        }
      } else if (trueRole === "AMBULANCE_DRIVER") { // FIX: Updated to AMBULANCE_DRIVER
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
            role: trueRole 
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
  */

/**
 * ACTIVE IMPLEMENTATION
 *
 * Two distinct completion flows, split by the user's true (DB) role:
 *
 * 1. SELF-REGISTRATION (STUDENT, ACADEMIC_STAFF, ADMIN)
 *    The user supplies name, phone, nic, and role-specific details themselves.
 *
 * 2. STAFF ONBOARDING (DOCTOR, NURSE, PHARMACIST, AMBULANCE_DRIVER)
 *    These accounts are admin-provisioned. NIC, university_staff_id,
 *    license_number, specialization, and vehicle_registration are all set by
 *    the Admin at creation time (see /api/admin/users) and are NOT editable
 *    here. The staff member only supplies phone + an optional username.
 *    If the admin-owned data is missing or still a legacy "PENDING" value,
 *    completion is blocked until an admin fixes it via
 *    PATCH /api/admin/users/[userId].
 */

import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';
import { verifyPatientStatus } from '@/lib/patient-verification';

const MEDICAL_ROLES = ["DOCTOR", "NURSE", "PHARMACIST"] as const;
const STAFF_PROVISIONED_ROLES = [...MEDICAL_ROLES, "AMBULANCE_DRIVER"] as const;

const isLegacyPendingValue = (value: string | null | undefined) =>
  !!value && value.toUpperCase().startsWith("PENDING");

// ============================================================================
// SELF-REGISTRATION SCHEMA (STUDENT / ACADEMIC_STAFF / ADMIN)
// ============================================================================
const buildSelfRegistrationSchema = (secureRole: string) => {
  return z.object({
    name: z.string().min(2, "Full name is required"),

    username: z.string()
      .min(3, "Username must be at least 3 characters")
      .max(20, "Username must be less than 20 characters")
      .regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores")
      .optional(),

    phone: z.string().min(10, "Valid phone number required"),
    nic: z.string().min(10, "NIC is required"),

    emergency_contact_name: z.string().optional(),
    emergency_contact_number: z.string().optional(),
    university_email: z.string().email().optional(),

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

  }).superRefine((data, ctx) => {
    if (secureRole === "STUDENT" && !data.student_details) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "student_details object is required", path: ["student_details"] });
    }
    if (secureRole === "ACADEMIC_STAFF" && !data.academic_staff_details) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "academic_staff_details object is required", path: ["academic_staff_details"] });
    }
  });
};

// ============================================================================
// STAFF ONBOARDING SCHEMA (DOCTOR / NURSE / PHARMACIST / AMBULANCE_DRIVER)
// Credentials are admin-owned — only phone + optional username are accepted.
// `.strict()` rejects any other key (nic, name, medical_staff_details, etc.)
// with a clear validation error instead of silently ignoring it.
// ============================================================================
const staffOnboardingSchema = z.object({
  phone: z.string().min(10, "Valid phone number required"),
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be less than 20 characters")
    .regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores")
    .optional(),
}).strict();

export async function PATCH(request: Request) {
  try {
    // === PRODUCTION AUTH BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    const userId = session.id;

    // === FETCH TRUE ROLE, STATUS, AND ADMIN-OWNED DATA FROM DB ===
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        is_profile_complete: true,
        nic: true,
        medicalCenterStaff: {
          select: {
            university_staff_id: true,
            license_number: true,
            doctor: { select: { specialization: true } },
          }
        },
        ambulanceDriver: {
          select: {
            university_staff_id: true,
            vehicle_registration: true,
          }
        }
      }
    });

    if (!currentUser) return apiErrors.unauthorized("User not found in database");

    // THE RESTORED GUARDRAIL
    if (currentUser.is_profile_complete) {
      return errorResponse("This profile is already complete.", 400);
    }

    const trueRole = currentUser.role;
    const isStaffProvisioned = (STAFF_PROVISIONED_ROLES as readonly string[]).includes(trueRole);

    const patientStatusError = await verifyPatientStatus(userId);
    if (patientStatusError) return patientStatusError;

    const body = await request.json();

    // ========================================================================
    // STAFF ONBOARDING PATH
    // ========================================================================
    if (isStaffProvisioned) {
      // Guard: admin must have fully configured this account first.
      const missing: string[] = [];

      if (!currentUser.nic) missing.push("NIC");

      if ((MEDICAL_ROLES as readonly string[]).includes(trueRole)) {
        const mcs = currentUser.medicalCenterStaff;
        if (!mcs?.university_staff_id) missing.push("university staff ID");
        if (!mcs?.license_number || isLegacyPendingValue(mcs.license_number)) missing.push("license number");
        if (
          trueRole === "DOCTOR" &&
          (!mcs?.doctor?.specialization || isLegacyPendingValue(mcs.doctor.specialization))
        ) {
          missing.push("specialization");
        }
      }

      if (trueRole === "AMBULANCE_DRIVER") {
        const ad = currentUser.ambulanceDriver;
        if (!ad?.university_staff_id) missing.push("university staff ID");
        if (!ad?.vehicle_registration || isLegacyPendingValue(ad.vehicle_registration)) missing.push("vehicle registration");
      }

      if (missing.length > 0) {
        return errorResponse(
          `Your account setup is incomplete (${missing.join(", ")}). Please contact an administrator before completing your profile.`,
          400
        );
      }

      const validatedData = staffOnboardingSchema.parse(body);

      if (validatedData.username) {
        const existingUsernameUser = await prisma.user.findUnique({
          where: { username: validatedData.username }
        });
        if (existingUsernameUser && existingUsernameUser.id !== userId) {
          return errorResponse("Username is already taken", 400);
        }
      }

      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: userId },
          data: {
            ...(validatedData.username && { username: validatedData.username }),
            phone: validatedData.phone,
            is_profile_complete: true,
          },
        });

        // Empty patient profile shell, consistent with other roles
        await tx.patientProfile.upsert({
          where: { user_id: userId },
          update: {},
          create: { user_id: userId }
        });

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
              message: "Initial profile completion (staff onboarding)",
              role: trueRole
            }),
          }
        });

        return user;
      });

      return successResponse(
        { user: { id: result.id, is_profile_complete: result.is_profile_complete } },
        "Profile successfully completed."
      );
    }

    // ========================================================================
    // SELF-REGISTRATION PATH (STUDENT / ACADEMIC_STAFF / ADMIN)
    // ========================================================================
    const schema = buildSelfRegistrationSchema(trueRole);
    const validatedData = schema.parse(body);

    if (validatedData.username) {
      const existingUsernameUser = await prisma.user.findUnique({
        where: { username: validatedData.username }
      });
      if (existingUsernameUser && existingUsernameUser.id !== userId) {
        return errorResponse("Username is already taken", 400);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          name: validatedData.name,
          ...(validatedData.username && { username: validatedData.username }),
          phone: validatedData.phone,
          nic: validatedData.nic,
          is_profile_complete: true,
        },
      });

      await tx.patientProfile.upsert({
        where: { user_id: userId },
        update: {},
        create: { user_id: userId }
      });

      if (trueRole === "STUDENT") {
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
      } else if (trueRole === "ACADEMIC_STAFF") {
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
            role: trueRole
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
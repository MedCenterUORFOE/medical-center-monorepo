// apps/web/app/api/admin/users/[userId]/route.ts

import { prisma } from '@medical-center/db';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limiter';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';

const MEDICAL_ROLES = ["DOCTOR", "NURSE", "PHARMACIST"] as const;

export async function DELETE(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    // === PRODUCTION AUTH & RBAC ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    
    // Strictly enforce Admin privileges
    if (session.role !== 'ADMIN') {
      return apiErrors.forbidden("Only Administrators can permanently delete accounts.");
    }

    const adminId = session.id;
    const targetUserId = params.userId;

    // GUARDRAIL: Prevent Admin from deleting themselves
    if (adminId === targetUserId) {
      return errorResponse("Action blocked: You cannot delete your own active administrator account.", 403);
    }

    await prisma.$transaction(async (tx: any) => {
      const targetUser = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { role: true },
      });

      if (!targetUser) throw new Error('Target user not found');

      // ── STEP 1: FREE UP UNIQUE IDENTIFIERS IN SUB-PROFILES ─────────────────
      
      // ── STUDENT ──
      await tx.student.deleteMany({ where: { student_id: targetUserId } });

      // ── ACADEMIC STAFF ──
      await tx.extraCertificateRecipient.deleteMany({ where: { staff_id: targetUserId } });
      await tx.academicStaff.deleteMany({ where: { academic_staff_id: targetUserId } });

      // ── AMBULANCE DRIVER ──
      await tx.emergencyRequest.updateMany({
        where: { driver_id: targetUserId },
        data: { driver_id: null },
      });
      await tx.ambulanceDriver.deleteMany({ where: { driver_id: targetUserId } });

      // ── MEDICAL CENTER STAFF (DOCTOR / NURSE / PHARMACIST) ──
      if (targetUser.role === 'DOCTOR') {
        await tx.medicalCenterStaff.updateMany({
          where: { staff_id: targetUserId },
          data: {
            license_number: `anon_${targetUserId.substring(0, 8)}`,
            university_staff_id: null,
          },
        });
      } else {
        await tx.medicalCenterStaff.deleteMany({ where: { staff_id: targetUserId } });
      }

      // ── STEP 2: ANONYMIZE PATIENT PROFILE ───────────────────────────────────
      await tx.patientProfile.updateMany({
        where: { user_id: targetUserId },
        data: {
          blood_group: null,
          allergies: null,
          special_notes: null,
          height: null,
          weight: null,
          date_of_birth: null,
        },
      });

      // ── STEP 3: ANONYMIZE THE USER ROW ──────────────────────────────────────
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          email: `deleted_${targetUserId.substring(0, 8)}@anonymized.local`,
          name: 'Deleted User',
          username: null,
          nic: null,
          phone: null,
          googleId: null,
          password_hash: null,
          profile_picture: null,
          status: 'SUSPENDED',
        },
      });

      // ── STEP 4: AUDIT LOG ────────────────────────────────────────────────────
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown-ip';

      await tx.auditLog.create({
        data: {
          user_id: adminId, // The admin executed the action
          action: 'ADMIN_ANONYMIZED_USER',
          entity_type: 'User',
          entity_id: targetUserId, // The user who was deleted
          ip_address: ip,
          details: JSON.stringify({
            message: `Administrator securely deleted and anonymized user account ${targetUserId}.`,
          }),
        },
      });
    });

    // Notice: We do NOT clear the session cookie here, because the Admin needs to stay logged in.
    return successResponse(null, 'Target account securely deleted and anonymized.');
    
  } catch (error) {
    console.error('Admin Deletion Error:', error);
    if (error instanceof Error && error.message === 'Target user not found') {
        return errorResponse("User not found.", 404);
    }
    return apiErrors.internal();
  }
}

// ============================================================================
// GET: Load a staff member's current admin-owned credential fields (for an edit form)
// ============================================================================
export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    if (session.role !== 'ADMIN') return apiErrors.forbidden();

    const targetUserId = params.userId;

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        nic: true,
        phone: true,
        username: true,
        is_profile_complete: true,
        created_at: true,
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

    if (!user) return errorResponse("User not found.", 404);

    return successResponse({ user }, "User retrieved successfully");

  } catch (error) {
    console.error('Admin Fetch User Error:', error);
    return apiErrors.internal();
  }
}

// ============================================================================
// PATCH: Admin-only edits to staff credential fields (not user-editable)
// ============================================================================
const adminUpdateSchema = z.object({
  name: z.string().min(2, "Name is required").optional(),
  email: z.string().email("Invalid email address").optional(),
  nic: z.string().min(10, "NIC is required").optional(),

  // Admin-owned staff credential fields
  university_staff_id: z.string().min(1, "University staff ID is required").optional(),
  license_number: z.string().min(4, "Valid license number is required").optional(),
  specialization: z.string().min(2, "Specialization is required").optional(),
  vehicle_registration: z.string().min(4, "Vehicle registration is required").optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';

    if (!checkRateLimit(ip, 30, 3600000)) {
      return errorResponse('Too many update attempts.', 429);
    }

    // === PRODUCTION AUTH & RBAC ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    if (session.role !== 'ADMIN') {
      return apiErrors.forbidden("Only Administrators can edit staff credentials.");
    }
    const adminId = session.id;
    const targetUserId = params.userId;

    const body = await request.json();
    const validatedData = adminUpdateSchema.parse(body);

    if (Object.keys(validatedData).length === 0) {
      return errorResponse("No fields provided to update.", 400);
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        role: true,
        email: true,
        nic: true,
        medicalCenterStaff: {
          select: { staff_id: true, university_staff_id: true, license_number: true }
        },
        ambulanceDriver: {
          select: { driver_id: true, university_staff_id: true }
        },
      }
    });

    if (!targetUser) return errorResponse("User not found.", 404);

    const isMedicalStaff = (MEDICAL_ROLES as readonly string[]).includes(targetUser.role);
    const isDriver = targetUser.role === "AMBULANCE_DRIVER";
    const isDoctor = targetUser.role === "DOCTOR";

    // --- Reject fields that don't apply to this user's role ---
    if (validatedData.license_number !== undefined && !isMedicalStaff) {
      return errorResponse("license_number only applies to doctors, nurses, and pharmacists.", 400);
    }
    if (validatedData.specialization !== undefined && !isDoctor) {
      return errorResponse("specialization only applies to doctors.", 400);
    }
    if (validatedData.vehicle_registration !== undefined && !isDriver) {
      return errorResponse("vehicle_registration only applies to ambulance drivers.", 400);
    }
    if (validatedData.university_staff_id !== undefined && !isMedicalStaff && !isDriver) {
      return errorResponse("university_staff_id only applies to medical staff and ambulance drivers.", 400);
    }

    // --- Uniqueness checks (only when the value is actually changing) ---
    if (validatedData.email && validatedData.email !== targetUser.email) {
      const existing = await prisma.user.findUnique({ where: { email: validatedData.email } });
      if (existing && existing.id !== targetUserId) {
        return errorResponse("An account with this email already exists", 409);
      }
    }

    if (validatedData.nic && validatedData.nic !== targetUser.nic) {
      const existing = await prisma.user.findUnique({ where: { nic: validatedData.nic } });
      if (existing && existing.id !== targetUserId) {
        return errorResponse("An account with this NIC already exists", 409);
      }
    }

    if (validatedData.university_staff_id) {
      const currentValue =
        targetUser.medicalCenterStaff?.university_staff_id ??
        targetUser.ambulanceDriver?.university_staff_id;

      if (validatedData.university_staff_id !== currentValue) {
        const [existingMedical, existingDriver] = await Promise.all([
          prisma.medicalCenterStaff.findUnique({ where: { university_staff_id: validatedData.university_staff_id } }),
          prisma.ambulanceDriver.findUnique({ where: { university_staff_id: validatedData.university_staff_id } }),
        ]);
        if (
          (existingMedical && existingMedical.staff_id !== targetUserId) ||
          (existingDriver && existingDriver.driver_id !== targetUserId)
        ) {
          return errorResponse("An account with this university staff ID already exists", 409);
        }
      }
    }

    if (
      validatedData.license_number &&
      validatedData.license_number !== targetUser.medicalCenterStaff?.license_number
    ) {
      const existing = await prisma.medicalCenterStaff.findUnique({
        where: { license_number: validatedData.license_number }
      });
      if (existing && existing.staff_id !== targetUserId) {
        return errorResponse("An account with this license number already exists", 409);
      }
    }

    const changedFields = Object.keys(validatedData);

    await prisma.$transaction(async (tx: any) => {
      if (validatedData.name || validatedData.email || validatedData.nic) {
        await tx.user.update({
          where: { id: targetUserId },
          data: {
            ...(validatedData.name && { name: validatedData.name }),
            ...(validatedData.email && { email: validatedData.email }),
            ...(validatedData.nic && { nic: validatedData.nic }),
          }
        });
      }

      if (isMedicalStaff && (validatedData.university_staff_id || validatedData.license_number)) {
        await tx.medicalCenterStaff.update({
          where: { staff_id: targetUserId },
          data: {
            ...(validatedData.university_staff_id && { university_staff_id: validatedData.university_staff_id }),
            ...(validatedData.license_number && { license_number: validatedData.license_number }),
          }
        });
      }

      if (isDoctor && validatedData.specialization) {
        await tx.doctor.update({
          where: { doctor_id: targetUserId },
          data: { specialization: validatedData.specialization }
        });
      }

      if (isDriver && (validatedData.university_staff_id || validatedData.vehicle_registration)) {
        await tx.ambulanceDriver.update({
          where: { driver_id: targetUserId },
          data: {
            ...(validatedData.university_staff_id && { university_staff_id: validatedData.university_staff_id }),
            ...(validatedData.vehicle_registration && { vehicle_registration: validatedData.vehicle_registration }),
          }
        });
      }

      await tx.auditLog.create({
        data: {
          user_id: adminId,
          action: "ADMIN_STAFF_UPDATED",
          entity_type: "User",
          entity_id: targetUserId,
          ip_address: ip,
          details: JSON.stringify({
            message: `Administrator updated staff credentials for user ${targetUserId}.`,
            updated_fields: changedFields,
          }),
        }
      });
    });

    return successResponse(null, "Staff account successfully updated.");

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error('Admin Update Error:', error);
    return apiErrors.internal();
  }
}
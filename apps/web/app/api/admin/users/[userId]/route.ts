// apps/web/app/api/admin/users/[userId]/route.ts

import { prisma } from '@medical-center/db';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';

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

    await prisma.$transaction(async (tx) => {
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
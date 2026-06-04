import { prisma } from '@medical-center/db';
import { successResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';

export async function DELETE(request: Request) {
  try {
    // === PRODUCTION AUTH ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    const userId = session.id;

    await prisma.$transaction(async (tx) => {
      const currentUser = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      if (!currentUser) throw new Error('User not found');

      // ── STEP 1: FREE UP UNIQUE IDENTIFIERS IN SUB-PROFILES ─────────────────
      //
      // The goal: remove (or anonymize) the rows that hold unique identifiers
      // like university_reg_number, university_staff_id, license_number, so that
      // a new person can re-register with the same credentials later.
      //
      // Each sub-profile type needs different handling depending on what other
      // tables reference it and whether those references have onDelete: Cascade.

      // ── STUDENT ─────────────────────────────────────────────────────────────
      // Nothing else in the schema references the Student table, so a straight
      // delete is safe and frees up university_reg_number + university_email.
      await tx.student.deleteMany({ where: { student_id: userId } });

      // ── ACADEMIC STAFF ───────────────────────────────────────────────────────
      // ExtraCertificateRecipient.staff_id → AcademicStaff with no onDelete
      // clause, so Postgres will block the AcademicStaff delete if any recipient
      // rows exist. Clean those up first (the person is no longer a valid
      // recipient anyway), then delete the staff row itself.
      await tx.extraCertificateRecipient.deleteMany({ where: { staff_id: userId } });
      await tx.academicStaff.deleteMany({ where: { academic_staff_id: userId } });

      // ── AMBULANCE DRIVER ─────────────────────────────────────────────────────
      // EmergencyRequest.driver_id is nullable (String?) with no cascade.
      // Null it out on any historical dispatches first — this preserves the
      // emergency records — then delete the driver row, which also cascades
      // to DriverAvailability.
      await tx.emergencyRequest.updateMany({
        where: { driver_id: userId },
        data: { driver_id: null },
      });
      await tx.ambulanceDriver.deleteMany({ where: { driver_id: userId } });

      // ── MEDICAL CENTER STAFF (DOCTOR / NURSE / PHARMACIST) ──────────────────
      // Doctors have appointment, medical record, prescription, and certificate
      // history that must be preserved for legal/clinical reasons. We cannot
      // delete the Doctor or MedicalCenterStaff rows without breaking those
      // FK chains. Instead, overwrite the two unique identifier fields so the
      // license number and staff ID are freed for a new registrant.
      //
      // Nurses and Pharmacists have no such blocking dependencies — their only
      // child tables (NurseAvailability, PharmacistAvailability) both declare
      // onDelete: Cascade, so deleting MedicalCenterStaff cascades cleanly.
      if (currentUser.role === 'DOCTOR') {
        await tx.medicalCenterStaff.updateMany({
          where: { staff_id: userId },
          data: {
            // license_number is NOT NULL + @unique — can't be null, must stay unique
            license_number: `anon_${userId}`,
            // university_staff_id is nullable — clear it
            university_staff_id: null,
          },
        });
      } else {
        // NURSE, PHARMACIST — or any other role that has no med-center row
        // (deleteMany is a no-op when there are no matching rows, so this is safe
        // to run unconditionally for all other roles too)
        await tx.medicalCenterStaff.deleteMany({ where: { staff_id: userId } });
      }

      // ── STEP 2: ANONYMIZE PATIENT PROFILE ───────────────────────────────────
      //
      // WHY NOT DELETE: PatientProfile is referenced by Appointment, MedicalRecord,
      // and MedicalCertificateRequest without onDelete: Cascade.  By the time this
      // endpoint runs in a real system (or after the full test suite has run),
      // those child records exist and will block the delete with a FK violation —
      // this was the immediate cause of the 500.
      //
      // Medical history must also be retained for clinical/legal reasons.
      // Re-registration does NOT require removing the PatientProfile anyway —
      // a new registrant gets a new User UUID and therefore a new PatientProfile
      // row; the old anonymized one is simply left as an orphaned clinical archive.
      //
      // So: null out every PII field and leave the row in place.
      await tx.patientProfile.updateMany({
        where: { user_id: userId },
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
      //
      // Keep the row with status SUSPENDED so the audit trail and any remaining
      // clinical FK references stay valid. Clear every PII and credential field,
      // including verification/reset tokens — leaving stale @unique token values
      // in the DB is harmless but noisy, and clearing them is good hygiene.
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted_${userId}@anonymized.local`,
          name: 'Deleted User',
          username: null,
          nic: null,
          phone: null,
          googleId: null,
          password_hash: null,
          profile_picture: null,
          verification_token: null,
          verification_expires: null,
          reset_token: null,
          reset_expires: null,
          fcm_token: null,
          status: 'SUSPENDED',
        },
      });

      // ── STEP 4: AUDIT LOG ────────────────────────────────────────────────────
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown-ip';

      await tx.auditLog.create({
        data: {
          user_id: userId,
          action: 'ACCOUNT_ANONYMIZED',
          entity_type: 'User',
          entity_id: userId,
          ip_address: ip,
          details: JSON.stringify({
            message: 'User requested account deletion and data anonymization.',
          }),
        },
      });
    });

    const response = successResponse(null, 'Account securely deleted.');

    // Kill the session cookie immediately
    response.cookies.set('session_token', '', { maxAge: 0 });

    return response;
  } catch (error) {
    console.error('Deletion Error:', error);
    return apiErrors.internal();
  }
}
// apps/web/app/api/users/onboarding-status/route.ts

/**
 * ONBOARDING STATUS ENDPOINT (GET /api/users/onboarding-status)
 *
 * Lets the frontend build a complete-profile screen that only asks for what's
 * actually missing, instead of guessing from the login payload alone.
 *
 * - For STAFF_PROVISIONED_ROLES (DOCTOR/NURSE/PHARMACIST/AMBULANCE_DRIVER),
 *   admin-owned fields (nic, university_staff_id, license_number,
 *   specialization, vehicle_registration) are checked against the DB,
 *   including detection of legacy "PENDING" placeholder values.
 * - For STUDENT/ACADEMIC_STAFF/ADMIN (self-registration), each field the
 *   user fills in themselves is broken out individually — including the
 *   nested student/academic-staff details — not just nic/phone/username.
 * - `pending_user_input` only ever lists fields that are actually REQUIRED
 *   to complete the profile (matches buildSelfRegistrationSchema /
 *   staffOnboardingSchema in complete-profile). Optional fields (username,
 *   emergency contact info, university_email, etc.) are still reported in
 *   `fields` with their completion state, but never appear in
 *   `pending_user_input`, since the user isn't blocked on them.
 * - `admin_setup_complete: false` tells the UI to show a "contact your
 *   administrator" message instead of a broken form (staff roles only).
 */

import { prisma } from '@medical-center/db';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';

const MEDICAL_ROLES = ["DOCTOR", "NURSE", "PHARMACIST"] as const;
const STAFF_PROVISIONED_ROLES = [...MEDICAL_ROLES, "AMBULANCE_DRIVER"] as const;

const isLegacyPendingValue = (value: string | null | undefined) =>
  !!value && value.toUpperCase().startsWith("PENDING");

type FieldStatus = { complete: boolean; source: "admin" | "user" };

export async function GET() {
  try {
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    const userId = session.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        is_profile_complete: true,
        name: true,
        nic: true,
        phone: true,
        username: true,
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
        },
        student: {
          select: {
            university_reg_number: true,
            faculty: true,
            department: true,
            year_of_study: true,
            batch: true,
            university_email: true,
            emergency_contact_name: true,
            emergency_contact_number: true,
          }
        },
        academicStaff: {
          select: {
            university_staff_id: true,
            university_email: true,
            department: true,
            position: true,
            emergency_contact_name: true,
            emergency_contact_number: true,
          }
        },
      }
    });

    if (!user) return errorResponse("User not found.", 404);

    const fields: Record<string, FieldStatus> = {};
    const pendingUserInput: string[] = [];
    let adminSetupComplete = true;

    if ((STAFF_PROVISIONED_ROLES as readonly string[]).includes(user.role)) {
      // ========================================================
      // STAFF ONBOARDING (DOCTOR / NURSE / PHARMACIST / DRIVER)
      // ========================================================

      // --- Admin-owned fields ---
      const nicOk = !!user.nic;
      fields.nic = { complete: nicOk, source: "admin" };
      if (!nicOk) adminSetupComplete = false;

      if ((MEDICAL_ROLES as readonly string[]).includes(user.role)) {
        const mcs = user.medicalCenterStaff;

        const staffIdOk = !!mcs?.university_staff_id;
        fields.university_staff_id = { complete: staffIdOk, source: "admin" };
        if (!staffIdOk) adminSetupComplete = false;

        const licenseOk = !!mcs?.license_number && !isLegacyPendingValue(mcs.license_number);
        fields.license_number = { complete: licenseOk, source: "admin" };
        if (!licenseOk) adminSetupComplete = false;

        if (user.role === "DOCTOR") {
          const specOk = !!mcs?.doctor?.specialization && !isLegacyPendingValue(mcs.doctor.specialization);
          fields.specialization = { complete: specOk, source: "admin" };
          if (!specOk) adminSetupComplete = false;
        }
      }

      if (user.role === "AMBULANCE_DRIVER") {
        const ad = user.ambulanceDriver;

        const staffIdOk = !!ad?.university_staff_id;
        fields.university_staff_id = { complete: staffIdOk, source: "admin" };
        if (!staffIdOk) adminSetupComplete = false;

        const vehicleOk = !!ad?.vehicle_registration && !isLegacyPendingValue(ad.vehicle_registration);
        fields.vehicle_registration = { complete: vehicleOk, source: "admin" };
        if (!vehicleOk) adminSetupComplete = false;
      }

      // --- User-owned fields (matches staffOnboardingSchema) ---
      // phone: required
      const phoneOk = !!user.phone;
      fields.phone = { complete: phoneOk, source: "user" };
      if (!phoneOk) pendingUserInput.push("phone");

      // username: optional — reported, never blocks completion
      fields.username = { complete: !!user.username, source: "user" };

    } else {
      // ========================================================
      // SELF-REGISTRATION (STUDENT / ACADEMIC_STAFF / ADMIN)
      // ========================================================

      // --- Fields required for every self-registered role ---
      const nameOk = !!user.name;
      fields.name = { complete: nameOk, source: "user" };
      if (!nameOk) pendingUserInput.push("name");

      const nicOk = !!user.nic;
      fields.nic = { complete: nicOk, source: "user" };
      if (!nicOk) pendingUserInput.push("nic");

      const phoneOk = !!user.phone;
      fields.phone = { complete: phoneOk, source: "user" };
      if (!phoneOk) pendingUserInput.push("phone");

      // username: optional — reported, never blocks completion
      fields.username = { complete: !!user.username, source: "user" };

      if (user.role === "STUDENT") {
        const sd = user.student;

        const regNumOk = !!sd?.university_reg_number;
        fields.university_reg_number = { complete: regNumOk, source: "user" };
        if (!regNumOk) pendingUserInput.push("university_reg_number");

        const facultyOk = !!sd?.faculty;
        fields.faculty = { complete: facultyOk, source: "user" };
        if (!facultyOk) pendingUserInput.push("faculty");

        const yearOk = sd?.year_of_study !== undefined && sd?.year_of_study !== null;
        fields.year_of_study = { complete: yearOk, source: "user" };
        if (!yearOk) pendingUserInput.push("year_of_study");

        const batchOk = !!sd?.batch;
        fields.batch = { complete: batchOk, source: "user" };
        if (!batchOk) pendingUserInput.push("batch");

        // Optional — reported, never blocks completion
        fields.department = { complete: !!sd?.department, source: "user" };
        fields.university_email = { complete: !!sd?.university_email, source: "user" };
        fields.emergency_contact_name = { complete: !!sd?.emergency_contact_name, source: "user" };
        fields.emergency_contact_number = { complete: !!sd?.emergency_contact_number, source: "user" };

      } else if (user.role === "ACADEMIC_STAFF") {
        const asr = user.academicStaff;

        const staffIdOk = !!asr?.university_staff_id;
        fields.university_staff_id = { complete: staffIdOk, source: "user" };
        if (!staffIdOk) pendingUserInput.push("university_staff_id");

        const departmentOk = !!asr?.department;
        fields.department = { complete: departmentOk, source: "user" };
        if (!departmentOk) pendingUserInput.push("department");

        const positionOk = !!asr?.position;
        fields.position = { complete: positionOk, source: "user" };
        if (!positionOk) pendingUserInput.push("position");

        // Optional — reported, never blocks completion
        fields.university_email = { complete: !!asr?.university_email, source: "user" };
        fields.emergency_contact_name = { complete: !!asr?.emergency_contact_name, source: "user" };
        fields.emergency_contact_number = { complete: !!asr?.emergency_contact_number, source: "user" };
      }
      // ADMIN: no nested details — name/nic/phone/username above cover it.
    }

    return successResponse(
      {
        is_profile_complete: user.is_profile_complete,
        role: user.role,
        fields,
        pending_user_input: pendingUserInput,
        admin_setup_complete: adminSetupComplete,
      },
      "Onboarding status retrieved successfully"
    );

  } catch (error) {
    console.error("Onboarding Status Error:", error);
    return apiErrors.internal();
  }
}
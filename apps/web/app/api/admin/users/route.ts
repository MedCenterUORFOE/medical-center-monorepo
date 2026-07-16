//apps/web/app/api/admin/users/route.ts

/**
 * STAFF PROVISIONING ENDPOINT (POST /api/admin/users)
 * * --- ARCHITECTURAL NOTE: TWO PROVISIONING FLOWS ---
 * * FLOW A: Admin-Provisioned Credentials (CURRENTLY ACTIVE)
 * - Why: Bypasses Resend Sandbox limits and simplifies local onboarding.
 * - How: The Admin manually sets a password in the UI. The API hashes it 
 * and instantly sets the user's status to 'VERIFIED'. No email is sent.
 * - Hand-off: The Admin securely shares the credentials directly with the staff.
 * * FLOW B: Setup Token via Email (COMMENTED OUT)
 * - Why: Better for larger organizations where admins shouldn't know passwords.
 * - How to switch back:
 * 1. Remove `password` from the `provisionSchema`.
 * 2. Uncomment the `crypto.randomBytes` setup token logic.
 * 3. In `tx.user.create`, remove `password_hash` and `status: 'VERIFIED'`.
 * 4. Restore `status: 'UNVERIFIED'`, `reset_token`, and `reset_expires`.
 * 5. Uncomment the `resend.emails.send` block at the bottom.
 * ---------------------------------------
 *
 * --- CREDENTIAL OWNERSHIP NOTE (Admin-provisioned staff) ---
 * For DOCTOR / NURSE / PHARMACIST / AMBULANCE_DRIVER, the Admin now supplies
 * university_staff_id, license_number, specialization, and vehicle_registration
 * at creation time. These are admin-owned fields going forward:
 *   - The staff member can never set or edit them via complete-profile/settings.
 *   - The Admin can edit them later via PATCH /api/admin/users/[userId].
 * ---------------------------------------
 */

import { NextRequest } from 'next/server';
import { prisma } from '@medical-center/db';
import { z } from 'zod';
import bcrypt from 'bcryptjs'; // ADDED: Required for Flow A
//import crypto from 'crypto';
//import { resend } from '@/lib/resend';
import { checkRateLimit } from '@/lib/rate-limiter';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
import { getUserSession } from '@/lib/auth';

const MEDICAL_ROLES = ["DOCTOR", "NURSE", "PHARMACIST"] as const;

// Validating the Admin's input
const provisionSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(2, "Name is required"),
  role: z.enum(["DOCTOR", "NURSE", "PHARMACIST", "ADMIN", "AMBULANCE_DRIVER"]),
  nic: z.string().min(10, "NIC is required"),
  password: z.string().min(8, "Password must be at least 8 characters"), // ADDED: Admin provides initial password

  // --- Admin-owned staff credential fields (role-conditional, see superRefine) ---
  university_staff_id: z.string().min(1, "University staff ID is required").optional(),
  license_number: z.string().min(4, "Valid license number is required").optional(),
  specialization: z.string().min(2, "Specialization is required").optional(),
  vehicle_registration: z.string().min(4, "Vehicle registration is required").optional(),
}).superRefine((data, ctx) => {
  const isMedical = (MEDICAL_ROLES as readonly string[]).includes(data.role);
  const isDriver = data.role === "AMBULANCE_DRIVER";

  if ((isMedical || isDriver) && !data.university_staff_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "university_staff_id is required for this role",
      path: ["university_staff_id"],
    });
  }

  if (isMedical && !data.license_number) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "license_number is required for this role",
      path: ["license_number"],
    });
  }

  if (data.role === "DOCTOR" && !data.specialization) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "specialization is required for doctors",
      path: ["specialization"],
    });
  }

  if (isDriver && !data.vehicle_registration) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "vehicle_registration is required for ambulance drivers",
      path: ["vehicle_registration"],
    });
  }
});

export async function POST(request: Request) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    if (!checkRateLimit(ip, 20, 3600000)) { 
      return errorResponse('Too many provisioning attempts.', 429);
    }

    // === PRODUCTION AUTH BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    if (session.role !== "ADMIN") return apiErrors.forbidden();
    const adminId = session.id;

    const body = await request.json();
    const {
      email,
      name,
      role,
      nic,
      password,
      university_staff_id,
      license_number,
      specialization,
      vehicle_registration,
    } = provisionSchema.parse(body);

    // --- GRACEFUL CONSTRAINT CHECKING ---
    // Looks for a match on either Email or NIC to prevent a 500 DB Crash
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { nic }
        ]
      }
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return errorResponse("An account with this email already exists", 409);
      }
      if (existingUser.nic === nic) {
        return errorResponse("An account with this NIC already exists", 409);
      }
    }

    // --- Credential uniqueness pre-checks (staff ID must be globally consistent) ---
    if (university_staff_id) {
      const [existingMedicalStaffId, existingDriverStaffId] = await Promise.all([
        prisma.medicalCenterStaff.findUnique({ where: { university_staff_id } }),
        prisma.ambulanceDriver.findUnique({ where: { university_staff_id } }),
      ]);
      if (existingMedicalStaffId || existingDriverStaffId) {
        return errorResponse("An account with this university staff ID already exists", 409);
      }
    }

    if (license_number) {
      const existingLicense = await prisma.medicalCenterStaff.findUnique({ where: { license_number } });
      if (existingLicense) {
        return errorResponse("An account with this license number already exists", 409);
      }
    }

    // --- Hash the Admin-Provided Password (FLOW A) ---
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // --- Legacy Token Logic (FLOW B) ---
    // const setupToken = crypto.randomBytes(32).toString('hex');
    // const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); 

    // THE SECURE TRANSACTION
    const newUser = await prisma.$transaction(async (tx) => {
      
      // 1. Create Base Identity
      const user = await tx.user.create({
        data: {
          email,
          name,
          role,
          nic,
          status: 'VERIFIED',         // FLOW A: Instantly verified
          password_hash,              // FLOW A: Password injected
          is_profile_complete: false,
          
          // FLOW B: Uncomment these if switching back to Email Setup
          // status: 'UNVERIFIED',
          // reset_token: setupToken, 
          // reset_expires: tokenExpiry
        }
      });

      // 2. Create the Subtypes based on Role
      if (role === "DOCTOR" || role === "NURSE" || role === "PHARMACIST") {
        const staff = await tx.medicalCenterStaff.create({
          data: {
            staff_id: user.id,
            license_number: license_number!,
            university_staff_id: university_staff_id!,
          }
        });

        if (role === "DOCTOR") {
          await tx.doctor.create({ data: { doctor_id: staff.staff_id, specialization: specialization! } });
        } else if (role === "NURSE") {
          await tx.nurse.create({ data: { nurse_id: staff.staff_id } });
        } else if (role === "PHARMACIST") {
          await tx.pharmacist.create({ data: { pharmacist_id: staff.staff_id } });
        }
      } else if (role === "AMBULANCE_DRIVER") {
        await tx.ambulanceDriver.create({
          data: {
            driver_id: user.id,
            vehicle_registration: vehicle_registration!,
            university_staff_id: university_staff_id!,
          }
        });
      }

      await tx.auditLog.create({
        data: {
          user_id: adminId, 
          action: "STAFF_PROVISIONED",
          entity_type: "User",
          entity_id: user.id,
          ip_address: ip,
          details: JSON.stringify({ 
            message: `Admin provisioned a new ${role} account (Direct Credential Flow).`,
            provisioned_email: email
          }),
        }
      });

      return user;
    });

    // ==========================================
    // --- EMAIL DISPATCH (FLOW B - DISABLED) ---
    // ==========================================
    /*
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const setupLink = `${appUrl}/setup-account?token=${setupToken}`;

    await resend.emails.send({
      from: 'Medical Center <admin@resend.dev>', 
      to: email, 
      subject: `Welcome to the Medical Center - ${role} Account Setup`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Hello ${name},</h2>
          <p>An administrator has provisioned a <strong>${role}</strong> account for you at the Medical Center.</p>
          <p>Please click the link below to set your secure password and activate your account:</p>
          <a href="${setupLink}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Setup My Account</a>
          <p style="margin-top: 20px; font-size: 12px; color: #666;">This secure link will expire in 7 days.</p>
        </div>
      `
    });
    */

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash: _ph, ...safeUser } = newUser;

    return successResponse(
      { user: safeUser }, 
      `${role} account successfully created and verified. Staff can now log in.`,
      201
    );

  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.errors);
    }
    console.error("Admin Provisioning Error:", error);
    return apiErrors.internal();
  }
}

// ============================================================================
// GET: Paginated, Searchable, and Filterable User Directory for the Admin
// ============================================================================
export async function GET(request: NextRequest) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    if (!checkRateLimit(ip, 100, 300000)) { 
      return errorResponse('Too many requests. Please slow down.', 429);
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role');
    const status = searchParams.get('status');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereClause: any = {};

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { nic: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      whereClause.role = role;
    }

    if (status) {
      whereClause.status = status;
    }

    const skip = (page - 1) * limit;

    const [users, totalCount] = await prisma.$transaction([
      prisma.user.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' }, 
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          created_at: true,
          is_profile_complete: true,
        },
      }),
      prisma.user.count({ where: whereClause }), 
    ]);

    return successResponse(
      {
        users,
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
      'Users retrieved successfully'
    );

  } catch (error) {
    console.error("Admin User Fetch Error:", error);
    return apiErrors.internal();
  }
}
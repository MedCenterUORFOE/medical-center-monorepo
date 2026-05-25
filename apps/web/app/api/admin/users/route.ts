import { NextRequest } from 'next/server'; // FIX: Imported NextRequest
import { prisma } from '@medical-center/db';
import { z } from 'zod';
import crypto from 'crypto';
import { Resend } from 'resend';
import { checkRateLimit } from '@/lib/rate-limiter';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';

const resend = new Resend(process.env.RESEND_API_KEY);

// Validating the Admin's input
const provisionSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(2, "Name is required"),
  role: z.enum(["DOCTOR", "NURSE", "PHARMACIST", "ADMIN", "AMBULANCE_DRIVER"]), // FIX: Updated enum
  nic: z.string().min(10, "NIC is required"),
});

export async function POST(request: Request) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    if (!checkRateLimit(ip, 20, 3600000)) { 
      return errorResponse('Too many provisioning attempts.', 429);
    }

    const body = await request.json();
    const { email, name, role, nic } = provisionSchema.parse(body);

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return errorResponse("An account with this email already exists", 409);
    }

    // Generate a secure setup token (Valid for 7 days)
    const setupToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); 

    // THE SECURE TRANSACTION
    const newUser = await prisma.$transaction(async (tx) => {
      
      // 1. Create Base Identity
      const user = await tx.user.create({
        data: {
          email,
          name,
          role,
          nic,
          status: 'UNVERIFIED',
          is_profile_complete: false,
          reset_token: setupToken, 
          reset_expires: tokenExpiry
        }
      });

      // 2. Create the Subtypes based on Role
      if (role === "DOCTOR" || role === "NURSE" || role === "PHARMACIST") {
        // Create the Middle Tier
        const staff = await tx.medicalCenterStaff.create({
          data: {
            staff_id: user.id, // PK maps to User ID
            license_number: `PENDING-${user.id.substring(0, 8)}`, // Temporary placeholder
          }
        });

        // Create the Final Tier
        if (role === "DOCTOR") {
          await tx.doctor.create({ data: { doctor_id: staff.staff_id, specialization: "PENDING" } });
        } else if (role === "NURSE") {
          await tx.nurse.create({ data: { nurse_id: staff.staff_id } });
        } else if (role === "PHARMACIST") {
          await tx.pharmacist.create({ data: { pharmacist_id: staff.staff_id } });
        }
      } else if (role === "AMBULANCE_DRIVER") { // FIX: Updated role check
        await tx.ambulanceDriver.create({
          data: {
            driver_id: user.id,
            vehicle_registration: "PENDING",
          }
        });
      }

      const adminId = request.headers.get('x-user-id') || 'system-admin';

      await tx.auditLog.create({
        data: {
          user_id: adminId, 
          action: "STAFF_PROVISIONED",
          entity_type: "User",
          entity_id: user.id,
          ip_address: ip,
          details: JSON.stringify({ 
            message: `Admin provisioned a new ${role} account.`,
            provisioned_email: email
          }),
        }
      });

      return user;
    });

    // --- EMAIL DISPATCH ---
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...safeUser } = newUser;

    return successResponse(
      { user: safeUser }, 
      `${role} account provisioned. Setup email sent successfully.`,
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
        // FIX: Removed university_reg_number because it crashes the User table query
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
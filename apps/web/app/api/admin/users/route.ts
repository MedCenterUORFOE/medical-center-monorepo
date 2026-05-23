import { NextRequest, NextResponse } from 'next/server';
import prisma from '@medical-center/db';
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
  role: z.enum(["DOCTOR", "NURSE", "PHARMACIST", "ADMIN", "DRIVER"]),
  nic: z.string().min(10, "NIC is required"),
});

export async function POST(request: Request) {
  try {
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    if (!checkRateLimit(ip, 20, 3600000)) { // 20 provisions per hour
      return errorResponse('Too many provisioning attempts.', 429);
    }

    // --- SECURITY NOTE ---
    // We do NOT need to check if the user is an ADMIN here.
    // Your middleware.ts is already configured to block anyone 
    // without the 'ADMIN' role from accessing '/api/admin/*' !

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
      
      const user = await tx.user.create({
        data: {
          email,
          name,
          role,
          nic,
          status: 'UNVERIFIED',
          is_profile_complete: false,
          reset_token: setupToken, // We repurpose the reset token for account setup!
          reset_expires: tokenExpiry
        }
      });

      // To extract the Admin's ID who made this request, we read the header 
      // injected by your middleware!
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
    // They will be directed to a "Setup Account" page which functions almost 
    // exactly like your "Reset Password" page on the frontend.
    const setupLink = `${appUrl}/setup-account?token=${setupToken}`;

    await resend.emails.send({
      from: 'Medical Center <admin@resend.dev>', // MUST use this for unverified Resend testing
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
    // --- RATE LIMITING ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';
    
    // Higher limit for GET requests since navigating pages triggers this often
    if (!checkRateLimit(ip, 100, 300000)) { 
      return errorResponse('Too many requests. Please slow down.', 429);
    }

    // 1. Extract Query Parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role');
    const status = searchParams.get('status');

    // 2. Build the Dynamic Prisma WHERE Clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereClause: any = {};

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { nic: { contains: search, mode: 'insensitive' } },
        { university_reg_number: { contains: search, mode: 'insensitive' } }, // Assuming this exists on your User model, else remove
      ];
    }

    if (role) {
      whereClause.role = role;
    }

    if (status) {
      whereClause.status = status;
    }

    // 3. Execute Database Query with Pagination
    const skip = (page - 1) * limit;

    const [users, totalCount] = await prisma.$transaction([
      prisma.user.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' }, // Newest users first
        select: {
          // WE NEVER SELECT THE PASSWORD HASH OR TOKENS HERE
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          created_at: true,
          is_profile_complete: true,
        },
      }),
      prisma.user.count({ where: whereClause }), // Get the total for frontend pagination math
    ]);

    // 4. Return the standard response
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
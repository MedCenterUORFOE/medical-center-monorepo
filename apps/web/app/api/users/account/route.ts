import { NextResponse } from 'next/server';
import prisma from '@medical-center/db';
import { successResponse, apiErrors } from '@/lib/api-response';
// import { getUserSession } from '@/lib/auth';

export async function DELETE(request: Request) {
  try {
    // === PRODUCTION AUTH ===
    // const session = await getUserSession();
    // if (!session?.id) return apiErrors.unauthorized();
    // const userId = session.id;

    // === LOCAL TESTING ===
    const userId = "test-user-id";

    await prisma.$transaction(async (tx) => {
      const currentUser = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true }
      });

      if (!currentUser) throw new Error("User not found");

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
          status: 'SUSPENDED', 
        },
      });

      if (currentUser.role === "STUDENT") {
        await tx.student.update({
          where: { student_id: userId },
          data: {
            university_email: null,
            emergency_contact_name: null,
            emergency_contact_number: "0000000000", 
          }
        });
      } else if (currentUser.role === "ACADEMIC_STAFF") {
        await tx.academicStaff.update({
          where: { academic_staff_id: userId },
          data: {
            university_email: null,
            emergency_contact_name: null,
            emergency_contact_number: "0000000000", 
          }
        });
      }

      const forwardedFor = request.headers.get('x-forwarded-for');
      const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';

      await tx.auditLog.create({
        data: {
          user_id: userId,
          action: "ACCOUNT_ANONYMIZED",
          entity_type: "User",
          entity_id: userId,
          ip_address: ip,
          details: JSON.stringify({ message: "User requested account deletion and data anonymization." }),
        }
      });
    });

    const response = successResponse(null, 'Account securely deleted.');
    
    // Immediately log them out by killing the cookie
    response.cookies.set('session_token', '', { maxAge: 0 });

    return response;

  } catch (error) {
    console.error("Deletion Error:", error);
    return apiErrors.internal();
  }
}
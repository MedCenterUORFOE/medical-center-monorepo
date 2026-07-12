//apps/web/app/api/users/profile-picture/route.ts

/**
 * PROFILE PICTURE UPLOAD ENDPOINT (POST /api/users/profile-picture)
 * * --- AUTHENTICATION TESTING STRATEGY ---
 * DEVELOPMENT MODE: Hardcoded `userId`.
 * PRODUCTION MODE: Uncomment `getUserSession()` before deployment.
 */

import { prisma } from '@medical-center/db';
import { checkRateLimit } from '@/lib/rate-limiter';
import { successResponse, errorResponse, apiErrors } from '@/lib/api-response';
// FIX: Use the centralized build-safe Supabase client!
import { supabase } from '@/lib/supabase';
import { getUserSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    // --- RATE LIMITING (Protect Supabase Storage Quota) ---
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown-ip';

    if (!checkRateLimit(ip, 5, 3600000)) { // Limit: 5 uploads per hour
      return errorResponse('Too many upload attempts. Please try again later.', 429);
    }

    // === PRODUCTION AUTH BLOCK ===
    const session = await getUserSession();
    if (!session?.id) return apiErrors.unauthorized();
    const userId = session.id; // FIXED from session.userId
    
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return apiErrors.badRequest("No image file provided");
    }

    // --- THE BUFFER FIX ---
    // Convert Web ArrayBuffer to Node.js Buffer to prevent 0-byte uploads in Supabase
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Safely extract extension with a fallback
    const fileExt = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
    const fileName = `${userId}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true, 
      });

    if (uploadError) {
      console.error("Supabase Storage Error:", uploadError);
      return errorResponse("Failed to upload image to storage", 502);
    }

    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    const uploadedUrl = publicUrlData.publicUrl;

    // --- THE SECURE TRANSACTION ---
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { profile_picture: uploadedUrl },
      });

      await tx.auditLog.create({
        data: {
          user_id: userId,
          action: "PROFILE_PICTURE_UPDATED",
          entity_type: "User",
          entity_id: userId,
          ip_address: ip,
          details: JSON.stringify({ message: "User updated their profile picture." }),
        }
      });
    });

    return successResponse({ url: uploadedUrl }, "Profile picture successfully updated.");

  } catch (error) {
    console.error("Profile Picture Upload Error:", error);
    return apiErrors.internal();
  }
}
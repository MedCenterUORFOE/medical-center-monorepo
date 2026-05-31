import { NextResponse } from 'next/server';
import { prisma } from '@medical-center/db';
// Import your custom helper function instead of the raw admin object
import { sendPushNotification } from '@/lib/firebase-admin'; 

export async function POST(request: Request) {
  try {
    // ========================================================================
    // 1. THE SECRET HANDSHAKE
    // ========================================================================
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.WEBHOOK_SECRET; 

    // Block the request if the header is missing or doesn't match our secret
    if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      console.warn("Blocked unauthorized webhook attempt.");
      return NextResponse.json({ error: "Unauthorized request" }, { status: 401 });
    }
    // ========================================================================

    const payload = await request.json();
    const newNotification = payload.record; 

    if (!newNotification || !newNotification.user_id) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: newNotification.user_id },
      select: { fcm_token: true } 
    });

    if (user?.fcm_token) {
      console.log(`Preparing FCM Push for user ${user.id}...`);
      
      // Use your robust helper function
      await sendPushNotification({
        tokens: user.fcm_token,
        title: "Medical Center Update", // You can customize this
        body: newNotification.message,
        data: {
          notificationId: newNotification.id,
          // You can pass extra hidden data to the app here if needed
        }
      });
      
    } else {
      console.log("No FCM token found for user. Skipping push.");
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error("Webhook Dispatch Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
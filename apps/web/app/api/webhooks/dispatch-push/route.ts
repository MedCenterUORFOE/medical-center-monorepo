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

    // Fail closed if the secret isn't configured
    if (!expectedSecret) {
      console.error('WEBHOOK_SECRET is not configured.');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

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
      select: {
        id: true,
        deviceTokens: { select: { token: true } },
      }
    });

    const tokens = user?.deviceTokens.map(dt => dt.token) ?? [];

    if (tokens.length > 0) {
      console.log(`Preparing FCM Push for user ${user!.id} (${tokens.length} device[s])...`);

      const result = await sendPushNotification({
        tokens,
        title: "Medical Center Update", // You can customize this
        body: newNotification.message ?? "",
        data: {
          notificationId: String(newNotification.id ?? ""),
          // You can pass extra hidden data to the app here if needed
        }
      });

      // Remove any tokens FCM reports as dead, without touching valid ones
      // on other devices belonging to this user.
      if (result.invalidTokens.length > 0) {
        await prisma.deviceToken.deleteMany({
          where: { token: { in: result.invalidTokens } },
        });
        console.log(`Removed ${result.invalidTokens.length} stale token(s) for user ${user!.id}`);
      }

      // Only report success if a push was actually attempted and delivered
      // to at least one device. Otherwise, surface the failure honestly so
      // whatever triggered this webhook (and any monitoring on it) can tell.
      if (result.attempted && result.successCount === 0) {
        await prisma.failedNotification.create({
          data: {
            user_id: user!.id,
            title: "Medical Center Update",
            body: newNotification.message ?? "",
            data: { notificationId: String(newNotification.id ?? "") },
            last_error: "Initial dispatch failed: 0 successful deliveries",
          },
        });

        return NextResponse.json(
          { success: false, error: "Push delivery failed, queued for retry" },
          { status: 502 }
        );
      }

    } else {
      console.log("No device tokens found for user. Skipping push.");
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error("Webhook Dispatch Error:", error);

    // Best-effort: try to log this as a retryable failure too, if we got
    // far enough to know who it was for. Swallow errors here — we don't
    // want a logging failure to mask the original error response.
    try {
      const payload = await request.clone().json().catch(() => null);
      const userId = payload?.record?.user_id;
      if (userId) {
        await prisma.failedNotification.create({
          data: {
            user_id: userId,
            title: "Medical Center Update",
            body: payload?.record?.message ?? "",
            data: { notificationId: String(payload?.record?.id ?? "") },
            last_error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    } catch {}

    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
import { NextResponse } from 'next/server';
import { prisma } from '@medical-center/db';
import { sendPushNotification } from '@/lib/firebase-admin';

const MAX_ATTEMPTS = 5;

export async function POST(request: Request) {
  try {
    // Reuse the same webhook secret pattern for this internal cron endpoint.
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.WEBHOOK_SECRET;

    if (!expectedSecret || !authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized request" }, { status: 401 });
    }

    const pending = await prisma.failedNotification.findMany({
      where: { attempt_count: { lt: MAX_ATTEMPTS } },
      take: 50, // process in batches, don't try to drain an unbounded backlog in one run
    });

    let retried = 0;
    let resolved = 0;
    let gaveUp = 0;

    for (const failure of pending) {
      const user = await prisma.user.findUnique({
        where: { id: failure.user_id },
        select: { deviceTokens: { select: { token: true } } },
      });

      const tokens = user?.deviceTokens.map(dt => dt.token) ?? [];

      if (tokens.length === 0) {
        // No devices to try anymore — nothing left to retry against.
        await prisma.failedNotification.delete({ where: { id: failure.id } });
        gaveUp++;
        continue;
      }

      const result = await sendPushNotification({
        tokens,
        title: failure.title,
        body: failure.body,
        data: (failure.data as Record<string, string>) ?? {},
      });

      // Clean up any tokens FCM now reports as dead, same as the main route.
      if (result.invalidTokens.length > 0) {
        await prisma.deviceToken.deleteMany({
          where: { token: { in: result.invalidTokens } },
        });
      }

      if (result.attempted && result.successCount > 0) {
        await prisma.failedNotification.delete({ where: { id: failure.id } });
        resolved++;
      } else if (failure.attempt_count + 1 >= MAX_ATTEMPTS) {
        // Give up after MAX_ATTEMPTS — delete rather than let it linger forever.
        await prisma.failedNotification.delete({ where: { id: failure.id } });
        gaveUp++;
      } else {
        await prisma.failedNotification.update({
          where: { id: failure.id },
          data: {
            attempt_count: { increment: 1 },
            last_error: "Retry attempt failed: 0 successful deliveries",
          },
        });
        retried++;
      }
    }

    return NextResponse.json({ success: true, resolved, retried, gaveUp, processed: pending.length });

  } catch (error) {
    console.error("Retry Cron Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

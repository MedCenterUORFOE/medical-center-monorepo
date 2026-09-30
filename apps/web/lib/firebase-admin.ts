import * as admin from 'firebase-admin';

const hasFirebaseKeys =
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY;

// 1. Initialize Firebase safely
if (!admin.apps.length) {
  if (!hasFirebaseKeys) {
    // Prevent build-time crashes when environment variables aren't injected (like in CI/CD pipelines)
    console.warn(
      '⚠️ Firebase Admin environment variables are missing. Firebase initialization skipped. (Expected during build/CI phases).'
    );
  } else {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
      console.log('Firebase Admin SDK initialized successfully.');
    } catch (error) {
      console.error('Firebase Admin initialization error:', error);
    }
  }
}

// Safely export messaging, but handle situations where app wasn't instantiated
export const adminMessaging = admin.apps.length ? admin.messaging() : null;

// Shape returned by sendPushNotification so callers can tell success from
// failure and clean up dead tokens, instead of getting `null` either way.
export type PushResult = {
  attempted: boolean;
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
};

// 2. The Master Push Notification Helper
export async function sendPushNotification({
  tokens,
  title,
  body,
  data = {},
}: {
  tokens: string | string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<PushResult> {
  const tokenArray = Array.isArray(tokens) ? tokens : [tokens];

  if (tokenArray.length === 0) {
    console.warn('[FCM] No tokens provided. Skipping push notification.');
    return { attempted: false, successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  // If initialization was skipped (CI environment), log and move on without throwing
  if (!adminMessaging) {
    console.warn('[FCM] Push notification skipped: Firebase Admin SDK is not initialized.');
    return { attempted: false, successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  try {
    const message = {
      notification: { title, body },
      data,
      tokens: tokenArray,
    };

    const response = await adminMessaging.sendEachForMulticast(message);
    console.log(`[FCM] Success: ${response.successCount} | Failed: ${response.failureCount}`);

    const invalidTokens: string[] = [];

    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`[FCM] Token failed (${tokenArray[idx]}):`, resp.error);
          const code = resp.error?.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument'
          ) {
            invalidTokens.push(tokenArray[idx]);
          }
        }
      });
    }

    return {
      attempted: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
    };
  } catch (error) {
    console.error('[FCM] Critical Push Notification Error:', error);
    return { attempted: true, successCount: 0, failureCount: tokenArray.length, invalidTokens: [] };
  }
}
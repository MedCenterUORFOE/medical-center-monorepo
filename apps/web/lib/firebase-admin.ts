import * as admin from 'firebase-admin';

// 1. Initialize Firebase (Prevent Next.js hot-reload crashes)
if (!admin.apps.length) {
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

export const adminMessaging = admin.messaging();

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
}) {
  try {
    // Normalize to an array so we always use sendEachForMulticast
    const tokenArray = Array.isArray(tokens) ? tokens : [tokens];

    if (tokenArray.length === 0) {
      console.warn('[FCM] No tokens provided. Skipping push notification.');
      return null;
    }

    const message = {
      notification: { title, body },
      data,
      tokens: tokenArray,
    };

    // Fire the notification
    const response = await adminMessaging.sendEachForMulticast(message);
    
    console.log(`[FCM] Success: ${response.successCount} | Failed: ${response.failureCount}`);

    // If any tokens failed (e.g., user uninstalled app), log exactly which ones
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`[FCM] Token failed (${tokenArray[idx]}):`, resp.error);
        }
      });
    }

    return response;
  } catch (error) {
    console.error('[FCM] Critical Push Notification Error:', error);
    // We return null instead of throwing an error so the main API route doesn't crash 
    // if notifications temporarily go down.
    return null;
  }
}
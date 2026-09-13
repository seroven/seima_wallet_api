import admin from 'firebase-admin';
import { env } from '../config/env';
import { db } from '../db/knex';

const ANDROID_CHANNEL_ID = 'seima_wallet';

let initialized = false;

function initFirebase(): boolean {
  if (initialized) return true;
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    console.warn('[fcm] Firebase credentials missing — push disabled');
    return false;
  }
  try {
    const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
    initialized = true;
    console.log(`[fcm] initialized for project ${env.FIREBASE_PROJECT_ID}`);
    return true;
  } catch (err) {
    console.error('[fcm] init failed', err);
    return false;
  }
}

export async function notifyUsers(params: {
  userIds: string[];
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  const uniqueIds = [...new Set(params.userIds)];
  if (uniqueIds.length === 0) {
    console.warn('[fcm] notifyUsers skipped: empty userIds');
    return;
  }

  for (const userId of uniqueIds) {
    await db('notifications').insert({
      user_id: userId,
      type: params.type,
      title: params.title,
      body: params.body,
      data: params.data ? JSON.stringify(params.data) : null,
    });
  }

  if (!initFirebase()) return;

  const tokens = await db('device_tokens')
    .whereIn('user_id', uniqueIds)
    .select('token');

  const list = tokens.map((t) => t.token as string).filter(Boolean);
  if (list.length === 0) {
    console.warn(
      `[fcm] no device tokens for users=${uniqueIds.join(',')} type=${params.type}`
    );
    return;
  }

  try {
    const result = await admin.messaging().sendEachForMulticast({
      tokens: list,
      notification: {
        title: params.title,
        body: params.body,
      },
      data: params.data,
      android: {
        priority: 'high',
        notification: {
          channelId: ANDROID_CHANNEL_ID,
          sound: 'default',
        },
      },
    });

    console.log(
      `[fcm] type=${params.type} tokens=${list.length} success=${result.successCount} failure=${result.failureCount}`
    );

    result.responses.forEach((response, index) => {
      if (response.error) {
        console.error(
          `[fcm] token[${index}] ${response.error.code}: ${response.error.message}`
        );
      }
    });
  } catch (err) {
    console.error('[fcm] send failed', err);
  }
}

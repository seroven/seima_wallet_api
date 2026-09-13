import admin from 'firebase-admin';
import { env } from '../config/env';
import { db } from '../db/knex';

let initialized = false;

function initFirebase(): boolean {
  if (initialized) return true;
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    console.warn('[fcm] Firebase credentials missing — push disabled');
    return false;
  }
  const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
  initialized = true;
  return true;
}

export async function notifyUsers(params: {
  userIds: string[];
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  const uniqueIds = [...new Set(params.userIds)];
  if (uniqueIds.length === 0) return;

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
  if (list.length === 0) return;

  try {
    await admin.messaging().sendEachForMulticast({
      tokens: list,
      notification: {
        title: params.title,
        body: params.body,
      },
      data: params.data,
    });
  } catch (err) {
    console.error('[fcm] send failed', err);
  }
}

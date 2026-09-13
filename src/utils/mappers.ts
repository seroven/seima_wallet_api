import { db } from '../db/knex';
import { PublicUser, RoleCode, UserRow } from '../types';

export async function getUserRoles(userId: string): Promise<RoleCode[]> {
  const rows = await db('user_roles as ur')
    .join('roles as r', 'r.id', 'ur.role_id')
    .where('ur.user_id', userId)
    .select('r.code');
  return rows.map((r) => r.code as RoleCode);
}

export async function toPublicUser(row: UserRow): Promise<PublicUser> {
  const roles = await getUserRoles(row.id);
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    isActive: row.is_active !== false,
    roles,
  };
}

export function formatOccurredAt(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

export async function getUserIdsByRole(code: RoleCode): Promise<string[]> {
  const rows = await db('user_roles as ur')
    .join('roles as r', 'r.id', 'ur.role_id')
    .join('users as u', 'u.id', 'ur.user_id')
    .where('r.code', code)
    .where('u.is_active', true)
    .select('u.id');
  return rows.map((r) => r.id as string);
}

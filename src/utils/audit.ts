import { db } from '../db/knex';
import { AuditAction, TransactionRow, TransactionSnapshot } from '../types';

export function toSnapshot(row: TransactionRow): TransactionSnapshot {
  const occurred =
    row.occurred_at instanceof Date
      ? row.occurred_at.toISOString().slice(0, 10)
      : String(row.occurred_at).slice(0, 10);

  return {
    id: row.id,
    type: row.type,
    amount: String(row.amount),
    subject: row.subject,
    photo_path: row.photo_path,
    occurred_at: occurred,
    created_by: row.created_by,
    updated_by: row.updated_by,
    deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
  };
}

export function diffSnapshots(
  before: TransactionSnapshot,
  after: TransactionSnapshot
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  (Object.keys(after) as (keyof TransactionSnapshot)[]).forEach((key) => {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { from: before[key], to: after[key] };
    }
  });
  return changes;
}

export async function writeAudit(params: {
  transactionId: string;
  userId: string;
  action: AuditAction;
  snapshot: TransactionSnapshot;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
}): Promise<void> {
  await db('transaction_audits').insert({
    transaction_id: params.transactionId,
    user_id: params.userId,
    action: params.action,
    snapshot: params.snapshot,
    changes: params.changes ?? null,
  });
}

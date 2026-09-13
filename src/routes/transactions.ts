import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { db } from '../db/knex';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';
import { uploadPhoto, SERVERFILES_DIR } from '../middleware/upload';
import { diffSnapshots, toSnapshot, writeAudit } from '../utils/audit';
import { formatOccurredAt, getUserIdsByRole } from '../utils/mappers';
import { TransactionRow } from '../types';
import { notifyUsers } from '../services/fcm';

const router = Router();

function mapTransaction(row: TransactionRow) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    amount: Number(row.amount),
    subject: row.subject,
    description: row.description ?? '',
    photoPath: row.photo_path,
    evidencePath: row.evidence_path,
    occurredAt: formatOccurredAt(row.occurred_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    validatedBy: row.validated_by,
    validatedAt: row.validated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasEvidence: Boolean(row.evidence_path),
  };
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const status = String(req.query.status || 'validated');
    let query = db<TransactionRow>('transactions').whereNull('deleted_at');
    if (status === 'pending' || status === 'validated') {
      query = query.where({ status });
    }
    const rows = await query
      .orderBy('occurred_at', 'desc')
      .orderBy('created_at', 'desc');
    res.json({ transactions: rows.map(mapTransaction) });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requireAuth,
  requireRole('admin', 'registrador'),
  async (req: AuthRequest, res, next) => {
    try {
      const schema = z.object({
        type: z.enum(['income', 'expense']),
        amount: z.coerce.number().positive(),
        subject: z.string().min(1).max(255),
        description: z.string().min(1).max(2000),
        occurredAt: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      });
      const fields = schema.parse(req.body);
      const occurredAt =
        fields.occurredAt ?? new Date().toISOString().slice(0, 10);

      const [row] = await db<TransactionRow>('transactions')
        .insert({
          type: fields.type,
          status: 'pending',
          amount: String(fields.amount),
          subject: fields.subject,
          description: fields.description,
          photo_path: null,
          evidence_path: null,
          occurred_at: occurredAt,
          created_by: req.user!.id,
          updated_by: req.user!.id,
        })
        .returning('*');

      await writeAudit({
        transactionId: row.id,
        userId: req.user!.id,
        action: 'CREATE',
        snapshot: toSnapshot(row),
        changes: null,
      });

      const revisores = await getUserIdsByRole('revisor');
      const kind = fields.type === 'income' ? 'ingreso' : 'gasto';
      void notifyUsers({
        userIds: revisores,
        type: 'transaction_pending',
        title: 'Nuevo movimiento por validar',
        body: `Se registró un ${kind} de ${fields.amount}: ${fields.subject}`,
        data: { transactionId: row.id, status: 'pending' },
      });

      res.status(201).json({ transaction: mapTransaction(row) });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.flatten() });
        return;
      }
      next(err);
    }
  }
);

router.patch(
  '/:id',
  requireAuth,
  requireRole('admin', 'registrador'),
  async (req: AuthRequest, res, next) => {
    try {
      const id = String(req.params.id);
      const existing = await db<TransactionRow>('transactions')
        .where({ id })
        .whereNull('deleted_at')
        .first();

      if (!existing) {
        res.status(404).json({ error: 'Transaction not found' });
        return;
      }
      if (existing.status === 'validated') {
        res.status(400).json({ error: 'Validated transactions cannot be edited' });
        return;
      }

      const partialSchema = z.object({
        type: z.enum(['income', 'expense']).optional(),
        amount: z.coerce.number().positive().optional(),
        subject: z.string().min(1).max(255).optional(),
        description: z.string().min(1).max(2000).optional(),
        occurredAt: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      });
      const fields = partialSchema.parse(req.body);
      const before = toSnapshot(existing);

      const updates: Record<string, unknown> = {
        updated_by: req.user!.id,
        updated_at: new Date(),
      };
      if (fields.type !== undefined) updates.type = fields.type;
      if (fields.amount !== undefined) updates.amount = String(fields.amount);
      if (fields.subject !== undefined) updates.subject = fields.subject;
      if (fields.description !== undefined) updates.description = fields.description;
      if (fields.occurredAt !== undefined) updates.occurred_at = fields.occurredAt;

      const [row] = await db<TransactionRow>('transactions')
        .where({ id: existing.id })
        .update(updates)
        .returning('*');

      const after = toSnapshot(row);
      await writeAudit({
        transactionId: row.id,
        userId: req.user!.id,
        action: 'UPDATE',
        snapshot: after,
        changes: diffSnapshots(before, after),
      });

      res.json({ transaction: mapTransaction(row) });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.flatten() });
        return;
      }
      next(err);
    }
  }
);

router.post(
  '/:id/validate',
  requireAuth,
  requireRole('admin', 'revisor'),
  uploadPhoto.single('evidence'),
  async (req: AuthRequest, res, next) => {
    try {
      const id = String(req.params.id);
      if (!req.file) {
        res.status(400).json({ error: 'Evidence photo is required' });
        return;
      }

      const existing = await db<TransactionRow>('transactions')
        .where({ id })
        .whereNull('deleted_at')
        .first();

      if (!existing) {
        const full = path.join(SERVERFILES_DIR, req.file.filename);
        if (fs.existsSync(full)) fs.unlinkSync(full);
        res.status(404).json({ error: 'Transaction not found' });
        return;
      }
      if (existing.status === 'validated') {
        const full = path.join(SERVERFILES_DIR, req.file.filename);
        if (fs.existsSync(full)) fs.unlinkSync(full);
        res.status(400).json({ error: 'Already validated' });
        return;
      }

      const before = toSnapshot(existing);
      const [row] = await db<TransactionRow>('transactions')
        .where({ id: existing.id })
        .update({
          status: 'validated',
          evidence_path: req.file.filename,
          validated_by: req.user!.id,
          validated_at: new Date(),
          updated_by: req.user!.id,
          updated_at: new Date(),
        })
        .returning('*');

      const after = toSnapshot(row);
      await writeAudit({
        transactionId: row.id,
        userId: req.user!.id,
        action: 'VALIDATE',
        snapshot: after,
        changes: diffSnapshots(before, after),
      });

      const kind = row.type === 'income' ? 'ingreso' : 'gasto';
      void notifyUsers({
        userIds: [row.created_by],
        type: 'transaction_validated',
        title: 'Movimiento validado',
        body: `Tu ${kind} "${row.subject}" fue validado con evidencia.`,
        data: { transactionId: row.id, status: 'validated' },
      });

      res.json({ transaction: mapTransaction(row) });
    } catch (err) {
      if (req.file) {
        const full = path.join(SERVERFILES_DIR, req.file.filename);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      }
      next(err);
    }
  }
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('admin', 'registrador'),
  async (req: AuthRequest, res, next) => {
    try {
      const id = String(req.params.id);
      const existing = await db<TransactionRow>('transactions')
        .where({ id })
        .whereNull('deleted_at')
        .first();

      if (!existing) {
        res.status(404).json({ error: 'Transaction not found' });
        return;
      }
      if (existing.status === 'validated' && !req.user!.roles.includes('admin')) {
        res.status(400).json({ error: 'Validated transactions cannot be deleted' });
        return;
      }

      const [row] = await db<TransactionRow>('transactions')
        .where({ id: existing.id })
        .update({
          deleted_at: new Date(),
          updated_by: req.user!.id,
          updated_at: new Date(),
        })
        .returning('*');

      await writeAudit({
        transactionId: row.id,
        userId: req.user!.id,
        action: 'DELETE',
        snapshot: toSnapshot(row),
        changes: null,
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:id/evidence', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const row = await db<TransactionRow>('transactions')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!row?.evidence_path) {
      res.status(404).json({ error: 'Evidence not found' });
      return;
    }

    const full = path.join(SERVERFILES_DIR, row.evidence_path);
    if (!fs.existsSync(full)) {
      res.status(404).json({ error: 'Evidence file missing' });
      return;
    }

    res.sendFile(full);
  } catch (err) {
    next(err);
  }
});

// Legacy photo endpoint (maps to evidence if present)
router.get('/:id/photo', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const row = await db<TransactionRow>('transactions')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    const fileName = row?.evidence_path || row?.photo_path;
    if (!fileName) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }

    const full = path.join(SERVERFILES_DIR, fileName);
    if (!fs.existsSync(full)) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }

    res.sendFile(full);
  } catch (err) {
    next(err);
  }
});

export default router;

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { db } from '../db/knex';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { uploadPhoto, SERVERFILES_DIR } from '../middleware/upload';
import { diffSnapshots, toSnapshot, writeAudit } from '../utils/audit';
import { formatOccurredAt } from '../utils/mappers';
import { TransactionRow } from '../types';

const router = Router();

function mapTransaction(row: TransactionRow) {
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    subject: row.subject,
    photoPath: row.photo_path,
    occurredAt: formatOccurredAt(row.occurred_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseTransactionFields(body: Record<string, unknown>) {
  const schema = z.object({
    type: z.enum(['income', 'expense']),
    amount: z.coerce.number().positive(),
    subject: z.string().min(1).max(255),
    occurredAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  });
  return schema.parse(body);
}

router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const rows = await db<TransactionRow>('transactions')
      .whereNull('deleted_at')
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
  uploadPhoto.single('photo'),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Photo is required' });
        return;
      }

      const fields = parseTransactionFields(req.body);
      const occurredAt =
        fields.occurredAt ?? new Date().toISOString().slice(0, 10);
      const photoPath = req.file.filename;

      const [row] = await db<TransactionRow>('transactions')
        .insert({
          type: fields.type,
          amount: String(fields.amount),
          subject: fields.subject,
          photo_path: photoPath,
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

      res.status(201).json({ transaction: mapTransaction(row) });
    } catch (err) {
      if (req.file) {
        const full = path.join(SERVERFILES_DIR, req.file.filename);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      }
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
  uploadPhoto.single('photo'),
  async (req: AuthRequest, res, next) => {
    try {
      const id = String(req.params.id);
      const existing = await db<TransactionRow>('transactions')
        .where({ id })
        .whereNull('deleted_at')
        .first();

      if (!existing) {
        if (req.file) {
          const full = path.join(SERVERFILES_DIR, req.file.filename);
          if (fs.existsSync(full)) fs.unlinkSync(full);
        }
        res.status(404).json({ error: 'Transaction not found' });
        return;
      }

      const partialSchema = z.object({
        type: z.enum(['income', 'expense']).optional(),
        amount: z.coerce.number().positive().optional(),
        subject: z.string().min(1).max(255).optional(),
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
      if (fields.occurredAt !== undefined) updates.occurred_at = fields.occurredAt;

      let oldPhoto: string | null = null;
      if (req.file) {
        oldPhoto = existing.photo_path;
        updates.photo_path = req.file.filename;
      }

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

      if (oldPhoto) {
        const full = path.join(SERVERFILES_DIR, oldPhoto);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      }

      res.json({ transaction: mapTransaction(row) });
    } catch (err) {
      if (req.file) {
        const full = path.join(SERVERFILES_DIR, req.file.filename);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      }
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.flatten() });
        return;
      }
      next(err);
    }
  }
);

router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
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
});

router.get('/:id/photo', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const row = await db<TransactionRow>('transactions')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!row) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }

    const full = path.join(SERVERFILES_DIR, row.photo_path);
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

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/knex';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { toPublicUser } from '../utils/mappers';
import { UserRow } from '../types';

const router = Router();

const updateMeSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    password: z.string().min(6).max(128).optional(),
  })
  .refine((data) => data.displayName !== undefined || data.password !== undefined, {
    message: 'At least one field is required',
  });

router.patch(
  '/me',
  requireAuth,
  validateBody(updateMeSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const body = req.body as z.infer<typeof updateMeSchema>;
      const updates: Partial<UserRow> = {
        updated_at: new Date(),
      };

      if (body.displayName !== undefined) {
        updates.display_name = body.displayName;
      }
      if (body.password !== undefined) {
        updates.password_hash = await bcrypt.hash(body.password, 12);
      }

      const [user] = await db<UserRow>('users')
        .where({ id: req.user!.id })
        .update(updates)
        .returning('*');

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ user: toPublicUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

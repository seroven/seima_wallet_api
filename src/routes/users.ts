import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/knex';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { toPublicUser } from '../utils/mappers';
import { RoleCode, UserRow } from '../types';

const router = Router();

const updateMeSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    password: z.string().min(6).max(128).optional(),
  })
  .refine((data) => data.displayName !== undefined || data.password !== undefined, {
    message: 'At least one field is required',
  });

const roleEnum = z.enum(['admin', 'registrador', 'revisor']);

const createUserSchema = z.object({
  username: z.string().min(1).max(64),
  displayName: z.string().min(1).max(120),
  password: z.string().min(6).max(128),
  roles: z.array(roleEnum).min(1),
  isActive: z.boolean().optional().default(true),
});

const updateUserSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  password: z.string().min(6).max(128).optional(),
  roles: z.array(roleEnum).min(1).optional(),
  isActive: z.boolean().optional(),
});

async function setUserRoles(userId: string, roles: RoleCode[]): Promise<void> {
  const roleRows = await db('roles').whereIn('code', roles).select('id', 'code');
  if (roleRows.length !== roles.length) {
    throw new Error('Invalid roles');
  }
  await db('user_roles').where({ user_id: userId }).del();
  await db('user_roles').insert(
    roleRows.map((r) => ({ user_id: userId, role_id: r.id }))
  );
}

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

      res.json({ user: await toPublicUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/', requireAuth, requireRole('admin'), async (_req, res, next) => {
  try {
    const rows = await db<UserRow>('users').orderBy('username', 'asc');
    const users = await Promise.all(rows.map((r) => toPublicUser(r)));
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  validateBody(createUserSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createUserSchema>;
      const exists = await db('users').where({ username: body.username }).first();
      if (exists) {
        res.status(409).json({ error: 'Username already exists' });
        return;
      }

      const passwordHash = await bcrypt.hash(body.password, 12);
      const [user] = await db<UserRow>('users')
        .insert({
          username: body.username,
          display_name: body.displayName,
          password_hash: passwordHash,
          is_active: body.isActive ?? true,
        })
        .returning('*');

      await setUserRoles(user.id, body.roles);
      res.status(201).json({ user: await toPublicUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validateBody(updateUserSchema),
  async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const body = req.body as z.infer<typeof updateUserSchema>;
      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (body.displayName !== undefined) updates.display_name = body.displayName;
      if (body.password !== undefined) {
        updates.password_hash = await bcrypt.hash(body.password, 12);
      }
      if (body.isActive !== undefined) updates.is_active = body.isActive;

      const [user] = await db<UserRow>('users').where({ id }).update(updates).returning('*');
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      if (body.roles) {
        await setUserRoles(user.id, body.roles);
      }
      res.json({ user: await toPublicUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/:id', requireAuth, requireRole('admin'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    if (id === req.user!.id) {
      res.status(400).json({ error: 'Cannot deactivate yourself' });
      return;
    }
    const [user] = await db<UserRow>('users')
      .where({ id })
      .update({ is_active: false, updated_at: new Date() })
      .returning('*');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: await toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

export default router;

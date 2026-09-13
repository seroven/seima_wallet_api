import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db/knex';
import { signToken, requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { toPublicUser } from '../utils/mappers';
import { UserRow } from '../types';

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, try again later' },
});

router.post(
  '/login',
  loginLimiter,
  validateBody(loginSchema),
  async (req, res, next) => {
    try {
      const { username, password } = req.body as z.infer<typeof loginSchema>;
      const user = await db<UserRow>('users').where({ username }).first();
      if (!user || user.is_active === false) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const publicUser = await toPublicUser(user);
      if (publicUser.roles.length === 0) {
        res.status(403).json({ error: 'User has no roles assigned' });
        return;
      }
      const token = signToken(publicUser);
      res.json({ token, user: publicUser });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await db<UserRow>('users').where({ id: req.user!.id }).first();
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

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/knex';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();

const registerSchema = z.object({
  token: z.string().min(10),
  platform: z.string().default('android'),
});

router.post(
  '/register',
  requireAuth,
  validateBody(registerSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { token, platform } = req.body as z.infer<typeof registerSchema>;
      const existing = await db('device_tokens').where({ token }).first();
      if (existing) {
        await db('device_tokens').where({ token }).update({
          user_id: req.user!.id,
          platform,
          updated_at: new Date(),
        });
      } else {
        await db('device_tokens').insert({
          user_id: req.user!.id,
          token,
          platform,
        });
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

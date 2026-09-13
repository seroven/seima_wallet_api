import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/knex';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { WalletCurrency } from '../types';

const router = Router();

const currencySchema = z.object({
  currency: z.enum(['USD', 'PEN']),
});

async function computeBalance(): Promise<number> {
  const rows = (await db('transactions')
    .whereNull('deleted_at')
    .where({ status: 'validated' })
    .select('type')
    .sum({ total: 'amount' })
    .groupBy('type')) as Array<{ type: string; total: string | number | null }>;

  let income = 0;
  let expense = 0;
  for (const row of rows) {
    const total = Number(row.total ?? 0);
    if (row.type === 'income') income = total;
    if (row.type === 'expense') expense = total;
  }
  return Math.round((income - expense) * 100) / 100;
}

router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const settings = await db('wallet_settings').where({ id: 1 }).first();
    const balance = await computeBalance();
    res.json({
      balance,
      currency: (settings?.currency as WalletCurrency) ?? 'PEN',
    });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/currency',
  requireAuth,
  validateBody(currencySchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { currency } = req.body as z.infer<typeof currencySchema>;
      await db('wallet_settings').where({ id: 1 }).update({
        currency,
        updated_at: db.fn.now(),
      });
      const balance = await computeBalance();
      res.json({ balance, currency });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

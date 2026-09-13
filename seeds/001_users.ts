import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';

export async function seed(knex: Knex): Promise<void> {
  await knex('transaction_audits').del();
  await knex('transactions').del();
  await knex('users').del();

  const passwordHash = await bcrypt.hash('123456', 12);

  await knex('users').insert([
    {
      username: 'Sebastian',
      display_name: 'Sebastian',
      password_hash: passwordHash,
    },
    {
      username: 'Luis',
      display_name: 'Luis',
      password_hash: passwordHash,
    },
  ]);

  const existing = await knex('wallet_settings').where({ id: 1 }).first();
  if (!existing) {
    await knex('wallet_settings').insert({ id: 1, currency: 'PEN' });
  } else {
    await knex('wallet_settings').where({ id: 1 }).update({ currency: 'PEN' });
  }
}

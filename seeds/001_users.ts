import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';

export async function seed(knex: Knex): Promise<void> {
  await knex('notifications').del();
  await knex('device_tokens').del();
  await knex('transaction_audits').del();
  await knex('transactions').del();
  await knex('user_roles').del();
  await knex('users').del();

  // Ensure roles exist
  const existingRoles = await knex('roles').select('*');
  if (existingRoles.length === 0) {
    await knex('roles').insert([
      { code: 'admin', name: 'Administrador' },
      { code: 'registrador', name: 'Registrador' },
      { code: 'revisor', name: 'Revisor' },
    ]);
  }

  const roles = await knex('roles').select('id', 'code');
  const byCode = Object.fromEntries(roles.map((r) => [r.code, r.id]));

  const passwordHash = await bcrypt.hash('123456', 12);

  const [sebastian, luis] = await knex('users')
    .insert([
      {
        username: 'Sebastian',
        display_name: 'Sebastian',
        password_hash: passwordHash,
        is_active: true,
      },
      {
        username: 'Luis',
        display_name: 'Luis',
        password_hash: passwordHash,
        is_active: true,
      },
    ])
    .returning(['id', 'username']);

  await knex('user_roles').insert([
    { user_id: sebastian.id, role_id: byCode.admin },
    { user_id: sebastian.id, role_id: byCode.revisor },
    { user_id: luis.id, role_id: byCode.registrador },
  ]);

  const existing = await knex('wallet_settings').where({ id: 1 }).first();
  if (!existing) {
    await knex('wallet_settings').insert({ id: 1, currency: 'PEN' });
  } else {
    await knex('wallet_settings').where({ id: 1 }).update({ currency: 'PEN' });
  }
}

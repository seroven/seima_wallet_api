import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const schema = process.env.PGSCHEMA || 'public';
  if (schema !== 'public') {
    await knex.schema.createSchemaIfNotExists(schema);
  }

  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('username', 64).notNullable().unique();
    table.string('display_name', 120).notNullable();
    table.string('password_hash', 255).notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('wallet_settings', (table) => {
    table.integer('id').primary();
    table.enum('currency', ['USD', 'PEN'], {
      useNative: true,
      enumName: 'wallet_currency',
    }).notNullable().defaultTo('PEN');
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.enum('type', ['income', 'expense'], {
      useNative: true,
      enumName: 'transaction_type',
    }).notNullable();
    table.decimal('amount', 14, 2).notNullable();
    table.string('subject', 255).notNullable();
    table.string('photo_path', 512).notNullable();
    table.date('occurred_at').notNullable();
    table
      .uuid('created_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table
      .uuid('updated_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();
  });

  await knex.schema.createTable('transaction_audits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('transaction_id')
      .notNullable()
      .references('id')
      .inTable('transactions')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.enum('action', ['CREATE', 'UPDATE', 'DELETE'], {
      useNative: true,
      enumName: 'audit_action',
    }).notNullable();
    table.jsonb('snapshot').notNullable();
    table.jsonb('changes').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex('wallet_settings').insert({ id: 1, currency: 'PEN' });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('transaction_audits');
  await knex.schema.dropTableIfExists('transactions');
  await knex.schema.dropTableIfExists('wallet_settings');
  await knex.schema.dropTableIfExists('users');
  await knex.raw('DROP TYPE IF EXISTS audit_action');
  await knex.raw('DROP TYPE IF EXISTS transaction_type');
  await knex.raw('DROP TYPE IF EXISTS wallet_currency');
}

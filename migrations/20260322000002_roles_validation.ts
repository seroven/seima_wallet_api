import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('code', 32).notNullable().unique();
    table.string('name', 64).notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('user_roles', (table) => {
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .uuid('role_id')
      .notNullable()
      .references('id')
      .inTable('roles')
      .onDelete('CASCADE');
    table.primary(['user_id', 'role_id']);
  });

  await knex.schema.alterTable('users', (table) => {
    table.boolean('is_active').notNullable().defaultTo(true);
  });

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE transaction_status AS ENUM ('pending', 'validated');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.schema.alterTable('transactions', (table) => {
    table.string('photo_path', 512).nullable().alter();
    table.string('evidence_path', 512).nullable();
    table
      .uuid('validated_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('validated_at').nullable();
  });

  await knex.raw(`
    ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS status transaction_status NOT NULL DEFAULT 'pending'
  `);

  // Existing rows with a photo are treated as already validated evidence
  await knex.raw(`
    UPDATE transactions
    SET
      status = 'validated',
      evidence_path = COALESCE(evidence_path, photo_path),
      validated_at = COALESCE(validated_at, updated_at, created_at),
      validated_by = COALESCE(validated_by, updated_by, created_by)
    WHERE photo_path IS NOT NULL AND photo_path <> ''
  `);

  await knex.raw(`
    DO $$ BEGIN
      ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'VALIDATE';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.schema.createTable('device_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('token', 512).notNullable().unique();
    table.string('platform', 32).notNullable().defaultTo('android');
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('type', 64).notNullable();
    table.string('title', 200).notNullable();
    table.text('body').notNullable();
    table.jsonb('data').nullable();
    table.timestamp('read_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  const roleRows = await knex('roles')
    .insert([
      { code: 'admin', name: 'Administrador' },
      { code: 'registrador', name: 'Registrador' },
      { code: 'revisor', name: 'Revisor' },
    ])
    .returning(['id', 'code']);

  // If seed hasn't run yet, roles exist for later seed assignment
  void roleRows;
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('device_tokens');
  await knex.schema.dropTableIfExists('user_roles');
  await knex.schema.dropTableIfExists('roles');

  await knex.schema.alterTable('transactions', (table) => {
    table.dropColumn('validated_at');
    table.dropColumn('validated_by');
    table.dropColumn('evidence_path');
    table.dropColumn('status');
  });

  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('is_active');
  });

  await knex.raw('DROP TYPE IF EXISTS transaction_status');
}

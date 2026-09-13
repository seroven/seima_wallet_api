import type { Knex } from 'knex';
import { env } from './env';

export function buildPgConnection(): Knex.PgConnectionConfig {
  return {
    host: env.PGHOST,
    port: env.PGPORT,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    database: env.PGDATABASE,
    ssl: env.PGSSL ? { rejectUnauthorized: false } : undefined,
  };
}

export function buildKnexConfig(overrides?: Partial<Knex.Config>): Knex.Config {
  return {
    client: 'pg',
    connection: buildPgConnection(),
    searchPath: [env.PGSCHEMA, 'public'],
    pool: { min: 0, max: 10 },
    ...overrides,
  };
}

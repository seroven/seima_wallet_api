import type { Knex } from 'knex';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required in .env`);
  }
  return value;
}

const schema = process.env.PGSCHEMA || 'public';
const useSsl = (process.env.PGSSL ?? 'true') === 'true';

const connection: Knex.PgConnectionConfig = {
  host: required('PGHOST'),
  port: Number(process.env.PGPORT || 5432),
  user: required('PGUSER'),
  password: required('PGPASSWORD'),
  database: required('PGDATABASE'),
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
};

const shared: Knex.Config = {
  client: 'pg',
  connection,
  searchPath: [schema, 'public'],
  migrations: {
    directory: './migrations',
    extension: 'ts',
    schemaName: schema === 'public' ? undefined : schema,
  },
  seeds: {
    directory: './seeds',
    extension: 'ts',
  },
};

const config: { [key: string]: Knex.Config } = {
  development: shared,
  production: shared,
};

export default config;

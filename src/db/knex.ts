import knex, { Knex } from 'knex';
import { buildKnexConfig } from '../config/db';

export const db: Knex = knex(buildKnexConfig());

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as relations from './relations';

// prepare:false — Supabase's transaction pooler (port 6543) doesn't support prepared statements.
// SSL comes from `sslmode=require` in DATABASE_URL. Connects lazily on the first query.
export const sqlClient = postgres(process.env.DATABASE_URL ?? '', { prepare: false, max: 10 });
export const db = drizzle(sqlClient, { schema: { ...schema, ...relations } });

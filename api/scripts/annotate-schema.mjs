// drizzle-kit pull emits users <-> groups foreign keys that make TypeScript infer `any` (circular
// reference). Annotating each table's extra-config callback breaks the cycle. Runs after every pull.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../src/db/schema.ts', import.meta.url);
let src = readFileSync(file, 'utf8');
if (!src.includes('PgTableExtraConfigValue')) {
  src = src
    .replaceAll('}, (table) => [', '}, (table): PgTableExtraConfigValue[] => [')
    .replace('import { pgTable,', 'import { pgTable, type PgTableExtraConfigValue,');
  writeFileSync(file, src);
}

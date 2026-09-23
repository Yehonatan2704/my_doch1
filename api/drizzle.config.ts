import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile();
} catch {
  // no .env — DATABASE_URL must come from the environment
}

export default defineConfig({
  dialect: 'postgresql',
  out: './src/db',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  introspect: { casing: 'camel' },
});

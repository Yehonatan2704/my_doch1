import { z } from 'zod';
import { INTEGRATION_KEY_MIN_LENGTH } from '@doch1/shared';

export const MOCK_PASSWORD_MIN_LENGTH = 16;

// This app holds only the two integration keys and its own Basic Auth login.
// It never gets DATABASE_URL or any Supabase secret (SECURITY.md §15).
const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DOCH1_API_URL: z.url({ protocol: /^https?$/ }).transform((u) => u.replace(/\/+$/, '')),
  CPR_API_KEY: z.string().min(INTEGRATION_KEY_MIN_LENGTH),
  PEOPLE_DIGITAL_API_KEY: z.string().min(INTEGRATION_KEY_MIN_LENGTH),
  MOCK_USER: z.string().min(1),
  MOCK_PASSWORD: z.string().min(MOCK_PASSWORD_MIN_LENGTH),
});

export type Config = z.infer<typeof envSchema>;

// Fail fast at startup. The message names the bad variables only, never their values.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
    throw new Error(`Missing or invalid env vars: ${names.join(', ')} (see .env.example)`);
  }
  return parsed.data;
}

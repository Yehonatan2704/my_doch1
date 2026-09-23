// Imported first by server.ts so DATABASE_URL etc. exist before db/client.ts evaluates.
try {
  process.loadEnvFile();
} catch {
  // no .env file — values come from the host environment (Render)
}

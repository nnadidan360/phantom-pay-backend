import { config } from './config'; // triggers env validation; exits on missing/malformed vars
import { runMigrations } from './db/migrate';
import { app } from './app';

async function main(): Promise<void> {
  await runMigrations();

  app.listen(config.PORT, () => {
    console.log(`[server] Listening on port ${config.PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});

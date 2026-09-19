import { createApp } from './src/app.js';
import { env } from './src/config/env.js';
import { pool, assertDbConnection } from './src/config/db.js';

async function bootstrap() {
  try {
    await assertDbConnection();
    console.log('[db] connection pool ready');
  } catch (err) {
    console.error('[db] unable to reach MySQL:', err.message);
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[api] HRMIS backend listening on http://localhost:${env.PORT}`);
    console.log(`[api] CORS origin: ${env.CLIENT_ORIGIN}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[api] ${signal} received — shutting down gracefully...`);
    server.close(async () => {
      await pool.end();
      console.log('[api] closed. Bye.');
      process.exit(0);
    });
    // Hard exit if connections refuse to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  ['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

  process.on('unhandledRejection', (reason) => {
    console.error('[fatal] unhandled rejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[fatal] uncaught exception:', err);
    process.exit(1);
  });
}

bootstrap();
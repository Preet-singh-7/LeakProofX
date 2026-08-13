const { buildApp } = require('./app');
const { connectDb } = require('./config/db');
const { env, assertProductionSecrets } = require('./config/env');
const { ensureActiveKeyVersion } = require('./encryption/ensureActiveKeyVersion');
const logger = require('./logs/logger');

async function main() {
  assertProductionSecrets();
  await connectDb();
  await ensureActiveKeyVersion();

  const app = buildApp();
  app.listen(env.port, () => {
    logger.info({ port: env.port, apiPrefix: env.apiPrefix, env: env.nodeEnv }, 'LeakProofX backend listening');
  });
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});

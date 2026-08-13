// Standalone verifier: recomputes the audit hash chain from genesis and
// reports the first break, if any. Full Phase 5 tooling will wrap this with
// CLI ergonomics (JSON output, exit codes for CI); this is the core logic.
require('dotenv').config();
const mongoose = require('mongoose');
const { env } = require('../src/config/env');
const { verifyChain } = require('../src/logs/audit.service');

async function main() {
  await mongoose.connect(env.mongoUri);
  const result = await verifyChain();

  if (result.valid) {
    console.log(`Chain OK — ${result.entriesChecked} entries verified.`);
  } else {
    console.error('Chain BROKEN at entry', result.brokenAt);
    console.error('Expected prevHash:', result.expectedPrev);
    console.error('Actual prevHash:  ', result.actualPrev);
    process.exitCode = 1;
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed to verify chain:', err);
  process.exit(1);
});

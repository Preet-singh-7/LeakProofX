// Standalone verifier: recomputes the audit hash chain from genesis and
// reports the first break, if any. Core logic lives in
// src/logs/audit.service.js's verifyChain() — this is just the CLI wrapper
// (Phase 5): --json for machine-readable output (CI, other tooling) and
// distinct exit codes so a caller can tell "chain broken" apart from
// "the script itself failed" without parsing stderr text.
require('dotenv').config();
const mongoose = require('mongoose');
const { env } = require('../src/config/env');
const { verifyChain } = require('../src/logs/audit.service');

const EXIT_OK = 0;
const EXIT_CHAIN_BROKEN = 1;
const EXIT_SCRIPT_ERROR = 2;

function printHelp() {
  console.log(`Usage: node scripts/verifyHashChain.js [--json]

Recomputes the audit log's SHA-256 hash chain from genesis and reports the
first break, if any.

  --json    Print machine-readable JSON instead of human-readable text.
  --help    Show this message.

Exit codes:
  ${EXIT_OK}  chain verified intact
  ${EXIT_CHAIN_BROKEN}  chain is broken (see output for where)
  ${EXIT_SCRIPT_ERROR}  the verifier itself failed (DB connection, etc.) — not a verdict on the chain
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }
  const jsonOutput = args.includes('--json');

  await mongoose.connect(env.mongoUri);
  const result = await verifyChain();
  await mongoose.disconnect();

  if (jsonOutput) {
    console.log(JSON.stringify(result));
  } else if (result.valid) {
    console.log(`Chain OK — ${result.entriesChecked} entries verified.`);
  } else {
    console.error('Chain BROKEN at entry', result.brokenAt);
    console.error('Expected prevHash:', result.expectedPrev);
    console.error('Actual prevHash:  ', result.actualPrev);
  }

  process.exitCode = result.valid ? EXIT_OK : EXIT_CHAIN_BROKEN;
}

main().catch((err) => {
  console.error('Failed to verify chain:', err);
  process.exitCode = EXIT_SCRIPT_ERROR;
});

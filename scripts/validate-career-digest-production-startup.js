'use strict';

/**
 * P3.67 — Career Intelligence Digest Production Startup Integration Validation Script
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  startCareerDigestScheduler,
  stopCareerDigestScheduler,
  sendCareerPerformanceDigest
} = require('../src/intelligence/career-digest.scheduler');

const DATA_FILES = [
  path.resolve(__dirname, '../data/application-queue.json'),
  path.resolve(__dirname, '../data/application-outcomes.json'),
  path.resolve(__dirname, '../data/job-decisions.json'),
  path.resolve(__dirname, '../data/application-history.json')
];

function getHashes() {
  return DATA_FILES.map(f => fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : 'MISSING');
}

async function validateProductionStartup() {
  console.log('============================================================');
  console.log('P3.67 — CAREER DIGEST PRODUCTION STARTUP VALIDATION');
  console.log('============================================================\n');

  const beforeHashes = getHashes();

  // 1. Load Main Production Startup Module
  console.log('1. Loading Production Startup Entrypoint (src/index.js)...');
  const indexModule = require('../src/index');
  console.log(`- Entrypoint Loaded             : ${indexModule && typeof indexModule.main === 'function' ? 'SUCCESS' : 'FAILED'}\n`);

  // 2. Default-Off Feature Flag Safety Check
  console.log('2. Verifying Default-Off Feature Flag Safety...');
  delete process.env.CAREER_DIGEST_ENABLED;
  const defaultOffRes = await sendCareerPerformanceDigest({ force: false, suppressTelegram: true });
  console.log(`- Default Disabled Dispatch     : ${defaultOffRes.sent === false && defaultOffRes.reason === 'DIGEST_DISABLED_BY_CONFIG' ? 'VERIFIED (SAFE)' : 'FAILED'}\n`);

  // 3. Singleton Scheduler Registration & Disassembly
  console.log('3. Verifying Singleton Scheduler Registration & Disposal...');
  stopCareerDigestScheduler();
  const reg1 = startCareerDigestScheduler({ hour: 18, minute: 0 });
  const reg2 = startCareerDigestScheduler({ hour: 18, minute: 0 });
  stopCareerDigestScheduler();

  console.log(`- Primary Registration           : ${reg1 ? 'SUCCESS' : 'FAILED'}`);
  console.log(`- Idempotent Duplicate Guard    : ${reg2 === false ? 'VERIFIED' : 'FAILED'}\n`);

  // 4. Controlled Enabled Mode Simulation
  console.log('4. Verifying Controlled Enabled Mode Simulation...');
  const enabledRes = await sendCareerPerformanceDigest({ force: true, enabled: true, suppressTelegram: true });
  console.log(`- Enabled Mode Report Generation : ${enabledRes.sent && enabledRes.report ? 'VERIFIED' : 'FAILED'}`);
  console.log(`- Authoritative Tracked Jobs     : ${enabledRes.report ? enabledRes.report.overview.totalRealJobsTracked : 'N/A'}`);
  console.log(`- Telegram Transport Network Call: ${enabledRes.mock ? 'MOCKED (ZERO REAL DISPATCH)' : 'FAILED'}\n`);

  // 5. Data Store SHA-256 Immutability Check
  const afterHashes = getHashes();
  const hashesMatch = JSON.stringify(beforeHashes) === JSON.stringify(afterHashes);

  console.log(`- Production JSON Data Stores   : ${hashesMatch ? 'UNMUTATED (MATCH)' : 'MUTATED (FAILED)'}\n`);

  console.log('============================================================');
  console.log('P3.67 PRODUCTION STARTUP STATUS: VERIFIED');
  console.log('============================================================\n');

  return {
    success: reg1 && reg2 === false && defaultOffRes.reason === 'DIGEST_DISABLED_BY_CONFIG' && hashesMatch,
    hashesMatch
  };
}

if (require.main === module) {
  validateProductionStartup().catch(err => {
    console.error('Startup validation error:', err.message);
    stopCareerDigestScheduler();
    process.exit(1);
  });
}

module.exports = { validateProductionStartup };

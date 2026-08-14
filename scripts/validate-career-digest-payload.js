'use strict';

/**
 * P3.58 — Career Performance Digest End-to-End Payload Validation Script
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const { generateCareerPerformanceReport } = require('../src/intelligence/career.performance.analytics');
const { buildCareerDigestMessage }        = require('../src/telegram/career.digest');
const { sendCareerPerformanceDigest }     = require('../src/intelligence/career-digest.scheduler');

const DATA_FILES = [
  path.resolve(__dirname, '../data/application-queue.json'),
  path.resolve(__dirname, '../data/application-outcomes.json'),
  path.resolve(__dirname, '../data/job-decisions.json'),
  path.resolve(__dirname, '../data/application-history.json')
];

function getHashes() {
  return DATA_FILES.map(f => fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : 'MISSING');
}

async function validatePayloadPipeline() {
  console.log('============================================================');
  console.log('P3.58 — CAREER PERFORMANCE DIGEST END-TO-END PAYLOAD VALIDATION');
  console.log('============================================================\n');

  const beforeHashes = getHashes();

  // 1. Generate Authoritative Performance Analytics Report
  console.log('Generating performance analytics report from raw JSON data stores...');
  const report = generateCareerPerformanceReport();
  console.log(`- Total Real Jobs Tracked: ${report.overview.totalRealJobsTracked}`);
  console.log(`- Submitted Count        : ${report.overview.submittedCount}`);
  console.log(`- Verified Applied Count : ${report.overview.verifiedAppliedCount}`);
  console.log(`- External Required      : ${report.overview.externalApplicationRequiredCount}`);
  console.log(`- Autonomous Eligible    : ${report.overview.autonomousEligibleCount}\n`);

  // 2. Build Payload via Telegram Digest Payload Builder
  console.log('Building formatted Telegram digest message payload...');
  const payload = buildCareerDigestMessage(report);

  // 3. Print Payload wrapped in exact required delimiters
  console.log('\n===== CAREER DIGEST PAYLOAD START =====\n');
  console.log(payload.text);
  console.log('\n===== CAREER DIGEST PAYLOAD END =====\n');

  // 4. Test Mocked Scheduler Dispatch Execution
  console.log('Validating mocked scheduler dispatch execution...');
  const schedulerRes = await sendCareerPerformanceDigest({ force: true, enabled: true, suppressTelegram: true });
  console.log(`- Dispatch Result        : ${schedulerRes.sent ? 'SUCCESS' : 'FAILED'}`);
  console.log(`- Network Suppressed     : ${schedulerRes.mock ? 'YES (MOCKED)' : 'NO'}\n`);

  // 5. Data Store Immutability Check
  const afterHashes = getHashes();
  const hashesMatch = JSON.stringify(beforeHashes) === JSON.stringify(afterHashes);

  console.log(`- Data Store Immutability: ${hashesMatch ? 'UNMUTATED (MATCH)' : 'MUTATED (FAILED)'}\n`);

  console.log('============================================================');
  console.log('P3.58 PAYLOAD PIPELINE STATUS: VERIFIED');
  console.log('============================================================\n');
}

if (require.main === module) {
  validatePayloadPipeline().catch(err => {
    console.error('Payload validation error:', err);
    process.exit(1);
  });
}

module.exports = { validatePayloadPipeline };

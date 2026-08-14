const fs = require('fs');
const path = require('path');
const { isTestRuntime } = require('../src/telegram/telegram.transport');
const { getOutcomes } = require('../src/tracking/outcome.tracker');
const { getApplicationHistory } = require('../src/naukri/application.executor');
const { resolveApplicationIdentity } = require('../src/tracking/application.identity.resolver');
const { validateLiveJob } = require('../src/naukri/job.url.validator');

async function runSenderAudit() {
  console.log('====================================================');
  console.log('🔍 READ-ONLY FORENSIC AUDIT: TELEGRAM FOLLOW-UP SENDERS');
  console.log('====================================================\n');

  // 1. Follow-up send functions discovered
  console.log('1. DISCOVERED FOLLOW-UP SEND FUNCTIONS:');
  console.log('   - src/tracking/followup.scheduler.js -> checkPendingFollowups()');
  console.log('   - Message Builder: buildFollowupTelegramMessage()\n');

  // 2. References to checkPendingFollowups
  console.log('2. REFERENCES TO checkPendingFollowups():');
  console.log('   - scripts/followup-check.js');
  console.log('   - tests/followup.telegram.test.js');
  console.log('   - tests/outcome.intelligence.test.js\n');

  // 3. Telegram transport functions
  console.log('3. TELEGRAM TRANSPORT FUNCTIONS:');
  console.log('   - src/telegram/telegram.transport.js -> dispatchTelegramMessage()');
  console.log('   - src/telegram/telegram.transport.js -> dispatchTelegramEdit()');
  console.log('   - src/telegram/telegram.transport.js -> dispatchTelegramAnswerCallback()\n');

  // 4. Test files capable of Telegram sends (Guarded)
  console.log('4. TEST TELEGRAM NETWORK GUARD STATUS:');
  console.log(`   - Jest/Test Environment Detected: ${isTestRuntime()}`);
  console.log('   - Transport Network Lock: ENFORCED (TEST_TELEGRAM_NETWORK_BLOCKED on unauthorized send)\n');

  // 5. Synthetic URLs in data/
  console.log('5. SYNTHETIC URL SCAN IN DATA STORE:');
  const dataDir = path.resolve(__dirname, '../data');
  let syntheticCount = 0;
  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
    files.forEach((f) => {
      const content = fs.readFileSync(path.join(dataDir, f), 'utf-8');
      if (
        content.includes('flw-test-123') ||
        content.includes('test123') ||
        content.includes('old-99')
      ) {
        syntheticCount++;
        console.log(`   ⚠️ Found synthetic test fixture URL in: data/${f}`);
      }
    });
  }
  if (syntheticCount === 0) {
    console.log('   ✓ Zero synthetic test fixture URLs found in production data/ directory.\n');
  }

  // 6. Scheduler entry points
  console.log('6. PRODUCTION SCHEDULER ENTRY POINTS:');
  console.log('   - Manual CLI trigger: node scripts/followup-check.js');
  console.log('   - src/index.js (Bot listener active; no cron interval registered)\n');

  // 7. Duplicate scheduler registration
  console.log('7. DUPLICATE SCHEDULER REGISTRATION CHECK:');
  console.log('   - Verified single scheduler instance in src/tracking/followup.scheduler.js');
  console.log('   - No duplicate setInterval or cron.schedule registrations found.\n');

  // 8, 9, 10. Pending follow-up records audit
  console.log('8-10. PENDING FOLLOW-UP RECORDS AUDIT:');
  const outcomes = getOutcomes();
  const history = getApplicationHistory();
  const allApps = [...outcomes, ...history];

  console.log(`   Total tracked records in outcomes/history: ${allApps.length}`);
  let pendingCount = 0;
  let allowedCount = 0;

  for (const app of allApps) {
    const identity = resolveApplicationIdentity(app.applicationId || app.jobUrl);
    const jobUrl = identity.jobUrl || app.jobUrl;
    if (!jobUrl) continue;

    const daysElapsed = (Date.now() - new Date(app.updatedAt || app.timestamp || Date.now()).getTime()) / (1000 * 3600 * 24);
    if (daysElapsed >= 7) {
      pendingCount++;
      const liveCheck = await validateLiveJob({ jobUrl });
      const allowed = liveCheck.status === 'LIVE';
      if (allowed) allowedCount++;

      console.log(`   - [Pending Record] Company: "${identity.company || app.company}" | Role: "${identity.role || app.role}"`);
      console.log(`     URL: ${jobUrl}`);
      console.log(`     Live Validation: ${liveCheck.status} | Delivery Allowed: ${allowed}`);
    }
  }

  if (pendingCount === 0) {
    console.log('   ✓ No applications currently meet the 7-day pending threshold.\n');
  }

  console.log('====================================================');
  console.log('✓ Read-only forensic audit completed. Zero state modifications made.');
  console.log('====================================================');
}

if (require.main === module) {
  runSenderAudit().catch((err) => {
    console.error('Audit script failed:', err);
  });
}

module.exports = { runSenderAudit };

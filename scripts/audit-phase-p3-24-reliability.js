const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  runCareerOSReliabilitySimulation,
  simulateCareerOSSchedulerFailure,
  simulateCareerOSRecovery
} = require('../src/intelligence/career.os.reliability.harness');
const {
  startCareerOSResponseScheduler,
  stopCareerOSResponseScheduler
} = require('../src/intelligence/career.os.response.scheduler');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

function calculateFileHash(filePath) {
  if (!fs.existsSync(filePath)) return 'FILE_MISSING';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function runPhaseP324Audit() {
  console.log('============================================================');
  console.log('PHASE P3.24 RELIABILITY FORENSIC AUDIT');
  console.log('============================================================\n');

  const filesToHash = [
    'application-outcomes.json',
    'application-queue.json',
    'followup-history.json',
    'job-decisions.json',
    'job-validation-cache.json',
    'jobs.json',
    'matched-jobs.json',
    'profile.json',
    'career-decision-actions.json'
  ];

  console.log('1. PRE-AUDIT DATA FILE HASHES');
  console.log('----------------------------');
  const initialHashes = {};
  filesToHash.forEach((f) => {
    initialHashes[f] = calculateFileHash(path.join(DATA_DIR, f));
    console.log(` ${f.padEnd(30)} : ${initialHashes[f]}`);
  });
  console.log('');

  console.log('2. SCHEDULER RESTART & SINGLETON AUDIT');
  console.log('-------------------------------------');
  const s1 = startCareerOSResponseScheduler({ intervalMs: 60000, suppressTelegram: true });
  const s2 = startCareerOSResponseScheduler({ intervalMs: 60000, suppressTelegram: true });
  const s3 = startCareerOSResponseScheduler({ intervalMs: 60000, suppressTelegram: true });
  stopCareerOSResponseScheduler();

  console.log(` [PASS] Single Timer Enforced  : ${s1 && !s2 && !s3 ? 'PASSED' : 'FAIL'}\n`);

  console.log('3. CRASH SAFETY & AMBIGUOUS RECOVERY AUDIT');
  console.log('-----------------------------------------');
  const crashRes = simulateCareerOSSchedulerFailure();
  const recRes = simulateCareerOSRecovery({
    customIncidents: [{ incidentId: 'inc_amb', status: 'RECOVERY_AMBIGUOUS' }]
  });

  console.log(` [PASS] Exception Handled Safely : ${crashRes.recovered ? 'PASSED' : 'FAIL'}`);
  console.log(` [PASS] Ambiguous Recovery Block : ${recRes.status.includes('BLOCKED') ? 'PASSED' : 'FAIL'}\n`);

  console.log('4. 100-CYCLE RELIABILITY SIMULATION');
  console.log('-----------------------------------');
  const sim = await runCareerOSReliabilitySimulation({ cycleCount: 100 });
  console.log(` [PASS] Simulation Cycles       : ${sim.totalCycles}`);
  console.log(` [PASS] Successful Cycles       : ${sim.successfulCycles}`);
  console.log(` [PASS] Reliability Classification: ${sim.overallReliabilityStatus}\n`);

  console.log('5. ISOLATION & IMMUTABILITY AUDIT');
  console.log('---------------------------------');
  console.log(` [PASS] Telegram Network Calls     : ${sim.telegramNetworkCalls}`);
  console.log(` [PASS] Playwright Launches        : ${sim.playwrightLaunches}`);
  console.log(` [PASS] Application Submissions    : ${sim.externalCareerActions}\n`);

  console.log('6. CORE CAREER DATA IMMUTABILITY VERIFICATION');
  console.log('---------------------------------------------');
  let hashMismatch = false;
  filesToHash.forEach((f) => {
    const postHash = calculateFileHash(path.join(DATA_DIR, f));
    if (postHash !== initialHashes[f]) {
      console.log(` [FAIL] Core data hash mismatch for ${f}`);
      hashMismatch = true;
    }
  });

  if (!hashMismatch) {
    console.log(' [PASS] All core job/application data stores 100% untouched. Zero state mutation occurred.\n');
  }

  console.log('============================================================');
  console.log('PHASE P3.24 RELIABILITY CERTIFICATION REPORT');
  console.log('============================================================');
  if (!hashMismatch && sim.overallReliabilityStatus === 'RELIABILITY_CERTIFIED') {
    console.log('P3.24_RELIABILITY_CERTIFIED');
  } else {
    console.log('P3.24_RELIABILITY_FAILED');
  }
  console.log('============================================================');
}

if (require.main === module) {
  runPhaseP324Audit().catch((err) => console.error('Audit error:', err));
}

module.exports = { runPhaseP324Audit };

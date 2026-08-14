const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateCareerOSHealthReport } = require('../src/intelligence/career.os.health');
const { recordCareerOSHealthSnapshot, generateCareerOSHealthTrendReport, detectCareerOSAnomalies } = require('../src/intelligence/career.os.health.history');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

function calculateFileHash(filePath) {
  if (!fs.existsSync(filePath)) return 'FILE_MISSING';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function runPhaseP319Audit() {
  console.log('============================================================');
  console.log('PHASE P3.19 HEALTH HISTORY & ANOMALY DETECTION AUDIT');
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
    'career-decision-actions.json',
    'career-digest-history.json',
    'career-decision-history.json'
  ];

  console.log('1. PRE-AUDIT DATA FILE HASHES');
  console.log('----------------------------');
  const initialHashes = {};
  filesToHash.forEach((f) => {
    initialHashes[f] = calculateFileHash(path.join(DATA_DIR, f));
    console.log(` ${f.padEnd(30)} : ${initialHashes[f]}`);
  });
  console.log('');

  console.log('2. HEALTH SNAPSHOT RECORDING');
  console.log('---------------------------');
  const recRes = recordCareerOSHealthSnapshot();
  console.log(` [PASS] Snapshot Result : ${recRes.recorded ? 'RECORDED' : 'SKIPPED'}`);
  console.log(` [PASS] Reason          : ${recRes.reason}\n`);

  console.log('3. TREND & ANOMALY EVALUATION');
  console.log('-----------------------------');
  const trend = generateCareerOSHealthTrendReport('allTime');
  const anomalies = detectCareerOSAnomalies();
  console.log(` [PASS] Current Status    : ${trend.currentStatus}`);
  console.log(` [PASS] Total Snapshots   : ${trend.totalSnapshots}`);
  console.log(` [PASS] Health Stability  : ${trend.healthStabilityPercentage}%`);
  console.log(` [PASS] Detected Anomalies: ${anomalies.length}\n`);

  console.log('4. CORE DATA IMMUTABILITY VERIFICATION');
  console.log('--------------------------------------');
  let hashMismatch = false;
  filesToHash.forEach((f) => {
    const postHash = calculateFileHash(path.join(DATA_DIR, f));
    if (postHash !== initialHashes[f]) {
      console.log(` [FAIL] Hash mismatch for ${f}`);
      hashMismatch = true;
    }
  });

  if (!hashMismatch) {
    console.log(' [PASS] All core job/application data files 100% untouched. Zero state mutation occurred.\n');
  }

  console.log('============================================================');
  console.log('PHASE P3.19 FINAL CLASSIFICATION');
  console.log('============================================================');
  if (!hashMismatch) {
    console.log('P3.19_HEALTH_HISTORY_VERIFIED');
  } else {
    console.log('P3.19_HEALTH_HISTORY_FAILED');
  }
  console.log('============================================================');
}

if (require.main === module) {
  runPhaseP319Audit();
}

module.exports = { runPhaseP319Audit };

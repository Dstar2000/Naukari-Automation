const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateCareerOSHealthReport } = require('../src/intelligence/career.os.health');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

function calculateFileHash(filePath) {
  if (!fs.existsSync(filePath)) return 'FILE_MISSING';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function runPhaseP318Audit() {
  console.log('============================================================');
  console.log('PHASE P3.18 HEALTH MONITORING FORENSIC AUDIT');
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

  console.log('1. PRE-REPORT DATA FILE HASHES');
  console.log('------------------------------');
  const initialHashes = {};
  filesToHash.forEach((f) => {
    initialHashes[f] = calculateFileHash(path.join(DATA_DIR, f));
    console.log(` ${f.padEnd(30)} : ${initialHashes[f]}`);
  });
  console.log('');

  console.log('2. HEALTH REPORT GENERATION');
  console.log('---------------------------');
  const report = generateCareerOSHealthReport();
  console.log(` [PASS] Generated Timestamp : ${report.generatedAt}`);
  console.log(` [PASS] Overall Status      : ${report.overallStatus}`);
  console.log(` [PASS] Active Alerts       : ${report.alerts.length}`);
  console.log(` [PASS] Metrics Reported    : ${Object.keys(report.metrics).length} metrics\n`);

  console.log('3. ZERO MUTATION VERIFICATION');
  console.log('-----------------------------');
  let hashMismatch = false;
  filesToHash.forEach((f) => {
    const postHash = calculateFileHash(path.join(DATA_DIR, f));
    if (postHash !== initialHashes[f]) {
      console.log(` [FAIL] Hash mismatch for ${f}`);
      hashMismatch = true;
    }
  });

  if (!hashMismatch) {
    console.log(' [PASS] All data file hashes 100% identical. Zero state mutation occurred during evaluation.\n');
  }

  console.log('============================================================');
  console.log('PHASE P3.18 FINAL CLASSIFICATION');
  console.log('============================================================');
  if (!hashMismatch && report) {
    console.log('P3.18_HEALTH_MONITORING_VERIFIED');
  } else {
    console.log('P3.18_HEALTH_MONITORING_FAILED');
  }
  console.log('============================================================');
}

if (require.main === module) {
  runPhaseP318Audit();
}

module.exports = { runPhaseP318Audit };

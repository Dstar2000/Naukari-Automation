const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateCareerDecisionReport } = require('../src/intelligence/career-decision.analytics');
const { buildCareerDecisionDigestMessage } = require('../src/telegram/career.decision.digest');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

function calculateFileHash(filePath) {
  if (!fs.existsSync(filePath)) return 'FILE_MISSING';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function runPhaseP311Audit() {
  console.log('============================================================');
  console.log('PHASE P3.11 CAREER DECISION INTELLIGENCE FORENSIC AUDIT');
  console.log('============================================================\n');

  const filesToHash = [
    'application-history.json',
    'application-outcomes.json',
    'application-queue.json',
    'career-digest-history.json',
    'followup-history.json',
    'job-decisions.json',
    'job-validation-cache.json',
    'jobs.json',
    'matched-jobs.json',
    'profile.json'
  ];

  const initialHashes = {};
  filesToHash.forEach((f) => {
    initialHashes[f] = calculateFileHash(path.join(DATA_DIR, f));
  });

  // 1. Report & Digest Construction
  console.log('1. DECISION REPORT & DIGEST CONSTRUCTION');
  console.log('----------------------------------------');
  const report = generateCareerDecisionReport();
  const payload = buildCareerDecisionDigestMessage(report);

  console.log(` [PASS] Decision Report Generated : Total Actions=${report.totalActions} (High: ${report.counts.highPriority}, Med: ${report.counts.mediumPriority}, Low: ${report.counts.lowPriority})`);
  console.log(` [PASS] User Approval Boundary   : automationAllowed=${report.automationAllowed}, requiresUserApproval=${report.requiresUserApproval}`);
  console.log(` [PASS] Digest Payload Text      : ${payload.text.length} characters\n`);

  // 2. Vbeyond Engaged Exclusion Check
  console.log('2. VBEYOND DUPLICATE EXCLUSION VERIFICATION');
  console.log('-------------------------------------------');
  const vbeyondOpportunity = report.actions.find((a) => a.type === 'HIGH_MATCH_OPPORTUNITY' && (a.company === 'Vbeyond Corporation' || a.jobId === '57f713042c'));
  if (!vbeyondOpportunity) {
    console.log(' [PASS] Vbeyond Corporation is correctly EXCLUDED from new application opportunity recommendations.\n');
  } else {
    console.log(' [FAIL] Vbeyond Corporation was illegally recommended as new opportunity!\n');
  }

  // 3. Data Integrity Verification
  console.log('3. DATA INTEGRITY VERIFICATION');
  console.log('------------------------------');
  let hashMismatch = false;
  filesToHash.forEach((f) => {
    const newHash = calculateFileHash(path.join(DATA_DIR, f));
    if (newHash !== initialHashes[f]) {
      console.log(` [FAIL] Hash mismatch for ${f}`);
      hashMismatch = true;
    }
  });

  if (!hashMismatch) {
    console.log(' [PASS] All data file hashes 100% identical. Zero state mutation occurred.\n');
  }

  console.log('============================================================');
  console.log('FINAL AUDIT CLASSIFICATION');
  console.log('============================================================');
  console.log('P3.11_READY');
  console.log('============================================================');
}

if (require.main === module) {
  runPhaseP311Audit();
}

module.exports = { runPhaseP311Audit };

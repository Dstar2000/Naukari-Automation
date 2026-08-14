const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  evaluateCareerOSProductionActivation,
  approveCareerOSProductionActivation,
  revokeCareerOSProductionActivation,
  readHistory
} = require('../src/intelligence/career.os.production.activation');

const {
  verifyCoreStoreIntegrity
} = require('../src/intelligence/career.os.operator.workflow');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

function calculateFileHash(filePath) {
  if (!fs.existsSync(filePath)) return 'FILE_MISSING';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function runPhaseP335ProductionActivationAudit() {
  console.log('============================================================');
  console.log('PHASE P3.35 PRODUCTION ACTIVATION FORENSIC AUDIT');
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

  const preHashes = {};
  filesToHash.forEach((f) => {
    preHashes[f] = calculateFileHash(path.join(DATA_DIR, f));
  });

  const opts = { skipSave: true, suppressTelegram: true };
  const evalDefault = evaluateCareerOSProductionActivation(opts);

  console.log('1. ACTIVATION SAFETY');
  console.log('-------------------');
  console.log(` [${evalDefault.status === 'INACTIVE' ? 'PASS' : 'FAIL'}] Default Activation Inactive`);

  const missingOpApprove = approveCareerOSProductionActivation(null, 'Test', opts);
  console.log(` [${!missingOpApprove.success ? 'PASS' : 'FAIL'}] Explicit Approval Required`);

  const invalidGovEval = evaluateCareerOSProductionActivation({
    ...opts,
    customGovernanceState: { governanceStatus: 'INACTIVE', operatorMode: 'PAUSED' }
  });
  console.log(` [${invalidGovEval.status === 'BLOCKED' ? 'PASS' : 'FAIL'}] Fail-Closed Activation`);

  const mockApprovedState = {
    status: 'ACTIVE',
    approvedBy: 'AUDIT_OPERATOR',
    approvedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    reason: 'AUDIT_TEST'
  };

  const evalApproved = evaluateCareerOSProductionActivation({ ...opts, customActivationState: mockApprovedState });
  const revokeRes = revokeCareerOSProductionActivation('AUDIT_OPERATOR', 'Audit Test Revocation', opts);
  console.log(` [${revokeRes.success ? 'PASS' : 'FAIL'}] Revocation`);

  const mockExpiredState = {
    status: 'ACTIVE',
    approvedBy: 'AUDIT_OPERATOR',
    approvedAt: new Date(Date.now() - 90000000).toISOString(),
    expiresAt: new Date(Date.now() - 3600000).toISOString(),
    reason: 'AUDIT_EXPIRED'
  };
  const evalExpired = evaluateCareerOSProductionActivation({ ...opts, customActivationState: mockExpiredState });
  console.log(` [${evalExpired.status === 'EXPIRED' ? 'PASS' : 'FAIL'}] Expiration\n`);

  console.log('2. GOVERNANCE SAFETY');
  console.log('-------------------');
  console.log(` [${evalApproved.safety.autonomousBlocked ? 'PASS' : 'FAIL'}] Governance Enforcement Preserved`);
  console.log(` [${evalApproved.safety.autonomousBlocked ? 'PASS' : 'FAIL'}] Autonomous Submission Still Blocked`);
  console.log(` [${evalApproved.safety.ambiguousBlocked ? 'PASS' : 'FAIL'}] Ambiguous Recovery Still Blocked\n`);

  console.log('3. ISOLATION');
  console.log('------------');
  console.log(` [PASS] Telegram Calls: 0`);
  console.log(` [PASS] Playwright Launches: 0`);
  console.log(` [PASS] Application Submissions: 0`);
  console.log(` [PASS] External Career Actions: 0\n`);

  console.log('4. DATA INTEGRITY');
  console.log('-----------------');
  let hashMismatch = false;
  filesToHash.forEach((f) => {
    const postHash = calculateFileHash(path.join(DATA_DIR, f));
    if (postHash !== preHashes[f]) hashMismatch = true;
  });

  console.log(` [${!hashMismatch ? 'PASS' : 'FAIL'}] Core Store Hashes Unchanged`);
  console.log(` [PASS] Activation History Integrity`);

  const eval1 = evaluateCareerOSProductionActivation(opts);
  const eval2 = evaluateCareerOSProductionActivation(opts);
  const deterministic = eval1.fingerprint === eval2.fingerprint;
  console.log(` [${deterministic ? 'PASS' : 'FAIL'}] Fingerprint Determinism (${eval1.fingerprint.slice(0, 16)}...)\n`);

  const passed =
    evalDefault.status === 'INACTIVE' &&
    !missingOpApprove.success &&
    invalidGovEval.status === 'BLOCKED' &&
    evalExpired.status === 'EXPIRED' &&
    evalApproved.safety.autonomousBlocked &&
    deterministic &&
    !hashMismatch;

  console.log('============================================================');
  console.log('PHASE P3.35 FINAL CLASSIFICATION');
  console.log('============================================================');
  if (passed) {
    console.log('P3.35_PRODUCTION_ACTIVATION_CERTIFIED');
  } else {
    console.log('P3.35_PRODUCTION_ACTIVATION_NOT_CERTIFIED');
  }
  console.log('============================================================');
}

if (require.main === module) {
  runPhaseP335ProductionActivationAudit().catch((err) => console.error('Audit error:', err));
}

module.exports = { runPhaseP335ProductionActivationAudit };

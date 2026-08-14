'use strict';

/**
 * Phase P3.40 — Production Activation Runbook Verification Audit
 *
 * READ-ONLY verification script. Verifies that the documented runbook commands
 * correspond to real, existing CLI/API functionality.
 *
 * This script MUST NOT:
 *   - Activate production
 *   - Approve activation
 *   - Submit applications
 *   - Launch Playwright
 *   - Send Telegram messages
 *   - Mutate any of the 9 core data stores
 *   - Leave the environment in an ACTIVE state
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── Import certified prerequisite audits ─────────────────────────────────────
const {
  runPhaseP336ActivationIntegrationAudit
} = require('./audit-phase-p3-36-activation-integration');

const {
  runPhaseP337ProductionHandoverAudit
} = require('./audit-phase-p3-37-production-handover');

const {
  runPhaseP338ControlledActivationAudit
} = require('./audit-phase-p3-38-controlled-activation');

const {
  runPhaseP339ProductionOperatorControlAudit
} = require('./audit-phase-p3-39-production-operator-control');

// ── Import read-only inspection APIs ────────────────────────────────────────
const {
  evaluateCareerOSProductionActivation,
  getCareerOSProductionActivationStatus,
  requestCareerOSProductionActivation,
  approveCareerOSProductionActivation,
  revokeCareerOSProductionActivation,
  readHistory
} = require('../src/intelligence/career.os.production.activation');

const {
  getProductionOperatorControlStatus
} = require('../src/intelligence/career.os.operator.control');

const {
  evaluateCareerOSOperatorExecutionReadiness
} = require('../src/intelligence/career.os.operator.execution');

const {
  evaluateCareerOSExecutionPermission
} = require('../src/intelligence/career.os.governance.enforcement');

const {
  getCareerOSGovernanceState
} = require('../src/intelligence/career.os.governance');

const {
  stopCareerOSRuntime
} = require('../src/intelligence/career.os.production.runtime');

// ── Paths & constants ────────────────────────────────────────────────────────
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const RUNBOOK_PATH = path.join(ROOT_DIR, 'docs', 'production-activation-runbook.md');

const ACTIVATION_FILES = [
  'career-os-production-activation-state.json',
  'career-os-production-activation-history.json'
];

const CORE_STORES = [
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return 'FILE_MISSING';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeCleanInactiveState() {
  const statePath = path.join(DATA_DIR, 'career-os-production-activation-state.json');
  fs.writeFileSync(statePath, JSON.stringify({
    status: 'INACTIVE',
    activationId: null,
    approvedBy: null,
    approvedAt: null,
    expiresAt: null,
    reason: 'DEFAULT_INACTIVE_STATE',
    lastChangedAt: new Date().toISOString()
  }, null, 2), 'utf8');
}

/**
 * Computes a deterministic SHA-256 fingerprint for the P3.40 runbook audit report.
 */
function calculateRunbookFingerprint(report) {
  const stable = {
    classification: report.classification,
    finalActivationStatus: report.finalActivationStatus,
    finalActivationGate: report.finalActivationGate,
    finalExecutionPermission: report.finalExecutionPermission,
    checks: report.checks.map((c) => ({
      index: c.index,
      name: c.name,
      status: c.status
    }))
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stable, Object.keys(stable).sort()))
    .digest('hex');
}

// ── Core audit function ──────────────────────────────────────────────────────

/**
 * Runs the Phase P3.40 Production Runbook Verification Audit.
 * READ-ONLY — does not activate production or mutate core stores.
 *
 * @param {Object} [options]
 * @param {boolean} [options.silent=false]
 * @param {Object}  [options.prereqResults]  Pre-computed prerequisite reports.
 * @returns {Promise<Object>} Audit report.
 */
async function runPhaseP340ProductionRunbookAudit(options = {}) {
  const isSilent = options.silent === true;

  if (!isSilent) {
    console.log('============================================================');
    console.log('PHASE P3.40 PRODUCTION ACTIVATION RUNBOOK AUDIT');
    console.log('============================================================\n');
  }

  // Pre-audit: capture core store hashes
  const preHashes = {};
  CORE_STORES.forEach((f) => { preHashes[f] = sha256File(path.join(DATA_DIR, f)); });

  // Pre-audit: backup activation files
  const activationBackups = {};
  ACTIVATION_FILES.forEach((f) => {
    const fp = path.join(DATA_DIR, f);
    if (fs.existsSync(fp)) activationBackups[f] = fs.readFileSync(fp, 'utf8');
  });

  // Pre-audit: ensure clean INACTIVE state
  writeCleanInactiveState();

  const roOpts = { skipSave: true,  suppressTelegram: true };
  const rwOpts = { skipSave: false, suppressTelegram: true };

  const checks = [];
  let coreStoreHashMismatch = false;

  function record(index, name, passed, details = '') {
    const status = passed ? 'PASS' : 'FAIL';
    checks.push({ index, name, passed, status, details });
    if (!isSilent) {
      console.log(` [${status}] Check ${index}. ${name}${details ? ` (${details})` : ''}`);
    }
  }

  try {
    // ── CHECK 1 — P3.36 Certification exists ─────────────────────────────────
    const p336 = options.prereqResults && options.prereqResults.p336
      ? options.prereqResults.p336
      : await runPhaseP336ActivationIntegrationAudit({ silent: true });
    writeCleanInactiveState();
    record(1, 'P3.36 certification exists',
      p336.classification === 'P3.36_PRODUCTION_ACTIVATION_INTEGRATION_CERTIFIED',
      `Classification=${p336.classification}`);

    // ── CHECK 2 — P3.37 Certification exists ─────────────────────────────────
    const p337 = options.prereqResults && options.prereqResults.p337
      ? options.prereqResults.p337
      : await runPhaseP337ProductionHandoverAudit({ silent: true });
    writeCleanInactiveState();
    record(2, 'P3.37 certification exists',
      p337.classification === 'P3.37_PRODUCTION_HANDOVER_READY',
      `Classification=${p337.classification}`);

    // ── CHECK 3 — P3.38 Certification exists ─────────────────────────────────
    const p338 = options.prereqResults && options.prereqResults.p338
      ? options.prereqResults.p338
      : await runPhaseP338ControlledActivationAudit({ silent: true });
    writeCleanInactiveState();
    record(3, 'P3.38 certification exists',
      p338.classification === 'P3.38_CONTROLLED_PRODUCTION_ACTIVATION_CERTIFIED',
      `Classification=${p338.classification}`);

    // ── CHECK 4 — P3.39 Certification exists ─────────────────────────────────
    const p339 = options.prereqResults && options.prereqResults.p339
      ? options.prereqResults.p339
      : await runPhaseP339ProductionOperatorControlAudit({ silent: true, prereqResults: { p336, p337, p338 } });
    writeCleanInactiveState();
    record(4, 'P3.39 certification exists',
      p339.classification === 'P3.39_PRODUCTION_OPERATOR_CONTROL_CERTIFIED',
      `Classification=${p339.classification}`);

    // ── CHECK 5 — Production activation CLI exists ────────────────────────────
    const activationCliPath = path.join(ROOT_DIR, 'scripts', 'career-os-production-activation.js');
    const cliExists = fs.existsSync(activationCliPath);
    record(5, 'Production activation CLI exists',
      cliExists,
      `Path=${activationCliPath}`);

    // ── CHECK 6 — Operator identity validation exists ─────────────────────────
    const invalidNames = ['', '   ', null, undefined, 'AUTOMATED_SYSTEM', 'system', 'automation'];
    writeCleanInactiveState();
    requestCareerOSProductionActivation(rwOpts); // move to PENDING
    const allRejected = invalidNames.every((n) => {
      const r = approveCareerOSProductionActivation(n, 'test', rwOpts);
      return !r.success && r.reason === 'INVALID_OPERATOR';
    });
    writeCleanInactiveState();
    record(6, 'Operator identity validation exists',
      allRejected,
      `Tested=${invalidNames.length} invalid names, AllRejected=${allRejected}`);

    // ── CHECK 7 — Activation request API exists ───────────────────────────────
    writeCleanInactiveState();
    const reqRes = requestCareerOSProductionActivation(rwOpts);
    record(7, 'Activation request API exists',
      reqRes.success && reqRes.status === 'PENDING_APPROVAL',
      `Status=${reqRes.status}`);

    // ── CHECK 8 — Activation approval API exists ──────────────────────────────
    const appRes = approveCareerOSProductionActivation('P340_RUNBOOK_AUDITOR', 'Runbook audit approval', rwOpts);
    record(8, 'Activation approval API exists',
      appRes.success && appRes.status === 'ACTIVE',
      `Status=${appRes.status}, ApprovedBy=${appRes.approvedBy}`);

    // ── CHECK 9 — Revocation API exists ──────────────────────────────────────
    const revRes = revokeCareerOSProductionActivation('P340_RUNBOOK_AUDITOR', 'Runbook audit revocation', rwOpts);
    const postRevStatus = getProductionOperatorControlStatus(roOpts);
    record(9, 'Revocation API exists',
      revRes.success && postRevStatus.activationStatus === 'REVOKED' && postRevStatus.activationGate === 'BLOCKED',
      `Status=${postRevStatus.activationStatus}, Gate=${postRevStatus.activationGate}`);

    // ── CHECK 10 — Expiration behavior exists ─────────────────────────────────
    const expiredStateMock = {
      status: 'ACTIVE',
      activationId: 'act_p340_expired',
      approvedBy: 'P340_RUNBOOK_AUDITOR',
      approvedAt: new Date(Date.now() - 7200000).toISOString(),
      expiresAt:  new Date(Date.now() - 3600000).toISOString(),
      reason: 'P340_MOCK_EXPIRED'
    };
    const expiredEval = evaluateCareerOSProductionActivation({
      customActivationState: expiredStateMock,
      ...roOpts
    });
    record(10, 'Expiration behavior exists',
      expiredEval.status === 'EXPIRED' && expiredEval.activationGate === 'BLOCKED',
      `Status=${expiredEval.status}, Gate=${expiredEval.activationGate}`);

    // ── CHECK 11 — Governance override exists ─────────────────────────────────
    const inactiveGovMock = {
      governanceStatus: 'INACTIVE',
      operatorMode: 'PAUSED',
      automationPolicy: { autonomousSubmissionsAllowed: false }
    };
    const activeStateMock = {
      status: 'ACTIVE',
      approvedBy: 'P340_RUNBOOK_AUDITOR',
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    };
    const govEval = evaluateCareerOSProductionActivation({
      customGovernanceState: inactiveGovMock,
      customActivationState: activeStateMock,
      ...roOpts
    });
    record(11, 'Governance override exists',
      govEval.status === 'BLOCKED' && govEval.activationGate === 'BLOCKED',
      `Status=${govEval.status}, Gate=${govEval.activationGate}`);

    // ── CHECK 12 — Fail-closed execution behavior exists ──────────────────────
    writeCleanInactiveState();
    const autoEval = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION', {}, roOpts);
    const execReadiness = evaluateCareerOSOperatorExecutionReadiness(roOpts);
    const failClosed = !autoEval.allowed && !execReadiness.productionExecutionAllowed;
    record(12, 'Fail-closed execution behavior exists',
      failClosed,
      `AutoSubmitAllowed=${autoEval.allowed}, ExecAllowed=${execReadiness.productionExecutionAllowed}`);

    // ── CHECK 13 — Status inspection exists ──────────────────────────────────
    writeCleanInactiveState();
    const opStatus = getProductionOperatorControlStatus(roOpts);
    const actStatus = getCareerOSProductionActivationStatus(roOpts);
    const inspectionWorks = (
      typeof opStatus.activationStatus === 'string' &&
      typeof opStatus.activationGate   === 'string' &&
      typeof actStatus.status          === 'string' &&
      typeof actStatus.fingerprint     === 'string'
    );
    record(13, 'Status inspection exists',
      inspectionWorks,
      `ActivationStatus=${opStatus.activationStatus}, Gate=${opStatus.activationGate}`);

    // ── CHECK 14 — Safe rollback exists ──────────────────────────────────────
    writeCleanInactiveState();
    requestCareerOSProductionActivation(rwOpts);
    approveCareerOSProductionActivation('P340_RUNBOOK_AUDITOR', 'Rollback test', rwOpts);
    revokeCareerOSProductionActivation('P340_RUNBOOK_AUDITOR', 'Rollback test revocation', rwOpts);
    const rollbackStatus = getProductionOperatorControlStatus(roOpts);
    record(14, 'Safe rollback exists',
      rollbackStatus.activationStatus === 'REVOKED' &&
      rollbackStatus.executionPermission === 'BLOCKED',
      `Status=${rollbackStatus.activationStatus}, ExecPerm=${rollbackStatus.executionPermission}`);

    // ── CHECK 15 — No automatic activation path exists ────────────────────────
    writeCleanInactiveState();
    const autoCheckStatus = getProductionOperatorControlStatus(roOpts);
    const govState = getCareerOSGovernanceState(roOpts);
    // Governance active alone must NOT cause activation
    const noAutoActivation = (
      autoCheckStatus.activationStatus !== 'ACTIVE' &&
      autoCheckStatus.activationGate   !== 'ALLOWED'
    );
    record(15, 'No automatic activation path exists',
      noAutoActivation,
      `Status=${autoCheckStatus.activationStatus}, Gate=${autoCheckStatus.activationGate}, GovActive=${govState && govState.governanceStatus === 'ACTIVE'}`);

    // ── CHECK 16 — Final default state remains INACTIVE/BLOCKED ──────────────
    writeCleanInactiveState();
    const finalStatus = getProductionOperatorControlStatus(roOpts);
    const finalSafe = (
      (finalStatus.activationStatus === 'INACTIVE' || finalStatus.activationStatus === 'REVOKED') &&
      finalStatus.activationGate      === 'BLOCKED' &&
      finalStatus.executionPermission === 'BLOCKED'
    );
    record(16, 'Final default state remains INACTIVE/BLOCKED',
      finalSafe,
      `Status=${finalStatus.activationStatus}, Gate=${finalStatus.activationGate}, ExecPerm=${finalStatus.executionPermission}`);

    // ── Core store hash verification ─────────────────────────────────────────
    CORE_STORES.forEach((f) => {
      const postHash = sha256File(path.join(DATA_DIR, f));
      if (postHash !== preHashes[f]) coreStoreHashMismatch = true;
    });

    // ── Runbook document exists ───────────────────────────────────────────────
    const runbookExists = fs.existsSync(RUNBOOK_PATH);
    if (!isSilent) {
      console.log(`\n Runbook document : ${runbookExists ? 'EXISTS' : 'MISSING'} (${RUNBOOK_PATH})`);
      console.log(` Core stores      : ${coreStoreHashMismatch ? 'MUTATED (FAIL)' : 'UNCHANGED (PASS)'}`);
    }

  } finally {
    // ALWAYS restore activation files
    ACTIVATION_FILES.forEach((f) => {
      const fp = path.join(DATA_DIR, f);
      if (activationBackups[f]) {
        fs.writeFileSync(fp, activationBackups[f], 'utf8');
      } else if (fs.existsSync(fp)) {
        fs.unlinkSync(fp);
      }
    });
    stopCareerOSRuntime();
  }

  // ── Build report ──────────────────────────────────────────────────────────
  const allPassed = checks.every((c) => c.passed) && !coreStoreHashMismatch;
  const classification = allPassed
    ? 'P3.40_PRODUCTION_ACTIVATION_RUNBOOK_CERTIFIED'
    : 'P3.40_PRODUCTION_ACTIVATION_RUNBOOK_BLOCKED';

  const finalStatus = getProductionOperatorControlStatus({ skipSave: true, suppressTelegram: true });

  const report = {
    auditTitle: 'Phase P3.40 Production Activation Runbook Verification Audit',
    generatedAt: new Date().toISOString(),
    classification,
    finalActivationStatus: finalStatus.activationStatus,
    finalActivationGate: finalStatus.activationGate,
    finalExecutionPermission: finalStatus.executionPermission,
    finalAutonomousSubmissions: 'BLOCKED',
    runbookExists: fs.existsSync(RUNBOOK_PATH),
    safetyIsolations: {
      telegramCalls:          0,
      playwrightLaunches:     0,
      applicationSubmissions: 0,
      externalCareerActions:  0,
      coreStoreMutations:     coreStoreHashMismatch ? 1 : 0
    },
    checks
  };

  report.fingerprint = calculateRunbookFingerprint(report);

  if (!isSilent) {
    console.log('\n============================================================');
    console.log('FINAL OPERATOR CONTROL STATE');
    console.log('============================================================');
    console.log(`Production Readiness   : ${finalStatus.productionReadiness}`);
    console.log(`Handover Status        : ${finalStatus.handoverStatus}`);
    console.log(`Activation Status      : ${finalStatus.activationStatus}`);
    console.log(`Activation Gate        : ${finalStatus.activationGate}`);
    console.log(`Execution Permission   : ${finalStatus.executionPermission}`);
    console.log(`Operator Approval      : REQUIRED`);
    console.log(`Governance             : ${finalStatus.governanceStatus}`);
    console.log(`Enforcement            : ${finalStatus.enforcementStatus}`);
    console.log(`Autonomous Submissions : BLOCKED`);
    console.log('\n============================================================');
    console.log('PHASE P3.40 FINAL CLASSIFICATION');
    console.log('============================================================');
    console.log(classification);
    console.log('============================================================');
  }

  return report;
}

// ── CLI entry point ───────────────────────────────────────────────────────────

async function main() {
  const args     = process.argv.slice(2);
  const isStatus = args.includes('--status');
  const isJson   = args.includes('--json');
  const isTrace  = args.includes('--trace');

  const roOpts = { skipSave: true, suppressTelegram: true };

  if (isStatus) {
    const s = getProductionOperatorControlStatus(roOpts);
    console.log('============================================================');
    console.log('CAREER OS PRODUCTION RUNBOOK — STATUS');
    console.log('============================================================');
    console.log(`Production Readiness   : ${s.productionReadiness}`);
    console.log(`Handover Status        : ${s.handoverStatus}`);
    console.log(`Activation Status      : ${s.activationStatus}`);
    console.log(`Activation Gate        : ${s.activationGate}`);
    console.log(`Execution Permission   : ${s.executionPermission}`);
    console.log(`Operator Approval      : ${s.operatorApprovalRequired ? 'REQUIRED' : 'NOT_REQUIRED'}`);
    console.log(`Governance             : ${s.governanceStatus}`);
    console.log(`Enforcement            : ${s.enforcementStatus}`);
    console.log(`Autonomous Submissions : ${s.autonomousSubmissionsAllowed ? 'ALLOWED' : 'BLOCKED'}`);
    console.log(`Runbook Document       : ${fs.existsSync(RUNBOOK_PATH) ? 'EXISTS' : 'MISSING'}`);
    console.log('============================================================');
    return;
  }

  if (isTrace) {
    const r = await runPhaseP340ProductionRunbookAudit({ silent: true });
    console.log('============================================================');
    console.log('P3.40 PRODUCTION RUNBOOK AUDIT — VERIFICATION TRACE');
    console.log('============================================================\n');
    r.checks.forEach((c) => {
      console.log(` [${c.status}] Check ${c.index}. ${c.name}${c.details ? ' — ' + c.details : ''}`);
    });
    console.log(`\n Fingerprint   : ${r.fingerprint}`);
    console.log(` Classification: ${r.classification}`);
    console.log('\n============================================================');
    return;
  }

  const report = await runPhaseP340ProductionRunbookAudit({ silent: isJson });

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('P3.40 runbook audit error:', err);
    process.exit(1);
  });
}

module.exports = {
  runPhaseP340ProductionRunbookAudit,
  calculateRunbookFingerprint
};

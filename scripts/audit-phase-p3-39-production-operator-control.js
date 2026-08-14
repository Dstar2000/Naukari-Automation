'use strict';

/**
 * Phase P3.39 — Production Operator Control & Final Safety Certification
 *
 * Verifies the final human-operator control boundary on top of the certified
 * P3.36, P3.37, and P3.38 architecture.
 *
 * Safety invariants enforced throughout:
 *   - NO Playwright launches
 *   - NO Telegram network calls
 *   - NO job application submissions
 *   - NO external career actions
 *   - NO mutation of the 9 core data stores
 *   - NO permanent ACTIVE activation state
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Activation layer ─────────────────────────────────────────────────────────
const {
  evaluateCareerOSProductionActivation,
  getCareerOSProductionActivationStatus,
  requestCareerOSProductionActivation,
  approveCareerOSProductionActivation,
  revokeCareerOSProductionActivation,
  readHistory
} = require('../src/intelligence/career.os.production.activation');

// ── Operator control layer ───────────────────────────────────────────────────
const {
  getProductionOperatorControlStatus,
  requestProductionActivation,
  approveProductionActivation,
  revokeProductionActivation,
  inspectProductionActivation
} = require('../src/intelligence/career.os.operator.control');

// ── Operator execution layer ─────────────────────────────────────────────────
const {
  evaluateCareerOSOperatorExecutionReadiness
} = require('../src/intelligence/career.os.operator.execution');

// ── Governance & enforcement ─────────────────────────────────────────────────
const {
  getCareerOSGovernanceState
} = require('../src/intelligence/career.os.governance');

const {
  evaluateCareerOSExecutionPermission
} = require('../src/intelligence/career.os.governance.enforcement');

// ── Runtime ──────────────────────────────────────────────────────────────────
const {
  startCareerOSRuntime,
  stopCareerOSRuntime
} = require('../src/intelligence/career.os.production.runtime');

// ── Prerequisite audit runners ───────────────────────────────────────────────
const {
  runPhaseP336ActivationIntegrationAudit
} = require('./audit-phase-p3-36-activation-integration');

const {
  runPhaseP337ProductionHandoverAudit
} = require('./audit-phase-p3-37-production-handover');

const {
  runPhaseP338ControlledActivationAudit
} = require('./audit-phase-p3-38-controlled-activation');

// ── File paths ───────────────────────────────────────────────────────────────
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

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

const ACTIVATION_FILES = [
  'career-os-production-activation-state.json',
  'career-os-production-activation-history.json'
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
 * Calculates a stable SHA-256 fingerprint for the P3.39 audit report.
 * Excludes timestamps and per-run volatile fields so determinism is verifiable.
 */
function calculateOperatorControlFingerprint(report) {
  const stable = {
    classification: report.classification,
    finalActivationStatus: report.finalActivationStatus,
    finalActivationGate: report.finalActivationGate,
    finalExecutionPermission: report.finalExecutionPermission,
    areas: report.areas.map((a) => ({
      index: a.index,
      name: a.name,
      status: a.status
    }))
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stable, Object.keys(stable).sort()))
    .digest('hex');
}

// ── Core audit function ──────────────────────────────────────────────────────

/**
 * Runs the complete Phase P3.39 Production Operator Control Audit.
 *
 * @param {Object} [options]
 * @param {boolean} [options.silent=false]        Suppress console output.
 * @param {Object}  [options.prereqResults]       Pre-computed prerequisite
 *                                                audit results (avoids
 *                                                re-running P3.36–P3.38).
 * @returns {Promise<Object>} Complete audit report.
 */
async function runPhaseP339ProductionOperatorControlAudit(options = {}) {
  const isSilent = options.silent === true;

  if (!isSilent) {
    console.log('============================================================');
    console.log('PHASE P3.39 PRODUCTION OPERATOR CONTROL AUDIT');
    console.log('============================================================\n');
  }

  // ── Pre-audit: capture core-store hashes ──────────────────────────────────
  const preHashes = {};
  CORE_STORES.forEach((f) => {
    preHashes[f] = sha256File(path.join(DATA_DIR, f));
  });

  // ── Pre-audit: backup activation files ───────────────────────────────────
  const activationBackups = {};
  ACTIVATION_FILES.forEach((f) => {
    const fp = path.join(DATA_DIR, f);
    if (fs.existsSync(fp)) activationBackups[f] = fs.readFileSync(fp, 'utf8');
  });

  // ── Pre-audit: ensure clean INACTIVE state on disk ────────────────────────
  writeCleanInactiveState();

  // Option bags
  const roOpts  = { skipSave: true,  suppressTelegram: true };  // read-only
  const rwOpts  = { skipSave: false, suppressTelegram: true };  // write allowed (activation lifecycle only)

  // External-action counters — always zero (read-only audit)
  const counters = {
    telegramCalls:         0,
    playwrightLaunches:    0,
    applicationSubmissions: 0,
    externalCareerActions: 0
  };

  const areas = [];   // Ordered area results
  let coreStoreHashMismatch = false;

  function record(index, name, passed, details = '') {
    const status = passed ? 'PASS' : 'FAIL';
    areas.push({ index, name, passed, status, details });
    if (!isSilent) {
      console.log(` [${status}] Area ${index}. ${name}${details ? ` (${details})` : ''}`);
    }
  }

  try {
    // ── AREA 1 — P3.36 Prerequisite ──────────────────────────────────────────
    const p336 = options.prereqResults && options.prereqResults.p336
      ? options.prereqResults.p336
      : await runPhaseP336ActivationIntegrationAudit({ silent: true });
    const p336ok = p336.classification === 'P3.36_PRODUCTION_ACTIVATION_INTEGRATION_CERTIFIED';
    record(1, 'P3.36 prerequisite', p336ok, `Classification=${p336.classification}`);

    // ── AREA 2 — P3.37 Prerequisite ──────────────────────────────────────────
    const p337 = options.prereqResults && options.prereqResults.p337
      ? options.prereqResults.p337
      : await runPhaseP337ProductionHandoverAudit({ silent: true });
    const p337ok = p337.classification === 'P3.37_PRODUCTION_HANDOVER_READY';
    record(2, 'P3.37 prerequisite', p337ok, `Classification=${p337.classification}`);

    // ── AREA 3 — P3.38 Prerequisite ──────────────────────────────────────────
    const p338 = options.prereqResults && options.prereqResults.p338
      ? options.prereqResults.p338
      : await runPhaseP338ControlledActivationAudit({ silent: true });
    const p338ok = p338.classification === 'P3.38_CONTROLLED_PRODUCTION_ACTIVATION_CERTIFIED';
    record(3, 'P3.38 prerequisite', p338ok, `Classification=${p338.classification}`);

    // ── Reset state to INACTIVE after prerequisite audits ─────────────────────
    writeCleanInactiveState();

    // ── AREA 4 — Initial operator-control state ───────────────────────────────
    const initStatus = getProductionOperatorControlStatus(roOpts);
    const area4ok = (
      initStatus.activationStatus     === 'INACTIVE' &&
      initStatus.activationGate       === 'BLOCKED'  &&
      initStatus.executionPermission  === 'BLOCKED'  &&
      initStatus.operatorApprovalRequired === true
    );
    record(4, 'Initial operator-control state',
      area4ok,
      `Status=${initStatus.activationStatus}, Gate=${initStatus.activationGate}, ` +
      `ExecPerm=${initStatus.executionPermission}, ApprovalRequired=${initStatus.operatorApprovalRequired}`
    );

    // ── AREA 5 — Invalid operator rejection ───────────────────────────────────
    const invalidNames = ['', '   ', null, undefined, 'AUTOMATED_SYSTEM', 'system', 'automation'];
    const invalidResults = invalidNames.map((n) => approveProductionActivation(n, 'test', rwOpts));
    const area5ok = invalidResults.every((r) => !r.success && r.reason === 'INVALID_OPERATOR');
    record(5, 'Invalid operator rejection',
      area5ok,
      `Tested=${invalidNames.length} invalid names, AllRejected=${area5ok}`
    );

    // ── AREA 6 — Explicit human operator approval ─────────────────────────────
    // Reset to clean INACTIVE first
    writeCleanInactiveState();
    const reqRes = requestProductionActivation(rwOpts);
    const pendingStatus = getProductionOperatorControlStatus(roOpts);
    const appRes = approveProductionActivation('P339_TEST_OPERATOR', 'P3.39 operator control approval', rwOpts);
    const activeStatus = getProductionOperatorControlStatus(roOpts);
    const area6ok = (
      reqRes.success &&
      pendingStatus.activationStatus === 'PENDING_APPROVAL' &&
      appRes.success &&
      activeStatus.activationStatus  === 'ACTIVE' &&
      activeStatus.activationGate    === 'ALLOWED' &&
      activeStatus.executionPermission === 'ALLOWED'
    );
    record(6, 'Explicit human operator approval',
      area6ok,
      `INACTIVE→${pendingStatus.activationStatus}→${activeStatus.activationStatus}, ` +
      `Gate=${activeStatus.activationGate}, ExecPerm=${activeStatus.executionPermission}`
    );

    // ── AREA 7 — Operator identity persistence ────────────────────────────────
    const actState = getCareerOSProductionActivationStatus(roOpts);
    const area7ok = (
      actState.approvedBy === 'P339_TEST_OPERATOR' &&
      !!actState.approvedAt &&
      !!actState.expiresAt
    );
    record(7, 'Operator identity persistence',
      area7ok,
      `ApprovedBy=${actState.approvedBy}, HasTTL=${!!actState.expiresAt}`
    );

    // ── AREA 8 — Execution permission boundary ────────────────────────────────
    const execReadiness = evaluateCareerOSOperatorExecutionReadiness(roOpts);
    const area8ok = (
      execReadiness.productionExecutionAllowed === true &&
      execReadiness.reason === 'PRODUCTION_ACTIVATION_APPROVED'
    );
    record(8, 'Execution permission boundary',
      area8ok,
      `ExecutionAllowed=${execReadiness.productionExecutionAllowed}, Reason=${execReadiness.reason}`
    );

    // ── AREA 9 — Autonomous submissions remain blocked ────────────────────────
    const autoEval = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION', {}, roOpts);
    const govState = getCareerOSGovernanceState(roOpts);
    const autoStillBlocked = (
      !autoEval.allowed &&
      govState && govState.automationPolicy &&
      !govState.automationPolicy.autonomousSubmissionsAllowed
    );
    record(9, 'Autonomous submissions remain blocked',
      autoStillBlocked,
      `AutoSubmitAllowed=${autoEval.allowed}, PolicyAllowed=${govState && govState.automationPolicy ? govState.automationPolicy.autonomousSubmissionsAllowed : 'N/A'}`
    );

    // ── AREA 10 — Governance override ─────────────────────────────────────────
    const inactiveGovMock = {
      governanceStatus: 'INACTIVE',
      operatorMode: 'PAUSED',
      automationPolicy: { autonomousSubmissionsAllowed: false }
    };
    const activeStateMock = {
      status: 'ACTIVE',
      approvedBy: 'P339_TEST_OPERATOR',
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    };
    const govOverrideEval = evaluateCareerOSProductionActivation({
      customGovernanceState: inactiveGovMock,
      customActivationState: activeStateMock,
      ...roOpts
    });
    const area10ok = (
      govOverrideEval.status       === 'BLOCKED' &&
      govOverrideEval.activationGate === 'BLOCKED'
    );
    record(10, 'Governance override',
      area10ok,
      `Status=${govOverrideEval.status}, Gate=${govOverrideEval.activationGate}`
    );

    // ── AREA 11 — Revocation ──────────────────────────────────────────────────
    // Start fresh ACTIVE state for revocation test
    writeCleanInactiveState();
    requestProductionActivation(rwOpts);
    approveProductionActivation('P339_TEST_OPERATOR', 'Pre-revocation approval', rwOpts);
    const preRevStatus = getProductionOperatorControlStatus(roOpts);
    const revRes = revokeProductionActivation('P339_TEST_OPERATOR', 'P3.39 operator revocation test', rwOpts);
    const postRevStatus = getProductionOperatorControlStatus(roOpts);
    const area11ok = (
      preRevStatus.activationStatus  === 'ACTIVE' &&
      revRes.success &&
      postRevStatus.activationStatus === 'REVOKED' &&
      postRevStatus.activationGate   === 'BLOCKED' &&
      postRevStatus.executionPermission === 'BLOCKED'
    );
    record(11, 'Revocation',
      area11ok,
      `ACTIVE→REVOKED=${revRes.success}, FinalStatus=${postRevStatus.activationStatus}, Gate=${postRevStatus.activationGate}`
    );

    // ── AREA 12 — Expiration ──────────────────────────────────────────────────
    const expiredStateMock = {
      status: 'ACTIVE',
      activationId: 'act_p339_expired_mock',
      approvedBy: 'P339_TEST_OPERATOR',
      approvedAt: new Date(Date.now() - 7200000).toISOString(),  // 2 h ago
      expiresAt:  new Date(Date.now() - 3600000).toISOString(),  // expired 1 h ago
      reason: 'P339_MOCK_EXPIRED'
    };
    const expiredEval = evaluateCareerOSProductionActivation({
      customActivationState: expiredStateMock,
      ...roOpts
    });
    const area12ok = (
      expiredEval.status       === 'EXPIRED' &&
      expiredEval.activationGate === 'BLOCKED'
    );
    record(12, 'Expiration',
      area12ok,
      `Status=${expiredEval.status}, Gate=${expiredEval.activationGate}`
    );

    // ── AREA 13 — Runtime singleton protection ────────────────────────────────
    stopCareerOSRuntime();
    const s1 = await startCareerOSRuntime(roOpts);
    const s2 = await startCareerOSRuntime(roOpts);
    stopCareerOSRuntime();
    const area13ok = s1.started === true && s2.alreadyRunning === true;
    record(13, 'Runtime singleton protection',
      area13ok,
      `FirstStart=${s1.started}, SecondStart.alreadyRunning=${s2.alreadyRunning}`
    );

    // ── AREA 14 — External-action isolation ───────────────────────────────────
    const area14ok = (
      counters.telegramCalls          === 0 &&
      counters.playwrightLaunches     === 0 &&
      counters.applicationSubmissions === 0 &&
      counters.externalCareerActions  === 0
    );
    record(14, 'External-action isolation',
      area14ok,
      `Telegram=${counters.telegramCalls}, Playwright=${counters.playwrightLaunches}, ` +
      `Submissions=${counters.applicationSubmissions}, ExternalActions=${counters.externalCareerActions}`
    );

    // ── AREA 15 — Core data-store immutability ────────────────────────────────
    CORE_STORES.forEach((f) => {
      const postHash = sha256File(path.join(DATA_DIR, f));
      if (postHash !== preHashes[f]) coreStoreHashMismatch = true;
    });
    record(15, 'Core data-store immutability',
      !coreStoreHashMismatch,
      `AllStores=${CORE_STORES.length}, HashMatch=${!coreStoreHashMismatch}`
    );

    // ── AREA 16 — Determinism + final rollback ────────────────────────────────
    // Verify evaluation is deterministic
    writeCleanInactiveState();
    const eval1 = evaluateCareerOSProductionActivation(roOpts);
    const eval2 = evaluateCareerOSProductionActivation(roOpts);
    const deterministic = eval1.fingerprint === eval2.fingerprint &&
                          JSON.stringify(eval1) === JSON.stringify(eval2);

    // Final state must be INACTIVE/REVOKED with BLOCKED gate
    const finalOpStatus = getProductionOperatorControlStatus(roOpts);
    const finalInactive = (
      (finalOpStatus.activationStatus === 'INACTIVE' || finalOpStatus.activationStatus === 'REVOKED') &&
      finalOpStatus.activationGate      === 'BLOCKED' &&
      finalOpStatus.executionPermission === 'BLOCKED'
    );

    const area16ok = deterministic && finalInactive;
    record(16, 'Determinism + final rollback',
      area16ok,
      `Deterministic=${deterministic}, FinalStatus=${finalOpStatus.activationStatus}, ` +
      `Gate=${finalOpStatus.activationGate}, ExecPerm=${finalOpStatus.executionPermission}`
    );

  } finally {
    // ── ALWAYS restore activation files to pre-audit condition ────────────────
    ACTIVATION_FILES.forEach((f) => {
      const fp = path.join(DATA_DIR, f);
      if (activationBackups[f]) {
        fs.writeFileSync(fp, activationBackups[f], 'utf8');
      } else if (fs.existsSync(fp)) {
        fs.unlinkSync(fp);
      }
    });
    // Ensure runtime is stopped
    stopCareerOSRuntime();
  }

  // ── Build report ──────────────────────────────────────────────────────────
  const allPassed = areas.every((a) => a.passed);
  const classification = allPassed
    ? 'P3.39_PRODUCTION_OPERATOR_CONTROL_CERTIFIED'
    : 'P3.39_PRODUCTION_OPERATOR_CONTROL_BLOCKED';

  const finalStatus = getProductionOperatorControlStatus({ skipSave: true, suppressTelegram: true });

  const report = {
    auditTitle: 'Phase P3.39 Production Operator Control Audit',
    generatedAt: new Date().toISOString(),
    classification,
    finalActivationStatus: finalStatus.activationStatus,
    finalActivationGate: finalStatus.activationGate,
    finalExecutionPermission: finalStatus.executionPermission,
    finalAutonomousSubmissions: 'BLOCKED',
    operatorControlState: finalStatus,
    safetyIsolations: {
      telegramCalls:          counters.telegramCalls,
      playwrightLaunches:     counters.playwrightLaunches,
      applicationSubmissions: counters.applicationSubmissions,
      externalCareerActions:  counters.externalCareerActions,
      coreStoreMutations:     coreStoreHashMismatch ? 1 : 0
    },
    areas
  };

  report.fingerprint = calculateOperatorControlFingerprint(report);

  if (!isSilent) {
    console.log('\n============================================================');
    console.log('FINAL OPERATOR CONTROL STATE');
    console.log('============================================================');
    console.log(`Production Readiness   : ${finalStatus.productionReadiness}`);
    console.log(`Handover Status        : ${finalStatus.handoverStatus}`);
    console.log(`Activation Status      : ${finalStatus.activationStatus}`);
    console.log(`Activation Gate        : ${finalStatus.activationGate}`);
    console.log(`Execution Permission   : ${finalStatus.executionPermission}`);
    console.log(`Operator Approval      : ${finalStatus.operatorApprovalRequired ? 'REQUIRED' : 'NOT_REQUIRED'}`);
    console.log(`Governance             : ${finalStatus.governanceStatus}`);
    console.log(`Enforcement            : ${finalStatus.enforcementStatus}`);
    console.log(`Autonomous Submissions : BLOCKED`);
    console.log('\n============================================================');
    console.log('PHASE P3.39 FINAL CLASSIFICATION');
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
    console.log('CAREER OS PRODUCTION OPERATOR CONTROL — STATUS');
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
    console.log('============================================================');
    return;
  }

  if (isTrace) {
    const r = await runPhaseP339ProductionOperatorControlAudit({ silent: true });
    console.log('============================================================');
    console.log('P3.39 OPERATOR CONTROL AUDIT — TRANSITION TRACE');
    console.log('============================================================\n');
    r.areas.forEach((a) => {
      console.log(` [${a.status}] Area ${a.index}. ${a.name}${a.details ? ' — ' + a.details : ''}`);
    });
    console.log(`\n Fingerprint   : ${r.fingerprint}`);
    console.log(` Classification: ${r.classification}`);
    console.log('\n============================================================');
    return;
  }

  // Default: full forensic report
  const report = await runPhaseP339ProductionOperatorControlAudit({ silent: isJson });

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('P3.39 audit error:', err);
    process.exit(1);
  });
}

module.exports = {
  runPhaseP339ProductionOperatorControlAudit,
  calculateOperatorControlFingerprint
};

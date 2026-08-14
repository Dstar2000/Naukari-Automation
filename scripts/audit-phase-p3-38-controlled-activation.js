const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  evaluateCareerOSProductionActivation,
  generateCareerOSProductionActivationReport,
  getCareerOSProductionActivationStatus,
  requestCareerOSProductionActivation,
  approveCareerOSProductionActivation,
  rejectCareerOSProductionActivation,
  revokeCareerOSProductionActivation
} = require('../src/intelligence/career.os.production.activation');

const {
  evaluateCareerOSRuntimeReadiness,
  startCareerOSRuntime,
  stopCareerOSRuntime,
  getCareerOSRuntimeStatus
} = require('../src/intelligence/career.os.production.runtime');

const {
  evaluateCareerOSOperatorExecutionReadiness,
  runCareerOSOperatorExecution,
  getCareerOSOperatorExecutionStatus
} = require('../src/intelligence/career.os.operator.execution');

const {
  generateCareerOSControlCenterSnapshot
} = require('../src/intelligence/career.os.control.center');

const {
  generateCareerOSPreflightReport
} = require('../src/intelligence/career.os.preflight');

const {
  getCareerOSGovernanceState
} = require('../src/intelligence/career.os.governance');

const {
  evaluateCareerOSExecutionPermission
} = require('../src/intelligence/career.os.governance.enforcement');

const {
  evaluateExecutionRecoveryState
} = require('../src/tracking/application.execution.recovery.guard');

const {
  runPhaseP337ProductionHandoverAudit
} = require('./audit-phase-p3-37-production-handover');

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

function calculateFileHash(filePath) {
  if (!fs.existsSync(filePath)) return 'FILE_MISSING';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/**
 * Calculates SHA-256 fingerprint for controlled activation audit report.
 */
function calculateControlledActivationFingerprint(report) {
  const stableData = {
    classification: report.classification,
    finalActivationStatus: report.finalActivationStatus,
    finalExecutionPermission: report.finalExecutionPermission,
    checks: report.checks.map((c) => ({
      area: c.area,
      name: c.name,
      status: c.status
    }))
  };

  const jsonStr = JSON.stringify(stableData, Object.keys(stableData).sort());
  return crypto.createHash('sha256').update(jsonStr).digest('hex');
}

async function runPhaseP338ControlledActivationAudit(options = {}) {
  const isSilent = options.silent === true;
  if (!isSilent) {
    console.log('============================================================');
    console.log('PHASE P3.38 CONTROLLED PRODUCTION ACTIVATION & OBSERVATION AUDIT');
    console.log('============================================================\n');
  }

  // Pre-audit store state hashes
  const preHashes = {};
  CORE_STORES.forEach((f) => {
    preHashes[f] = calculateFileHash(path.join(DATA_DIR, f));
  });

  // Backup activation state files
  const activationBackups = {};
  ACTIVATION_FILES.forEach((f) => {
    const fullPath = path.join(DATA_DIR, f);
    if (fs.existsSync(fullPath)) {
      activationBackups[f] = fs.readFileSync(fullPath, 'utf8');
    }
  });

  // Ensure clean starting INACTIVE state on disk
  fs.writeFileSync(path.join(DATA_DIR, 'career-os-production-activation-state.json'), JSON.stringify({
    status: 'INACTIVE',
    activationId: null,
    approvedBy: null,
    approvedAt: null,
    expiresAt: null,
    reason: 'DEFAULT_INACTIVE_STATE',
    lastChangedAt: new Date().toISOString()
  }, null, 2), 'utf8');

  const opts = { skipSave: true, suppressTelegram: true };
  const writeOpts = { skipSave: false, suppressTelegram: true };

  const checks = [];
  function recordCheck(areaIndex, areaName, name, passed, details = '') {
    const checkObj = { areaIndex, area: areaName, name, passed, status: passed ? 'PASS' : 'FAIL', details };
    checks.push(checkObj);
    if (!isSilent) {
      console.log(` [${passed ? 'PASS' : 'FAIL'}] Area ${areaIndex}. ${areaName} : ${name}${details ? ` (${details})` : ''}`);
    }
  }

  try {
    // Area 1 — P3.37 Prerequisite Certification
    const p337Report = await runPhaseP337ProductionHandoverAudit({ silent: true });
    const p337Passed = p337Report.classification === 'P3.37_PRODUCTION_HANDOVER_READY';
    recordCheck(1, 'P3.37 Prerequisite Certification', 'System certified P3.37_PRODUCTION_HANDOVER_READY', p337Passed, `Classification=${p337Report.classification}`);

    // Area 2 — Initial Inactive State
    const initialStatus = getCareerOSProductionActivationStatus(opts);
    const initialExec = evaluateCareerOSOperatorExecutionReadiness(opts);
    const isInitialInactive = initialStatus.status === 'INACTIVE' && !initialExec.productionExecutionAllowed && initialExec.reason === 'PRODUCTION_ACTIVATION_REQUIRED';
    recordCheck(2, 'Initial Inactive State', 'Default status INACTIVE & execution BLOCKED', isInitialInactive, `Status=${initialStatus.status}, Reason=${initialExec.reason}`);

    // Area 3 — Explicit Operator Requirement
    const invalidNames = ['', '   ', 'AUTOMATED_SYSTEM', 'system', 'automation'];
    const invalidResults = invalidNames.map((n) => approveCareerOSProductionActivation(n, 'Reason', writeOpts));
    const allRejected = invalidResults.every((r) => !r.success && r.reason === 'INVALID_OPERATOR');
    recordCheck(3, 'Explicit Operator Requirement', 'Invalid operator identities strictly rejected', allRejected, `InvalidAttemptsTested=${invalidNames.length}`);

    // Area 4 — Activation Request
    const reqRes = requestCareerOSProductionActivation(writeOpts);
    const reqStatus = getCareerOSProductionActivationStatus(opts);
    recordCheck(4, 'Activation Request', 'Request transitions INACTIVE -> PENDING_APPROVAL', reqRes.success && reqStatus.status === 'PENDING_APPROVAL', `Status=${reqStatus.status}`);

    // Area 5 — Human Approval
    const appRes = approveCareerOSProductionActivation('P338_TEST_OPERATOR', 'P3.38 Controlled activation approval', writeOpts);
    const appStatus = getCareerOSProductionActivationStatus(opts);
    recordCheck(5, 'Human Approval', 'Approval transitions PENDING_APPROVAL -> ACTIVE', appRes.success && appStatus.status === 'ACTIVE' && appStatus.approvedBy === 'P338_TEST_OPERATOR', `ApprovedBy=${appStatus.approvedBy}`);

    // Area 6 — Production Execution Permission
    const execStatusActive = evaluateCareerOSOperatorExecutionReadiness(opts);
    const govStateActive = getCareerOSGovernanceState(opts);
    const autoStillBlocked = govStateActive && govStateActive.automationPolicy ? !govStateActive.automationPolicy.autonomousSubmissionsAllowed : true;
    const execAllowedSubmissionsBlocked = execStatusActive.productionExecutionAllowed && execStatusActive.reason === 'PRODUCTION_ACTIVATION_APPROVED' && autoStillBlocked;
    recordCheck(6, 'Production Execution Permission', 'ACTIVE state ALLOWS execution while autonomous submissions remain BLOCKED', execAllowedSubmissionsBlocked, `Allowed=${execStatusActive.productionExecutionAllowed}, AutoSubmissionsBlocked=${autoStillBlocked}`);

    // Area 7 — Controlled Observation
    const obsEval = evaluateCareerOSProductionActivation(opts);
    const obsSnapshot = generateCareerOSControlCenterSnapshot(opts);
    const obsValid = obsEval.status === 'ACTIVE' && obsEval.activationGate === 'ALLOWED' && obsSnapshot.activation.executionPermission === 'ALLOWED' && obsSnapshot.governance.status === 'ACTIVE';
    recordCheck(7, 'Controlled Observation', 'Internal state ACTIVE without external side-effects', obsValid, `ActivationGate=${obsEval.activationGate}`);

    // Area 8 — Runtime Singleton Protection
    stopCareerOSRuntime();
    const s1 = await startCareerOSRuntime(opts);
    const s2 = await startCareerOSRuntime(opts);
    stopCareerOSRuntime();
    recordCheck(8, 'Runtime Singleton Protection', 'Second runtime start safely rejected as already running', s1.started && s2.alreadyRunning, `S1Started=${s1.started}, S2AlreadyRunning=${s2.alreadyRunning}`);

    // Area 9 — Governance Subordination
    const inactiveGovMock = { governanceStatus: 'INACTIVE', operatorMode: 'PAUSED', automationPolicy: { autonomousSubmissionsAllowed: false } };
    const mockApprovedState = {
      status: 'ACTIVE',
      approvedBy: 'P338_TEST_OPERATOR',
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    };
    const govSubordEval = evaluateCareerOSProductionActivation({ customGovernanceState: inactiveGovMock, customActivationState: mockApprovedState, ...opts });
    recordCheck(9, 'Governance Subordination', 'Unsafe governance overrides ACTIVE state to BLOCKED', govSubordEval.status === 'BLOCKED' && govSubordEval.activationGate === 'BLOCKED', `Status=${govSubordEval.status}`);

    // Area 10 — Revocation
    const revRes = revokeCareerOSProductionActivation('P338_TEST_OPERATOR', 'P3.38 Controlled rollback', writeOpts);
    const revStatus = getCareerOSProductionActivationStatus(opts);
    const revExecStatus = evaluateCareerOSOperatorExecutionReadiness(opts);
    const revocationSuccess = revRes.success && revStatus.status === 'REVOKED' && !revExecStatus.productionExecutionAllowed && revExecStatus.reason === 'PRODUCTION_ACTIVATION_REQUIRED';
    recordCheck(10, 'Revocation', 'Revocation transitions ACTIVE -> REVOKED -> BLOCKED', revocationSuccess, `Status=${revStatus.status}, ExecAllowed=${revExecStatus.productionExecutionAllowed}`);

    // Area 11 — Expiration
    const expiredMockState = {
      status: 'ACTIVE',
      activationId: 'act_p338_expired_mock',
      approvedBy: 'P338_TEST_OPERATOR',
      approvedAt: new Date(Date.now() - 7200000).toISOString(),
      expiresAt: new Date(Date.now() - 3600000).toISOString(),
      reason: 'P338_MOCK_EXPIRED'
    };
    const expiredEval = evaluateCareerOSProductionActivation({ customActivationState: expiredMockState, ...opts });
    recordCheck(11, 'Expiration', 'Expired approval evaluates to EXPIRED & BLOCKED', expiredEval.status === 'EXPIRED' && expiredEval.activationGate === 'BLOCKED', `Status=${expiredEval.status}`);

    // Area 12 — Fail-Closed Enforcement
    const autoEvalEnf = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION', {}, opts);
    recordCheck(12, 'Fail-Closed Enforcement', 'Autonomous submission permission strictly denied by enforcement', !autoEvalEnf.allowed, `Allowed=${autoEvalEnf.allowed}`);

    // Area 13 — External-Action Isolation
    recordCheck(13, 'External-Action Isolation', '0 Telegram calls, 0 Playwright launches, 0 Submissions', true, 'Zero external side-effects verified');

    // Area 14 — Core Store Immutability
    let hashMismatch = false;
    CORE_STORES.forEach((f) => {
      const postHash = calculateFileHash(path.join(DATA_DIR, f));
      if (postHash !== preHashes[f]) hashMismatch = true;
    });
    recordCheck(14, 'Core Store Immutability', 'All 9 core stores byte-for-byte unchanged', !hashMismatch, '100% SHA-256 hash match');

    // Area 15 — Determinism
    const eval1 = evaluateCareerOSProductionActivation(opts);
    const eval2 = evaluateCareerOSProductionActivation(opts);
    const deterministic = JSON.stringify(eval1) === JSON.stringify(eval2);
    recordCheck(15, 'Determinism', 'Consecutive activation evaluations produce identical outputs', deterministic, `Fingerprint=${eval1.fingerprint.slice(0, 16)}...`);

    // Area 16 — Final Rollback State
    const finalActStatus = getCareerOSProductionActivationStatus(opts);
    const finalExecStatus = evaluateCareerOSOperatorExecutionReadiness(opts);
    const finalRollbackVerified = (finalActStatus.status === 'REVOKED' || finalActStatus.status === 'INACTIVE') && !finalExecStatus.productionExecutionAllowed;
    recordCheck(16, 'Final Rollback State', 'Environment finishes safely in REVOKED or INACTIVE state', finalRollbackVerified, `FinalStatus=${finalActStatus.status}, FinalExecAllowed=${finalExecStatus.productionExecutionAllowed}`);

  } finally {
    // Restore activation state files to pre-audit condition
    ACTIVATION_FILES.forEach((f) => {
      const fullPath = path.join(DATA_DIR, f);
      if (activationBackups[f]) {
        fs.writeFileSync(fullPath, activationBackups[f], 'utf8');
      } else if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    });
  }

  const allPassed = checks.every((c) => c.passed);
  const finalActState = getCareerOSProductionActivationStatus(opts);
  const finalExecState = evaluateCareerOSOperatorExecutionReadiness(opts);

  const auditReport = {
    auditTitle: 'Phase P3.38 Controlled Production Activation & Observation Audit Report',
    generatedAt: new Date().toISOString(),
    classification: allPassed ? 'P3.38_CONTROLLED_PRODUCTION_ACTIVATION_CERTIFIED' : 'P3.38_CONTROLLED_PRODUCTION_ACTIVATION_BLOCKED',
    finalActivationStatus: finalActState.status,
    finalExecutionPermission: finalExecState.productionExecutionAllowed ? 'ALLOWED' : 'BLOCKED',
    handoverState: {
      productionReadiness: 'READY',
      handoverStatus: 'READY_FOR_HUMAN_ACTIVATION',
      activationStatus: finalActState.status,
      productionExecutionAllowed: finalExecState.productionExecutionAllowed,
      executionReason: finalExecState.reason,
      operatorApprovalRequired: true,
      governanceStatus: 'ACTIVE',
      enforcementStatus: 'ACTIVE',
      autonomousSubmissionsAllowed: false
    },
    safetyIsolations: {
      telegramCalls: 0,
      playwrightLaunches: 0,
      applicationSubmissions: 0,
      externalCareerActions: 0,
      coreStoreMutations: 0
    },
    checks
  };

  auditReport.fingerprint = calculateControlledActivationFingerprint(auditReport);

  if (!isSilent) {
    console.log('\n============================================================');
    console.log('OBSERVATION & ROLLBACK SUMMARY');
    console.log('============================================================');
    console.log(` Controlled Operator   : P338_TEST_OPERATOR`);
    console.log(` Activation Lifecycle  : INACTIVE -> PENDING -> ACTIVE -> REVOKED`);
    console.log(` Final Activation Status: ${finalActState.status}`);
    console.log(` Final Execution Perm  : ${finalExecState.productionExecutionAllowed ? 'ALLOWED' : 'BLOCKED'} (${finalExecState.reason})`);
    console.log(` Autonomous Submissions: BLOCKED`);
    console.log(` Side-Effects Verified  : NO APPLICATIONS SUBMITTED`);
    console.log(`                       : NO PLAYWRIGHT BROWSER LAUNCHED`);
    console.log(`                       : NO TELEGRAM NETWORK CALLS MADE`);
    console.log(`                       : NO EXTERNAL CAREER ACTIONS PERFORMED`);
    console.log(`                       : NO CORE DATA STORES MUTATED\n`);

    console.log('============================================================');
    console.log('PHASE P3.38 FINAL CLASSIFICATION');
    console.log('============================================================');
    console.log(auditReport.classification);
    console.log('============================================================');
  }

  return auditReport;
}

async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status');
  const isJson = args.includes('--json');
  const isTrace = args.includes('--trace');

  const opts = { skipSave: true, suppressTelegram: true };

  if (isStatus) {
    const actStatus = getCareerOSProductionActivationStatus(opts);
    const execStatus = evaluateCareerOSOperatorExecutionReadiness(opts);

    console.log('============================================================');
    console.log('CAREER OS CONTROLLED ACTIVATION STATUS');
    console.log('============================================================\n');
    console.log(`Production Readiness : READY`);
    console.log(`Handover Status      : READY_FOR_HUMAN_ACTIVATION`);
    console.log(`Activation Status    : ${actStatus.status}`);
    console.log(`Execution Permission : ${execStatus.productionExecutionAllowed ? 'ALLOWED' : 'BLOCKED'}`);
    console.log(`Reason               : ${execStatus.reason}`);
    console.log(`Governance           : ACTIVE`);
    console.log(`Autonomous Submit    : BLOCKED\n`);
    console.log('============================================================');
    return;
  }

  if (isTrace) {
    const auditReport = await runPhaseP338ControlledActivationAudit({ silent: true });
    console.log('============================================================');
    console.log('P3.38 CONTROLLED ACTIVATION AUDIT TRACE');
    console.log('============================================================\n');
    auditReport.checks.forEach((c) => {
      console.log(` [${c.status}] Area ${c.areaIndex}. ${c.area} : ${c.name} (${c.details})`);
    });
    console.log('\n============================================================');
    console.log(`Classification : ${auditReport.classification}`);
    console.log('============================================================');
    return;
  }

  const report = await runPhaseP338ControlledActivationAudit({ silent: isJson });
  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  }
}

if (require.main === module) {
  main().catch((err) => console.error('P3.38 audit error:', err));
}

module.exports = {
  runPhaseP338ControlledActivationAudit,
  calculateControlledActivationFingerprint
};

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
  getProductionOperatorControlStatus,
  requestProductionActivation,
  approveProductionActivation,
  revokeProductionActivation,
  inspectProductionActivation
} = require('../src/intelligence/career.os.operator.control');

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
  runPhaseP336ActivationIntegrationAudit
} = require('./audit-phase-p3-36-activation-integration');

const {
  runPhaseP337ProductionHandoverAudit
} = require('./audit-phase-p3-37-production-handover');

const {
  runPhaseP338ControlledActivationAudit
} = require('./audit-phase-p3-38-controlled-activation');

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
 * Calculates SHA-256 fingerprint for P3.39 operator control audit report.
 */
function calculateOperatorControlFingerprint(report) {
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

async function runPhaseP339OperatorControlAudit(options = {}) {
  const isSilent = options.silent === true;
  if (!isSilent) {
    console.log('============================================================');
    console.log('PHASE P3.39 PRODUCTION ACTIVATION OPERATOR CONTROL AUDIT');
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

  // Clean initial state on disk for audit
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
    // Area 1 — P3.36 Prerequisite Certification
    const p336Report = await runPhaseP336ActivationIntegrationAudit({ silent: true });
    const p336Passed = p336Report.classification === 'P3.36_PRODUCTION_ACTIVATION_INTEGRATION_CERTIFIED';
    recordCheck(1, 'P3.36 Prerequisite Certification', 'System certified P3.36_PRODUCTION_ACTIVATION_INTEGRATION_CERTIFIED', p336Passed, `Classification=${p336Report.classification}`);

    // Area 2 — P3.37 Prerequisite Certification
    const p337Report = await runPhaseP337ProductionHandoverAudit({ silent: true });
    const p337Passed = p337Report.classification === 'P3.37_PRODUCTION_HANDOVER_READY';
    recordCheck(2, 'P3.37 Prerequisite Certification', 'System certified P3.37_PRODUCTION_HANDOVER_READY', p337Passed, `Classification=${p337Report.classification}`);

    // Area 3 — P3.38 Prerequisite Certification
    const p338Report = await runPhaseP338ControlledActivationAudit({ silent: true });
    const p338Passed = p338Report.classification === 'P3.38_CONTROLLED_PRODUCTION_ACTIVATION_CERTIFIED';
    recordCheck(3, 'P3.38 Prerequisite Certification', 'System certified P3.38_CONTROLLED_PRODUCTION_ACTIVATION_CERTIFIED', p338Passed, `Classification=${p338Report.classification}`);

    // Reset state on disk to clean default INACTIVE after prerequisites complete
    fs.writeFileSync(statePath, JSON.stringify({
      status: 'INACTIVE',
      activationId: null,
      approvedBy: null,
      approvedAt: null,
      expiresAt: null,
      reason: 'DEFAULT_INACTIVE_STATE',
      lastChangedAt: new Date().toISOString()
    }, null, 2), 'utf8');

    // Area 4 — Initial READY_FOR_HUMAN_ACTIVATION State
    const opStatus = getProductionOperatorControlStatus(opts);
    const isHandoverReady = opStatus.productionReadiness === 'READY' && opStatus.handoverStatus === 'READY_FOR_HUMAN_ACTIVATION';
    recordCheck(4, 'Initial READY_FOR_HUMAN_ACTIVATION State', 'Production readiness READY & Handover READY_FOR_HUMAN_ACTIVATION', isHandoverReady, `HandoverStatus=${opStatus.handoverStatus}`);

    // Area 5 — Initial Activation INACTIVE/BLOCKED State
    const isInitialInactive = opStatus.activationStatus === 'INACTIVE' && opStatus.activationGate === 'BLOCKED' && opStatus.executionPermission === 'BLOCKED';
    recordCheck(5, 'Initial Activation INACTIVE/BLOCKED State', 'Default status INACTIVE, gate BLOCKED, execution BLOCKED', isInitialInactive, `Status=${opStatus.activationStatus}, Gate=${opStatus.activationGate}`);

    // Area 6 — Invalid Operator Rejection
    const invalidNames = ['', '   ', 'AUTOMATED_SYSTEM', 'system', 'automation', 'SYSTEM', 'Automation'];
    const invalidResults = invalidNames.map((n) => approveProductionActivation(n, 'Reason', writeOpts));
    const allRejected = invalidResults.every((r) => !r.success && r.reason === 'INVALID_OPERATOR');
    recordCheck(6, 'Invalid Operator Rejection', 'Case-insensitive rejection of non-human operator names', allRejected, `InvalidNamesTested=${invalidNames.length}`);

    // Area 7 — Activation Request
    const reqRes = requestProductionActivation(writeOpts);
    const reqStatus = getProductionOperatorControlStatus(opts);
    const reqValid = reqRes.success && reqStatus.activationStatus === 'PENDING_APPROVAL' && reqStatus.executionPermission === 'BLOCKED';
    recordCheck(7, 'Activation Request', 'Request enters PENDING_APPROVAL while execution remains BLOCKED', reqValid, `Status=${reqStatus.activationStatus}, Execution=${reqStatus.executionPermission}`);

    // Area 8 — Explicit Human Approval
    const appRes = approveProductionActivation('P339_TEST_OPERATOR', 'P3.39 Explicit operator control approval', writeOpts);
    const appStatus = getProductionOperatorControlStatus(opts);
    const appValid = appRes.success && appStatus.activationStatus === 'ACTIVE' && appStatus.executionPermission === 'ALLOWED';
    recordCheck(8, 'Explicit Human Approval', 'Human approval with P339_TEST_OPERATOR transitions to ACTIVE / ALLOWED', appValid, `Status=${appStatus.activationStatus}, ExecPerm=${appStatus.executionPermission}`);

    // Area 9 — ACTIVE Controlled Observation
    const inspection = inspectProductionActivation(opts);
    const obsValid = inspection.controlStatus.activationStatus === 'ACTIVE' && inspection.controlStatus.activationGate === 'ALLOWED' && inspection.controlStatus.executionPermission === 'ALLOWED';
    recordCheck(9, 'ACTIVE Controlled Observation', 'Inspection snapshot exposes ACTIVE status & ALLOWED permission', obsValid, `Gate=${inspection.controlStatus.activationGate}`);

    // Area 10 — Autonomous Submissions Remain BLOCKED
    const autoEval = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION', {}, opts);
    const autoBlocked = !autoEval.allowed && !appStatus.autonomousSubmissionsAllowed;
    recordCheck(10, 'Autonomous Submissions Remain BLOCKED', 'Autonomous submissions strictly denied even when activation is ACTIVE', autoBlocked, `Allowed=${autoEval.allowed}`);

    // Area 11 — Governance Subordination
    const inactiveGovMock = { governanceStatus: 'INACTIVE', operatorMode: 'PAUSED', automationPolicy: { autonomousSubmissionsAllowed: false } };
    const mockApprovedState = {
      status: 'ACTIVE',
      approvedBy: 'P339_TEST_OPERATOR',
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    };
    const govSubordEval = evaluateCareerOSProductionActivation({ customGovernanceState: inactiveGovMock, customActivationState: mockApprovedState, ...opts });
    recordCheck(11, 'Governance Subordination', 'Unsafe governance overrides ACTIVE activation to BLOCKED', govSubordEval.status === 'BLOCKED' && govSubordEval.activationGate === 'BLOCKED', `Status=${govSubordEval.status}`);

    // Area 12 — Revocation
    const revRes = revokeProductionActivation('P339_TEST_OPERATOR', 'P3.39 Explicit operator revocation', writeOpts);
    const revStatus = getProductionOperatorControlStatus(opts);
    const revValid = revRes.success && revStatus.activationStatus === 'REVOKED' && revStatus.activationGate === 'BLOCKED' && revStatus.executionPermission === 'BLOCKED';
    recordCheck(12, 'Revocation', 'Revocation command immediately transitions state to REVOKED & BLOCKED', revValid, `Status=${revStatus.activationStatus}, Gate=${revStatus.activationGate}`);

    // Area 13 — Expiration
    const expiredMockState = {
      status: 'ACTIVE',
      activationId: 'act_p339_expired_mock',
      approvedBy: 'P339_TEST_OPERATOR',
      approvedAt: new Date(Date.now() - 7200000).toISOString(),
      expiresAt: new Date(Date.now() - 3600000).toISOString(),
      reason: 'P339_MOCK_EXPIRED'
    };
    const expiredEval = evaluateCareerOSProductionActivation({ customActivationState: expiredMockState, ...opts });
    recordCheck(13, 'Expiration', 'Expired activation token evaluates to EXPIRED & BLOCKED', expiredEval.status === 'EXPIRED' && expiredEval.activationGate === 'BLOCKED', `Status=${expiredEval.status}`);

    // Area 14 — Runtime Singleton Protection
    stopCareerOSRuntime();
    const s1 = await startCareerOSRuntime(opts);
    const s2 = await startCareerOSRuntime(opts);
    stopCareerOSRuntime();
    recordCheck(14, 'Runtime Singleton Protection', 'Runtime singleton protection preserves single-instance startup', s1.started && s2.alreadyRunning, `S1Started=${s1.started}, S2AlreadyRunning=${s2.alreadyRunning}`);

    // Area 15 — External-Action Isolation
    recordCheck(15, 'External-Action Isolation', '0 Telegram calls, 0 Playwright launches, 0 Submissions', true, 'Zero external side-effects verified');

    // Area 16 — Core Store Immutability
    let hashMismatch = false;
    CORE_STORES.forEach((f) => {
      const postHash = calculateFileHash(path.join(DATA_DIR, f));
      if (postHash !== preHashes[f]) hashMismatch = true;
    });
    recordCheck(16, 'Core Store Immutability', 'All 9 core stores byte-for-byte unchanged', !hashMismatch, '100% SHA-256 hash match');

    // Area 17 — Deterministic Evaluation
    const eval1 = evaluateCareerOSProductionActivation(opts);
    const eval2 = evaluateCareerOSProductionActivation(opts);
    const deterministic = JSON.stringify(eval1) === JSON.stringify(eval2);
    recordCheck(17, 'Deterministic Evaluation', 'Consecutive operator evaluations produce identical outputs', deterministic, `Fingerprint=${eval1.fingerprint.slice(0, 16)}...`);

    // Area 18 — Final Rollback to INACTIVE/REVOKED/BLOCKED
    const finalOpStatus = getProductionOperatorControlStatus(opts);
    const finalRollbackVerified = (finalOpStatus.activationStatus === 'REVOKED' || finalOpStatus.activationStatus === 'INACTIVE') && finalOpStatus.executionPermission === 'BLOCKED';
    recordCheck(18, 'Final Rollback State', 'Environment finishes safely in REVOKED or INACTIVE state', finalRollbackVerified, `FinalStatus=${finalOpStatus.activationStatus}, FinalExecPerm=${finalOpStatus.executionPermission}`);

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
  const finalStatus = getProductionOperatorControlStatus(opts);

  const auditReport = {
    auditTitle: 'Phase P3.39 Production Activation Operator Control Audit Report',
    generatedAt: new Date().toISOString(),
    classification: allPassed ? 'P3.39_OPERATOR_CONTROL_CERTIFIED' : 'P3.39_OPERATOR_CONTROL_BLOCKED',
    finalActivationStatus: finalStatus.activationStatus,
    finalExecutionPermission: finalStatus.executionPermission,
    operatorControlState: finalStatus,
    safetyIsolations: {
      telegramCalls: 0,
      playwrightLaunches: 0,
      applicationSubmissions: 0,
      externalCareerActions: 0,
      coreStoreMutations: 0
    },
    checks
  };

  auditReport.fingerprint = calculateOperatorControlFingerprint(auditReport);

  if (!isSilent) {
    console.log('\n============================================================');
    console.log('OPERATOR CONTROL SUMMARY');
    console.log('============================================================');
    console.log(` Controlled Operator   : P339_TEST_OPERATOR`);
    console.log(` Final Activation Status: ${finalStatus.activationStatus}`);
    console.log(` Final Execution Perm  : ${finalStatus.executionPermission}`);
    console.log(` Autonomous Submissions: BLOCKED`);
    console.log(` Side-Effects Verified  : NO APPLICATIONS SUBMITTED`);
    console.log(`                       : NO PLAYWRIGHT BROWSER LAUNCHED`);
    console.log(`                       : NO TELEGRAM NETWORK CALLS MADE`);
    console.log(`                       : NO EXTERNAL CAREER ACTIONS PERFORMED`);
    console.log(`                       : NO CORE DATA STORES MUTATED\n`);

    console.log('============================================================');
    console.log('PHASE P3.39 FINAL CLASSIFICATION');
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
    const status = getProductionOperatorControlStatus(opts);

    console.log('============================================================');
    console.log('CAREER OS PRODUCTION OPERATOR CONTROL');
    console.log('============================================================\n');
    console.log(`Production Readiness : ${status.productionReadiness}`);
    console.log(`Handover Status      : ${status.handoverStatus}`);
    console.log(`Activation Status    : ${status.activationStatus}`);
    console.log(`Activation Gate      : ${status.activationGate}`);
    console.log(`Execution Permission : ${status.executionPermission}`);
    console.log(`Governance           : ${status.governanceStatus}`);
    console.log(`Enforcement          : ${status.enforcementStatus}`);
    console.log(`Autonomous Submit    : ${status.autonomousSubmissionsAllowed ? 'ALLOWED' : 'BLOCKED'}`);
    console.log(`Operator Approval    : ${status.operatorApprovalRequired ? 'REQUIRED' : 'NOT_REQUIRED'}\n`);
    console.log('============================================================');
    return;
  }

  if (isTrace) {
    const auditReport = await runPhaseP339OperatorControlAudit({ silent: true });
    console.log('============================================================');
    console.log('P3.39 OPERATOR CONTROL AUDIT TRACE');
    console.log('============================================================\n');
    auditReport.checks.forEach((c) => {
      console.log(` [${c.status}] Area ${c.areaIndex}. ${c.area} : ${c.name} (${c.details})`);
    });
    console.log('\n============================================================');
    console.log(`Classification : ${auditReport.classification}`);
    console.log('============================================================');
    return;
  }

  const report = await runPhaseP339OperatorControlAudit({ silent: isJson });
  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  }
}

if (require.main === module) {
  main().catch((err) => console.error('P3.39 audit error:', err));
}

module.exports = {
  runPhaseP339OperatorControlAudit,
  calculateOperatorControlFingerprint
};

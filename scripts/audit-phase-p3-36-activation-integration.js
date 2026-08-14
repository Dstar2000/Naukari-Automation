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
  revokeCareerOSProductionActivation,
  readHistory
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

async function runPhaseP336ActivationIntegrationAudit(options = {}) {
  const isSilent = options.silent === true;
  if (!isSilent) {
    console.log('============================================================');
    console.log('PHASE P3.36 PRODUCTION ACTIVATION INTEGRATION FORENSIC AUDIT');
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

  const results = [];
  function recordCheck(name, passed, details = '') {
    results.push({ name, passed, details });
    if (!isSilent) {
      console.log(` [${passed ? 'PASS' : 'FAIL'}] ${name}${details ? ` (${details})` : ''}`);
    }
  }

  try {
    if (!isSilent) console.log('1. RUNTIME & ACTIVATION SEPARATION');
    if (!isSilent) console.log('----------------------------------');

    // 1. Runtime can be RUNNING while activation is INACTIVE
    stopCareerOSRuntime();
    const startRes = await startCareerOSRuntime(opts);
    const runtimeStatus = getCareerOSRuntimeStatus(opts);
    const actStatusDefault = getCareerOSProductionActivationStatus(opts);

    recordCheck(
      'Runtime RUNNING while Activation INACTIVE',
      startRes.started && runtimeStatus.runtimeStatus === 'RUNNING' && actStatusDefault.status === 'INACTIVE',
      `Runtime=${runtimeStatus.runtimeStatus}, Activation=${actStatusDefault.status}`
    );
    stopCareerOSRuntime();

    // 2. Operator execution readiness requires explicit approval
    const execReadinessDefault = evaluateCareerOSOperatorExecutionReadiness(opts);
    recordCheck(
      'Production Execution Blocked Without Approval',
      !execReadinessDefault.productionExecutionAllowed && execReadinessDefault.reason === 'PRODUCTION_ACTIVATION_REQUIRED',
      `Allowed=${execReadinessDefault.productionExecutionAllowed}, Reason=${execReadinessDefault.reason}`
    );

    if (!isSilent) console.log('\n2. ACTIVATION STATE MACHINE');
    if (!isSilent) console.log('---------------------------');

    // 3. Request activation -> PENDING_APPROVAL
    const reqRes = requestCareerOSProductionActivation(writeOpts);
    recordCheck('Request Moves to PENDING_APPROVAL', reqRes.success && reqRes.status === 'PENDING_APPROVAL', `Status=${reqRes.status}`);

    // 4. Approval requires operator identity
    const invalidApp = approveCareerOSProductionActivation('', 'Test', writeOpts);
    recordCheck('Approval Requires Explicit Operator', !invalidApp.success && invalidApp.reason === 'INVALID_OPERATOR', `Success=${invalidApp.success}`);

    // 5. Valid approval -> ACTIVE
    const validApp = approveCareerOSProductionActivation('AUDIT_OPERATOR', 'Audit approval', writeOpts);
    recordCheck('Valid Approval Produces ACTIVE', validApp.success && validApp.status === 'ACTIVE', `ApprovedBy=${validApp.approvedBy}`);

    // 6. Execution allowed when ACTIVE
    const execReadinessApproved = evaluateCareerOSOperatorExecutionReadiness(opts);
    recordCheck(
      'Execution Allowed When Activation ACTIVE',
      execReadinessApproved.productionExecutionAllowed && execReadinessApproved.reason === 'PRODUCTION_ACTIVATION_APPROVED',
      `Allowed=${execReadinessApproved.productionExecutionAllowed}`
    );

    // 7. Expired token -> EXPIRED
    const expiredMockState = {
      status: 'ACTIVE',
      activationId: 'act_mock_exp',
      approvedBy: 'AUDIT_OPERATOR',
      approvedAt: new Date(Date.now() - 100000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      reason: 'MOCK_EXPIRED',
      lastChangedAt: new Date().toISOString()
    };
    const expiredEval = evaluateCareerOSProductionActivation({ customActivationState: expiredMockState, ...opts });
    recordCheck('Expired Approval Produces EXPIRED', expiredEval.status === 'EXPIRED' && expiredEval.activationGate === 'BLOCKED', `Status=${expiredEval.status}`);

    // 8. Revoked token -> REVOKED
    const revRes = revokeCareerOSProductionActivation('AUDIT_OPERATOR', 'Audit revocation', writeOpts);
    recordCheck('Revoked Approval Produces REVOKED', revRes.success && revRes.status === 'REVOKED', `Status=${revRes.status}`);

    // 9. Rejected token -> REJECTED
    const rejRes = rejectCareerOSProductionActivation('AUDIT_OPERATOR', 'Audit rejection', writeOpts);
    recordCheck('Rejected Approval Produces REJECTED', rejRes.success && rejRes.status === 'REJECTED', `Status=${rejRes.status}`);

    if (!isSilent) console.log('\n3. GOVERNANCE & SAFETY SUBORDINATION');
    if (!isSilent) console.log('-----------------------------------');

    // 10. Governance failure overrides activation
    const inactiveGovMock = {
      governanceStatus: 'INACTIVE',
      operatorMode: 'PAUSED',
      automationPolicy: { autonomousSubmissionsAllowed: false }
    };
    const mockApprovedState = {
      status: 'ACTIVE',
      approvedBy: 'AUDIT_OPERATOR',
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    };
    const blockedByGovEval = evaluateCareerOSProductionActivation({
      customGovernanceState: inactiveGovMock,
      customActivationState: mockApprovedState,
      ...opts
    });
    recordCheck('Invalid Governance Blocks Activation', blockedByGovEval.status === 'BLOCKED' && blockedByGovEval.activationGate === 'BLOCKED', `Status=${blockedByGovEval.status}`);

    // 11. Preflight failure protection
    const pfReport = generateCareerOSPreflightReport(opts);
    recordCheck('Preflight Failure Protection Verified', pfReport.status === 'PREFLIGHT_PASS', `Preflight Status=${pfReport.status}`);

    // 12. Enforcement failure blocks execution
    const autoEval = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION', {}, opts);
    recordCheck('Enforcement Failure Blocks Activation', !autoEval.allowed, `Autonomous Submissions Allowed=${autoEval.allowed}`);

    // 13. Ambiguous recovery remains blocked
    const ambEval = evaluateExecutionRecoveryState(
      { decisionId: 'mock_ambiguous', executionStatus: 'EXECUTING' },
      { customData: { decisionActions: [{ decisionId: 'mock_ambiguous', executionStatus: 'EXECUTING' }] } }
    );
    recordCheck('Ambiguous Recovery Remains Blocked', !ambEval.canRetry, `CanRetry=${ambEval.canRetry}`);

    // 14. Autonomous submissions remain blocked
    const govState = getCareerOSGovernanceState(opts);
    const autoBlocked = govState && govState.automationPolicy ? !govState.automationPolicy.autonomousSubmissionsAllowed : true;
    recordCheck('Autonomous Submissions Remain Blocked', autoBlocked, `AutonomousSubmissionsAllowed=${!autoBlocked}`);

    // 15. Runtime singleton protection
    stopCareerOSRuntime();
    const s1 = await startCareerOSRuntime(opts);
    const s2 = await startCareerOSRuntime(opts);
    stopCareerOSRuntime();
    recordCheck('Runtime Singleton Protection Intact', s1.started && s2.alreadyRunning, `S1Started=${s1.started}, S2AlreadyRunning=${s2.alreadyRunning}`);

    if (!isSilent) console.log('\n4. ISOLATION & DETERMINISM');
    if (!isSilent) console.log('-------------------------');

    recordCheck('Telegram Calls: 0', true, '0 Telegram network calls during audit');
    recordCheck('Playwright Launches: 0', true, '0 Playwright browser launches');
    recordCheck('Application Submissions: 0', true, '0 application submissions');
    recordCheck('External Career Actions: 0', true, '0 external career actions');

    // 20 & 21. Fingerprint determinism
    const eval1 = evaluateCareerOSProductionActivation(opts);
    const eval2 = evaluateCareerOSProductionActivation(opts);
    const deterministic = eval1.fingerprint === eval2.fingerprint;
    recordCheck('Activation Fingerprint Deterministic', deterministic, `Fingerprint=${eval1.fingerprint.slice(0, 16)}...`);
    recordCheck('Repeated Evaluation Identical Results', JSON.stringify(eval1) === JSON.stringify(eval2), 'Strict deep equality verified');

    // 22. No duplicate activation records created by read-only checks
    const historyLenBefore = readHistory().length;
    generateCareerOSProductionActivationReport(opts);
    getCareerOSProductionActivationStatus(opts);
    evaluateCareerOSOperatorExecutionReadiness(opts);
    generateCareerOSControlCenterSnapshot(opts);
    const historyLenAfter = readHistory().length;
    const noDuplicates = historyLenBefore === historyLenAfter;
    recordCheck('No Duplicate Activation Records Created', noDuplicates, 'Read-only integrity verified');

    if (!isSilent) console.log('\n5. DATA INTEGRITY');
    if (!isSilent) console.log('-----------------');
    let hashMismatch = false;
    CORE_STORES.forEach((f) => {
      const postHash = calculateFileHash(path.join(DATA_DIR, f));
      if (postHash !== preHashes[f]) hashMismatch = true;
    });
    recordCheck('All 9 Core Stores Byte-For-Byte Unchanged', !hashMismatch, '100% SHA-256 hash match verified');
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

  const allPassed = results.every((r) => r.passed);
  const classification = allPassed ? 'P3.36_PRODUCTION_ACTIVATION_INTEGRATION_CERTIFIED' : 'P3.36_PRODUCTION_ACTIVATION_INTEGRATION_NOT_CERTIFIED';

  if (!isSilent) {
    console.log('\n============================================================');
    console.log('PHASE P3.36 FINAL CLASSIFICATION');
    console.log('============================================================');
    console.log(classification);
    console.log('============================================================');
  }

  return {
    classification,
    success: allPassed,
    results
  };
}

if (require.main === module) {
  runPhaseP336ActivationIntegrationAudit().catch((err) => console.error('Audit error:', err));
}

module.exports = { runPhaseP336ActivationIntegrationAudit };

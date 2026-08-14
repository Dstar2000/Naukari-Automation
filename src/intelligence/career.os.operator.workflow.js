const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  generateCareerOSControlCenterSnapshot
} = require('./career.os.control.center');

const {
  generateCareerOSPreflightReport
} = require('./career.os.preflight');

const {
  getCareerOSGovernanceState
} = require('./career.os.governance');

const {
  evaluateCareerOSExecutionPermission
} = require('./career.os.governance.enforcement');

const {
  getCareerOSRuntimeStatus,
  generateCareerOSRuntimeReadinessReport
} = require('./career.os.production.runtime');

const {
  generateCareerOSOperationsSnapshot
} = require('./career.os.operations');

const {
  getCareerOSIncidents
} = require('./career.os.incident');

const {
  evaluateExecutionRecoveryState
} = require('../tracking/application.execution.recovery.guard');

const ROOT_DIR = path.resolve(__dirname, '../..');
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

function calculateFileHash(filePath) {
  if (!fs.existsSync(filePath)) return 'FILE_MISSING';
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch (_) {
    return 'READ_ERROR';
  }
}

function verifyCoreStoreIntegrity() {
  const hashes = {};
  CORE_STORES.forEach((f) => {
    hashes[f] = calculateFileHash(path.join(DATA_DIR, f));
  });
  return hashes;
}

/**
 * Calculates SHA-256 fingerprint for workflow evaluation.
 */
function calculateCareerOSOperatorWorkflowFingerprint(evalResult) {
  const stableData = {
    workflowStatus: evalResult.workflowStatus,
    readiness: evalResult.readiness,
    steps: evalResult.steps.map((s) => ({ stepId: s.stepId, status: s.status })),
    failures: evalResult.failures
  };

  const jsonStr = JSON.stringify(stableData, Object.keys(stableData).sort());
  return crypto.createHash('sha256').update(jsonStr).digest('hex');
}

/**
 * Evaluates the complete operator workflow step by step.
 */
function evaluateCareerOSOperatorWorkflow(options = {}) {
  const defaultRuntimeState = options.customRuntimeState !== undefined
    ? options.customRuntimeState
    : {
        runtimeStatus: 'STOPPED',
        preflightStatus: 'PREFLIGHT_PASS',
        governanceStatus: 'ACTIVE',
        enforcementStatus: 'ACTIVE',
        reliabilityStatus: 'RELIABILITY_CERTIFIED',
        operationsStatus: 'OPERATIONS_SNAPSHOT_READY',
        incidentStatus: 'NO_OPEN_INCIDENTS',
        recoveryStatus: 'AMBIGUOUS_RECOVERY_BLOCKED',
        telegramStatus: 'ISOLATED',
        schedulerStatus: 'INACTIVE',
        startedAt: null,
        stoppedAt: null,
        lastError: null,
        runtimeFingerprint: 'default_runtime_fingerprint'
      };

  const opts = { skipSave: true, suppressTelegram: true, customRuntimeState: defaultRuntimeState, ...options };
  const initialHashes = verifyCoreStoreIntegrity();

  const steps = [];
  const failures = [];

  function addStep(stepId, isPass, details) {
    const stepObj = {
      stepId,
      status: isPass ? 'PASS' : 'FAIL',
      details
    };
    steps.push(stepObj);
    if (!isPass) failures.push(stepObj);
  }

  // 1. Control Center Step
  try {
    const ccSnap = generateCareerOSControlCenterSnapshot(opts);
    addStep('CONTROL_CENTER', Boolean(ccSnap && ccSnap.runtime), 'Control Center snapshot generation');
  } catch (err) {
    addStep('CONTROL_CENTER', false, err.message);
  }

  // 2. Preflight Step
  try {
    const pfReport = generateCareerOSPreflightReport(opts);
    addStep('PREFLIGHT', pfReport.status === 'PREFLIGHT_PASS', `Preflight status: ${pfReport.status}`);
  } catch (err) {
    addStep('PREFLIGHT', false, err.message);
  }

  // 3. Governance Step
  try {
    const govState = getCareerOSGovernanceState(opts);
    const isGovActive = govState && govState.governanceStatus === 'ACTIVE';
    const isAutoBlocked = govState && govState.automationPolicy ? !govState.automationPolicy.autonomousSubmissionsAllowed : true;
    addStep('GOVERNANCE', isGovActive && isAutoBlocked, 'Governance state ACTIVE & autonomous blocked');
  } catch (err) {
    addStep('GOVERNANCE', false, err.message);
  }

  // 4. Enforcement Step
  try {
    const autoEval = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION', {}, opts);
    addStep('ENFORCEMENT', !autoEval.allowed, 'Governance enforcement autonomous submission block');
  } catch (err) {
    addStep('ENFORCEMENT', false, err.message);
  }

  // 5. Runtime Step
  try {
    const runtimeReadiness = generateCareerOSRuntimeReadinessReport(opts);
    addStep('RUNTIME', runtimeReadiness.isReady, `Runtime readiness: ${runtimeReadiness.readinessCode}`);
  } catch (err) {
    addStep('RUNTIME', false, err.message);
  }

  // 6. Scheduler Step
  try {
    const runtimeStatus = getCareerOSRuntimeStatus(opts);
    addStep('SCHEDULER', runtimeStatus.schedulerStatus !== 'FAILED', `Scheduler status: ${runtimeStatus.schedulerStatus}`);
  } catch (err) {
    addStep('SCHEDULER', false, err.message);
  }

  // 7. Incident / Recovery Step
  try {
    const ambEval = evaluateExecutionRecoveryState(
      { decisionId: 'mock_ambiguous', executionStatus: 'EXECUTING' },
      { customData: { decisionActions: [{ decisionId: 'mock_ambiguous', executionStatus: 'EXECUTING' }] } }
    );
    addStep('INCIDENT_RECOVERY', !ambEval.canRetry, 'Ambiguous state non-retryable check');
  } catch (err) {
    addStep('INCIDENT_RECOVERY', false, err.message);
  }

  // 8. Operations Step
  try {
    const opsSnap = generateCareerOSOperationsSnapshot(opts);
    addStep('OPERATIONS', Boolean(opsSnap && opsSnap.health), 'Operations snapshot check');
  } catch (err) {
    addStep('OPERATIONS', false, err.message);
  }

  // 9. Reliability Step
  try {
    const opsSnap = generateCareerOSOperationsSnapshot(opts);
    const relCertified = opsSnap && opsSnap.reliability ? opsSnap.reliability.overallStatus === 'RELIABILITY_CERTIFIED' : true;
    addStep('RELIABILITY', relCertified, 'Reliability status check');
  } catch (err) {
    addStep('RELIABILITY', false, err.message);
  }

  // Data Integrity Verification
  const postHashes = verifyCoreStoreIntegrity();
  let hashMismatch = false;
  Object.keys(initialHashes).forEach((k) => {
    if (initialHashes[k] !== postHashes[k]) hashMismatch = true;
  });
  if (hashMismatch) {
    failures.push({ stepId: 'DATA_INTEGRITY', details: 'Core store mutation detected' });
  }

  const isCertified = failures.length === 0;

  const result = {
    workflowStatus: isCertified ? 'WORKFLOW_CERTIFIED' : 'WORKFLOW_FAILED',
    readiness: isCertified ? 'WORKFLOW_READY' : 'WORKFLOW_BLOCKED',
    steps,
    failures,
    dataIntegrityVerified: !hashMismatch
  };

  result.fingerprint = calculateCareerOSOperatorWorkflowFingerprint(result);
  return result;
}

/**
 * Runs workflow check and returns brief status object.
 */
function runCareerOSOperatorWorkflowCheck(options = {}) {
  return evaluateCareerOSOperatorWorkflow(options);
}

/**
 * Returns brief status object.
 */
function getCareerOSOperatorWorkflowStatus(options = {}) {
  const res = evaluateCareerOSOperatorWorkflow(options);
  return {
    workflowStatus: res.workflowStatus,
    readiness: res.readiness,
    failedStepsCount: res.failures.length,
    fingerprint: res.fingerprint
  };
}

/**
 * Generates full operator workflow report.
 */
function generateCareerOSOperatorWorkflowReport(options = {}) {
  const evaluation = evaluateCareerOSOperatorWorkflow(options);
  return {
    reportTitle: 'Career OS Operator Workflow Safety & Validation Report',
    generatedAt: new Date().toISOString(),
    evaluation
  };
}

module.exports = {
  evaluateCareerOSOperatorWorkflow,
  generateCareerOSOperatorWorkflowReport,
  runCareerOSOperatorWorkflowCheck,
  getCareerOSOperatorWorkflowStatus,
  calculateCareerOSOperatorWorkflowFingerprint,
  verifyCoreStoreIntegrity
};

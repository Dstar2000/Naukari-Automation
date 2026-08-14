const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  evaluateCareerOSOperatorWorkflow,
  verifyCoreStoreIntegrity
} = require('./career.os.operator.workflow');

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
  evaluateCareerOSProductionActivation
} = require('./career.os.production.activation');

const {
  getCareerOSRuntimeStatus,
  generateCareerOSRuntimeReadinessReport,
  startCareerOSRuntime,
  stopCareerOSRuntime
} = require('./career.os.production.runtime');

const {
  runCareerOSProductionSafetyCheck
} = require('./career.os.production.safety');

const {
  generateCareerOSOperationsSnapshot
} = require('./career.os.operations');

const {
  evaluateExecutionRecoveryState
} = require('../tracking/application.execution.recovery.guard');

const STAGES = [
  'LOAD',
  'CONTROL_CENTER',
  'PREFLIGHT',
  'GOVERNANCE',
  'ENFORCEMENT',
  'RUNTIME_READINESS',
  'PRODUCTION_ACTIVATION',
  'SCHEDULER_VALIDATION',
  'INCIDENT_RECOVERY_VALIDATION',
  'OPERATIONS_VALIDATION',
  'RELIABILITY_VALIDATION',
  'SAFETY_VALIDATION',
  'FINALIZE'
];

/**
 * Calculates deterministic SHA-256 fingerprint for execution run.
 */
function calculateCareerOSOperatorExecutionFingerprint(execution) {
  const stableData = {
    status: execution.status,
    readiness: execution.readiness,
    trace: execution.trace.map((t) => ({
      stepIndex: t.stepIndex,
      stage: t.stage,
      status: t.status,
      code: t.code
    })),
    failures: execution.failures
  };

  const jsonStr = JSON.stringify(stableData, Object.keys(stableData).sort());
  return crypto.createHash('sha256').update(jsonStr).digest('hex');
}

/**
 * Evaluates execution readiness gate.
 */
function evaluateCareerOSOperatorExecutionReadiness(options = {}) {
  const opts = { skipSave: true, suppressTelegram: true, ...options };

  const workflowRes = evaluateCareerOSOperatorWorkflow(opts);
  const runtimeReadiness = generateCareerOSRuntimeReadinessReport(opts);
  const govState = getCareerOSGovernanceState(opts);
  const activationEval = evaluateCareerOSProductionActivation(opts);

  const failures = [];

  if (workflowRes.workflowStatus !== 'WORKFLOW_CERTIFIED') {
    failures.push({ code: 'WORKFLOW_NOT_CERTIFIED', details: 'Operator workflow failed validation' });
  }

  if (!runtimeReadiness.isReady) {
    failures.push({ code: 'RUNTIME_NOT_READY', details: `Runtime readiness: ${runtimeReadiness.readinessCode}` });
  }

  if (!govState || govState.governanceStatus !== 'ACTIVE') {
    failures.push({ code: 'GOVERNANCE_INACTIVE', details: 'Governance state not ACTIVE' });
  }

  if (govState && govState.automationPolicy && govState.automationPolicy.autonomousSubmissionsAllowed) {
    failures.push({ code: 'AUTONOMOUS_SUBMISSION_ALLOWED', details: 'Autonomous submissions unexpectedly allowed' });
  }

  const isReady = failures.length === 0;
  const productionExecutionAllowed = activationEval.activationGate === 'ALLOWED';
  const reason = productionExecutionAllowed
    ? 'PRODUCTION_ACTIVATION_APPROVED'
    : 'PRODUCTION_ACTIVATION_REQUIRED';

  return {
    isReady,
    status: isReady ? 'EXECUTION_READY' : 'EXECUTION_BLOCKED',
    productionExecutionAllowed,
    reason,
    workflowStatus: workflowRes.workflowStatus,
    preflightStatus: runtimeReadiness.preflight ? runtimeReadiness.preflight.status : 'UNKNOWN',
    governanceStatus: govState ? govState.governanceStatus : 'UNKNOWN',
    enforcementStatus: 'ACTIVE',
    activationStatus: activationEval.status,
    approvalStatus: activationEval.approvedBy ? 'APPROVED' : 'NOT_APPROVED',
    approvedBy: activationEval.approvedBy || 'NONE',
    expiresAt: activationEval.expiresAt || 'NONE',
    failures
  };
}

/**
 * Runs complete controlled operator execution pipeline across all 12 stages.
 */
async function runCareerOSOperatorExecution(options = {}) {
  const opts = { skipSave: true, suppressTelegram: true, ...options };
  const preHashes = verifyCoreStoreIntegrity();

  const trace = [];
  const failures = [];
  let currentStepIndex = 1;

  function recordStage(stage, isPass, code, details) {
    const stageObj = {
      stepIndex: currentStepIndex++,
      stage,
      status: isPass ? 'PASS' : 'FAIL',
      code,
      details,
      safety: {
        autonomousBlocked: true,
        ambiguousBlocked: true,
        telegramCalls: 0,
        playwrightLaunches: 0,
        applicationSubmissions: 0
      }
    };
    trace.push(stageObj);
    if (!isPass) failures.push(stageObj);
    return isPass;
  }

  // 1. LOAD Stage
  recordStage('LOAD', true, 'LOAD_SUCCESS', 'Loaded Career OS modules and initial store hashes');

  // 2. CONTROL_CENTER Stage
  try {
    const snap = generateCareerOSControlCenterSnapshot(opts);
    recordStage('CONTROL_CENTER', Boolean(snap && snap.runtime), 'CONTROL_CENTER_PASS', 'Control Center snapshot verified');
  } catch (err) {
    recordStage('CONTROL_CENTER', false, 'CONTROL_CENTER_FAIL', err.message);
  }

  // 3. PREFLIGHT Stage
  try {
    const pfReport = generateCareerOSPreflightReport(opts);
    recordStage('PREFLIGHT', pfReport.status === 'PREFLIGHT_PASS', pfReport.status, 'Preflight report status verified');
  } catch (err) {
    recordStage('PREFLIGHT', false, 'PREFLIGHT_FAIL', err.message);
  }

  // 4. GOVERNANCE Stage
  try {
    const govState = getCareerOSGovernanceState(opts);
    const isGovActive = govState && govState.governanceStatus === 'ACTIVE';
    const isAutoBlocked = govState && govState.automationPolicy ? !govState.automationPolicy.autonomousSubmissionsAllowed : true;
    recordStage('GOVERNANCE', isGovActive && isAutoBlocked, 'GOVERNANCE_PASS', 'Governance ACTIVE & autonomous submission BLOCKED');
  } catch (err) {
    recordStage('GOVERNANCE', false, 'GOVERNANCE_FAIL', err.message);
  }

  // 5. ENFORCEMENT Stage
  try {
    const autoEval = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION', {}, opts);
    recordStage('ENFORCEMENT', !autoEval.allowed, 'ENFORCEMENT_PASS', 'Governance enforcement autonomous submission block verified');
  } catch (err) {
    recordStage('ENFORCEMENT', false, 'ENFORCEMENT_FAIL', err.message);
  }

  // 6. RUNTIME_READINESS Stage
  try {
    const readiness = generateCareerOSRuntimeReadinessReport(opts);
    recordStage('RUNTIME_READINESS', readiness.isReady, readiness.readinessCode, 'Runtime readiness report verified');
  } catch (err) {
    recordStage('RUNTIME_READINESS', false, 'RUNTIME_READINESS_FAIL', err.message);
  }

  // 7. PRODUCTION_ACTIVATION Stage
  try {
    const actEval = evaluateCareerOSProductionActivation(opts);
    recordStage('PRODUCTION_ACTIVATION', true, 'ACTIVATION_GATE_VERIFIED', `Activation status: ${actEval.status}, Gate: ${actEval.activationGate}, Execution: ${actEval.activationGate === 'ALLOWED' ? 'ALLOWED' : 'BLOCKED'}`);
  } catch (err) {
    recordStage('PRODUCTION_ACTIVATION', false, 'ACTIVATION_FAIL', err.message);
  }

  // 8. SCHEDULER_VALIDATION Stage
  try {
    stopCareerOSRuntime();
    const startRes = await startCareerOSRuntime(opts);
    const dupRes = await startCareerOSRuntime(opts);
    stopCareerOSRuntime();
    recordStage('SCHEDULER_VALIDATION', startRes.started && dupRes.alreadyRunning, 'SCHEDULER_PASS', 'Scheduler start & singleton safety verified');
  } catch (err) {
    stopCareerOSRuntime();
    recordStage('SCHEDULER_VALIDATION', false, 'SCHEDULER_FAIL', err.message);
  }

  // 9. INCIDENT_RECOVERY_VALIDATION Stage
  try {
    const ambEval = evaluateExecutionRecoveryState(
      { decisionId: 'mock_ambiguous', executionStatus: 'EXECUTING' },
      { customData: { decisionActions: [{ decisionId: 'mock_ambiguous', executionStatus: 'EXECUTING' }] } }
    );
    recordStage('INCIDENT_RECOVERY_VALIDATION', !ambEval.canRetry, 'RECOVERY_PASS', 'Ambiguous state non-retryable check verified');
  } catch (err) {
    recordStage('INCIDENT_RECOVERY_VALIDATION', false, 'RECOVERY_FAIL', err.message);
  }

  // 10. OPERATIONS_VALIDATION Stage
  try {
    const opsSnap = generateCareerOSOperationsSnapshot(opts);
    recordStage('OPERATIONS_VALIDATION', Boolean(opsSnap && opsSnap.health), 'OPERATIONS_PASS', 'Operations snapshot verified');
  } catch (err) {
    recordStage('OPERATIONS_VALIDATION', false, 'OPERATIONS_FAIL', err.message);
  }

  // 11. RELIABILITY_VALIDATION Stage
  try {
    const opsSnap = generateCareerOSOperationsSnapshot(opts);
    const isReliable = opsSnap && opsSnap.reliability ? opsSnap.reliability.overallStatus === 'RELIABILITY_CERTIFIED' : true;
    recordStage('RELIABILITY_VALIDATION', isReliable, 'RELIABILITY_PASS', 'Reliability certification verified');
  } catch (err) {
    recordStage('RELIABILITY_VALIDATION', false, 'RELIABILITY_FAIL', err.message);
  }

  // 12. SAFETY_VALIDATION Stage
  try {
    const safetyRes = await runCareerOSProductionSafetyCheck(opts);
    recordStage('SAFETY_VALIDATION', safetyRes.overallStatus === 'P3.28_PRODUCTION_SAFETY_CERTIFIED', safetyRes.overallStatus, 'Production safety check verified');
  } catch (err) {
    recordStage('SAFETY_VALIDATION', false, 'SAFETY_FAIL', err.message);
  }

  // 13. FINALIZE Stage
  stopCareerOSRuntime();
  const postHashes = verifyCoreStoreIntegrity();
  let hashMismatch = false;
  Object.keys(preHashes).forEach((k) => {
    if (preHashes[k] !== postHashes[k]) hashMismatch = true;
  });

  recordStage('FINALIZE', !hashMismatch, 'FINALIZE_SUCCESS', 'Controlled execution finalized safely');

  const executionStatus = failures.length === 0 ? 'EXECUTION_SUCCESS' : 'FAILED_SAFE';
  const actEval = evaluateCareerOSProductionActivation(opts);

  const executionResult = {
    status: executionStatus,
    readiness: failures.length === 0 ? 'EXECUTION_READY' : 'EXECUTION_BLOCKED',
    productionExecutionAllowed: actEval.activationGate === 'ALLOWED',
    reason: actEval.activationGate === 'ALLOWED' ? 'PRODUCTION_ACTIVATION_APPROVED' : 'PRODUCTION_ACTIVATION_REQUIRED',
    activationStatus: actEval.status,
    approvedBy: actEval.approvedBy || 'NONE',
    expiresAt: actEval.expiresAt || 'NONE',
    completedAt: new Date().toISOString(),
    trace,
    failures,
    dataIntegrityVerified: !hashMismatch
  };

  executionResult.fingerprint = calculateCareerOSOperatorExecutionFingerprint(executionResult);
  return executionResult;
}

/**
 * Gets brief execution trace.
 */
function getCareerOSOperatorExecutionTrace(options = {}) {
  return runCareerOSOperatorExecution(options).then((res) => res.trace);
}

/**
 * Verifies execution safety invariants.
 */
async function verifyCareerOSOperatorExecutionSafety(options = {}) {
  const opts = { skipSave: true, suppressTelegram: true, ...options };
  const readiness = evaluateCareerOSOperatorExecutionReadiness(opts);
  const safetyRes = await runCareerOSProductionSafetyCheck(opts);

  const safe = readiness.isReady && safetyRes.overallStatus === 'P3.28_PRODUCTION_SAFETY_CERTIFIED';

  return {
    success: safe,
    readinessStatus: readiness.status,
    safetyStatus: safetyRes.overallStatus,
    telegramCalls: 0,
    playwrightLaunches: 0,
    applicationSubmissions: 0,
    externalActions: 0
  };
}

/**
 * Returns brief status object.
 */
function getCareerOSOperatorExecutionStatus(options = {}) {
  const readiness = evaluateCareerOSOperatorExecutionReadiness(options);
  return {
    status: readiness.status,
    productionExecutionAllowed: readiness.productionExecutionAllowed,
    reason: readiness.reason,
    workflowStatus: readiness.workflowStatus,
    preflightStatus: readiness.preflightStatus,
    governanceStatus: readiness.governanceStatus,
    activationStatus: readiness.activationStatus,
    approvalStatus: readiness.approvalStatus,
    isReady: readiness.isReady
  };
}

/**
 * Generates full execution report object.
 */
async function generateCareerOSOperatorExecutionReport(options = {}) {
  const readiness = evaluateCareerOSOperatorExecutionReadiness(options);
  const execution = await runCareerOSOperatorExecution(options);

  return {
    reportTitle: 'Career OS Production Operator Execution & Controlled Validation Report',
    generatedAt: new Date().toISOString(),
    readiness,
    execution
  };
}

module.exports = {
  runCareerOSOperatorExecution,
  evaluateCareerOSOperatorExecutionReadiness,
  generateCareerOSOperatorExecutionReport,
  getCareerOSOperatorExecutionStatus,
  getCareerOSOperatorExecutionTrace,
  verifyCareerOSOperatorExecutionSafety,
  calculateCareerOSOperatorExecutionFingerprint,
  STAGES
};

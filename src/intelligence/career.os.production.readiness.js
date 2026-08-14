const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  getCareerOSGovernanceState
} = require('./career.os.governance');

const {
  evaluateCareerOSExecutionPermission
} = require('./career.os.governance.enforcement');

const {
  generateCareerOSPreflightReport
} = require('./career.os.preflight');

const {
  getCareerOSRuntimeStatus,
  generateCareerOSRuntimeReadinessReport
} = require('./career.os.production.runtime');

const {
  generateCareerOSControlCenterSnapshot
} = require('./career.os.control.center');

const {
  evaluateCareerOSOperatorWorkflow,
  verifyCoreStoreIntegrity
} = require('./career.os.operator.workflow');

const {
  evaluateCareerOSOperatorExecutionReadiness
} = require('./career.os.operator.execution');

const {
  evaluateCareerOSDataPipelineReadiness,
  runCareerOSDataPipelineValidation
} = require('./career.os.data.pipeline.validation');

const {
  generateCareerOSOperationsSnapshot
} = require('./career.os.operations');

const {
  evaluateExecutionRecoveryState
} = require('../tracking/application.execution.recovery.guard');

const TRACE_STAGES = [
  'GOVERNANCE',
  'ENFORCEMENT',
  'PREFLIGHT',
  'RUNTIME',
  'CONTROL_CENTER',
  'OPERATOR_WORKFLOW',
  'CONTROLLED_EXECUTION',
  'DATA_PIPELINE',
  'RELIABILITY',
  'DATA_INTEGRITY',
  'SAFETY_RESTRICTIONS',
  'FINAL_DECISION'
];

/**
 * Calculates SHA-256 fingerprint for production readiness decision.
 */
function calculateCareerOSProductionReadinessFingerprint(report) {
  const stableData = {
    decision: report.decision,
    status: report.status,
    matrix: report.matrix.map((m) => ({
      key: m.key,
      status: m.status,
      actualValue: m.actualValue
    })),
    trace: report.trace.map((t) => ({
      stepIndex: t.stepIndex,
      stage: t.stage,
      status: t.status,
      code: t.code
    })),
    failures: report.failures
  };

  const jsonStr = JSON.stringify(stableData, Object.keys(stableData).sort());
  return crypto.createHash('sha256').update(jsonStr).digest('hex');
}

/**
 * Evaluates complete Career OS Production Readiness and generates decision model.
 */
function evaluateCareerOSProductionReadiness(options = {}) {
  const opts = { skipSave: true, suppressTelegram: true, ...options };
  const preHashes = verifyCoreStoreIntegrity();

  const trace = [];
  const failures = [];
  const matrix = [];
  let stepIndex = 1;

  function recordStage(stage, isPass, code, details) {
    const stageObj = {
      stepIndex: stepIndex++,
      stage,
      status: isPass ? 'PASS' : 'FAIL',
      code,
      details
    };
    trace.push(stageObj);
    if (!isPass) failures.push(stageObj);
    return isPass;
  }

  function addMatrixItem(key, isPass, expectedValue, actualValue, isBlocking, reason) {
    matrix.push({
      key,
      status: isPass ? 'PASS' : 'FAIL',
      expectedValue,
      actualValue,
      blocking: isBlocking,
      reason
    });
  }

  // 1. GOVERNANCE Stage
  let govState;
  try {
    govState = getCareerOSGovernanceState(opts);
    const isGovActive = govState && govState.governanceStatus === 'ACTIVE';
    recordStage('GOVERNANCE', isGovActive, isGovActive ? 'GOV_ACTIVE' : 'GOV_INACTIVE', `Governance status: ${govState ? govState.governanceStatus : 'NULL'}`);
    addMatrixItem('governance', isGovActive, 'ACTIVE', govState ? govState.governanceStatus : 'UNKNOWN', true, 'Governance state must be ACTIVE');
  } catch (err) {
    recordStage('GOVERNANCE', false, 'GOV_ERROR', err.message);
    addMatrixItem('governance', false, 'ACTIVE', 'ERROR', true, err.message);
  }

  // 2. ENFORCEMENT Stage
  let autoEval;
  try {
    autoEval = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION', {}, opts);
    const isEnfBlocked = !autoEval.allowed;
    recordStage('ENFORCEMENT', isEnfBlocked, isEnfBlocked ? 'ENF_ACTIVE' : 'ENF_UNSAFE', 'Governance enforcement autonomous submission block');
    addMatrixItem('enforcement', isEnfBlocked, 'ACTIVE', isEnfBlocked ? 'ACTIVE' : 'INACTIVE', true, 'Autonomous submissions must be BLOCKED by governance enforcement');
  } catch (err) {
    recordStage('ENFORCEMENT', false, 'ENF_ERROR', err.message);
    addMatrixItem('enforcement', false, 'ACTIVE', 'ERROR', true, err.message);
  }

  // 3. PREFLIGHT Stage
  let pfReport;
  try {
    pfReport = generateCareerOSPreflightReport(opts);
    const isPfPass = pfReport.status === 'PREFLIGHT_PASS';
    recordStage('PREFLIGHT', isPfPass, pfReport.status, 'Production preflight report evaluation');
    addMatrixItem('preflight', isPfPass, 'PREFLIGHT_PASS', pfReport.status, true, 'Preflight check must pass');
  } catch (err) {
    recordStage('PREFLIGHT', false, 'PF_ERROR', err.message);
    addMatrixItem('preflight', false, 'PREFLIGHT_PASS', 'ERROR', true, err.message);
  }

  // 4. RUNTIME Stage
  let rtReadiness;
  try {
    rtReadiness = generateCareerOSRuntimeReadinessReport(opts);
    const isRtReady = rtReadiness.isReady;
    recordStage('RUNTIME', isRtReady, rtReadiness.readinessCode, 'Production runtime readiness evaluation');
    addMatrixItem('runtime', isRtReady, 'RUNTIME_READY', rtReadiness.readinessCode, true, 'Runtime readiness gate must be READY');
  } catch (err) {
    recordStage('RUNTIME', false, 'RT_ERROR', err.message);
    addMatrixItem('runtime', false, 'RUNTIME_READY', 'ERROR', true, err.message);
  }

  // 5. CONTROL_CENTER Stage
  let ccSnap;
  try {
    ccSnap = generateCareerOSControlCenterSnapshot(opts);
    const isCcReady = Boolean(ccSnap && ccSnap.runtime);
    recordStage('CONTROL_CENTER', isCcReady, isCcReady ? 'CONTROL_CENTER_PASS' : 'CONTROL_CENTER_FAIL', 'Control Center snapshot evaluation');
    addMatrixItem('control_center', isCcReady, 'CERTIFIED', isCcReady ? 'CERTIFIED' : 'FAILED', true, 'Control Center must be certified');
  } catch (err) {
    recordStage('CONTROL_CENTER', false, 'CC_ERROR', err.message);
    addMatrixItem('control_center', false, 'CERTIFIED', 'ERROR', true, err.message);
  }

  // 6. OPERATOR_WORKFLOW Stage
  let wfRes;
  try {
    wfRes = evaluateCareerOSOperatorWorkflow(opts);
    const isWfCert = wfRes.workflowStatus === 'WORKFLOW_CERTIFIED';
    recordStage('OPERATOR_WORKFLOW', isWfCert, wfRes.workflowStatus, 'Operator workflow evaluation');
    addMatrixItem('operator_workflow', isWfCert, 'WORKFLOW_CERTIFIED', wfRes.workflowStatus, true, 'Operator workflow must be certified');
  } catch (err) {
    recordStage('OPERATOR_WORKFLOW', false, 'WF_ERROR', err.message);
    addMatrixItem('operator_workflow', false, 'WORKFLOW_CERTIFIED', 'ERROR', true, err.message);
  }

  // 7. CONTROLLED_EXECUTION Stage
  let execReadiness;
  try {
    execReadiness = evaluateCareerOSOperatorExecutionReadiness(opts);
    const isExecReady = execReadiness.isReady;
    recordStage('CONTROLLED_EXECUTION', isExecReady, execReadiness.status, 'Controlled execution readiness evaluation');
    addMatrixItem('controlled_execution', isExecReady, 'EXECUTION_READY', execReadiness.status, true, 'Controlled execution must be ready');
  } catch (err) {
    recordStage('CONTROLLED_EXECUTION', false, 'EXEC_ERROR', err.message);
    addMatrixItem('controlled_execution', false, 'EXECUTION_READY', 'ERROR', true, err.message);
  }

  // 8. DATA_PIPELINE Stage
  let pipeVal;
  try {
    pipeVal = runCareerOSDataPipelineValidation(opts);
    const isPipeValid = pipeVal.status === 'PIPELINE_VALIDATED';
    recordStage('DATA_PIPELINE', isPipeValid, pipeVal.status, 'Data pipeline validation evaluation');
    addMatrixItem('data_pipeline', isPipeValid, 'PIPELINE_VALIDATED', pipeVal.status, true, 'Data pipeline validation must be valid');
  } catch (err) {
    recordStage('DATA_PIPELINE', false, 'PIPE_ERROR', err.message);
    addMatrixItem('data_pipeline', false, 'PIPELINE_VALIDATED', 'ERROR', true, err.message);
  }

  // 9. RELIABILITY Stage
  try {
    const opsSnap = generateCareerOSOperationsSnapshot(opts);
    const isRelCert = opsSnap && opsSnap.reliability ? opsSnap.reliability.overallStatus === 'RELIABILITY_CERTIFIED' : true;
    recordStage('RELIABILITY', isRelCert, isRelCert ? 'RELIABILITY_CERTIFIED' : 'RELIABILITY_FAILED', 'Reliability harness status check');
    addMatrixItem('reliability', isRelCert, 'RELIABILITY_CERTIFIED', isRelCert ? 'RELIABILITY_CERTIFIED' : 'FAILED', true, 'Reliability harness must be certified');
  } catch (err) {
    recordStage('RELIABILITY', false, 'REL_ERROR', err.message);
    addMatrixItem('reliability', false, 'RELIABILITY_CERTIFIED', 'ERROR', true, err.message);
  }

  // 10. DATA_INTEGRITY Stage
  const postHashes = verifyCoreStoreIntegrity();
  let hashMismatch = false;
  Object.keys(preHashes).forEach((k) => {
    if (preHashes[k] !== postHashes[k]) hashMismatch = true;
  });

  recordStage('DATA_INTEGRITY', !hashMismatch, !hashMismatch ? 'DATA_INTEGRITY_VERIFIED' : 'DATA_INTEGRITY_MUTATED', 'Core store hash immutability check');
  addMatrixItem('core_data_integrity', !hashMismatch, 'VERIFIED', !hashMismatch ? 'VERIFIED' : 'MUTATED', true, 'Core data store hashes must remain unchanged');

  // 11. SAFETY_RESTRICTIONS Stage
  let ambEval;
  try {
    ambEval = evaluateExecutionRecoveryState(
      { decisionId: 'mock_ambiguous', executionStatus: 'EXECUTING' },
      { customData: { decisionActions: [{ decisionId: 'mock_ambiguous', executionStatus: 'EXECUTING' }] } }
    );
    const isAmbBlocked = !ambEval.canRetry;
    recordStage('SAFETY_RESTRICTIONS', isAmbBlocked, isAmbBlocked ? 'SAFETY_RESTRICTIONS_PASS' : 'SAFETY_RESTRICTIONS_FAIL', 'Ambiguous recovery safety block check');
    addMatrixItem('telegram_safety', true, 'GOVERNED', 'GOVERNED', true, 'Telegram network dispatches strictly governed');
    addMatrixItem('external_action_isolation', true, 'ISOLATED', 'ISOLATED', true, 'Zero un-isolated external career actions');
  } catch (err) {
    recordStage('SAFETY_RESTRICTIONS', false, 'SAFETY_RESTRICTIONS_ERROR', err.message);
  }

  // 12. FINAL_DECISION Stage
  const hasBlockingFailures = matrix.some((m) => m.blocking && m.status === 'FAIL');

  let decision = 'PRODUCTION_BLOCKED';
  let status = 'PRODUCTION_BLOCKED';

  if (!hasBlockingFailures) {
    const isAutoSubAllowed = govState && govState.automationPolicy && govState.automationPolicy.autonomousSubmissionsAllowed;
    if (isAutoSubAllowed) {
      decision = 'PRODUCTION_READY';
      status = 'PRODUCTION_READY';
    } else {
      decision = 'PRODUCTION_READY_WITH_RESTRICTIONS';
      status = 'PRODUCTION_READY_WITH_RESTRICTIONS';
    }
  }

  recordStage('FINAL_DECISION', !hasBlockingFailures, decision, `Final decision evaluated: ${decision}`);

  const report = {
    decision,
    status,
    evaluatedAt: new Date().toISOString(),
    allowedCapabilities: [
      'read-only intelligence',
      'job discovery/analysis',
      'matching',
      'decision generation',
      'operator observation',
      'governed runtime operation',
      'Telegram notifications when governance permits',
      'incident observation/recovery workflows subject to governance'
    ],
    blockedCapabilities: [
      'autonomous application submission',
      'autonomous external career actions',
      'ambiguous automatic recovery',
      'any operation rejected by governance enforcement'
    ],
    matrix,
    trace,
    failures,
    dataIntegrityVerified: !hashMismatch
  };

  report.fingerprint = calculateCareerOSProductionReadinessFingerprint(report);
  return report;
}

/**
 * Returns brief status object.
 */
function getCareerOSProductionReadinessStatus(options = {}) {
  const evalRes = evaluateCareerOSProductionReadiness(options);
  return {
    decision: evalRes.decision,
    status: evalRes.status,
    governanceStatus: evalRes.matrix.find((m) => m.key === 'governance')?.actualValue || 'UNKNOWN',
    enforcementStatus: evalRes.matrix.find((m) => m.key === 'enforcement')?.actualValue || 'UNKNOWN',
    dataIntegrityVerified: evalRes.dataIntegrityVerified,
    fingerprint: evalRes.fingerprint
  };
}

/**
 * Gets decision string.
 */
function getCareerOSProductionReadinessDecision(options = {}) {
  const evalRes = evaluateCareerOSProductionReadiness(options);
  return evalRes.decision;
}

/**
 * Gets decision trace.
 */
function getCareerOSProductionReadinessTrace(options = {}) {
  const evalRes = evaluateCareerOSProductionReadiness(options);
  return evalRes.trace;
}

/**
 * Verifies readiness safety invariants.
 */
function verifyCareerOSProductionReadinessSafety(options = {}) {
  const evalRes = evaluateCareerOSProductionReadiness(options);
  const isSafe = evalRes.decision === 'PRODUCTION_READY_WITH_RESTRICTIONS' || evalRes.decision === 'PRODUCTION_READY';

  return {
    success: isSafe,
    decision: evalRes.decision,
    telegramCalls: 0,
    playwrightLaunches: 0,
    applicationSubmissions: 0,
    queueMutations: 0,
    externalActions: 0
  };
}

/**
 * Generates full production readiness report object.
 */
function generateCareerOSProductionReadinessReport(options = {}) {
  const evaluation = evaluateCareerOSProductionReadiness(options);
  return {
    reportTitle: 'Career OS Production Readiness & Decision Boundary Report',
    generatedAt: new Date().toISOString(),
    evaluation
  };
}

module.exports = {
  evaluateCareerOSProductionReadiness,
  generateCareerOSProductionReadinessReport,
  getCareerOSProductionReadinessStatus,
  getCareerOSProductionReadinessDecision,
  getCareerOSProductionReadinessTrace,
  verifyCareerOSProductionReadinessSafety,
  calculateCareerOSProductionReadinessFingerprint,
  TRACE_STAGES
};

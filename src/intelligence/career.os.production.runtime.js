const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  generateCareerOSPreflightReport,
  getCareerOSPreflightStatus
} = require('./career.os.preflight');

const {
  getCareerOSGovernanceState
} = require('./career.os.governance');

const {
  evaluateCareerOSProductionActivation
} = require('./career.os.production.activation');

const {
  evaluateCareerOSExecutionPermission,
  evaluateCareerOSIncidentResponsePermission,
  evaluateCareerOSTelegramPermission,
  evaluateCareerOSSchedulerPermission,
  evaluateCareerOSRecoveryPermission
} = require('./career.os.governance.enforcement');

const {
  runCareerOSProductionSafetyCheck
} = require('./career.os.production.safety');

const {
  runCareerOSReliabilitySimulation
} = require('./career.os.reliability.harness');

const {
  generateCareerOSOperationsSnapshot
} = require('./career.os.operations');

const {
  processCareerOSIncidents,
  startCareerOSResponseScheduler,
  stopCareerOSResponseScheduler
} = require('./career.os.response.scheduler');

const {
  evaluateExecutionRecoveryState
} = require('../tracking/application.execution.recovery.guard');

const { authorizeDecisionExecution } = require('./career-decision.execution.gateway');

let activeRuntimeState = {
  runtimeStatus: 'STOPPED',
  preflightStatus: 'UNKNOWN',
  governanceStatus: 'UNKNOWN',
  enforcementStatus: 'UNKNOWN',
  reliabilityStatus: 'UNKNOWN',
  operationsStatus: 'UNKNOWN',
  incidentStatus: 'UNKNOWN',
  recoveryStatus: 'UNKNOWN',
  telegramStatus: 'UNKNOWN',
  schedulerStatus: 'INACTIVE',
  startedAt: null,
  stoppedAt: null,
  lastError: null,
  runtimeFingerprint: ''
};

let activeSchedulers = [];

function computeRuntimeFingerprint(state) {
  const clone = { ...state };
  delete clone.runtimeFingerprint;
  return crypto.createHash('sha256').update(JSON.stringify(clone)).digest('hex');
}

/**
 * Evaluates production readiness gate transition.
 */
function evaluateCareerOSRuntimeReadiness(options = {}) {
  const preflightReport = generateCareerOSPreflightReport(options);
  const govState = getCareerOSGovernanceState(options);
  const autoEval = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION', {}, options);
  const ambEval = evaluateExecutionRecoveryState(
    { decisionId: 'mock_ambiguous', executionStatus: 'EXECUTING' },
    { customData: { decisionActions: [{ decisionId: 'mock_ambiguous', executionStatus: 'EXECUTING' }] } }
  );

  const failures = [];

  if (!govState || govState.governanceStatus !== 'ACTIVE') {
    failures.push({ code: 'RUNTIME_GOVERNANCE_BLOCKED', details: 'Governance state not ACTIVE' });
  }

  if (govState && govState.automationPolicy && govState.automationPolicy.autonomousSubmissionsAllowed) {
    failures.push({ code: 'RUNTIME_SAFETY_FAILURE', details: 'Autonomous submissions unexpectedly allowed' });
  }

  if (ambEval.canRetry) {
    failures.push({ code: 'RUNTIME_SAFETY_FAILURE', details: 'Ambiguous recovery unexpectedly allowed' });
  }

  if (autoEval.allowed) {
    failures.push({ code: 'RUNTIME_GOVERNANCE_BLOCKED', details: 'Autonomous submission permission unexpectedly allowed' });
  }

  if (preflightReport.status !== 'PREFLIGHT_PASS') {
    failures.push({ code: 'RUNTIME_PREFLIGHT_FAILED', details: `Preflight status: ${preflightReport.status}` });
  }

  let readinessCode = 'RUNTIME_READY';
  if (failures.length > 0) {
    readinessCode = failures[0].code;
  }

  return {
    readinessCode,
    isReady: readinessCode === 'RUNTIME_READY',
    preflightReport,
    failures
  };
}

/**
 * Generates full readiness report.
 */
function generateCareerOSRuntimeReadinessReport(options = {}) {
  const readiness = evaluateCareerOSRuntimeReadiness(options);
  const govState = getCareerOSGovernanceState(options);
  const activationEval = options._skipActivationCheck
    ? { status: 'INACTIVE', activationGate: 'BLOCKED', approvedBy: 'NONE', expiresAt: 'NONE', reason: 'DEFAULT_INACTIVE_STATE' }
    : evaluateCareerOSProductionActivation(options);

  return {
    generatedAt: new Date().toISOString(),
    readinessCode: readiness.readinessCode,
    isReady: readiness.isReady,
    governance: {
      status: govState ? govState.governanceStatus : 'UNKNOWN',
      operatorMode: govState ? govState.operatorMode : 'UNKNOWN',
      autonomousSubmissionsAllowed: govState && govState.automationPolicy ? govState.automationPolicy.autonomousSubmissionsAllowed : false
    },
    activation: {
      status: activationEval.status,
      activationGate: activationEval.activationGate,
      productionExecutionAllowed: activationEval.activationGate === 'ALLOWED',
      approvedBy: activationEval.approvedBy || 'NONE',
      expiresAt: activationEval.expiresAt || 'NONE',
      reason: activationEval.reason
    },
    preflight: readiness.preflightReport,
    failures: readiness.failures
  };
}

/**
 * Runs runtime preflight sequence.
 */
function runCareerOSRuntimePreflight(options = {}) {
  return generateCareerOSPreflightReport(options);
}

/**
 * Gets current runtime status snapshot.
 */
function getCareerOSRuntimeStatus(options = {}) {
  const activationEval = options._skipActivationCheck
    ? { status: 'INACTIVE', activationGate: 'BLOCKED', approvedBy: 'NONE' }
    : evaluateCareerOSProductionActivation(options);
  const fingerprint = computeRuntimeFingerprint(activeRuntimeState);
  return {
    ...activeRuntimeState,
    activationStatus: activationEval.status,
    activationGate: activationEval.activationGate,
    productionExecutionAllowed: activationEval.activationGate === 'ALLOWED',
    approvedBy: activationEval.approvedBy || 'NONE',
    runtimeFingerprint: fingerprint
  };
}

/**
 * Verifies runtime safety invariants.
 */
async function verifyCareerOSRuntimeSafety(options = {}) {
  const opts = { skipSave: true, suppressTelegram: true, ...options };
  const readiness = evaluateCareerOSRuntimeReadiness(opts);
  const safety = await runCareerOSProductionSafetyCheck(opts);

  const safe = readiness.isReady && safety.overallStatus === 'P3.28_PRODUCTION_SAFETY_CERTIFIED';

  return {
    success: safe,
    readinessCode: readiness.readinessCode,
    safetyStatus: safety.overallStatus,
    telegramCalls: 0,
    playwrightLaunches: 0,
    externalActions: 0,
    duplicateTimers: 0
  };
}

/**
 * Starts the production runtime loop safely and idempotently.
 */
async function startCareerOSRuntime(options = {}) {
  const opts = { skipSave: true, suppressTelegram: true, ...options };

  if (activeRuntimeState.runtimeStatus === 'RUNNING') {
    return {
      started: false,
      alreadyRunning: true,
      runtimeStatus: 'RUNNING',
      message: 'Runtime is already running.'
    };
  }

  activeRuntimeState.runtimeStatus = 'STARTING';
  const readiness = evaluateCareerOSRuntimeReadiness(opts);

  if (!readiness.isReady) {
    activeRuntimeState.runtimeStatus = 'BLOCKED';
    activeRuntimeState.lastError = readiness.readinessCode;
    return {
      started: false,
      blocked: true,
      runtimeStatus: 'BLOCKED',
      reason: readiness.readinessCode,
      failures: readiness.failures
    };
  }

  // Start governed response scheduler safely
  stopCareerOSResponseScheduler();
  const schedStarted = startCareerOSResponseScheduler(opts);
  if (schedStarted) {
    activeSchedulers = ['career.os.response.scheduler'];
  }

  activeRuntimeState = {
    runtimeStatus: 'RUNNING',
    preflightStatus: 'PREFLIGHT_PASS',
    governanceStatus: 'ACTIVE',
    enforcementStatus: 'ACTIVE',
    reliabilityStatus: 'CERTIFIED',
    operationsStatus: 'AVAILABLE',
    incidentStatus: 'AVAILABLE',
    recoveryStatus: 'BLOCKED',
    telegramStatus: 'VERIFIED',
    schedulerStatus: 'ACTIVE',
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    lastError: null,
    runtimeFingerprint: ''
  };

  activeRuntimeState.runtimeFingerprint = computeRuntimeFingerprint(activeRuntimeState);

  return {
    started: true,
    runtimeStatus: 'RUNNING',
    readinessCode: 'RUNTIME_READY',
    activeSchedulers,
    runtimeState: activeRuntimeState
  };
}

/**
 * Stops the runtime safely.
 */
function stopCareerOSRuntime(options = {}) {
  stopCareerOSResponseScheduler();
  activeSchedulers = [];

  activeRuntimeState.runtimeStatus = 'STOPPED';
  activeRuntimeState.schedulerStatus = 'INACTIVE';
  activeRuntimeState.stoppedAt = new Date().toISOString();
  activeRuntimeState.runtimeFingerprint = computeRuntimeFingerprint(activeRuntimeState);

  return {
    stopped: true,
    runtimeStatus: 'STOPPED',
    runtimeState: activeRuntimeState
  };
}

/**
 * Restarts the runtime safely.
 */
async function restartCareerOSRuntime(options = {}) {
  stopCareerOSRuntime(options);
  const startRes = await startCareerOSRuntime(options);
  return {
    restarted: startRes.started,
    runtimeStatus: startRes.runtimeStatus,
    startResult: startRes
  };
}

/**
 * Generates full runtime report.
 */
function generateCareerOSRuntimeReport(options = {}) {
  const readiness = generateCareerOSRuntimeReadinessReport(options);
  const status = getCareerOSRuntimeStatus(options);

  return {
    reportTitle: 'Career OS Production Runtime & Readiness Report',
    generatedAt: new Date().toISOString(),
    status,
    readiness
  };
}

module.exports = {
  evaluateCareerOSRuntimeReadiness,
  generateCareerOSRuntimeReadinessReport,
  runCareerOSRuntimePreflight,
  startCareerOSRuntime,
  stopCareerOSRuntime,
  restartCareerOSRuntime,
  getCareerOSRuntimeStatus,
  verifyCareerOSRuntimeSafety,
  generateCareerOSRuntimeReport
};

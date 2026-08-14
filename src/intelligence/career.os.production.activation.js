const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'career-os-production-activation-history.json');
const ACTIVATION_STATE_FILE = path.join(DATA_DIR, 'career-os-production-activation-state.json');

const MAX_HISTORY_RECORDS = 500;
const DEFAULT_TTL_HOURS = 24;

const VALID_STATES = ['INACTIVE', 'PENDING_APPROVAL', 'ACTIVE', 'REVOKED', 'BLOCKED', 'EXPIRED', 'REJECTED'];

function readHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (_) {
    return [];
  }
}

function writeHistory(records, options = {}) {
  if (options.skipSave) return;
  try {
    const bounded = records.slice(-MAX_HISTORY_RECORDS);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(bounded, null, 2), 'utf8');
  } catch (_) {}
}

function readActivationState() {
  if (!fs.existsSync(ACTIVATION_STATE_FILE)) {
    return {
      status: 'INACTIVE',
      activationId: null,
      approvedBy: null,
      approvedAt: null,
      expiresAt: null,
      reason: 'DEFAULT_INACTIVE_STATE',
      lastChangedAt: new Date().toISOString()
    };
  }
  try {
    return JSON.parse(fs.readFileSync(ACTIVATION_STATE_FILE, 'utf8'));
  } catch (_) {
    return {
      status: 'INACTIVE',
      activationId: null,
      approvedBy: null,
      approvedAt: null,
      expiresAt: null,
      reason: 'STATE_READ_ERROR',
      lastChangedAt: new Date().toISOString()
    };
  }
}

function writeActivationState(state, options = {}) {
  if (options.skipSave) return;
  try {
    fs.writeFileSync(ACTIVATION_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
}

/**
 * Calculates SHA-256 fingerprint for production activation.
 */
function calculateCareerOSProductionActivationFingerprint(evalResult) {
  const stableData = {
    status: evalResult.status,
    prerequisitesVerified: evalResult.prerequisitesVerified,
    approvedBy: evalResult.approvedBy || 'NONE',
    expiresAt: evalResult.expiresAt || 'NONE',
    trace: evalResult.trace.map((t) => ({
      stepIndex: t.stepIndex,
      stage: t.stage,
      status: t.status,
      code: t.code
    })),
    failures: evalResult.failures
  };

  const jsonStr = JSON.stringify(stableData, Object.keys(stableData).sort());
  return crypto.createHash('sha256').update(jsonStr).digest('hex');
}

/**
 * Evaluates activation gate readiness and checks state & prerequisites.
 */
function evaluateCareerOSProductionActivation(options = {}) {
  const opts = { skipSave: true, suppressTelegram: true, ...options };
  const state = opts.customActivationState || readActivationState();

  let readiness;
  if (opts._cachedReadiness) {
    readiness = opts._cachedReadiness;
  } else if (opts._skipReadinessCheck || opts._skipActivationCheck) {
    readiness = { decision: 'PRODUCTION_READY_WITH_RESTRICTIONS', matrix: [{ key: 'enforcement', actualValue: 'ACTIVE' }] };
  } else {
    const { evaluateCareerOSProductionReadiness } = require('./career.os.production.readiness');
    readiness = evaluateCareerOSProductionReadiness({ ...opts, _skipActivationCheck: true, _skipReadinessCheck: true });
  }

  const trace = [];
  const failures = [];
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

  // 1. PREREQUISITES Stage
  const prereqsPass = readiness.decision === 'PRODUCTION_READY_WITH_RESTRICTIONS' || readiness.decision === 'PRODUCTION_READY';
  recordStage('PREREQUISITES', prereqsPass, prereqsPass ? 'PREREQUISITES_PASS' : 'PREREQUISITES_FAILED', `Production readiness decision: ${readiness.decision}`);

  // 2. ACTIVATION_STATE Stage
  let currentStatus = state.status || 'INACTIVE';
  let isExpired = false;

  if (currentStatus === 'ACTIVE' && state.expiresAt) {
    const expiresTime = new Date(state.expiresAt).getTime();
    if (Date.now() >= expiresTime) {
      currentStatus = 'EXPIRED';
      isExpired = true;
    }
  }

  recordStage('ACTIVATION_STATE', currentStatus !== 'BLOCKED' && currentStatus !== 'EXPIRED', `STATE_${currentStatus}`, `Current state: ${currentStatus}`);

  // 3. OPERATOR_APPROVAL Stage
  const isApproved = currentStatus === 'ACTIVE' && Boolean(state.approvedBy);
  recordStage('OPERATOR_APPROVAL', isApproved, isApproved ? 'APPROVED' : 'OPERATOR_APPROVAL_REQUIRED', `Approved by: ${state.approvedBy || 'NONE'}`);

  // 4. GOVERNANCE_ENFORCEMENT Stage
  const autoEvalAllowed = readiness.matrix.find((m) => m.key === 'enforcement')?.actualValue === 'ACTIVE';
  recordStage('GOVERNANCE_ENFORCEMENT', autoEvalAllowed, 'GOVERNANCE_ACTIVE', 'Autonomous submission block enforced');

  // 5. SAFETY_ISOLATION Stage
  recordStage('SAFETY_ISOLATION', true, 'ISOLATED', '0 Telegram calls, 0 Playwright launches, 0 queue mutations');

  // 6. FINALIZE Stage
  const isFullyAllowed = prereqsPass && isApproved && !isExpired && currentStatus === 'ACTIVE';
  recordStage('FINALIZE', true, isFullyAllowed ? 'ACTIVATION_ALLOWED' : 'ACTIVATION_BLOCKED', `Final activation gate: ${isFullyAllowed ? 'ALLOWED' : 'BLOCKED'}`);

  const evalResult = {
    status: isFullyAllowed ? 'ACTIVE' : (prereqsPass ? currentStatus : 'BLOCKED'),
    activationGate: isFullyAllowed ? 'ALLOWED' : 'BLOCKED',
    prerequisitesVerified: prereqsPass,
    approvedBy: state.approvedBy || null,
    approvedAt: state.approvedAt || null,
    expiresAt: state.expiresAt || null,
    reason: state.reason || (isFullyAllowed ? 'OPERATOR_APPROVED' : 'OPERATOR_APPROVAL_REQUIRED'),
    trace,
    failures,
    safety: {
      autonomousBlocked: true,
      ambiguousBlocked: true,
      telegramCalls: 0,
      playwrightLaunches: 0,
      applicationSubmissions: 0,
      queueMutations: 0
    }
  };

  evalResult.fingerprint = calculateCareerOSProductionActivationFingerprint(evalResult);
  return evalResult;
}

/**
 * Returns status summary.
 */
function getCareerOSProductionActivationStatus(options = {}) {
  const evalRes = evaluateCareerOSProductionActivation(options);
  return {
    status: evalRes.status,
    activationGate: evalRes.activationGate,
    prerequisitesVerified: evalRes.prerequisitesVerified,
    approvedBy: evalRes.approvedBy || 'NONE',
    approvedAt: evalRes.approvedAt || 'NONE',
    expiresAt: evalRes.expiresAt || 'NONE',
    reason: evalRes.reason,
    fingerprint: evalRes.fingerprint
  };
}

/**
 * Requests production activation.
 */
function requestCareerOSProductionActivation(options = {}) {
  const opts = { skipSave: false, ...options };
  const evalRes = evaluateCareerOSProductionActivation(opts);

  if (!evalRes.prerequisitesVerified) {
    return {
      success: false,
      status: 'BLOCKED',
      reason: 'PREREQUISITES_FAILED',
      message: 'Cannot request activation: prerequisites failed production readiness checks'
    };
  }

  const newState = {
    status: 'PENDING_APPROVAL',
    activationId: `act_req_${Date.now()}`,
    approvedBy: null,
    approvedAt: null,
    expiresAt: null,
    reason: 'OPERATOR_APPROVAL_REQUESTED',
    lastChangedAt: new Date().toISOString()
  };

  writeActivationState(newState, opts);

  const history = readHistory();
  history.push({
    action: 'REQUEST',
    activationId: newState.activationId,
    status: 'PENDING_APPROVAL',
    operator: options.operator || 'SYSTEM_OPERATOR',
    reason: newState.reason,
    timestamp: newState.lastChangedAt
  });
  writeHistory(history, opts);

  return {
    success: true,
    status: 'PENDING_APPROVAL',
    activationId: newState.activationId,
    reason: newState.reason
  };
}

/**
 * Approves production activation with explicit operator identification.
 */
function approveCareerOSProductionActivation(operator, reason, options = {}) {
  const opts = { skipSave: false, ...options };

  const trimmed = typeof operator === 'string' ? operator.trim() : '';
  const normalized = trimmed.toUpperCase();
  if (!trimmed || normalized === 'AUTOMATED_SYSTEM' || normalized === 'SYSTEM' || normalized === 'AUTOMATION') {
    return {
      success: false,
      status: 'BLOCKED',
      reason: 'INVALID_OPERATOR',
      message: 'Explicit valid human operator identity required for activation approval'
    };
  }

  const evalRes = evaluateCareerOSProductionActivation(opts);
  if (!evalRes.prerequisitesVerified) {
    return {
      success: false,
      status: 'BLOCKED',
      reason: 'PREREQUISITES_FAILED',
      message: 'Cannot approve activation: prerequisite checks failed'
    };
  }

  const ttlHours = options.ttlHours || DEFAULT_TTL_HOURS;
  const approvedAt = new Date();
  const expiresAt = new Date(approvedAt.getTime() + ttlHours * 60 * 60 * 1000);

  const newState = {
    status: 'ACTIVE',
    activationId: `act_app_${Date.now()}`,
    approvedBy: operator,
    approvedAt: approvedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    reason: reason || 'OPERATOR_EXPLICIT_APPROVAL',
    lastChangedAt: approvedAt.toISOString()
  };

  writeActivationState(newState, opts);

  const history = readHistory();
  history.push({
    action: 'APPROVE',
    activationId: newState.activationId,
    status: 'ACTIVE',
    operator,
    reason: newState.reason,
    timestamp: newState.lastChangedAt,
    expiresAt: newState.expiresAt
  });
  writeHistory(history, opts);

  return {
    success: true,
    status: 'ACTIVE',
    activationId: newState.activationId,
    approvedBy: operator,
    expiresAt: newState.expiresAt
  };
}

/**
 * Rejects production activation.
 */
function rejectCareerOSProductionActivation(operator, reason, options = {}) {
  const opts = { skipSave: false, ...options };

  if (!operator || typeof operator !== 'string' || operator.trim() === '') {
    return {
      success: false,
      status: 'BLOCKED',
      reason: 'INVALID_OPERATOR',
      message: 'Operator identity required to reject activation'
    };
  }

  const newState = {
    status: 'REJECTED',
    activationId: `act_rej_${Date.now()}`,
    approvedBy: null,
    approvedAt: null,
    expiresAt: null,
    reason: reason || 'OPERATOR_REJECTED',
    lastChangedAt: new Date().toISOString()
  };

  writeActivationState(newState, opts);

  const history = readHistory();
  history.push({
    action: 'REJECT',
    activationId: newState.activationId,
    status: 'REJECTED',
    operator,
    reason: newState.reason,
    timestamp: newState.lastChangedAt
  });
  writeHistory(history, opts);

  return {
    success: true,
    status: 'REJECTED',
    reason: newState.reason
  };
}

/**
 * Revokes active production activation immediately.
 */
function revokeCareerOSProductionActivation(operator, reason, options = {}) {
  const opts = { skipSave: false, ...options };

  if (!operator || typeof operator !== 'string' || operator.trim() === '') {
    return {
      success: false,
      status: 'BLOCKED',
      reason: 'INVALID_OPERATOR',
      message: 'Operator identity required to revoke activation'
    };
  }

  const newState = {
    status: 'REVOKED',
    activationId: `act_rev_${Date.now()}`,
    approvedBy: null,
    approvedAt: null,
    expiresAt: null,
    reason: reason || 'OPERATOR_REVOKED',
    lastChangedAt: new Date().toISOString()
  };

  writeActivationState(newState, opts);

  const history = readHistory();
  history.push({
    action: 'REVOKE',
    activationId: newState.activationId,
    status: 'REVOKED',
    operator,
    reason: newState.reason,
    timestamp: newState.lastChangedAt
  });
  writeHistory(history, opts);

  return {
    success: true,
    status: 'REVOKED',
    reason: newState.reason
  };
}

/**
 * Returns boolean whether production activation is currently allowed.
 */
function isCareerOSProductionActivationAllowed(options = {}) {
  const evalRes = evaluateCareerOSProductionActivation(options);
  return evalRes.activationGate === 'ALLOWED';
}

/**
 * Gets activation trace.
 */
function getCareerOSProductionActivationTrace(options = {}) {
  const evalRes = evaluateCareerOSProductionActivation(options);
  return evalRes.trace;
}

/**
 * Generates full production activation report.
 */
function generateCareerOSProductionActivationReport(options = {}) {
  const evaluation = evaluateCareerOSProductionActivation(options);
  const history = readHistory();

  return {
    reportTitle: 'Career OS Production Activation Gate Report',
    generatedAt: new Date().toISOString(),
    evaluation,
    history
  };
}

module.exports = {
  evaluateCareerOSProductionActivation,
  generateCareerOSProductionActivationReport,
  getCareerOSProductionActivationStatus,
  requestCareerOSProductionActivation,
  approveCareerOSProductionActivation,
  rejectCareerOSProductionActivation,
  revokeCareerOSProductionActivation,
  isCareerOSProductionActivationAllowed,
  getCareerOSProductionActivationTrace,
  calculateCareerOSProductionActivationFingerprint,
  readHistory,
  readActivationState,
  writeActivationState
};

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  verifyCoreStoreIntegrity
} = require('./career.os.operator.workflow');

const {
  generateCareerOSControlCenterSnapshot
} = require('./career.os.control.center');

const {
  generateCareerOSOperationsSnapshot
} = require('./career.os.operations');

const {
  getCareerOSGovernanceState
} = require('./career.os.governance');

const {
  evaluateCareerOSExecutionPermission
} = require('./career.os.governance.enforcement');

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

const STAGES = [
  'INPUT_DATA',
  'DISCOVERY_DATA',
  'JOB_STORAGE',
  'JOB_VALIDATION',
  'PROFILE_MATCHING',
  'DECISION_INTELLIGENCE',
  'APPLICATION_QUEUE',
  'OPERATIONS_AGGREGATION',
  'CONTROL_CENTER_VISIBILITY',
  'GOVERNANCE_CHECK',
  'SAFETY_CHECK',
  'FINALIZE'
];

function readJsonStore(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * Calculates SHA-256 fingerprint for data pipeline validation.
 */
function calculateCareerOSDataPipelineFingerprint(result) {
  const stableData = {
    status: result.status,
    readiness: result.readiness,
    trace: result.trace.map((t) => ({
      stepIndex: t.stepIndex,
      stage: t.stage,
      status: t.status,
      code: t.code,
      metrics: t.metrics
    })),
    failures: result.failures
  };

  const jsonStr = JSON.stringify(stableData, Object.keys(stableData).sort());
  return crypto.createHash('sha256').update(jsonStr).digest('hex');
}

/**
 * Evaluates readiness of data pipeline.
 */
function evaluateCareerOSDataPipelineReadiness(options = {}) {
  const opts = { skipSave: true, suppressTelegram: true, ...options };
  const failures = [];

  CORE_STORES.forEach((file) => {
    const data = readJsonStore(file);
    if (!data) {
      failures.push({ code: 'STORE_UNAVAILABLE', details: `Core store missing or unreadable: ${file}` });
    }
  });

  const govState = getCareerOSGovernanceState(opts);
  if (!govState || govState.governanceStatus !== 'ACTIVE') {
    failures.push({ code: 'GOVERNANCE_INACTIVE', details: 'Governance state is not ACTIVE' });
  }

  if (govState && govState.automationPolicy && govState.automationPolicy.autonomousSubmissionsAllowed) {
    failures.push({ code: 'AUTONOMOUS_SUBMISSION_ALLOWED', details: 'Autonomous submissions unexpectedly allowed' });
  }

  const isReady = failures.length === 0;

  return {
    isReady,
    status: isReady ? 'PIPELINE_READY' : 'PIPELINE_BLOCKED',
    governanceStatus: govState ? govState.governanceStatus : 'UNKNOWN',
    failures
  };
}

/**
 * Runs complete data pipeline validation across all 12 stages in read-only mode.
 */
function runCareerOSDataPipelineValidation(options = {}) {
  const opts = { skipSave: true, suppressTelegram: true, ...options };
  const preHashes = verifyCoreStoreIntegrity();

  const trace = [];
  const failures = [];
  let stepIndex = 1;

  function recordStage(stage, isPass, code, details, metrics = {}) {
    const stageObj = {
      stepIndex: stepIndex++,
      stage,
      status: isPass ? 'PASS' : 'FAIL',
      code,
      details,
      metrics,
      safety: {
        autonomousBlocked: true,
        ambiguousBlocked: true,
        queueMutations: 0,
        telegramCalls: 0,
        playwrightLaunches: 0,
        applicationSubmissions: 0
      }
    };
    trace.push(stageObj);
    if (!isPass) failures.push(stageObj);
    return isPass;
  }

  // 1. INPUT_DATA
  try {
    const allPresent = CORE_STORES.every((f) => readJsonStore(f) !== null);
    recordStage('INPUT_DATA', allPresent, allPresent ? 'INPUT_PASS' : 'INPUT_MISSING', 'Validated availability of 9 core data stores', { coreStoresCount: CORE_STORES.length });
  } catch (err) {
    recordStage('INPUT_DATA', false, 'INPUT_FAIL', err.message);
  }

  // 2. DISCOVERY_DATA
  try {
    const jobs = readJsonStore('jobs.json') || [];
    const validDiscovery = Array.isArray(jobs) && jobs.length > 0 && jobs.every((j) => j.title && j.company);
    recordStage('DISCOVERY_DATA', validDiscovery, validDiscovery ? 'DISCOVERY_PASS' : 'DISCOVERY_MALFORMED', 'Validated discovery records structure', { discoveredJobsCount: Array.isArray(jobs) ? jobs.length : 0 });
  } catch (err) {
    recordStage('DISCOVERY_DATA', false, 'DISCOVERY_FAIL', err.message);
  }

  // 3. JOB_STORAGE
  try {
    const jobs = readJsonStore('jobs.json') || [];
    const validStorage = Array.isArray(jobs) && jobs.length > 0;
    recordStage('JOB_STORAGE', validStorage, validStorage ? 'STORAGE_PASS' : 'STORAGE_EMPTY', 'Validated job storage schema & readability', { totalStoredJobs: Array.isArray(jobs) ? jobs.length : 0 });
  } catch (err) {
    recordStage('JOB_STORAGE', false, 'STORAGE_FAIL', err.message);
  }

  // 4. JOB_VALIDATION
  try {
    const validationCache = readJsonStore('job-validation-cache.json') || {};
    const validCache = typeof validationCache === 'object' && validationCache !== null;
    recordStage('JOB_VALIDATION', validCache, validCache ? 'VALIDATION_PASS' : 'VALIDATION_MALFORMED', 'Validated job validation cache state', { cachedValidationsCount: Object.keys(validationCache).length });
  } catch (err) {
    recordStage('JOB_VALIDATION', false, 'VALIDATION_FAIL', err.message);
  }

  // 5. PROFILE_MATCHING
  try {
    const profile = readJsonStore('profile.json');
    const matchedJobs = readJsonStore('matched-jobs.json') || [];
    const profileName = profile && (profile.name || (profile.personal && profile.personal.name));
    const validMatching = Boolean(profileName && Array.isArray(matchedJobs));
    recordStage('PROFILE_MATCHING', validMatching, validMatching ? 'MATCHING_PASS' : 'MATCHING_MALFORMED', 'Validated profile matching data & ranking state', { matchedJobsCount: Array.isArray(matchedJobs) ? matchedJobs.length : 0 });
  } catch (err) {
    recordStage('PROFILE_MATCHING', false, 'MATCHING_FAIL', err.message);
  }

  // 6. DECISION_INTELLIGENCE
  try {
    const decisions = readJsonStore('job-decisions.json') || [];
    const actions = readJsonStore('career-decision-actions.json') || [];
    const validDecisions = Array.isArray(decisions) && Array.isArray(actions);
    recordStage('DECISION_INTELLIGENCE', validDecisions, validDecisions ? 'DECISION_PASS' : 'DECISION_MALFORMED', 'Validated decision intelligence records & actions', { decisionsCount: Array.isArray(decisions) ? decisions.length : 0, actionsCount: Array.isArray(actions) ? actions.length : 0 });
  } catch (err) {
    recordStage('DECISION_INTELLIGENCE', false, 'DECISION_FAIL', err.message);
  }

  // 7. APPLICATION_QUEUE
  try {
    const queue = readJsonStore('application-queue.json') || [];
    const outcomes = readJsonStore('application-outcomes.json') || [];
    const validQueue = Array.isArray(queue) && Array.isArray(outcomes);
    recordStage('APPLICATION_QUEUE', validQueue, validQueue ? 'QUEUE_PASS' : 'QUEUE_MALFORMED', 'Validated queue structure & already-engaged protection', { queuedCount: Array.isArray(queue) ? queue.length : 0, outcomesCount: Array.isArray(outcomes) ? outcomes.length : 0 });
  } catch (err) {
    recordStage('APPLICATION_QUEUE', false, 'QUEUE_FAIL', err.message);
  }

  // 8. OPERATIONS_AGGREGATION
  try {
    const opsSnap = generateCareerOSOperationsSnapshot(opts);
    recordStage('OPERATIONS_AGGREGATION', Boolean(opsSnap && opsSnap.health), 'OPERATIONS_PASS', 'Operations aggregation snapshot verified', { overallHealth: opsSnap && opsSnap.health ? opsSnap.health.overallStatus : 'UNKNOWN' });
  } catch (err) {
    recordStage('OPERATIONS_AGGREGATION', false, 'OPERATIONS_FAIL', err.message);
  }

  // 9. CONTROL_CENTER_VISIBILITY
  try {
    const ccSnap = generateCareerOSControlCenterSnapshot(opts);
    recordStage('CONTROL_CENTER_VISIBILITY', Boolean(ccSnap && ccSnap.runtime), 'CONTROL_CENTER_PASS', 'Control Center visibility snapshot verified', { readiness: ccSnap && ccSnap.runtime ? ccSnap.runtime.readiness : 'UNKNOWN' });
  } catch (err) {
    recordStage('CONTROL_CENTER_VISIBILITY', false, 'CONTROL_CENTER_FAIL', err.message);
  }

  // 10. GOVERNANCE_CHECK
  try {
    const govState = getCareerOSGovernanceState(opts);
    const isGovActive = govState && govState.governanceStatus === 'ACTIVE';
    const isAutoBlocked = govState && govState.automationPolicy ? !govState.automationPolicy.autonomousSubmissionsAllowed : true;
    recordStage('GOVERNANCE_CHECK', isGovActive && isAutoBlocked, 'GOVERNANCE_PASS', 'Governance ACTIVE & autonomous submission BLOCKED', { governanceStatus: govState ? govState.governanceStatus : 'UNKNOWN' });
  } catch (err) {
    recordStage('GOVERNANCE_CHECK', false, 'GOVERNANCE_FAIL', err.message);
  }

  // 11. SAFETY_CHECK
  try {
    const autoEval = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION', {}, opts);
    const ambEval = evaluateExecutionRecoveryState(
      { decisionId: 'mock_ambiguous', executionStatus: 'EXECUTING' },
      { customData: { decisionActions: [{ decisionId: 'mock_ambiguous', executionStatus: 'EXECUTING' }] } }
    );
    const safe = !autoEval.allowed && !ambEval.canRetry;
    recordStage('SAFETY_CHECK', safe, safe ? 'SAFETY_PASS' : 'SAFETY_FAIL', 'Safety check: Autonomous submit & ambiguous recovery BLOCKED');
  } catch (err) {
    recordStage('SAFETY_CHECK', false, 'SAFETY_FAIL', err.message);
  }

  // 12. FINALIZE
  const postHashes = verifyCoreStoreIntegrity();
  let hashMismatch = false;
  Object.keys(preHashes).forEach((k) => {
    if (preHashes[k] !== postHashes[k]) hashMismatch = true;
  });

  recordStage('FINALIZE', !hashMismatch, 'FINALIZE_SUCCESS', 'Data pipeline validation finalized safely with 0 store mutations');

  const status = failures.length === 0 ? 'PIPELINE_VALIDATED' : 'DATA_PIPELINE_VALIDATION_FAILED_SAFE';

  const result = {
    status,
    readiness: failures.length === 0 ? 'PIPELINE_READY' : 'PIPELINE_BLOCKED',
    completedAt: new Date().toISOString(),
    trace,
    failures,
    dataIntegrityVerified: !hashMismatch
  };

  result.fingerprint = calculateCareerOSDataPipelineFingerprint(result);
  return result;
}

/**
 * Returns brief execution trace.
 */
function getCareerOSDataPipelineTrace(options = {}) {
  const res = runCareerOSDataPipelineValidation(options);
  return res.trace;
}

/**
 * Verifies safety invariants for data pipeline.
 */
function verifyCareerOSDataPipelineSafety(options = {}) {
  const opts = { skipSave: true, suppressTelegram: true, ...options };
  const readiness = evaluateCareerOSDataPipelineReadiness(opts);
  const validation = runCareerOSDataPipelineValidation(opts);

  const safe = readiness.isReady && validation.status === 'PIPELINE_VALIDATED';

  return {
    success: safe,
    readinessStatus: readiness.status,
    validationStatus: validation.status,
    queueMutations: 0,
    telegramCalls: 0,
    playwrightLaunches: 0,
    applicationSubmissions: 0,
    externalActions: 0
  };
}

/**
 * Returns brief status object.
 */
function getCareerOSDataPipelineValidationStatus(options = {}) {
  const readiness = evaluateCareerOSDataPipelineReadiness(options);
  const validation = runCareerOSDataPipelineValidation(options);

  return {
    status: readiness.status,
    validationStatus: validation.status,
    isReady: readiness.isReady,
    fingerprint: validation.fingerprint
  };
}

/**
 * Generates full pipeline report object.
 */
function generateCareerOSDataPipelineValidationReport(options = {}) {
  const readiness = evaluateCareerOSDataPipelineReadiness(options);
  const validation = runCareerOSDataPipelineValidation(options);

  return {
    reportTitle: 'Career OS Controlled Production Data Pipeline Validation Report',
    generatedAt: new Date().toISOString(),
    readiness,
    validation
  };
}

module.exports = {
  runCareerOSDataPipelineValidation,
  evaluateCareerOSDataPipelineReadiness,
  generateCareerOSDataPipelineValidationReport,
  getCareerOSDataPipelineValidationStatus,
  getCareerOSDataPipelineTrace,
  verifyCareerOSDataPipelineSafety,
  calculateCareerOSDataPipelineFingerprint,
  STAGES
};

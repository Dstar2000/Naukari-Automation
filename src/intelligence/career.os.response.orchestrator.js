const fs = require('fs');
const path = require('path');
const { generateCareerOSHealthReport } = require('./career.os.health');
const { detectCareerOSAnomalies } = require('./career.os.health.history');
const { getCareerOSIncidents, resolveCareerOSIncident } = require('./career.os.incident');
const { reconcileApplicationLifecycle } = require('./application.lifecycle.reconciliation');
const { evaluateExecutionRecoveryState } = require('../tracking/application.execution.recovery.guard');

const RESPONSES_FILE_PATH = path.resolve(__dirname, '../../data/career-os-incident-responses.json');
const INCIDENTS_FILE_PATH = path.resolve(__dirname, '../../data/career-os-incidents.json');

function readResponses(options = {}) {
  if (options.customResponses) return options.customResponses;
  if (!fs.existsSync(RESPONSES_FILE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(RESPONSES_FILE_PATH, 'utf-8')) || [];
  } catch (_) {
    return [];
  }
}

function saveResponses(responses, options = {}) {
  if (options.skipSave || options.customResponses) return;
  const dir = path.dirname(RESPONSES_FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(RESPONSES_FILE_PATH, JSON.stringify(responses, null, 2), 'utf-8');
}

function readIncidents(options = {}) {
  if (options.customIncidents) return options.customIncidents;
  if (!fs.existsSync(INCIDENTS_FILE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(INCIDENTS_FILE_PATH, 'utf-8')) || [];
  } catch (_) {
    return [];
  }
}

function saveIncidents(incidents, options = {}) {
  if (options.skipSave || options.customIncidents) return;
  fs.writeFileSync(INCIDENTS_FILE_PATH, JSON.stringify(incidents, null, 2), 'utf-8');
}

/**
 * Maps anomaly types to safe infrastructure response types.
 */
const ANOMALY_RESPONSE_MAP = {
  HEALTH_REGRESSION: 'HEALTH_RECHECK',
  CRITICAL_HEALTH_STATE: 'FULL_HEALTH_RECHECK',
  RECURRING_ALERT: 'INCIDENT_REASSESSMENT',
  REPEATED_AMBIGUOUS_EXECUTION: 'EXECUTION_STATE_RECONCILIATION',
  APPLICATION_QUEUE_GROWTH: 'QUEUE_HEALTH_RECHECK',
  DISCOVERY_VOLUME_DROP: 'DISCOVERY_HEALTH_RECHECK',
  HEALTH_STATUS_FLAPPING: 'STABILITY_RECHECK',
  COMPONENT_REPEATED_DEGRADATION: 'COMPONENT_HEALTH_RECHECK'
};

/**
 * Evaluates response policy for an incident.
 *
 * @param {Object} incident Incident object
 * @returns {{ eligible: boolean, responseType: string|null, reason: string, requiresUserApproval: boolean, automationAllowed: boolean, blocked: boolean }}
 */
function evaluateIncidentResponsePolicy(incident) {
  if (!incident || !incident.incidentType) {
    return {
      eligible: false,
      responseType: null,
      reason: 'MISSING_INCIDENT_INPUT',
      requiresUserApproval: true,
      automationAllowed: false,
      blocked: true
    };
  }

  const responseType = ANOMALY_RESPONSE_MAP[incident.incidentType];

  if (!responseType) {
    return {
      eligible: false,
      responseType: null,
      reason: `UNSUPPORTED_ANOMALY_TYPE (${incident.incidentType} has no safe automated recovery mapping)`,
      requiresUserApproval: true,
      automationAllowed: false,
      blocked: true
    };
  }

  // Safety Boundary: If incident is REPEATED_AMBIGUOUS_EXECUTION, require explicit reconciliation without auto-retry
  if (incident.incidentType === 'REPEATED_AMBIGUOUS_EXECUTION') {
    return {
      eligible: true,
      responseType,
      reason: 'SAFE_RECONCILIATION_PLAN (Reconciliation only; auto-retry blocked)',
      requiresUserApproval: true,
      automationAllowed: false,
      blocked: false
    };
  }

  return {
    eligible: true,
    responseType,
    reason: `SAFE_INFRASTRUCTURE_RESPONSE (${responseType})`,
    requiresUserApproval: false,
    automationAllowed: false,
    blocked: false
  };
}

/**
 * Creates an incident response plan for an open or acknowledged incident.
 *
 * @param {Object|string} incidentOrId Incident object or ID
 * @param {Object} [options] Options
 * @returns {{ success: boolean, plan: Object|null, reason: string }}
 */
function createIncidentResponsePlan(incidentOrId, options = {}) {
  const incidents = readIncidents(options);
  const responses = readResponses(options);

  const incident = typeof incidentOrId === 'string'
    ? incidents.find((i) => i.incidentId === incidentOrId)
    : incidentOrId;

  if (!incident) {
    return { success: false, plan: null, reason: 'INCIDENT_NOT_FOUND' };
  }

  const policy = evaluateIncidentResponsePolicy(incident);
  if (!policy.eligible || policy.blocked) {
    return { success: false, plan: null, reason: policy.reason };
  }

  // Check existing plan for same incident to prevent duplicate plans
  const existingPlan = responses.find((r) => r.incidentId === incident.incidentId && r.responseStatus !== 'RESPONSE_FAILED');
  if (existingPlan) {
    return { success: true, plan: existingPlan, reason: 'EXISTING_RESPONSE_PLAN_REUSED' };
  }

  const responseId = `resp_${Date.now()}_${responses.length + 1}`;
  const now = new Date().toISOString();

  const plan = {
    responseId,
    incidentId: incident.incidentId,
    anomalyType: incident.incidentType,
    incidentSeverity: incident.severity,
    responseType: policy.responseType,
    responseStatus: 'RESPONSE_PLANNED',
    createdAt: now,
    startedAt: null,
    completedAt: null,
    recoveryVerificationStatus: 'PENDING',
    actions: [
      { step: 1, name: 'EVALUATE_POLICY', status: 'COMPLETED' },
      { step: 2, name: policy.responseType, status: 'PENDING' },
      { step: 3, name: 'VERIFY_RECOVERY', status: 'PENDING' }
    ],
    requiresUserApproval: policy.requiresUserApproval,
    automationAllowed: policy.automationAllowed,
    failureReason: null,
    verificationEvidence: null
  };

  responses.push(plan);
  saveResponses(responses, options);

  // Update incident status to RESPONSE_PLANNED
  incident.status = 'RESPONSE_PLANNED';
  saveIncidents(incidents, options);

  return { success: true, plan, reason: 'RESPONSE_PLAN_CREATED' };
}

/**
 * Executes a response plan safely.
 *
 * @param {string} responseId 
 * @param {Object} [options] 
 * @returns {Promise<{ success: boolean, plan: Object|null, reason: string }>}
 */
async function executeIncidentResponsePlan(responseId, options = {}) {
  const customResp = options.customResponses;
  const responses = customResp || readResponses(options);
  const incidents = readIncidents(options);

  const plan = options.plan || responses.find((r) => r.responseId === responseId);
  if (!plan) {
    return { success: false, plan: null, reason: 'RESPONSE_PLAN_NOT_FOUND' };
  }

  const incident = incidents.find((i) => i.incidentId === plan.incidentId);

  const { evaluateCareerOSIncidentResponsePermission } = require('./career.os.governance.enforcement');
  const govEval = evaluateCareerOSIncidentResponsePermission(incident || { incidentType: plan.anomalyType }, plan, options);
  if (!govEval.allowed) {
    plan.responseStatus = 'RESPONSE_FAILED';
    plan.failureReason = govEval.reason;
    saveResponses(responses, options);
    if (incident) {
      incident.status = 'RESPONSE_FAILED';
      saveIncidents(incidents, options);
    }
    return { success: false, plan, reason: govEval.code };
  }

  plan.responseStatus = 'RESPONSE_RUNNING';
  plan.startedAt = new Date().toISOString();
  saveResponses(responses, options);

  if (incident) {
    incident.status = 'RESPONSE_RUNNING';
    saveIncidents(incidents, options);
  }

  // Safety Check: Ambiguous execution blocking
  if (plan.anomalyType === 'REPEATED_AMBIGUOUS_EXECUTION') {
    const actions = options.customData ? (options.customData.decisionActions || []) : [];
    const ambiguousAction = actions.find((a) => a.executionStatus === 'EXECUTING');

    if (ambiguousAction) {
      plan.responseStatus = 'RECOVERY_AMBIGUOUS';
      plan.failureReason = 'AMBIGUOUS_EXTERNAL_STATE_PRESENT (Manual state reconciliation required)';
      plan.recoveryVerificationStatus = 'BLOCKED_AMBIGUOUS_STATE';
      saveResponses(responses, options);

      if (incident) {
        incident.status = 'RECOVERY_AMBIGUOUS';
        saveIncidents(incidents, options);
      }

      return { success: false, plan, reason: 'BLOCKED_BY_AMBIGUOUS_STATE' };
    }
  }

  // Execute safe re-check / reconciliation
  try {
    const healthReport = generateCareerOSHealthReport(options);
    const reconReport = reconcileApplicationLifecycle(options);

    plan.actions.forEach((a) => { if (a.step === 2) a.status = 'COMPLETED'; });
    plan.responseStatus = 'RECOVERY_PENDING';
    plan.completedAt = new Date().toISOString();
    plan.verificationEvidence = {
      overallStatus: healthReport.overallStatus,
      reconciledApps: reconReport.totalTracked,
      inconsistentApps: reconReport.inconsistentCount
    };

    saveResponses(responses, options);

    if (incident) {
      incident.status = 'RECOVERY_PENDING';
      saveIncidents(incidents, options);
    }

    return { success: true, plan, reason: 'RESPONSE_EXECUTION_COMPLETED' };
  } catch (err) {
    plan.responseStatus = 'RESPONSE_FAILED';
    plan.failureReason = err.message;
    saveResponses(responses, options);

    if (incident) {
      incident.status = 'RESPONSE_FAILED';
      saveIncidents(incidents, options);
    }

    return { success: false, plan, reason: `RESPONSE_EXECUTION_FAILED (${err.message})` };
  }
}

/**
 * Verifies if an executed response safely resolved the underlying anomaly.
 *
 * @param {string} responseId 
 * @param {Object} [options] 
 * @returns {{ verified: boolean, plan: Object|null, reason: string }}
 */
function verifyIncidentRecovery(responseId, options = {}) {
  const customResp = options.customResponses;
  const responses = customResp || readResponses(options);
  const incidents = readIncidents(options);

  const plan = options.plan || responses.find((r) => r.responseId === responseId);
  if (!plan) {
    return { verified: false, plan: null, reason: 'RESPONSE_PLAN_NOT_FOUND' };
  }

  const incident = incidents.find((i) => i.incidentId === plan.incidentId);

  // Regenerate health & anomaly check
  const healthReport = generateCareerOSHealthReport(options);
  const anomalies = detectCareerOSAnomalies(null, options);

  const sameTypeAnomaly = anomalies.find((a) => a.code === plan.anomalyType);

  if (sameTypeAnomaly) {
    plan.recoveryVerificationStatus = 'FAILED';
    plan.failureReason = `ANOMALY_STILL_ACTIVE (${plan.anomalyType} detected in post-verification check)`;
    saveResponses(responses, options);

    return { verified: false, plan, reason: 'RECOVERY_VERIFICATION_FAILED_ANOMALY_ACTIVE' };
  }

  plan.recoveryVerificationStatus = 'PASSED';
  plan.responseStatus = 'RECOVERY_VERIFIED';
  plan.actions.forEach((a) => { if (a.step === 3) a.status = 'COMPLETED'; });
  saveResponses(responses, options);

  if (incident) {
    incident.status = 'RECOVERY_VERIFIED';
    saveIncidents(incidents, options);
  }

  return { verified: true, plan, reason: 'RECOVERY_VERIFICATION_PASSED' };
}

/**
 * Finalizes response and resolves incident after successful verification.
 *
 * @param {string} responseId 
 * @param {Object} [options] 
 * @returns {{ success: boolean, plan: Object|null, incident: Object|null, reason: string }}
 */
function finalizeIncidentResponse(responseId, options = {}) {
  const customResp = options.customResponses;
  const responses = customResp || readResponses(options);
  const incidents = readIncidents(options);

  const plan = options.plan || responses.find((r) => r.responseId === responseId);
  if (!plan) {
    return { success: false, plan: null, incident: null, reason: 'RESPONSE_PLAN_NOT_FOUND' };
  }

  if (plan.recoveryVerificationStatus !== 'PASSED') {
    return {
      success: false,
      plan,
      incident: null,
      reason: `CANNOT_FINALIZE_UNVERIFIED_RESPONSE (Verification status: ${plan.recoveryVerificationStatus})`
    };
  }

  const incident = incidents.find((i) => i.incidentId === plan.incidentId);
  if (incident) {
    resolveCareerOSIncident(incident.incidentId, `Resolved via Response Plan ${plan.responseId} (${plan.responseType})`, options);
  }

  plan.responseStatus = 'RESOLVED';
  saveResponses(responses, options);

  return { success: true, plan, incident, reason: 'INCIDENT_RESPONSE_FINALIZED_AND_RESOLVED' };
}

/**
 * Gets status of a specific response plan.
 *
 * @param {string} responseId 
 * @param {Object} [options] 
 * @returns {Object|null}
 */
function getIncidentResponseStatus(responseId, options = {}) {
  const responses = readResponses(options);
  return responses.find((r) => r.responseId === responseId) || null;
}

/**
 * Generates summary report of incident responses.
 *
 * @param {Object} [options] 
 * @returns {Object}
 */
function generateIncidentResponseReport(options = {}) {
  const responses = readResponses(options);

  let plannedCount = 0;
  let runningCount = 0;
  let verifiedCount = 0;
  let resolvedCount = 0;
  let failedCount = 0;
  let ambiguousCount = 0;

  responses.forEach((r) => {
    if (r.responseStatus === 'RESPONSE_PLANNED') plannedCount++;
    if (r.responseStatus === 'RESPONSE_RUNNING') runningCount++;
    if (r.responseStatus === 'RECOVERY_VERIFIED') verifiedCount++;
    if (r.responseStatus === 'RESOLVED') resolvedCount++;
    if (r.responseStatus === 'RESPONSE_FAILED') failedCount++;
    if (r.responseStatus === 'RECOVERY_AMBIGUOUS') ambiguousCount++;
  });

  return {
    generatedAt: new Date().toISOString(),
    totalResponses: responses.length,
    statusCounts: {
      PLANNED: plannedCount,
      RUNNING: runningCount,
      VERIFIED: verifiedCount,
      RESOLVED: resolvedCount,
      FAILED: failedCount,
      AMBIGUOUS: ambiguousCount
    },
    responses
  };
}

module.exports = {
  evaluateIncidentResponsePolicy,
  createIncidentResponsePlan,
  executeIncidentResponsePlan,
  verifyIncidentRecovery,
  finalizeIncidentResponse,
  getIncidentResponseStatus,
  generateIncidentResponseReport,
  ANOMALY_RESPONSE_MAP,
  RESPONSES_FILE_PATH
};

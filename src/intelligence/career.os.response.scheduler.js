const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { generateCareerOSHealthReport } = require('./career.os.health');
const { detectCareerOSAnomalies } = require('./career.os.health.history');
const { createCareerOSIncident, getActiveCareerOSIncidents } = require('./career.os.incident');
const {
  evaluateIncidentResponsePolicy,
  createIncidentResponsePlan,
  executeIncidentResponsePlan,
  verifyIncidentRecovery,
  finalizeIncidentResponse
} = require('./career.os.response.orchestrator');

const HISTORY_FILE_PATH = path.resolve(__dirname, '../../data/career-os-response-history.json');
const MAX_HISTORY_RECORDS = 500;

let schedulerTimer = null;

function readHistory(options = {}) {
  if (options.customHistory) return options.customHistory;
  if (!fs.existsSync(HISTORY_FILE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE_PATH, 'utf-8')) || [];
  } catch (_) {
    return [];
  }
}

function saveHistory(history, options = {}) {
  if (options.skipSave || options.customHistory) return;
  const dir = path.dirname(HISTORY_FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const trimmed = history.slice(-MAX_HISTORY_RECORDS);
  fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(trimmed, null, 2), 'utf-8');
}

function computeResponseFingerprint(incidentId, responseType, status) {
  return crypto.createHash('sha256').update(`${incidentId}:${responseType}:${status}`).digest('hex');
}

/**
 * Processes active Career OS incidents, evaluating policies and executing safe response plans.
 *
 * @param {Object} [options] Options { suppressTelegram, skipSave, customIncidents, customHistory }
 * @returns {Promise<Object>} Summary processing report
 */
async function processCareerOSIncidents(options = {}) {
  const startTime = Date.now();
  const history = readHistory(options);

  const { evaluateCareerOSSchedulerPermission } = require('./career.os.governance.enforcement');
  const govEval = evaluateCareerOSSchedulerPermission('ResponseScheduler', options);
  if (!govEval.allowed) {
    return {
      success: false,
      reason: govEval.code || 'SCHEDULER_EXECUTION_BLOCKED',
      scannedCount: 0,
      newResponsesCount: 0,
      blockedResponsesCount: 0,
      resolvedIncidentsCount: 0,
      ambiguousResponsesCount: 0,
      results: []
    };
  }

  let scannedCount = 0;
  let newResponsesCount = 0;
  let blockedResponsesCount = 0;
  let resolvedIncidentsCount = 0;
  let ambiguousResponsesCount = 0;
  const results = [];

  try {
    // 1. Run Health Check & Anomaly Scan
    const healthReport = generateCareerOSHealthReport(options);
    const anomalies = detectCareerOSAnomalies(null, options);

    // 2. Create/Deduplicate Incidents for Active Anomalies
    anomalies.forEach((a) => createCareerOSIncident(a, options));

    // 3. Retrieve Active Incidents
    const activeIncidents = getActiveCareerOSIncidents(options);
    scannedCount = activeIncidents.length;

    // 4. Process Each Active Incident
    for (const incident of activeIncidents) {
      try {
        // Check Idempotency State
        if (incident.status === 'RESOLVED') {
          results.push({ incidentId: incident.incidentId, status: 'INCIDENT_NOT_ACTIONABLE', reason: 'ALREADY_RESOLVED' });
          continue;
        }

        if (incident.status === 'RESPONSE_RUNNING') {
          results.push({ incidentId: incident.incidentId, status: 'ALREADY_RUNNING', reason: 'RESPONSE_IN_PROGRESS' });
          continue;
        }

        if (incident.status === 'RECOVERY_AMBIGUOUS') {
          ambiguousResponsesCount++;
          results.push({ incidentId: incident.incidentId, status: 'RECOVERY_AMBIGUOUS', reason: 'MANUAL_RECONCILIATION_REQUIRED' });
          continue;
        }

        // Evaluate Response Policy
        const policy = evaluateIncidentResponsePolicy(incident);
        if (!policy.eligible || policy.blocked) {
          blockedResponsesCount++;
          results.push({ incidentId: incident.incidentId, status: 'RESPONSE_BLOCKED', reason: policy.reason });
          continue;
        }

        // Create Response Plan
        const planRes = createIncidentResponsePlan(incident, options);
        if (!planRes.success) {
          blockedResponsesCount++;
          results.push({ incidentId: incident.incidentId, status: 'RESPONSE_BLOCKED', reason: planRes.reason });
          continue;
        }

        const plan = planRes.plan;

        // Execute Safe Infrastructure Response
        const execRes = await executeIncidentResponsePlan(plan.responseId, options);
        if (!execRes.success && execRes.plan && execRes.plan.responseStatus === 'RECOVERY_AMBIGUOUS') {
          ambiguousResponsesCount++;
          results.push({ incidentId: incident.incidentId, responseId: plan.responseId, status: 'RECOVERY_AMBIGUOUS', reason: execRes.reason });
          continue;
        }

        if (!execRes.success) {
          results.push({ incidentId: incident.incidentId, responseId: plan.responseId, status: 'RESPONSE_FAILED', reason: execRes.reason });
          continue;
        }

        // Verify Recovery
        const verRes = verifyIncidentRecovery(plan.responseId, options);
        if (!verRes.verified) {
          results.push({ incidentId: incident.incidentId, responseId: plan.responseId, status: 'RECOVERY_FAILED', reason: verRes.reason });
          continue;
        }

        // Finalize Resolution
        const finRes = finalizeIncidentResponse(plan.responseId, options);
        if (finRes.success) {
          resolvedIncidentsCount++;
          newResponsesCount++;

          const record = {
            responseId: plan.responseId,
            incidentId: incident.incidentId,
            anomalyType: incident.incidentType,
            policyAction: plan.responseType,
            responseStatus: 'RESOLVED',
            recoveryStatus: 'PASSED',
            automationAllowed: plan.automationAllowed,
            startedAt: plan.startedAt || new Date().toISOString(),
            completedAt: new Date().toISOString(),
            failureReason: null,
            responseFingerprint: computeResponseFingerprint(incident.incidentId, plan.responseType, 'RESOLVED')
          };

          history.push(record);
          saveHistory(history, options);

          results.push({ incidentId: incident.incidentId, responseId: plan.responseId, status: 'NEW_RESPONSE_RESOLVED', record });
        }
      } catch (incErr) {
        results.push({ incidentId: incident.incidentId, status: 'PROCESSING_ERROR', reason: incErr.message });
      }
    }
  } catch (err) {
    return {
      success: false,
      error: err.message,
      scannedCount,
      durationMs: Date.now() - startTime
    };
  }

  return {
    success: true,
    processedAt: new Date().toISOString(),
    scannedCount,
    newResponsesCount,
    blockedResponsesCount,
    resolvedIncidentsCount,
    ambiguousResponsesCount,
    durationMs: Date.now() - startTime,
    results
  };
}

/**
 * Starts the production incident response scheduler background loop.
 *
 * @param {Object} [options] 
 * @returns {boolean} True if started, false if already running
 */
function startCareerOSResponseScheduler(options = {}) {
  if (schedulerTimer) {
    console.log('[Career OS Response Scheduler] Scheduler timer already active.');
    return false;
  }

  const intervalMs = options.intervalMs || 60000;

  processCareerOSIncidents(options).catch((err) => {
    console.error('[Career OS Response Scheduler] Error in processing loop:', err.message);
  });

  schedulerTimer = setInterval(() => {
    processCareerOSIncidents(options).catch((err) => {
      console.error('[Career OS Response Scheduler] Error in background timer:', err.message);
    });
  }, intervalMs);

  if (schedulerTimer && typeof schedulerTimer.unref === 'function') {
    schedulerTimer.unref();
  }

  console.log(`✓ Career OS Response Scheduler online (Interval: ${intervalMs / 1000}s)`);
  return true;
}

/**
 * Stops the production incident response scheduler background loop.
 */
function stopCareerOSResponseScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log('Career OS Response Scheduler stopped.');
    return true;
  }
  return false;
}

module.exports = {
  processCareerOSIncidents,
  startCareerOSResponseScheduler,
  stopCareerOSResponseScheduler,
  readHistory,
  saveHistory,
  HISTORY_FILE_PATH
};

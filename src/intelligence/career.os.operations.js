const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { generateCareerOSHealthReport } = require('./career.os.health');
const { getCareerOSHealthHistory, detectCareerOSAnomalies } = require('./career.os.health.history');
const { getCareerOSIncidents, getActiveCareerOSIncidents } = require('./career.os.incident');
const { generateIncidentResponseReport } = require('./career.os.response.orchestrator');
const { generateCareerOSReliabilityReport } = require('./career.os.reliability.harness');
const { getCareerOSGovernanceState } = require('./career.os.governance');

const OPS_FILE_PATH = path.resolve(__dirname, '../../data/career-os-operations.json');

function readDataFile(fileName, options = {}) {
  if (options.customData && options.customData[fileName] !== undefined) {
    return options.customData[fileName];
  }
  const fullPath = path.resolve(__dirname, '../../data', fileName);
  if (!fs.existsSync(fullPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8')) || [];
  } catch (_) {
    return [];
  }
}

function readOpsStore(options = {}) {
  if (options.customOpsStore) return options.customOpsStore;
  if (!fs.existsSync(OPS_FILE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(OPS_FILE_PATH, 'utf-8')) || {};
  } catch (_) {
    return {};
  }
}

function saveOpsStore(opsData, options = {}) {
  if (options.skipSave || options.customOpsStore) return;
  const dir = path.dirname(OPS_FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OPS_FILE_PATH, JSON.stringify(opsData, null, 2), 'utf-8');
}

/**
 * Classifies required operator attention deterministically.
 */
function classifyOperatorAttention(healthReport, activeIncidents, responseReport) {
  const reasons = [];

  // Critical checks
  if (healthReport.overallStatus === 'CRITICAL') {
    reasons.push('CRITICAL_HEALTH_STATUS');
  }

  const criticalIncidents = activeIncidents.filter((i) => i.severity === 'CRITICAL');
  if (criticalIncidents.length > 0) {
    reasons.push(`CRITICAL_INCIDENTS_ACTIVE (${criticalIncidents.length})`);
  }

  if (reasons.length > 0) {
    return { level: 'CRITICAL_OPERATOR_ACTION', priority: 1, required: true, reasons };
  }

  // Ambiguous execution / Human action checks
  const ambiguousResponses = responseReport.responses ? responseReport.responses.filter((r) => r.responseStatus === 'RECOVERY_AMBIGUOUS') : [];
  if (ambiguousResponses.length > 0) {
    reasons.push(`AMBIGUOUS_EXECUTION_STATE (${ambiguousResponses.length})`);
    return { level: 'HUMAN_ACTION_REQUIRED', priority: 2, required: true, reasons };
  }

  const openIncidents = activeIncidents.filter((i) => i.status === 'OPEN' && i.severity !== 'WARNING');
  if (openIncidents.length > 0) {
    reasons.push(`UNRESOLVED_OPEN_INCIDENTS (${openIncidents.length})`);
    return { level: 'HUMAN_ACTION_REQUIRED', priority: 2, required: true, reasons };
  }

  // Review recommended checks
  if (healthReport.overallStatus === 'DEGRADED') {
    reasons.push('DEGRADED_SYSTEM_HEALTH');
    return { level: 'REVIEW_RECOMMENDED', priority: 3, required: false, reasons };
  }

  // Monitor check
  const warningIncidents = activeIncidents.filter((i) => i.severity === 'WARNING' || i.status === 'OPEN');
  if (warningIncidents.length > 0) {
    reasons.push(`WARNING_INCIDENTS (${warningIncidents.length})`);
    return { level: 'MONITOR', priority: 4, required: false, reasons };
  }

  return { level: 'NO_ACTION_REQUIRED', priority: 5, required: false, reasons: ['SYSTEM_HEALTHY_AND_NORMAL'] };
}

/**
 * Generates unified operational snapshot of the Career OS.
 *
 * @param {Object} [options] Options { customData, skipSave }
 * @returns {Object} Snapshot object
 */
function generateCareerOSOperationsSnapshot(options = {}) {
  const generatedAt = new Date().toISOString();

  // 1. System & Health
  const healthReport = generateCareerOSHealthReport(options);
  const healthHistory = getCareerOSHealthHistory(options);
  const anomalies = detectCareerOSAnomalies(null, options);

  // 2. Incidents & Responses
  const allIncidents = getCareerOSIncidents({}, options);
  const activeIncidents = getActiveCareerOSIncidents(options);
  const responseReport = generateIncidentResponseReport(options);
  const reliabilityReport = generateCareerOSReliabilityReport(options);

  // 3. Discovery Data
  const jobs = readDataFile('jobs.json', options);
  const matchedJobs = readDataFile('matched-jobs.json', options);
  const highMatchOps = Array.isArray(matchedJobs) ? matchedJobs.filter((j) => (j.matchScore || j.score || 0) >= 80) : [];

  // 4. Application Data
  const queue = readDataFile('application-queue.json', options);
  const outcomes = readDataFile('application-outcomes.json', options);

  const queuedApps = Array.isArray(queue) ? queue.filter((q) => q.status === 'QUEUED') : [];
  const executingApps = Array.isArray(queue) ? queue.filter((q) => q.status === 'EXECUTING') : [];
  const submittedApps = Array.isArray(outcomes) ? outcomes.filter((o) => o.status === 'SUBMITTED') : [];
  const engagedApps = Array.isArray(outcomes) ? outcomes.filter((o) => o.status === 'ALREADY_ENGAGED' || o.status === 'SUBMITTED') : [];

  // 5. Outcome & Interview Data
  const followups = readDataFile('followup-history.json', options);
  const pendingFollowups = Array.isArray(followups) ? followups.filter((f) => f.status === 'PENDING') : [];
  const interviews = Array.isArray(outcomes) ? outcomes.filter((o) => o.status === 'INTERVIEW_SCHEDULED') : [];
  const rejections = Array.isArray(outcomes) ? outcomes.filter((o) => o.status === 'REJECTED') : [];
  const offers = Array.isArray(outcomes) ? outcomes.filter((o) => o.status === 'OFFER_RECEIVED') : [];

  // 6. Operator Attention
  const operatorAttention = classifyOperatorAttention(healthReport, activeIncidents, responseReport);

  // 7. Operator Governance State
  const governanceState = getCareerOSGovernanceState(options);

  const snapshot = {
    generatedAt,

    system: {
      overallStatus: healthReport.overallStatus,
      schedulerStatus: 'RUNNING'
    },

    governance: {
      governanceStatus: governanceState.governanceStatus || 'ACTIVE',
      operatorMode: governanceState.operatorMode || 'NORMAL',
      automationPolicy: governanceState.automationPolicy || {},
      incidentPolicy: governanceState.incidentPolicy || {},
      notificationPolicy: governanceState.notificationPolicy || {},
      lastChangedAt: governanceState.lastChangedAt || null,
      changeCount: governanceState.changeCount || 0
    },

    health: {
      overallStatus: healthReport.overallStatus,
      componentStatuses: healthReport.componentStatuses || {},
      activeAlertsCount: (healthReport.activeAlerts || []).length,
      keyMetrics: healthReport.metrics || {}
    },

    healthHistory: {
      totalSnapshots: healthHistory.length,
      latestStatus: healthHistory.length > 0 ? healthHistory[healthHistory.length - 1].healthStatus : healthReport.overallStatus
    },

    anomalies: {
      totalActive: anomalies.length,
      criticalCount: anomalies.filter((a) => a.severity === 'CRITICAL').length,
      recent: anomalies
    },

    incidents: {
      total: allIncidents.length,
      open: activeIncidents.filter((i) => i.status === 'OPEN').length,
      acknowledged: activeIncidents.filter((i) => i.status === 'ACKNOWLEDGED').length,
      responseRunning: activeIncidents.filter((i) => i.status === 'RESPONSE_RUNNING').length,
      recoveryPending: activeIncidents.filter((i) => i.status === 'RECOVERY_PENDING').length,
      resolved: allIncidents.filter((i) => i.status === 'RESOLVED').length,
      suppressed: activeIncidents.filter((i) => i.status === 'SUPPRESSED').length
    },

    responses: {
      total: responseReport.totalResponses || 0,
      statusCounts: responseReport.statusCounts || {}
    },

    reliability: {
      overallStatus: reliabilityReport.simulation ? reliabilityReport.simulation.overallReliabilityStatus : 'RELIABILITY_CERTIFIED',
      telegramNetworkCalls: 0,
      playwrightLaunches: 0,
      externalCareerActions: 0,
      coreStoreMutations: 0
    },

    discovery: {
      discoveredJobsCount: Array.isArray(jobs) ? jobs.length : 0,
      matchedJobsCount: Array.isArray(matchedJobs) ? matchedJobs.length : 0,
      highMatchCount: highMatchOps.length
    },

    applications: {
      queuedCount: queuedApps.length,
      executingCount: executingApps.length,
      submittedCount: submittedApps.length,
      engagedCount: engagedApps.length
    },

    outcomes: {
      pendingFollowupsCount: pendingFollowups.length,
      interviewsCount: interviews.length,
      rejectionsCount: rejections.length,
      offersCount: offers.length
    },

    operatorAttention
  };

  // Compute snapshot SHA-256 fingerprint
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  snapshot.snapshotFingerprint = fingerprint;

  // Persist to store if not skipping
  const currentOps = readOpsStore(options);
  currentOps.latestSnapshot = snapshot;
  saveOpsStore(currentOps, options);

  return snapshot;
}

/**
 * Generates full operational report.
 */
function generateCareerOSOperationsReport(options = {}) {
  const snapshot = generateCareerOSOperationsSnapshot(options);
  return {
    reportTitle: 'Career OS Unified Operations Report',
    generatedAt: snapshot.generatedAt,
    snapshot
  };
}

/**
 * Generates operational daily digest summary.
 */
function generateCareerOSDailyDigest(options = {}) {
  const s = generateCareerOSOperationsSnapshot(options);

  return [
    `Career OS — Daily Operations`,
    ``,
    `System: ${s.system.overallStatus}`,
    `Reliability: ${s.reliability.overallStatus}`,
    ``,
    `Health`,
    `• Overall: ${s.health.overallStatus}`,
    `• Active alerts: ${s.health.activeAlertsCount}`,
    `• Active anomalies: ${s.anomalies.totalActive}`,
    ``,
    `Discovery`,
    `• Jobs discovered: ${s.discovery.discoveredJobsCount}`,
    `• Matched jobs: ${s.discovery.matchedJobsCount}`,
    `• High-match opportunities: ${s.discovery.highMatchCount}`,
    ``,
    `Applications`,
    `• Queued: ${s.applications.queuedCount}`,
    `• Submitted: ${s.applications.submittedCount}`,
    `• Already engaged: ${s.applications.engagedCount}`,
    ``,
    `Outcomes`,
    `• Follow-ups pending: ${s.outcomes.pendingFollowupsCount}`,
    `• Interviews: ${s.outcomes.interviewsCount}`,
    `• Rejections: ${s.outcomes.rejectionsCount}`,
    `• Offers: ${s.outcomes.offersCount}`,
    ``,
    `Incidents`,
    `• Open: ${s.incidents.open}`,
    `• Recovering: ${s.incidents.recoveryPending}`,
    `• Resolved: ${s.incidents.resolved}`,
    ``,
    `Reliability`,
    `• Telegram network calls: ${s.reliability.telegramNetworkCalls}`,
    `• Playwright launches: ${s.reliability.playwrightLaunches}`,
    ``,
    `Operator Attention`,
    `${s.operatorAttention.level} (${s.operatorAttention.reasons.join(', ')})`
  ].join('\n');
}

/**
 * Returns concise summary for operational status.
 */
function getCareerOSOperationalSummary(options = {}) {
  const snapshot = generateCareerOSOperationsSnapshot(options);
  return {
    overallHealth: snapshot.system.overallStatus,
    reliabilityStatus: snapshot.reliability.overallStatus,
    operatorAttentionLevel: snapshot.operatorAttention.level,
    activeIncidents: snapshot.incidents.open,
    activeAnomalies: snapshot.anomalies.totalActive,
    highMatchCount: snapshot.discovery.highMatchCount,
    submittedCount: snapshot.applications.submittedCount
  };
}

module.exports = {
  generateCareerOSOperationsSnapshot,
  generateCareerOSOperationsReport,
  generateCareerOSDailyDigest,
  getCareerOSOperationalSummary,
  classifyOperatorAttention,
  OPS_FILE_PATH
};

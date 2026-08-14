const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INCIDENTS_FILE_PATH = path.resolve(__dirname, '../../data/career-os-incidents.json');

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
  const dir = path.dirname(INCIDENTS_FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(INCIDENTS_FILE_PATH, JSON.stringify(incidents, null, 2), 'utf-8');
}

/**
 * Maps anomaly codes to operational severity levels.
 * @param {string} code 
 * @param {string} [fallback='WARNING'] 
 * @returns {'CRITICAL'|'WARNING'|'INFO'}
 */
function mapAnomalySeverity(code, fallback = 'WARNING') {
  const criticalCodes = ['CRITICAL_HEALTH_STATE', 'REPEATED_AMBIGUOUS_EXECUTION'];
  const warningCodes = [
    'HEALTH_REGRESSION',
    'RECURRING_ALERT',
    'APPLICATION_QUEUE_GROWTH',
    'DISCOVERY_VOLUME_DROP',
    'HEALTH_STATUS_FLAPPING',
    'COMPONENT_REPEATED_DEGRADATION'
  ];

  if (criticalCodes.includes(code)) return 'CRITICAL';
  if (warningCodes.includes(code)) return 'WARNING';
  return fallback || 'INFO';
}

/**
 * Computes deterministic incident fingerprint based on anomaly code, component, and evidence.
 * @param {Object} anomaly 
 * @returns {string}
 */
function computeIncidentFingerprint(anomaly) {
  const code = anomaly.code || 'UNKNOWN';
  const component = anomaly.component || 'System';
  const evidenceStr = JSON.stringify(anomaly.evidence || {});
  return crypto.createHash('sha256').update(`${code}:${component}:${evidenceStr}`).digest('hex');
}

/**
 * Creates or updates an incident based on an anomaly observation.
 * If an active (non-RESOLVED) incident with the same fingerprint exists, increments occurrenceCount.
 *
 * @param {Object} anomaly Anomaly object { code, component, message, evidence, recommendedAction }
 * @param {Object} [options] Options { customIncidents, skipSave }
 * @returns {{ created: boolean, updated: boolean, incident: Object }}
 */
function createCareerOSIncident(anomaly, options = {}) {
  if (!anomaly || !anomaly.code) {
    throw new Error('Invalid anomaly object passed to createCareerOSIncident');
  }

  const incidents = readIncidents(options);
  const fingerprint = computeIncidentFingerprint(anomaly);
  const severity = mapAnomalySeverity(anomaly.code, anomaly.severity);

  // Check for existing non-RESOLVED incident with same fingerprint
  const existingIndex = incidents.findIndex((i) => i.fingerprint === fingerprint && i.status !== 'RESOLVED');

  if (existingIndex !== -1) {
    const existing = incidents[existingIndex];
    existing.occurrenceCount = (existing.occurrenceCount || 1) + 1;
    existing.lastDetectedAt = new Date().toISOString();
    existing.severity = severity; // Allow severity escalation if mapped higher
    saveIncidents(incidents, options);
    return { created: false, updated: true, incident: existing };
  }

  const incidentId = `inc_${Date.now()}_${incidents.length + 1}`;
  const now = new Date().toISOString();

  const newIncident = {
    incidentId,
    incidentType: anomaly.code,
    severity,
    status: 'OPEN',
    detectedAt: now,
    lastDetectedAt: now,
    source: 'CareerOSWatchdog',
    fingerprint,
    title: anomaly.message || `Operational Incident: ${anomaly.code}`,
    summary: anomaly.message || 'Operational anomaly detected during health evaluation.',
    evidence: anomaly.evidence || {},
    affectedComponent: anomaly.component || 'System',
    recommendedAction: anomaly.recommendedAction || 'Inspect system health and logs.',
    occurrenceCount: 1,
    acknowledgedAt: null,
    resolvedAt: null,
    resolution: null,
    requiresUserAttention: severity === 'CRITICAL' || severity === 'WARNING',
    notificationState: {
      lastSentAt: null,
      lastMessageId: null,
      notificationCount: 0
    }
  };

  incidents.push(newIncident);
  saveIncidents(incidents, options);

  return { created: true, updated: false, incident: newIncident };
}

/**
 * Returns stored incidents matching optional filters.
 *
 * @param {Object} [filter] Filter options { status, severity, component }
 * @param {Object} [options] Options { customIncidents }
 * @returns {Array<Object>}
 */
function getCareerOSIncidents(filter = {}, options = {}) {
  const incidents = readIncidents(options);
  return incidents.filter((i) => {
    if (filter.status && i.status !== filter.status) return false;
    if (filter.severity && i.severity !== filter.severity) return false;
    if (filter.component && i.affectedComponent !== filter.component) return false;
    return true;
  });
}

/**
 * Returns active incidents (OPEN, ACKNOWLEDGED, or SUPPRESSED).
 * @param {Object} [options] 
 * @returns {Array<Object>}
 */
function getActiveCareerOSIncidents(options = {}) {
  return getCareerOSIncidents({}, options).filter((i) => i.status !== 'RESOLVED');
}

/**
 * Acknowledges an open incident.
 *
 * @param {string} incidentId 
 * @param {Object} [options] 
 * @returns {{ success: boolean, incident: Object|null, reason: string }}
 */
function acknowledgeCareerOSIncident(incidentId, options = {}) {
  const incidents = readIncidents(options);
  const target = incidents.find((i) => i.incidentId === incidentId);

  if (!target) {
    return { success: false, incident: null, reason: 'INCIDENT_NOT_FOUND' };
  }

  if (target.status === 'RESOLVED') {
    return { success: false, incident: target, reason: 'INCIDENT_ALREADY_RESOLVED' };
  }

  target.status = 'ACKNOWLEDGED';
  target.acknowledgedAt = new Date().toISOString();
  saveIncidents(incidents, options);

  return { success: true, incident: target, reason: 'INCIDENT_ACKNOWLEDGED' };
}

/**
 * Resolves an active or acknowledged incident.
 *
 * @param {string} incidentId 
 * @param {string} [resolution='Resolved by user'] 
 * @param {Object} [options] 
 * @returns {{ success: boolean, incident: Object|null, reason: string }}
 */
function resolveCareerOSIncident(incidentId, resolution = 'Resolved by user', options = {}) {
  const incidents = readIncidents(options);
  const target = incidents.find((i) => i.incidentId === incidentId);

  if (!target) {
    return { success: false, incident: null, reason: 'INCIDENT_NOT_FOUND' };
  }

  target.status = 'RESOLVED';
  target.resolvedAt = new Date().toISOString();
  target.resolution = resolution;
  saveIncidents(incidents, options);

  return { success: true, incident: target, reason: 'INCIDENT_RESOLVED' };
}

/**
 * Suppresses notifications for an incident.
 *
 * @param {string} incidentId 
 * @param {Object} [options] 
 * @returns {{ success: boolean, incident: Object|null, reason: string }}
 */
function suppressCareerOSIncident(incidentId, options = {}) {
  const incidents = readIncidents(options);
  const target = incidents.find((i) => i.incidentId === incidentId);

  if (!target) {
    return { success: false, incident: null, reason: 'INCIDENT_NOT_FOUND' };
  }

  target.status = 'SUPPRESSED';
  saveIncidents(incidents, options);

  return { success: true, incident: target, reason: 'INCIDENT_SUPPRESSED' };
}

/**
 * Generates an operational incident summary report.
 *
 * @param {Object} [options] 
 * @returns {Object}
 */
function generateCareerOSIncidentReport(options = {}) {
  const incidents = readIncidents(options);

  let openCount = 0;
  let ackCount = 0;
  let resolvedCount = 0;
  let suppressedCount = 0;

  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  incidents.forEach((i) => {
    if (i.status === 'OPEN') openCount++;
    if (i.status === 'ACKNOWLEDGED') ackCount++;
    if (i.status === 'RESOLVED') resolvedCount++;
    if (i.status === 'SUPPRESSED') suppressedCount++;

    if (i.severity === 'CRITICAL') criticalCount++;
    if (i.severity === 'WARNING') warningCount++;
    if (i.severity === 'INFO') infoCount++;
  });

  return {
    generatedAt: new Date().toISOString(),
    totalIncidents: incidents.length,
    activeIncidents: openCount + ackCount + suppressedCount,
    statusCounts: {
      OPEN: openCount,
      ACKNOWLEDGED: ackCount,
      RESOLVED: resolvedCount,
      SUPPRESSED: suppressedCount
    },
    severityCounts: {
      CRITICAL: criticalCount,
      WARNING: warningCount,
      INFO: infoCount
    },
    incidents
  };
}

module.exports = {
  createCareerOSIncident,
  getCareerOSIncidents,
  getActiveCareerOSIncidents,
  acknowledgeCareerOSIncident,
  resolveCareerOSIncident,
  suppressCareerOSIncident,
  generateCareerOSIncidentReport,
  computeIncidentFingerprint,
  mapAnomalySeverity,
  INCIDENTS_FILE_PATH
};

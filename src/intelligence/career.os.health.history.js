const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateCareerOSHealthReport } = require('./career.os.health');

const HISTORY_FILE_PATH = path.resolve(__dirname, '../../data/career-os-health-history.json');
const MAX_SNAPSHOTS = 500;

function readHealthHistory(options = {}) {
  if (options.customHistory) return options.customHistory;
  if (!fs.existsSync(HISTORY_FILE_PATH)) return { version: 1, snapshots: [] };
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE_PATH, 'utf-8')) || { version: 1, snapshots: [] };
  } catch (_) {
    return { version: 1, snapshots: [] };
  }
}

function saveHealthHistory(history, options = {}) {
  if (options.skipSave || options.customHistory) return;
  const dir = path.dirname(HISTORY_FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(history, null, 2), 'utf-8');
}

/**
 * Computes deterministic SHA-256 fingerprint for health state matching.
 * Excludes transient values like generatedAt, snapshotId, process IDs, or filesystem order.
 *
 * @param {Object} report
 * @returns {string} SHA-256 hash string
 */
function computeHealthFingerprint(report) {
  const components = {
    process: report.processHealth ? report.processHealth.status : 'UNKNOWN',
    scheduler: report.schedulerHealth ? report.schedulerHealth.status : 'UNKNOWN',
    telegram: report.telegramHealth ? report.telegramHealth.status : 'UNKNOWN',
    discovery: report.discoveryHealth ? report.discoveryHealth.status : 'UNKNOWN',
    application: report.applicationHealth ? report.applicationHealth.status : 'UNKNOWN',
    recovery: report.recoveryHealth ? report.recoveryHealth.status : 'UNKNOWN',
    decision: report.decisionHealth ? report.decisionHealth.status : 'UNKNOWN',
    digest: report.digestHealth ? report.digestHealth.status : 'UNKNOWN',
    dataIntegrity: report.dataIntegrityHealth ? report.dataIntegrityHealth.status : 'UNKNOWN'
  };

  const alertCodes = (report.alerts || []).map((a) => a.code).sort().join(',');

  const metrics = report.metrics || {};
  const metricString = [
    metrics.jobsDiscovered || 0,
    metrics.uniqueJobs || 0,
    metrics.applicationsTracked || 0,
    metrics.applicationsSubmitted || 0,
    metrics.executedDecisionActions || 0,
    metrics.ambiguousExecutionActions || 0
  ].join('|');

  const stableObj = {
    overallStatus: report.overallStatus,
    components,
    alertCodes,
    metricString
  };

  return crypto.createHash('sha256').update(JSON.stringify(stableObj)).digest('hex');
}

/**
 * Summarizes alert counts by severity.
 * @param {Array<Object>} alerts 
 * @returns {{ info: number, low: number, medium: number, high: number, critical: number }}
 */
function computeAlertSummary(alerts = []) {
  const summary = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
  alerts.forEach((a) => {
    const sev = (a.severity || 'info').toLowerCase();
    if (summary[sev] !== undefined) summary[sev]++;
  });
  return summary;
}

/**
 * Records a health snapshot into data/career-os-health-history.json.
 * Skips duplicate snapshots if fingerprint and metrics are unchanged.
 * Enforces max 500 snapshots retention.
 *
 * @param {Object} [options] Options { customData, customHistory, skipSave }
 * @returns {{ recorded: boolean, snapshotId: string|null, reason: string }}
 */
function recordCareerOSHealthSnapshot(options = {}) {
  const report = generateCareerOSHealthReport(options);
  const fingerprint = computeHealthFingerprint(report);
  const alertSummary = computeAlertSummary(report.alerts);

  const history = readHealthHistory(options);
  const snapshots = history.snapshots || [];

  const lastSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  if (lastSnapshot && lastSnapshot.healthFingerprint === fingerprint) {
    return {
      recorded: false,
      snapshotId: lastSnapshot.snapshotId,
      reason: 'UNCHANGED_HEALTH_STATE'
    };
  }

  const snapshotId = `health_${Date.now()}_${snapshots.length + 1}`;
  const newSnapshot = {
    snapshotId,
    generatedAt: report.generatedAt,
    overallStatus: report.overallStatus,
    componentStatuses: {
      process: report.processHealth ? report.processHealth.status : 'UNKNOWN',
      scheduler: report.schedulerHealth ? report.schedulerHealth.status : 'UNKNOWN',
      telegram: report.telegramHealth ? report.telegramHealth.status : 'UNKNOWN',
      discovery: report.discoveryHealth ? report.discoveryHealth.status : 'UNKNOWN',
      application: report.applicationHealth ? report.applicationHealth.status : 'UNKNOWN',
      recovery: report.recoveryHealth ? report.recoveryHealth.status : 'UNKNOWN',
      decision: report.decisionHealth ? report.decisionHealth.status : 'UNKNOWN',
      digest: report.digestHealth ? report.digestHealth.status : 'UNKNOWN',
      dataIntegrity: report.dataIntegrityHealth ? report.dataIntegrityHealth.status : 'UNKNOWN'
    },
    metrics: report.metrics || {},
    alertSummary,
    alerts: (report.alerts || []).map((a) => ({ code: a.code, severity: a.severity, component: a.component })),
    healthFingerprint: fingerprint
  };

  snapshots.push(newSnapshot);

  // Enforce MAX_SNAPSHOTS retention (newest 500)
  if (snapshots.length > MAX_SNAPSHOTS) {
    history.snapshots = snapshots.slice(snapshots.length - MAX_SNAPSHOTS);
  } else {
    history.snapshots = snapshots;
  }

  saveHealthHistory(history, options);

  return {
    recorded: true,
    snapshotId,
    reason: 'RECORDED'
  };
}

/**
 * Returns filtered health history snapshots.
 *
 * @param {string} [period='allTime'] Period: '7d', '30d', '90d', 'allTime'
 * @param {Object} [options] Options { customHistory }
 * @returns {Array<Object>} Filtered snapshot array
 */
function getCareerOSHealthHistory(period = 'allTime', options = {}) {
  const history = readHealthHistory(options);
  const snapshots = history.snapshots || [];

  if (period === 'allTime' || !period) return snapshots;

  const now = Date.now();
  let msLimit = 0;
  if (period === '7d') msLimit = 7 * 24 * 60 * 60 * 1000;
  else if (period === '30d') msLimit = 30 * 24 * 60 * 60 * 1000;
  else if (period === '90d') msLimit = 90 * 24 * 60 * 60 * 1000;

  if (msLimit === 0) return snapshots;

  return snapshots.filter((s) => {
    const t = new Date(s.generatedAt).getTime();
    return !isNaN(t) && (now - t) <= msLimit;
  });
}

/**
 * Detects operational anomalies across health snapshots.
 *
 * @param {Array<Object>} [snapshots] Snapshot list (defaults to allTime history)
 * @param {Object} [options] Options
 * @returns {Array<Object>} Detected anomalies list
 */
function detectCareerOSAnomalies(snapshotsInput, options = {}) {
  const snapshots = snapshotsInput || getCareerOSHealthHistory('allTime', options);
  const anomalies = [];

  if (snapshots.length === 0) return anomalies;

  const current = snapshots[snapshots.length - 1];
  const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;

  // A. HEALTH_REGRESSION
  if (previous && previous.overallStatus === 'HEALTHY' && ['DEGRADED', 'BLOCKED', 'CRITICAL'].includes(current.overallStatus)) {
    anomalies.push({
      code: 'HEALTH_REGRESSION',
      severity: 'HIGH',
      component: 'System',
      message: `System health regressed from ${previous.overallStatus} to ${current.overallStatus}.`,
      evidence: { previousStatus: previous.overallStatus, currentStatus: current.overallStatus },
      recommendedAction: 'Inspect recent alert logs and state changes.'
    });
  }

  // B. CRITICAL_HEALTH_STATE
  if (current.overallStatus === 'CRITICAL') {
    anomalies.push({
      code: 'CRITICAL_HEALTH_STATE',
      severity: 'CRITICAL',
      component: 'System',
      message: 'System is currently operating in CRITICAL health status.',
      evidence: { status: current.overallStatus, alerts: current.alerts },
      recommendedAction: 'Immediate operator intervention required. Inspect critical alerts.'
    });
  }

  // C. RECURRING_ALERT (appears in 3+ snapshots)
  const codeCounts = {};
  snapshots.forEach((s) => {
    (s.alerts || []).forEach((a) => {
      codeCounts[a.code] = (codeCounts[a.code] || 0) + 1;
    });
  });

  Object.keys(codeCounts).forEach((code) => {
    if (codeCounts[code] >= 3) {
      anomalies.push({
        code: 'RECURRING_ALERT',
        severity: 'MEDIUM',
        component: 'Alerts',
        message: `Alert code "${code}" has recurred across ${codeCounts[code]} health snapshots.`,
        evidence: { alertCode: code, occurrenceCount: codeCounts[code] },
        recommendedAction: `Resolve persistent underlying cause for alert code ${code}.`
      });
    }
  });

  // D. REPEATED_AMBIGUOUS_EXECUTION (2+ snapshots)
  let ambiguousCount = 0;
  snapshots.forEach((s) => {
    const amb = s.metrics ? (s.metrics.ambiguousExecutionActions || 0) : 0;
    if (amb > 0) ambiguousCount++;
  });

  if (ambiguousCount >= 2) {
    anomalies.push({
      code: 'REPEATED_AMBIGUOUS_EXECUTION',
      severity: 'HIGH',
      component: 'Recovery',
      message: `Ambiguous execution actions detected in ${ambiguousCount} snapshots.`,
      evidence: { snapshotsAffected: ambiguousCount },
      recommendedAction: 'Manually inspect interrupted application records and update state.'
    });
  }

  // E. APPLICATION_QUEUE_GROWTH (>= 50% increase across 3+ snapshots & min +5)
  if (snapshots.length >= 3) {
    const s1 = snapshots[snapshots.length - 3].metrics ? (snapshots[snapshots.length - 3].metrics.pendingDecisionActions || 0) : 0;
    const sCurrent = current.metrics ? (current.metrics.pendingDecisionActions || 0) : 0;
    const absDiff = sCurrent - s1;
    const pctInc = s1 > 0 ? (absDiff / s1) : (sCurrent > 0 ? 1 : 0);

    if (absDiff >= 5 && pctInc >= 0.5) {
      anomalies.push({
        code: 'APPLICATION_QUEUE_GROWTH',
        severity: 'MEDIUM',
        component: 'ApplicationQueue',
        message: `Pending decision workload grew by ${Math.round(pctInc * 100)}% (${absDiff} items) across recent snapshots.`,
        evidence: { initialWorkload: s1, currentWorkload: sCurrent, growthAmount: absDiff },
        recommendedAction: 'Review and clear pending decision queue recommendations.'
      });
    }
  }

  // F. DISCOVERY_VOLUME_DROP (>= 50% drop across 3+ snapshots, min previous 10)
  if (snapshots.length >= 3) {
    const d1 = snapshots[snapshots.length - 3].metrics ? (snapshots[snapshots.length - 3].metrics.jobsDiscovered || 0) : 0;
    const dCurrent = current.metrics ? (current.metrics.jobsDiscovered || 0) : 0;

    if (d1 >= 10) {
      const dropPct = (d1 - dCurrent) / d1;
      if (dropPct >= 0.5) {
        anomalies.push({
          code: 'DISCOVERY_VOLUME_DROP',
          severity: 'HIGH',
          component: 'Discovery',
          message: `Discovered job volume dropped by ${Math.round(dropPct * 100)}% (${d1} -> ${dCurrent}) across snapshots.`,
          evidence: { previousJobs: d1, currentJobs: dCurrent, dropPercentage: Math.round(dropPct * 100) },
          recommendedAction: 'Inspect job search scrapers and Naukri connectivity.'
        });
      }
    }
  }

  // G. HEALTH_STATUS_FLAPPING (Status alternates across 4+ snapshots)
  if (snapshots.length >= 4) {
    let flips = 0;
    for (let i = snapshots.length - 1; i > snapshots.length - 4; i--) {
      if (snapshots[i].overallStatus !== snapshots[i - 1].overallStatus) {
        flips++;
      }
    }
    if (flips >= 3) {
      anomalies.push({
        code: 'HEALTH_STATUS_FLAPPING',
        severity: 'HIGH',
        component: 'System',
        message: `Health status is flapping rapidly (${flips} state transitions across last 4 snapshots).`,
        evidence: { transitionCount: flips },
        recommendedAction: 'Inspect unstable component health conditions.'
      });
    }
  }

  // H. COMPONENT_REPEATED_DEGRADATION (Component degraded in 3+ snapshots)
  const compDegCounts = {};
  snapshots.forEach((s) => {
    if (s.componentStatuses) {
      Object.keys(s.componentStatuses).forEach((comp) => {
        const status = s.componentStatuses[comp];
        if (['DEGRADED', 'BLOCKED', 'CRITICAL'].includes(status)) {
          compDegCounts[comp] = (compDegCounts[comp] || 0) + 1;
        }
      });
    }
  });

  Object.keys(compDegCounts).forEach((comp) => {
    if (compDegCounts[comp] >= 3) {
      anomalies.push({
        code: 'COMPONENT_REPEATED_DEGRADATION',
        severity: 'HIGH',
        component: comp,
        message: `Component "${comp}" has remained degraded in ${compDegCounts[comp]} snapshots.`,
        evidence: { component: comp, occurrenceCount: compDegCounts[comp] },
        recommendedAction: `Inspect and rectify persistent faults in component ${comp}.`
      });
    }
  });

  return anomalies;
}

/**
 * Generates comprehensive operational health trend analytics.
 *
 * @param {string} [period='allTime'] Period: '7d', '30d', '90d', 'allTime'
 * @param {Object} [options] Options { customHistory }
 * @returns {Object} Trend report
 */
function generateCareerOSHealthTrendReport(period = 'allTime', options = {}) {
  const snapshots = getCareerOSHealthHistory(period, options);
  const totalSnapshots = snapshots.length;

  if (totalSnapshots === 0) {
    return {
      period,
      currentStatus: 'UNKNOWN',
      previousStatus: 'UNKNOWN',
      statusChange: 'NO_DATA',
      totalSnapshots: 0,
      healthStabilityPercentage: 100,
      statusDistribution: { HEALTHY: 0, DEGRADED: 0, BLOCKED: 0, CRITICAL: 0 },
      alertDistribution: { info: 0, low: 0, medium: 0, high: 0, critical: 0 },
      recurringAlerts: [],
      componentTrends: {},
      anomalies: []
    };
  }

  const current = snapshots[snapshots.length - 1];
  const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;

  const currentStatus = current.overallStatus;
  const previousStatus = previous ? previous.overallStatus : currentStatus;
  const statusChange = currentStatus === previousStatus ? 'STABLE' : `${previousStatus}_TO_${currentStatus}`;

  const statusDistribution = { HEALTHY: 0, DEGRADED: 0, BLOCKED: 0, CRITICAL: 0 };
  const alertDistribution = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
  const alertCodeCounts = {};
  const componentDegradations = {};

  let healthyCount = 0;

  snapshots.forEach((s) => {
    if (statusDistribution[s.overallStatus] !== undefined) {
      statusDistribution[s.overallStatus]++;
    }
    if (s.overallStatus === 'HEALTHY') healthyCount++;

    if (s.alertSummary) {
      Object.keys(s.alertSummary).forEach((k) => {
        alertDistribution[k] = (alertDistribution[k] || 0) + (s.alertSummary[k] || 0);
      });
    }

    (s.alerts || []).forEach((a) => {
      alertCodeCounts[a.code] = (alertCodeCounts[a.code] || 0) + 1;
    });

    if (s.componentStatuses) {
      Object.keys(s.componentStatuses).forEach((comp) => {
        const st = s.componentStatuses[comp];
        if (['DEGRADED', 'BLOCKED', 'CRITICAL'].includes(st)) {
          componentDegradations[comp] = (componentDegradations[comp] || 0) + 1;
        }
      });
    }
  });

  const healthStabilityPercentage = Math.round((healthyCount / totalSnapshots) * 100);

  const recurringAlerts = Object.keys(alertCodeCounts)
    .filter((code) => alertCodeCounts[code] >= 2)
    .map((code) => ({ code, occurrences: alertCodeCounts[code] }));

  const anomalies = detectCareerOSAnomalies(snapshots, options);

  return {
    period,
    currentStatus,
    previousStatus,
    statusChange,
    totalSnapshots,
    healthySnapshots: healthyCount,
    degradedSnapshots: statusDistribution.DEGRADED,
    blockedSnapshots: statusDistribution.BLOCKED,
    criticalSnapshots: statusDistribution.CRITICAL,
    healthStabilityPercentage,
    statusDistribution,
    alertDistribution,
    recurringAlerts,
    componentTrends: componentDegradations,
    anomalies
  };
}

module.exports = {
  recordCareerOSHealthSnapshot,
  getCareerOSHealthHistory,
  generateCareerOSHealthTrendReport,
  detectCareerOSAnomalies,
  computeHealthFingerprint,
  HISTORY_FILE_PATH
};

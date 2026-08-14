const fs = require('fs');
const path = require('path');

const HISTORY_PATH = path.resolve(__dirname, '../../data/application-history.json');
const OUTCOMES_PATH = path.resolve(__dirname, '../../data/application-outcomes.json');
const QUEUE_PATH = path.resolve(__dirname, '../../data/application-queue.json');
const DECISION_ACTIONS_PATH = path.resolve(__dirname, '../../data/career-decision-actions.json');
const FOLLOWUP_PATH = path.resolve(__dirname, '../../data/followup-history.json');

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) || [];
  } catch (_) {
    return [];
  }
}

/**
 * Reconciles all application state stores into a single canonical view per tracked application.
 * Detects cross-store inconsistencies without mutating production files.
 *
 * @param {Object} [options] Options { customData }
 * @returns {{ generatedAt: string, totalTracked: number, consistentCount: number, inconsistentCount: number, items: Array<Object> }}
 */
function reconcileApplicationLifecycle(options = {}) {
  const custom = options.customData;
  const isCustom = !!custom;

  const history = isCustom ? (custom.history || []) : readJsonArray(HISTORY_PATH);
  const outcomes = isCustom ? (custom.outcomes || []) : readJsonArray(OUTCOMES_PATH);
  const queue = isCustom ? (custom.queue || []) : readJsonArray(QUEUE_PATH);
  const decisionActions = isCustom ? (custom.decisionActions || []) : readJsonArray(DECISION_ACTIONS_PATH);
  const followups = isCustom ? (custom.followups || []) : readJsonArray(FOLLOWUP_PATH);

  const appMap = new Map();

  function getOrCreateApp(id, fallback = {}) {
    if (!id) return null;
    if (!appMap.has(id)) {
      appMap.set(id, {
        applicationId: id,
        jobId: fallback.jobId || id,
        jobUrl: fallback.jobUrl || null,
        company: fallback.company || 'Unknown Company',
        role: fallback.role || fallback.title || 'Unknown Role',
        historyStatus: null,
        outcomeStatus: null,
        decisionStatus: null,
        executionStatus: null,
        followupStatus: null,
        canonicalStatus: 'UNKNOWN',
        consistencyStatus: 'CONSISTENT',
        inconsistencies: []
      });
    }
    const record = appMap.get(id);
    if (!record.jobUrl && fallback.jobUrl) record.jobUrl = fallback.jobUrl;
    if (record.company === 'Unknown Company' && fallback.company) record.company = fallback.company;
    if (record.role === 'Unknown Role' && (fallback.role || fallback.title)) record.role = fallback.role || fallback.title;
    return record;
  }

  // 1. Process History
  history.forEach((h) => {
    if (!h) return;
    const appId = h.applicationId || h.jobId;
    const rec = getOrCreateApp(appId, h);
    if (rec) rec.historyStatus = (h.status || '').toUpperCase();
  });

  // 2. Process Outcomes
  outcomes.forEach((o) => {
    if (!o) return;
    const appId = o.applicationId || o.jobId;
    const rec = getOrCreateApp(appId, o);
    if (rec) rec.outcomeStatus = (o.currentStatus || o.status || '').toUpperCase();
  });

  // 3. Process Queue
  queue.forEach((q) => {
    if (!q) return;
    const appId = q.applicationId || q.jobId;
    const rec = getOrCreateApp(appId, q);
    if (rec && !rec.historyStatus && !rec.outcomeStatus) {
      rec.outcomeStatus = 'QUEUED';
    }
  });

  // 4. Process Decision Actions
  decisionActions.forEach((d) => {
    if (!d) return;
    const appId = d.executionApplicationId || d.applicationId || d.jobId;
    const rec = getOrCreateApp(appId, d);
    if (rec) {
      rec.decisionStatus = d.decisionStatus || null;
      rec.executionStatus = d.executionStatus || null;
    }
  });

  // 5. Process Followups
  followups.forEach((f) => {
    if (!f) return;
    const appId = f.applicationId || f.jobId;
    const rec = getOrCreateApp(appId, f);
    if (rec) {
      rec.followupStatus = (f.status || 'ACTIVE').toUpperCase();
    }
  });

  let consistentCount = 0;
  let inconsistentCount = 0;

  const items = Array.from(appMap.values()).map((rec) => {
    const inconsistencies = [];

    // Check History vs Outcome Status Match
    if (rec.historyStatus && rec.outcomeStatus && rec.historyStatus !== rec.outcomeStatus) {
      inconsistencies.push(`STATUS_MISMATCH (History: ${rec.historyStatus} vs Outcome: ${rec.outcomeStatus})`);
    }

    // Check Missing Outcome
    if (rec.historyStatus && !rec.outcomeStatus) {
      inconsistencies.push('MISSING_OUTCOME_RECORD');
    }

    // Check Missing History for Submitted Job
    if (rec.outcomeStatus === 'SUBMITTED' && !rec.historyStatus) {
      inconsistencies.push('MISSING_HISTORY_RECORD');
    }

    // Determine Canonical Status
    rec.canonicalStatus = (rec.executionStatus === 'EXECUTED' ? 'SUBMITTED' : null) || rec.outcomeStatus || rec.historyStatus || 'REGISTERED';
    rec.inconsistencies = inconsistencies;
    rec.consistencyStatus = inconsistencies.length === 0 ? 'CONSISTENT' : 'INCONSISTENT';

    if (rec.consistencyStatus === 'CONSISTENT') {
      consistentCount++;
    } else {
      inconsistentCount++;
    }

    return rec;
  });

  return {
    generatedAt: new Date().toISOString(),
    totalTracked: items.length,
    consistentCount,
    inconsistentCount,
    items
  };
}

module.exports = {
  reconcileApplicationLifecycle
};

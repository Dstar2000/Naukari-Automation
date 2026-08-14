'use strict';

/**
 * P3.53 — Read-Only Career Intelligence & Performance Analytics Engine
 */

const fs   = require('fs');
const path = require('path');

const DEFAULT_QUEUE_PATH     = path.resolve(__dirname, '../../data/application-queue.json');
const DEFAULT_OUTCOMES_PATH  = path.resolve(__dirname, '../../data/application-outcomes.json');
const DEFAULT_DECISIONS_PATH = path.resolve(__dirname, '../../data/job-decisions.json');
const DEFAULT_HISTORY_PATH   = path.resolve(__dirname, '../../data/application-history.json');

/**
 * Helper to identify synthetic or test records.
 */
function isSyntheticTestRecord(item) {
  if (!item) return true;
  const str = JSON.stringify(item).toLowerCase();
  if (str.includes('test123') || str.includes('test-123') || str.includes('fixture') || str.includes('fake-id')) {
    return true;
  }
  const url = item.jobUrl || '';
  if (url && !url.includes('naukri.com/job-listings-')) {
    return true;
  }
  return false;
}

/**
 * Safely reads JSON files without mutating anything on disk.
 */
function readJsonFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      return content ? JSON.parse(content) : [];
    }
  } catch (err) {
    // Fail-safe read-only mode
  }
  return [];
}

/**
 * Calculates overview metrics for real jobs.
 */
function calculateApplicationOverview(queue = [], outcomes = [], decisions = [], history = []) {
  const realQueue = queue.filter(q => !isSyntheticTestRecord(q));

  let submittedCount = 0;
  let verifiedAppliedCount = 0;
  let externalCount = 0;
  let alreadyAppliedCount = 0;
  let pendingManualCount = 0;
  let autonomousEligibleCount = 0;

  realQueue.forEach(job => {
    const id = job.jobId || job.applicationId;
    const url = job.jobUrl;
    const outcome = outcomes.find(o => o && (o.jobId === id || o.jobUrl === url));

    const status = (job.status || '').toUpperCase();
    const applyType = (job.applyType || '').toUpperCase();
    const verStatus = (job.verificationStatus || (outcome ? outcome.verificationStatus : '') || '').toUpperCase();

    if (verStatus === 'VERIFIED_APPLIED' || status === 'SUBMITTED') {
      submittedCount++;
      if (verStatus === 'VERIFIED_APPLIED' || (outcome && outcome.verificationStatus === 'VERIFIED_APPLIED')) {
        verifiedAppliedCount++;
      }
      alreadyAppliedCount++;
    } else if (status === 'EXTERNAL_APPLICATION_REQUIRED' || applyType === 'EXTERNAL_APPLICATION_REQUIRED') {
      externalCount++;
    } else if (status === 'MANUAL_REQUIRED') {
      pendingManualCount++;
    } else if (status === 'QUEUED' && applyType === 'EASY_APPLY') {
      autonomousEligibleCount++;
    }
  });

  return {
    totalRealJobsTracked: realQueue.length,
    submittedCount,
    verifiedAppliedCount,
    externalApplicationRequiredCount: externalCount,
    alreadyAppliedCount,
    pendingManualCount,
    autonomousEligibleCount
  };
}

/**
 * Helper to determine effective verification status combining queue and outcome stores.
 */
function getEffectiveVerificationStatus(q, outcome) {
  const qVer = (q.verificationStatus || '').toUpperCase();
  const oVer = (outcome && outcome.verificationStatus || '').toUpperCase();
  const qStat = (q.status || '').toUpperCase();

  if (oVer === 'VERIFIED_APPLIED' || qVer === 'VERIFIED_APPLIED') {
    return 'VERIFIED_APPLIED';
  }
  if (qStat === 'EXTERNAL_APPLICATION_REQUIRED' || (q.applyType || '').toUpperCase() === 'EXTERNAL_APPLICATION_REQUIRED') {
    return 'NOT_VERIFIED';
  }
  return qVer || 'NOT_VERIFIED';
}

/**
 * Calculates safety metrics.
 */
function calculateSafetyMetrics(queue = [], outcomes = [], decisions = [], history = []) {
  const realQueue = queue.filter(q => !isSyntheticTestRecord(q));
  const realOutcomes = outcomes.filter(o => !isSyntheticTestRecord(o));

  let externalBlocked = 0;
  let duplicatePrevented = 0;
  let verificationFailures = 0;
  let reconciliationEvents = 0;

  realQueue.forEach(job => {
    const id = job.jobId || job.applicationId;
    const outcome = realOutcomes.find(o => o && (o.jobId === id || o.jobUrl === job.jobUrl));
    const status = (job.status || '').toUpperCase();
    const applyType = (job.applyType || '').toUpperCase();
    const verStatus = getEffectiveVerificationStatus(job, outcome);

    if (status === 'EXTERNAL_APPLICATION_REQUIRED' || applyType === 'EXTERNAL_APPLICATION_REQUIRED') {
      externalBlocked++;
      reconciliationEvents++;
    }
    if (status === 'SUBMITTED' || status === 'ALREADY_APPLIED') {
      duplicatePrevented++;
    }
    if (verStatus === 'VERIFICATION_ERROR') {
      verificationFailures++;
    }
  });

  return {
    blockedApplicationCount: externalBlocked + duplicatePrevented,
    externalApplicationsBlocked: externalBlocked,
    duplicateApplicationsPrevented: duplicatePrevented,
    submissionAttempts: realOutcomes.length > 0 ? 1 : 0,
    actualSubmissions: realOutcomes.filter(o => (o.currentStatus || o.status) === 'SUBMITTED').length,
    verificationFailures,
    reconciliationEvents
  };
}

/**
 * Calculates outcome metrics.
 */
function calculateOutcomeMetrics(outcomes = []) {
  const realOutcomes = outcomes.filter(o => !isSyntheticTestRecord(o));
  const summary = {
    SUBMITTED: 0,
    VERIFIED_APPLIED: 0,
    EXTERNAL_APPLICATION_REQUIRED: 0,
    MANUAL_REQUIRED: 0
  };

  realOutcomes.forEach(o => {
    const st = (o.currentStatus || o.status || 'UNKNOWN').toUpperCase();
    if (summary[st] !== undefined) {
      summary[st]++;
    } else {
      summary[st] = 1;
    }
    if ((o.verificationStatus || '').toUpperCase() === 'VERIFIED_APPLIED') {
      summary.VERIFIED_APPLIED++;
    }
  });

  return summary;
}

/**
 * Calculates classification metrics.
 */
function calculateClassificationMetrics(queue = []) {
  const realQueue = queue.filter(q => !isSyntheticTestRecord(q));
  const dist = {
    EASY_APPLY: 0,
    EXTERNAL_APPLICATION_REQUIRED: 0,
    ALREADY_APPLIED: 0
  };

  realQueue.forEach(q => {
    const st = (q.status || '').toUpperCase();
    const at = (q.applyType || '').toUpperCase();

    if (st === 'SUBMITTED' || st === 'ALREADY_APPLIED') {
      dist.ALREADY_APPLIED++;
    } else if (st === 'EXTERNAL_APPLICATION_REQUIRED' || at === 'EXTERNAL_APPLICATION_REQUIRED') {
      dist.EXTERNAL_APPLICATION_REQUIRED++;
    } else {
      dist.EASY_APPLY++;
    }
  });

  return dist;
}

/**
 * Calculates verification metrics.
 */
function calculateVerificationMetrics(queue = [], outcomes = []) {
  const realQueue = queue.filter(q => !isSyntheticTestRecord(q));
  const ver = {
    VERIFIED_APPLIED: 0,
    NOT_VERIFIED: 0,
    VERIFICATION_ERROR: 0
  };

  realQueue.forEach(q => {
    const id = q.jobId || q.applicationId;
    const outcome = (outcomes || []).find(o => o && (o.jobId === id || o.jobUrl === q.jobUrl));
    const vs = getEffectiveVerificationStatus(q, outcome);
    if (ver[vs] !== undefined) {
      ver[vs]++;
    } else {
      ver.NOT_VERIFIED++;
    }
  });

  return ver;
}

/**
 * Calculates metrics by company.
 */
function calculateCompanyMetrics(queue = []) {
  const realQueue = queue.filter(q => !isSyntheticTestRecord(q));
  const map = {};

  realQueue.forEach(q => {
    const comp = q.company || 'Unknown';
    if (!map[comp]) {
      map[comp] = { company: comp, total: 0, external: 0, submitted: 0 };
    }
    map[comp].total++;
    const st = (q.status || '').toUpperCase();
    if (st === 'EXTERNAL_APPLICATION_REQUIRED' || (q.applyType || '').toUpperCase() === 'EXTERNAL_APPLICATION_REQUIRED') {
      map[comp].external++;
    }
    if (st === 'SUBMITTED') {
      map[comp].submitted++;
    }
  });

  return Object.values(map).sort((a, b) => b.total - a.total);
}

/**
 * Calculates metrics by role/title.
 */
function calculateRoleMetrics(queue = []) {
  const realQueue = queue.filter(q => !isSyntheticTestRecord(q));
  const map = {};

  realQueue.forEach(q => {
    const role = q.title || q.role || 'Unknown';
    if (!map[role]) {
      map[role] = { role, total: 0, external: 0, submitted: 0 };
    }
    map[role].total++;
    const st = (q.status || '').toUpperCase();
    if (st === 'EXTERNAL_APPLICATION_REQUIRED' || (q.applyType || '').toUpperCase() === 'EXTERNAL_APPLICATION_REQUIRED') {
      map[role].external++;
    }
    if (st === 'SUBMITTED') {
      map[role].submitted++;
    }
  });

  return Object.values(map).sort((a, b) => b.total - a.total);
}

/**
 * Generates full Career Performance Report.
 */
function generateCareerPerformanceReport(options = {}) {
  const queuePath     = options.queuePath     || DEFAULT_QUEUE_PATH;
  const outcomesPath  = options.outcomesPath  || DEFAULT_OUTCOMES_PATH;
  const decisionsPath = options.decisionsPath || DEFAULT_DECISIONS_PATH;
  const historyPath   = options.historyPath   || DEFAULT_HISTORY_PATH;

  const queue     = readJsonFile(queuePath);
  const outcomes  = readJsonFile(outcomesPath);
  const decisions = readJsonFile(decisionsPath);
  const history   = readJsonFile(historyPath);

  return {
    generatedAt: new Date().toISOString(),
    source: {
      queue: queuePath,
      outcomes: outcomesPath,
      decisions: decisionsPath,
      history: historyPath
    },
    overview: calculateApplicationOverview(queue, outcomes, decisions, history),
    safety: calculateSafetyMetrics(queue, outcomes, decisions, history),
    outcomes: calculateOutcomeMetrics(outcomes),
    classifications: calculateClassificationMetrics(queue),
    verification: calculateVerificationMetrics(queue, outcomes),
    companies: calculateCompanyMetrics(queue),
    roles: calculateRoleMetrics(queue)
  };
}

module.exports = {
  isSyntheticTestRecord,
  calculateApplicationOverview,
  calculateSafetyMetrics,
  calculateOutcomeMetrics,
  calculateClassificationMetrics,
  calculateVerificationMetrics,
  calculateCompanyMetrics,
  calculateRoleMetrics,
  generateCareerPerformanceReport
};

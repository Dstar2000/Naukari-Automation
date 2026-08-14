const path = require('path');
const fs = require('fs');
const { getJobId } = require('../telegram/job.approval');

const OUTCOMES_PATH = path.resolve(__dirname, '../../data/application-outcomes.json');
const HISTORY_PATH = path.resolve(__dirname, '../../data/application-history.json');
const QUEUE_PATH = path.resolve(__dirname, '../../data/application-queue.json');
const DECISIONS_PATH = path.resolve(__dirname, '../../data/job-decisions.json');

const ENGAGED_STATUSES = [
  'QUEUED',
  'APPROVED',
  'WAITING_CONFIRMATION',
  'SUBMITTED',
  'ALREADY_APPLIED',
  'EXTERNAL_APPLICATION_REQUIRED',
  'MANUAL_REQUIRED',
  'SHORTLISTED',
  'TECHNICAL_ROUND',
  'OFFER'
];

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) || [];
  } catch (_) {
    return [];
  }
}

/**
 * Authoritative Unified Duplicate Application Guard:
 * Checks whether a job has already been recommended, approved, queued, or submitted.
 * Scans application-outcomes.json, application-history.json, application-queue.json, and job-decisions.json.
 * Matches on exact jobUrl, jobId, or applicationId.
 *
 * @param {Object|string} jobOrUrl Job object or raw jobUrl string
 * @param {Object} [options] Options { includeDecisions: true }
 * @returns {{ engaged: boolean, reason?: string, status?: string, matchedStore?: string }}
 */
function isApplicationAlreadyEngaged(jobOrUrl, options = {}) {
  if (!jobOrUrl) {
    return { engaged: false, reason: 'INVALID_INPUT' };
  }

  const jobObj = typeof jobOrUrl === 'string' ? { jobUrl: jobOrUrl } : jobOrUrl;
  const url = (jobObj.jobUrl || '').trim();
  const targetId = jobObj.applicationId || jobObj.jobId || (url ? getJobId(url) : null);
  const company = (jobObj.company || '').toLowerCase().trim();
  const role = (jobObj.role || jobObj.title || '').toLowerCase().trim();

  if (!url && !targetId && (!company || !role)) {
    return { engaged: false, reason: 'NO_IDENTIFIER' };
  }

  // 1. Check application-outcomes
  const outcomes = options.customData ? (options.customData.outcomes || []) : readJsonArray(OUTCOMES_PATH);
  for (const o of outcomes) {
    if (!o) continue;
    const oUrl = (o.jobUrl || '').trim();
    const oId = o.applicationId || o.jobId || (oUrl ? getJobId(oUrl) : null);
    const oStatus = (o.currentStatus || o.status || '').toUpperCase();

    const matchUrl = url && oUrl && url === oUrl;
    const matchId = targetId && oId && targetId === oId;
    const matchCompRole = company && role && o.company && o.role &&
      o.company.toLowerCase().trim() === company &&
      (o.role || o.title || '').toLowerCase().trim() === role;

    if ((matchUrl || matchId || matchCompRole) && ENGAGED_STATUSES.includes(oStatus)) {
      return {
        engaged: true,
        reason: `Already engaged in application-outcomes.json (Status: ${oStatus})`,
        status: oStatus,
        matchedStore: 'application-outcomes.json'
      };
    }
  }

  // 2. Check application-history
  const history = options.customData ? (options.customData.history || []) : readJsonArray(HISTORY_PATH);
  for (const h of history) {
    if (!h) continue;
    const hUrl = (h.jobUrl || '').trim();
    const hId = h.applicationId || h.jobId || (hUrl ? getJobId(hUrl) : null);
    const hStatus = (h.status || '').toUpperCase();

    const matchUrl = url && hUrl && url === hUrl;
    const matchId = targetId && hId && targetId === hId;
    const matchCompRole = company && role && h.company && h.role &&
      h.company.toLowerCase().trim() === company &&
      (h.role || h.title || '').toLowerCase().trim() === role;

    if ((matchUrl || matchId || matchCompRole) && ENGAGED_STATUSES.includes(hStatus)) {
      return {
        engaged: true,
        reason: `Already engaged in application-history.json (Status: ${hStatus})`,
        status: hStatus,
        matchedStore: 'application-history.json'
      };
    }
  }

  // 3. Check application-queue
  if (options.includeQueue !== false) {
    const queue = options.customData ? (options.customData.queue || []) : readJsonArray(QUEUE_PATH);
    for (const q of queue) {
      if (!q) continue;
      const qUrl = (q.jobUrl || '').trim();
      const qId = q.applicationId || q.jobId || (qUrl ? getJobId(qUrl) : null);

      const matchUrl = url && qUrl && url === qUrl;
      const matchId = targetId && qId && targetId === qId;

      if (matchUrl || matchId) {
        return {
          engaged: true,
          reason: 'Already queued in application-queue.json',
          status: 'QUEUED',
          matchedStore: 'application-queue.json'
        };
      }
    }
  }

  // 4. Check job-decisions (if enabled)
  if (options.includeDecisions !== false) {
    const decisions = options.customData ? (options.customData.jobDecisions || options.customData.decisions || []) : readJsonArray(DECISIONS_PATH);
    for (const d of decisions) {
      if (!d) continue;
      const dUrl = (d.jobUrl || '').trim();
      const dId = d.jobId || (dUrl ? getJobId(dUrl) : null);

      const matchUrl = url && dUrl && url === dUrl;
      const matchId = targetId && dId && targetId === dId;

      if ((matchUrl || matchId) && (d.decision === 'approved' || d.decision === 'approved_all' || d.decision === 'rejected')) {
        return {
          engaged: true,
          reason: `Job decision already recorded (${d.decision})`,
          status: d.decision.toUpperCase(),
          matchedStore: 'job-decisions.json'
        };
      }
    }
  }

  // 5. Check career-decision-actions
  const decisionActions = options.customData ? (options.customData.decisionActions || []) : readJsonArray(path.resolve(__dirname, '../../data/career-decision-actions.json'));
  for (const da of decisionActions) {
    if (!da) continue;
    const daUrl = (da.jobUrl || '').trim();
    const daId = da.executionApplicationId || da.applicationId || da.jobId || (daUrl ? getJobId(daUrl) : null);
    const daStatus = (da.executionStatus || '').toUpperCase();

    const matchUrl = url && daUrl && url === daUrl;
    const matchId = targetId && daId && targetId === daId;

    if ((matchUrl || matchId) && ['EXECUTED', 'EXECUTING', 'EXECUTION_AUTHORIZED'].includes(daStatus)) {
      return {
        engaged: true,
        reason: `Already executed in career-decision-actions.json (Status: ${daStatus})`,
        status: daStatus,
        matchedStore: 'career-decision-actions.json'
      };
    }
  }

  return { engaged: false };
}

module.exports = {
  isApplicationAlreadyEngaged,
  ENGAGED_STATUSES,
  OUTCOMES_PATH,
  HISTORY_PATH,
  QUEUE_PATH,
  DECISIONS_PATH
};

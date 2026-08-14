const path = require('path');
const fs = require('fs');
const { getJobId } = require('../telegram/job.approval');

const OUTCOMES_FILE_PATH = path.resolve(__dirname, '../../data/application-outcomes.json');
const HISTORY_FILE_PATH = path.resolve(__dirname, '../../data/application-history.json');

const OUTCOME_STATUSES = {
  APPLIED: 'APPLIED',
  SHORTLISTED: 'SHORTLISTED',
  INTERVIEW_SCHEDULED: 'INTERVIEW_SCHEDULED',
  TECHNICAL_ROUND: 'TECHNICAL_ROUND',
  HR_ROUND: 'HR_ROUND',
  OFFER: 'OFFER',
  REJECTED: 'REJECTED',
  NO_RESPONSE: 'NO_RESPONSE'
};

const STATUS_RANKS = {
  APPLIED: 1,
  SHORTLISTED: 2,
  INTERVIEW_SCHEDULED: 3,
  TECHNICAL_ROUND: 4,
  HR_ROUND: 5,
  OFFER: 6,
  REJECTED: 7,
  NO_RESPONSE: 7
};

/**
 * Validates state transition rules for outcome state machine.
 * Prevents invalid rewinds like OFFER -> APPLIED or REJECTED -> TECHNICAL_ROUND.
 * @param {string} currentStatus 
 * @param {string} newStatus 
 * @returns {boolean}
 */
function isValidTransition(currentStatus, newStatus) {
  if (!currentStatus || currentStatus === newStatus) return true;

  // Terminal states cannot transition to active states
  if (['OFFER', 'REJECTED', 'NO_RESPONSE'].includes(currentStatus)) {
    return false;
  }

  // Terminal state transitions from active states are always allowed
  if (['REJECTED', 'NO_RESPONSE'].includes(newStatus)) {
    return true;
  }

  const currentRank = STATUS_RANKS[currentStatus] || 1;
  const newRank = STATUS_RANKS[newStatus] || 1;

  // Disallow rewinds
  return newRank >= currentRank;
}

/**
 * Migrates old schema outcome item to current schema cleanly while retaining status property alias.
 * @param {Object} item 
 * @returns {Object}
 */
function migrateOutcomeSchema(item) {
  if (!item) return item;
  const currStatus = item.currentStatus || item.status || OUTCOME_STATUSES.APPLIED;
  const timestamp = item.updatedAt || new Date().toISOString();

  let history = Array.isArray(item.history) ? item.history : [];
  if (history.length === 0) {
    history.push({
      status: currStatus,
      timestamp
    });
  }

  return {
    applicationId: item.applicationId || (item.jobUrl ? getJobId(item.jobUrl) : `app_${Date.now()}`),
    company: item.company || '',
    role: item.role || item.title || '',
    jobUrl: item.jobUrl || '',
    currentStatus: currStatus,
    status: currStatus, // Backwards compatibility alias
    updatedAt: timestamp,
    notes: item.notes || '',
    history
  };
}

/**
 * Reads data/application-outcomes.json safely with automatic schema migration.
 * @returns {Array<Object>}
 */
function getOutcomes() {
  if (!fs.existsSync(OUTCOMES_FILE_PATH)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(OUTCOMES_FILE_PATH, 'utf-8')) || [];
    if (!Array.isArray(raw)) return [];
    return raw.map(migrateOutcomeSchema);
  } catch (_) {
    return [];
  }
}

/**
 * Finds outcome entry for a job by jobUrl or applicationId.
 * @param {string} identifier jobUrl or applicationId
 * @returns {Object|null}
 */
function getOutcomeByJob(identifier) {
  if (!identifier) return null;
  const outcomes = getOutcomes();
  return (
    outcomes.find(
      (o) => o.jobUrl === identifier || o.applicationId === identifier || (o.jobUrl && getJobId(o.jobUrl) === identifier)
    ) || null
  );
}

/**
 * Records or updates an application outcome in data/application-outcomes.json with state validation and history preservation.
 * @param {Object} job Job object
 * @param {string} status Status string
 * @param {string} [notes] Optional notes
 * @returns {{ success: boolean, reason?: string, entry?: Object }}
 */
function recordOutcome(job, status, notes = '') {
  if (!job) return { success: false, reason: 'INVALID_JOB_OBJECT' };

  const outcomes = getOutcomes();
  const appId = job.applicationId || (job.jobUrl ? getJobId(job.jobUrl) : `app_${Date.now()}`);
  const existing = outcomes.find(
    (o) => (o.jobUrl && job.jobUrl && o.jobUrl === job.jobUrl) || o.applicationId === appId
  );

  const newStatus = status || OUTCOME_STATUSES.APPLIED;

  if (existing) {
    if (!isValidTransition(existing.currentStatus, newStatus)) {
      console.warn(`Invalid state transition blocked: ${existing.currentStatus} -> ${newStatus}`);
      return {
        success: false,
        reason: 'INVALID_STATUS_TRANSITION'
      };
    }
  }

  const timestamp = job.updatedAt || new Date().toISOString();
  const historyEntry = { status: newStatus, timestamp };

  let entry;
  if (existing) {
    existing.currentStatus = newStatus;
    existing.status = newStatus;
    existing.updatedAt = timestamp;
    if (notes) existing.notes = notes;
    if (!existing.history) existing.history = [];
    existing.history.push(historyEntry);
    entry = existing;
  } else {
    entry = {
      applicationId: appId,
      company: job.company || '',
      role: job.role || job.title || '',
      jobUrl: job.jobUrl || '',
      currentStatus: newStatus,
      status: newStatus,
      updatedAt: timestamp,
      notes: notes || '',
      history: [historyEntry]
    };
    outcomes.push(entry);
  }

  const dir = path.dirname(OUTCOMES_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(OUTCOMES_FILE_PATH, JSON.stringify(outcomes, null, 2), 'utf-8');

  return {
    success: true,
    entry
  };
}

/**
 * Aggregates accurate statistics summary of outcomes.
 * @returns {Object}
 */
function getOutcomeStats() {
  const outcomes = getOutcomes();

  let history = [];
  if (fs.existsSync(HISTORY_FILE_PATH)) {
    try {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE_PATH, 'utf-8')) || [];
    } catch (_) {}
  }

  const submittedApps = history.filter((h) => h.status === 'SUBMITTED');
  const totalApplications = Math.max(submittedApps.length, outcomes.length);

  const activeInterviews = outcomes.filter((o) =>
    ['SHORTLISTED', 'INTERVIEW_SCHEDULED', 'TECHNICAL_ROUND', 'HR_ROUND'].includes(o.currentStatus)
  ).length;

  const uniqueInterviewApps = outcomes.filter((o) =>
    ['SHORTLISTED', 'INTERVIEW_SCHEDULED', 'TECHNICAL_ROUND', 'HR_ROUND', 'OFFER'].includes(o.currentStatus)
  ).length;

  const offers = outcomes.filter((o) => o.currentStatus === 'OFFER').length;
  const rejections = outcomes.filter((o) => o.currentStatus === 'REJECTED').length;
  const noResponse = outcomes.filter((o) => o.currentStatus === 'NO_RESPONSE').length;

  const respondedApps = outcomes.filter((o) => o.currentStatus !== 'APPLIED');
  const responseCount = respondedApps.length;

  const interviewRate = totalApplications > 0 ? `${Math.round((uniqueInterviewApps / totalApplications) * 100)}%` : '0%';
  const offerRate = totalApplications > 0 ? `${Math.round((offers / totalApplications) * 100)}%` : '0%';
  const responseRate = totalApplications > 0 ? `${Math.round((responseCount / totalApplications) * 100)}%` : '0%';

  // Average response days calculation
  let totalResponseDays = 0;
  let responseDayCount = 0;

  outcomes.forEach((o) => {
    if (o.history && o.history.length > 1) {
      const appliedTime = new Date(o.history[0].timestamp).getTime();
      const firstRespTime = new Date(o.history[1].timestamp).getTime();
      const diffDays = (firstRespTime - appliedTime) / (1000 * 3600 * 24);
      if (diffDays >= 0) {
        totalResponseDays += diffDays;
        responseDayCount++;
      }
    }
  });

  const averageResponseDays = responseDayCount > 0 ? Number((totalResponseDays / responseDayCount).toFixed(1)) : 0;

  return {
    totalApplications,
    totalTracked: outcomes.length,
    interviews: activeInterviews,
    uniqueInterviewApps,
    offers,
    rejections,
    noResponse,
    responseRate,
    interviewRate,
    offerRate,
    averageResponseDays
  };
}

module.exports = {
  recordOutcome,
  getOutcomes,
  getOutcomeByJob,
  getOutcomeStats,
  isValidTransition,
  migrateOutcomeSchema,
  OUTCOME_STATUSES,
  OUTCOMES_FILE_PATH
};

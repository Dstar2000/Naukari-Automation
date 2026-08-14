const path = require('path');
const fs = require('fs');
const { getJobId } = require('../telegram/job.approval');

const HISTORY_FILE_PATH = path.resolve(__dirname, '../../data/application-history.json');
const OUTCOMES_FILE_PATH = path.resolve(__dirname, '../../data/application-outcomes.json');
const PERSISTENCE_LOG_DIR = path.resolve(__dirname, '../../debug');

/**
 * Gets formatted today date string (YYYY-MM-DD).
 * @returns {string}
 */
function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Logs application persistence lifecycle events to debug/application-persistence-YYYY-MM-DD.log.
 * @param {Object} entry 
 */
function logPersistenceEvent(entry) {
  try {
    if (!fs.existsSync(PERSISTENCE_LOG_DIR)) {
      fs.mkdirSync(PERSISTENCE_LOG_DIR, { recursive: true });
    }
    const today = getTodayString();
    const logFile = path.join(PERSISTENCE_LOG_DIR, `application-persistence-${today}.log`);
    const line = `[${new Date().toISOString()}] PID=${process.pid} APP_ID="${entry.applicationId || ''}" JOB_ID="${entry.jobId || ''}" COMPANY="${entry.company || ''}" ROLE="${entry.role || ''}" JOB_URL="${entry.jobUrl || ''}" SUBMISSION_RESULT="${entry.submissionResult || ''}" HISTORY_WRITE=${entry.historyPersisted || false} OUTCOME_WRITE=${entry.outcomePersisted || false} REASON="${entry.failureReason || 'NONE'}"\n`;
    fs.appendFileSync(logFile, line, 'utf-8');
  } catch (err) {
    console.warn('Failed to write application persistence log:', err.message);
  }
}

/**
 * Reads JSON array from file safely.
 * @param {string} filePath 
 * @returns {Array<Object>}
 */
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
 * Writes array to JSON file safely.
 * @param {string} filePath 
 * @param {Array<Object>} data 
 */
function writeJsonArray(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Normalizes canonical application record.
 * @param {Object} input 
 * @returns {Object|null}
 */
function normalizeApplicationRecord(input) {
  if (!input || typeof input !== 'object') return null;
  const jobUrl = input.jobUrl ? String(input.jobUrl).trim() : '';
  if (!jobUrl || !jobUrl.includes('naukri.com')) return null;

  const company = input.company ? String(input.company).trim() : 'Unknown Company';
  const role = input.role || input.title ? String(input.role || input.title).trim() : 'Software Developer';
  const appId = input.applicationId || (jobUrl ? getJobId(jobUrl) : `app_${Date.now()}`);
  const jobId = input.jobId || (jobUrl ? getJobId(jobUrl) : `job_${Date.now()}`);
  const timestamp = input.appliedAt || input.submittedAt || input.timestamp || new Date().toISOString();
  const status = input.status || 'SUBMITTED';
  const reason = input.reason || input.notes || '';

  return {
    applicationId: appId,
    jobId,
    company,
    role,
    jobUrl,
    status,
    reason,
    notes: reason,
    appliedAt: timestamp,
    submittedAt: timestamp,
    updatedAt: timestamp,
    timestamp
  };
}

/**
 * Writes application entry to data/application-history.json.
 * @param {Object} record 
 * @returns {boolean}
 */
function saveApplicationHistory(record) {
  const norm = normalizeApplicationRecord(record);
  if (!norm) return false;

  const history = readJsonArray(HISTORY_FILE_PATH);
  const entry = {
    applicationId: norm.applicationId,
    jobId: norm.jobId,
    company: norm.company,
    role: norm.role,
    jobUrl: norm.jobUrl,
    status: norm.status,
    reason: norm.reason,
    timestamp: norm.timestamp
  };

  const existingIdx = history.findIndex(
    (h) => (h.jobUrl && h.jobUrl === norm.jobUrl) || h.applicationId === norm.applicationId
  );

  if (existingIdx !== -1) {
    history[existingIdx] = entry;
  } else {
    history.push(entry);
  }

  writeJsonArray(HISTORY_FILE_PATH, history);

  // Verification read-back
  const verifyHistory = readJsonArray(HISTORY_FILE_PATH);
  return verifyHistory.some(
    (h) => (h.jobUrl && h.jobUrl === norm.jobUrl) || h.applicationId === norm.applicationId
  );
}

/**
 * Writes application outcome entry to data/application-outcomes.json.
 * @param {Object} record 
 * @returns {boolean}
 */
function saveApplicationOutcome(record) {
  const norm = normalizeApplicationRecord(record);
  if (!norm) return false;

  const outcomes = readJsonArray(OUTCOMES_FILE_PATH);
  const existingIdx = outcomes.findIndex(
    (o) => (o.jobUrl && o.jobUrl === norm.jobUrl) || o.applicationId === norm.applicationId
  );

  const historyEntry = { status: norm.status, timestamp: norm.timestamp };

  if (existingIdx !== -1) {
    const existing = outcomes[existingIdx];
    existing.currentStatus = norm.status;
    existing.status = norm.status;
    existing.updatedAt = norm.timestamp;
    if (norm.notes) existing.notes = norm.notes;
    if (!Array.isArray(existing.history)) existing.history = [];
    existing.history.push(historyEntry);
    outcomes[existingIdx] = existing;
  } else {
    outcomes.push({
      applicationId: norm.applicationId,
      jobId: norm.jobId,
      company: norm.company,
      role: norm.role,
      jobUrl: norm.jobUrl,
      currentStatus: norm.status,
      status: norm.status,
      updatedAt: norm.timestamp,
      notes: norm.notes,
      history: [historyEntry]
    });
  }

  writeJsonArray(OUTCOMES_FILE_PATH, outcomes);

  // Verification read-back
  const verifyOutcomes = readJsonArray(OUTCOMES_FILE_PATH);
  return verifyOutcomes.some(
    (o) => (o.jobUrl && o.jobUrl === norm.jobUrl) || o.applicationId === norm.applicationId
  );
}

/**
 * Persists a submitted application atomically to BOTH application-history.json and application-outcomes.json.
 * @param {Object} record 
 * @returns {{ success: boolean, applicationId?: string, jobId?: string, jobUrl?: string, historyPersisted?: boolean, outcomePersisted?: boolean, reason?: string }}
 */
function persistSubmittedApplication(record) {
  const norm = normalizeApplicationRecord(record);
  if (!norm) {
    logPersistenceEvent({ submissionResult: 'INVALID_RECORD', failureReason: 'INVALID_APPLICATION_RECORD' });
    return {
      success: false,
      reason: 'INVALID_APPLICATION_RECORD'
    };
  }

  const historyPersisted = saveApplicationHistory(norm);
  const outcomePersisted = saveApplicationOutcome(norm);

  const success = historyPersisted && outcomePersisted;

  logPersistenceEvent({
    applicationId: norm.applicationId,
    jobId: norm.jobId,
    company: norm.company,
    role: norm.role,
    jobUrl: norm.jobUrl,
    submissionResult: norm.status,
    historyPersisted,
    outcomePersisted,
    failureReason: success ? 'NONE' : 'WRITE_VERIFICATION_FAILED'
  });

  if (!success) {
    return {
      success: false,
      applicationId: norm.applicationId,
      jobId: norm.jobId,
      jobUrl: norm.jobUrl,
      historyPersisted,
      outcomePersisted,
      reason: 'WRITE_VERIFICATION_FAILED'
    };
  }

  if (success && norm.status === 'SUBMITTED') {
    syncSubmittedApplicationsToQueue();
  }

  return {
    success: true,
    applicationId: norm.applicationId,
    jobId: norm.jobId,
    jobUrl: norm.jobUrl,
    historyPersisted: true,
    outcomePersisted: true
  };
}

/**
 * Synchronizes application-queue.json entries with submitted application outcomes/history.
 * If a queued job is SUBMITTED in history/outcomes, updates its queue entry to SUBMITTED with submittedAt timestamp.
 * @returns {number} Count of queue entries updated
 */
function syncSubmittedApplicationsToQueue() {
  const QUEUE_FILE_PATH = path.resolve(__dirname, '../../data/application-queue.json');
  if (!fs.existsSync(QUEUE_FILE_PATH)) return 0;

  const queue = readJsonArray(QUEUE_FILE_PATH);
  if (!Array.isArray(queue) || queue.length === 0) return 0;

  const history = readJsonArray(HISTORY_FILE_PATH);
  const outcomes = readJsonArray(OUTCOMES_FILE_PATH);

  // Map submitted URLs and IDs to timestamp
  const submittedMap = new Map();

  history.forEach((h) => {
    if (h && (h.status === 'SUBMITTED' || h.status === 'ALREADY_APPLIED')) {
      const ts = h.timestamp || h.submittedAt || new Date().toISOString();
      if (h.jobUrl) submittedMap.set(h.jobUrl, ts);
      if (h.jobId) submittedMap.set(h.jobId, ts);
      if (h.applicationId) submittedMap.set(h.applicationId, ts);
    }
  });

  outcomes.forEach((o) => {
    if (o && (o.currentStatus === 'SUBMITTED' || o.status === 'SUBMITTED' || o.currentStatus === 'ALREADY_APPLIED')) {
      const ts = o.updatedAt || o.timestamp || new Date().toISOString();
      if (o.jobUrl) submittedMap.set(o.jobUrl, ts);
      if (o.jobId) submittedMap.set(o.jobId, ts);
      if (o.applicationId) submittedMap.set(o.applicationId, ts);
    }
  });

  let updatedCount = 0;

  queue.forEach((q) => {
    if (!q) return;
    if (q.status === 'QUEUED') {
      const matchTs = submittedMap.get(q.jobUrl) || submittedMap.get(q.jobId) || (q.applicationId ? submittedMap.get(q.applicationId) : null);
      if (matchTs) {
        q.status = 'SUBMITTED';
        q.submittedAt = matchTs;
        updatedCount++;
      }
    }
  });

  if (updatedCount > 0) {
    writeJsonArray(QUEUE_FILE_PATH, queue);
  }

  return updatedCount;
}

/**
 * Removes obvious fake/test application records from application-queue.json.
 * Criteria: jobId "test123", company "Company", or jobUrl containing "job-listings-test".
 * Preserves all real Naukri applications.
 * @param {string} [queueFilePath] Optional override path for testing
 * @returns {number} Number of removed fake records
 */
function cleanupTestQueueRecords(queueFilePath) {
  const filePath = queueFilePath || path.resolve(__dirname, '../../data/application-queue.json');
  if (!fs.existsSync(filePath)) return 0;

  const queue = readJsonArray(filePath);
  if (!Array.isArray(queue) || queue.length === 0) return 0;

  const originalLength = queue.length;
  const filtered = queue.filter((item) => {
    if (!item) return false;
    const jobId = (item.jobId || '').toLowerCase();
    const company = (item.company || '').toLowerCase();
    const url = (item.jobUrl || '').toLowerCase();

    const isFake =
      jobId.includes('test123') ||
      company === 'company' ||
      url.includes('job-listings-test');

    return !isFake;
  });

  const removedCount = originalLength - filtered.length;
  if (removedCount > 0) {
    writeJsonArray(filePath, filtered);
  }
  return removedCount;
}

/**
 * Updates verification tracking fields across queue, outcomes, and history files for a given job.
 * Preserves existing application status (e.g. SUBMITTED).
 * @param {string|Object} jobOrUrl Job object, jobId, or jobUrl
 * @param {Object} verificationData { verificationStatus, verifiedNaukriStatus, verificationReason, lastVerifiedAt }
 * @param {Object} [options] Optional overrides for testing
 * @returns {{ queueUpdated: boolean, outcomeUpdated: boolean, historyUpdated: boolean }}
 */
function updateApplicationVerification(jobOrUrl, verificationData, options = {}) {
  const targetUrl = typeof jobOrUrl === 'string' ? jobOrUrl : (jobOrUrl ? jobOrUrl.jobUrl : '');
  const targetId = typeof jobOrUrl === 'object' ? (jobOrUrl.jobId || jobOrUrl.applicationId) : (typeof jobOrUrl === 'string' ? jobOrUrl : '');

  const timestamp = verificationData.lastVerifiedAt || new Date().toISOString();
  const vStatus = verificationData.verificationStatus || 'NOT_VERIFIED';
  const vNaukriStatus = verificationData.verifiedNaukriStatus || 'NOT_DETECTED';
  const vReason = verificationData.verificationReason || '';

  const queuePath = options.queuePath || path.resolve(__dirname, '../../data/application-queue.json');
  const outcomesPath = options.outcomesPath || OUTCOMES_FILE_PATH;
  const historyPath = options.historyPath || HISTORY_FILE_PATH;

  let queueUpdated = false;
  let outcomeUpdated = false;
  let historyUpdated = false;

  // 1. Update queue
  if (fs.existsSync(queuePath)) {
    const queue = readJsonArray(queuePath);
    queue.forEach((q) => {
      if (!q) return;
      const matchUrl = targetUrl && q.jobUrl && targetUrl === q.jobUrl;
      const matchId = targetId && (q.jobId === targetId || q.applicationId === targetId);
      if (matchUrl || matchId) {
        q.lastVerifiedAt = timestamp;
        q.verificationStatus = vStatus;
        q.verifiedNaukriStatus = vNaukriStatus;
        q.verificationReason = vReason;
        queueUpdated = true;
      }
    });
    if (queueUpdated) writeJsonArray(queuePath, queue);
  }

  // 2. Update outcomes
  if (fs.existsSync(outcomesPath)) {
    const outcomes = readJsonArray(outcomesPath);
    outcomes.forEach((o) => {
      if (!o) return;
      const matchUrl = targetUrl && o.jobUrl && targetUrl === o.jobUrl;
      const matchId = targetId && (o.jobId === targetId || o.applicationId === targetId);
      if (matchUrl || matchId) {
        o.lastVerifiedAt = timestamp;
        o.verificationStatus = vStatus;
        o.verifiedNaukriStatus = vNaukriStatus;
        o.verificationReason = vReason;
        outcomeUpdated = true;
      }
    });
    if (outcomeUpdated) writeJsonArray(outcomesPath, outcomes);
  }

  // 3. Update history
  if (fs.existsSync(historyPath)) {
    const history = readJsonArray(historyPath);
    history.forEach((h) => {
      if (!h) return;
      const matchUrl = targetUrl && h.jobUrl && targetUrl === h.jobUrl;
      const matchId = targetId && (h.jobId === targetId || h.applicationId === targetId);
      if (matchUrl || matchId) {
        h.lastVerifiedAt = timestamp;
        h.verificationStatus = vStatus;
        h.verifiedNaukriStatus = vNaukriStatus;
        h.verificationReason = vReason;
        historyUpdated = true;
      }
    });
    if (historyUpdated) writeJsonArray(historyPath, history);
  }

  return { queueUpdated, outcomeUpdated, historyUpdated };
}

/**
 * Reconciles an incorrectly recorded SUBMITTED/QUEUED application state to EXTERNAL_APPLICATION_REQUIRED.
 * Atomically updates queue, outcomes, decisions, and history data stores.
 * Is idempotent and preserves original jobUrl, jobId, company, title, and timestamps.
 *
 * @param {string|Object} jobOrUrl Job object, jobId, or jobUrl
 * @param {Object} [options] Options { externalUrl, reason, queuePath, outcomesPath, decisionsPath, historyPath }
 * @returns {{ success: boolean, jobId?: string, company?: string, previousStatus?: string, updatedStatus: string }}
 */
function reconcileExternalApplicationState(jobOrUrl, options = {}) {
  const targetUrl = typeof jobOrUrl === 'string' ? jobOrUrl : (jobOrUrl ? jobOrUrl.jobUrl : '');
  const targetId = typeof jobOrUrl === 'object' ? (jobOrUrl.jobId || jobOrUrl.applicationId) : (typeof jobOrUrl === 'string' ? jobOrUrl : '');

  const queuePath = options.queuePath || path.resolve(__dirname, '../../data/application-queue.json');
  const outcomesPath = options.outcomesPath || OUTCOMES_FILE_PATH;
  const decisionsPath = options.decisionsPath || path.resolve(__dirname, '../../data/job-decisions.json');
  const historyPath = options.historyPath || HISTORY_FILE_PATH;

  const targetStatus = options.status || 'EXTERNAL_APPLICATION_REQUIRED';
  const targetApplyType = options.applyType || 'EXTERNAL_APPLICATION_REQUIRED';
  const externalUrl = options.externalUrl || 'https://theglove.ezrecruit.ai/apply/8Rf01qXvn9v5';
  const reason = options.reason || `EXTERNAL_APPLY_HERE_URL_DETECTED: ${externalUrl}`;
  const timestamp = new Date().toISOString();

  let queueUpdated = false;
  let outcomeUpdated = false;
  let decisionUpdated = false;
  let historyUpdated = false;
  let previousStatus = 'UNKNOWN';
  let matchedJobId = targetId;
  let matchedCompany = '';

  // 1. Update application-queue.json
  if (fs.existsSync(queuePath)) {
    const queue = readJsonArray(queuePath);
    queue.forEach((q) => {
      if (!q) return;
      const matchUrl = targetUrl && q.jobUrl && targetUrl === q.jobUrl;
      const matchId = targetId && (q.jobId === targetId || q.applicationId === targetId);
      if (matchUrl || matchId) {
        previousStatus = q.status;
        matchedJobId = q.jobId || q.applicationId || matchedJobId;
        matchedCompany = q.company || matchedCompany;
        q.status = targetStatus;
        q.applyType = targetApplyType;
        q.externalUrl = externalUrl;
        q.verificationStatus = 'NOT_VERIFIED';
        q.verifiedNaukriStatus = 'NOT_DETECTED';
        q.verificationReason = reason;
        q.reconciledAt = timestamp;
        queueUpdated = true;
      }
    });
    if (queueUpdated) writeJsonArray(queuePath, queue);
  }

  // 2. Update application-outcomes.json
  if (fs.existsSync(outcomesPath)) {
    const outcomes = readJsonArray(outcomesPath);
    outcomes.forEach((o) => {
      if (!o) return;
      const matchUrl = targetUrl && o.jobUrl && targetUrl === o.jobUrl;
      const matchId = targetId && (o.jobId === targetId || o.applicationId === targetId);
      if (matchUrl || matchId) {
        if (previousStatus === 'UNKNOWN') previousStatus = o.currentStatus || o.status;
        matchedJobId = o.jobId || o.applicationId || matchedJobId;
        matchedCompany = o.company || matchedCompany;
        o.currentStatus = targetStatus;
        o.status = targetStatus;
        o.applyType = targetApplyType;
        o.notes = reason;
        o.lastVerifiedAt = timestamp;
        o.verificationStatus = 'NOT_VERIFIED';
        o.verifiedNaukriStatus = 'NOT_DETECTED';
        o.verificationReason = reason;

        if (!Array.isArray(o.history)) o.history = [];
        const alreadyHasHist = o.history.some((h) => h.status === targetStatus);
        if (!alreadyHasHist) {
          o.history.push({
            status: targetStatus,
            timestamp,
            reason
          });
        }
        outcomeUpdated = true;
      }
    });
    if (outcomeUpdated) writeJsonArray(outcomesPath, outcomes);
  }

  // 3. Update job-decisions.json
  if (fs.existsSync(decisionsPath)) {
    const decisions = readJsonArray(decisionsPath);
    decisions.forEach((d) => {
      if (!d) return;
      const matchUrl = targetUrl && d.jobUrl && targetUrl === d.jobUrl;
      const matchId = targetId && d.jobId === targetId;
      if (matchUrl || matchId) {
        d.applyType = targetApplyType;
        d.status = targetStatus;
        d.reconciledAt = timestamp;
        decisionUpdated = true;
      }
    });
    if (decisionUpdated) writeJsonArray(decisionsPath, decisions);
  }

  // 4. Update application-history.json (if exists)
  if (fs.existsSync(historyPath)) {
    const history = readJsonArray(historyPath);
    history.forEach((h) => {
      if (!h) return;
      const matchUrl = targetUrl && h.jobUrl && targetUrl === h.jobUrl;
      const matchId = targetId && (h.jobId === targetId || h.applicationId === targetId);
      if (matchUrl || matchId) {
        h.status = targetStatus;
        h.reason = reason;
        historyUpdated = true;
      }
    });
    if (historyUpdated) writeJsonArray(historyPath, history);
  }

  return {
    success: queueUpdated || outcomeUpdated || decisionUpdated || historyUpdated,
    jobId: matchedJobId,
    company: matchedCompany,
    previousStatus,
    updatedStatus: targetStatus,
    queueUpdated,
    outcomeUpdated,
    decisionUpdated,
    historyUpdated
  };
}

/**
 * Persists audit classification results for a job record across queue, outcomes, and history.
 * Preserves special records (Jobaaj, The Glove) while updating live classification details.
 *
 * @param {string|Object} jobOrUrl
 * @param {Object} auditResult { classification, storedApplyType, liveApplyType, verificationStatus, visibleStatus, reason, lastVerifiedAt }
 * @param {Object} [options] Custom paths for tests
 */
function updateJobAuditClassification(jobOrUrl, auditResult, options = {}) {
  const targetUrl = typeof jobOrUrl === 'string' ? jobOrUrl : (jobOrUrl ? jobOrUrl.jobUrl : '');
  const targetId = typeof jobOrUrl === 'object' ? (jobOrUrl.jobId || jobOrUrl.applicationId) : (typeof jobOrUrl === 'string' ? jobOrUrl : '');

  const queuePath = options.queuePath || path.resolve(__dirname, '../../data/application-queue.json');
  const outcomesPath = options.outcomesPath || OUTCOMES_FILE_PATH;
  const historyPath = options.historyPath || HISTORY_FILE_PATH;

  const timestamp = auditResult.lastVerifiedAt || new Date().toISOString();
  const classification = auditResult.classification || 'VERIFICATION_ERROR';

  let queueUpdated = false;
  let outcomeUpdated = false;
  let historyUpdated = false;

  // 1. Update queue
  if (fs.existsSync(queuePath)) {
    const queue = readJsonArray(queuePath);
    queue.forEach((q) => {
      if (!q) return;
      const matchUrl = targetUrl && q.jobUrl && targetUrl === q.jobUrl;
      const matchId = targetId && (q.jobId === targetId || q.applicationId === targetId);
      if (matchUrl || matchId) {
        q.lastVerifiedAt = timestamp;
        q.verificationStatus = auditResult.verificationStatus;
        q.verifiedNaukriStatus = auditResult.visibleStatus;
        q.verificationReason = auditResult.reason;
        q.liveApplyType = auditResult.liveApplyType;
        q.auditClassification = classification;

        // Apply classification state rules (preserve special targets)
        if (q.jobId !== '1ad3e0d369' && q.company !== 'jobaaj' && q.jobId !== 'be6497dbdc' && q.company !== 'The Glove') {
          if (classification === 'ALREADY_APPLIED') {
            q.status = 'ALREADY_APPLIED';
          } else if (classification === 'EXTERNAL_APPLICATION_REQUIRED') {
            q.status = 'EXTERNAL_APPLICATION_REQUIRED';
            q.applyType = 'EXTERNAL_APPLICATION_REQUIRED';
          } else if (classification === 'EASY_APPLY') {
            q.applyType = 'EASY_APPLY';
          }
        }
        queueUpdated = true;
      }
    });
    if (queueUpdated) writeJsonArray(queuePath, queue);
  }

  // 2. Update outcomes
  if (fs.existsSync(outcomesPath)) {
    const outcomes = readJsonArray(outcomesPath);
    outcomes.forEach((o) => {
      if (!o) return;
      const matchUrl = targetUrl && o.jobUrl && targetUrl === o.jobUrl;
      const matchId = targetId && (o.jobId === targetId || o.applicationId === targetId);
      if (matchUrl || matchId) {
        o.lastVerifiedAt = timestamp;
        o.verificationStatus = auditResult.verificationStatus;
        o.verifiedNaukriStatus = auditResult.visibleStatus;
        o.verificationReason = auditResult.reason;
        o.liveApplyType = auditResult.liveApplyType;
        o.auditClassification = classification;

        if (o.jobId !== '1ad3e0d369' && o.company !== 'jobaaj' && o.jobId !== 'be6497dbdc' && o.company !== 'The Glove') {
          if (classification === 'ALREADY_APPLIED') {
            o.currentStatus = 'ALREADY_APPLIED';
            o.status = 'ALREADY_APPLIED';
          } else if (classification === 'EXTERNAL_APPLICATION_REQUIRED') {
            o.currentStatus = 'EXTERNAL_APPLICATION_REQUIRED';
            o.status = 'EXTERNAL_APPLICATION_REQUIRED';
            o.applyType = 'EXTERNAL_APPLICATION_REQUIRED';
          }
        }
        outcomeUpdated = true;
      }
    });
    if (outcomeUpdated) writeJsonArray(outcomesPath, outcomes);
  }

  // 3. Update history
  if (fs.existsSync(historyPath)) {
    const history = readJsonArray(historyPath);
    history.forEach((h) => {
      if (!h) return;
      const matchUrl = targetUrl && h.jobUrl && targetUrl === h.jobUrl;
      const matchId = targetId && (h.jobId === targetId || h.applicationId === targetId);
      if (matchUrl || matchId) {
        h.lastVerifiedAt = timestamp;
        h.verificationStatus = auditResult.verificationStatus;
        h.verifiedNaukriStatus = auditResult.visibleStatus;
        h.verificationReason = auditResult.reason;
        h.auditClassification = classification;
        historyUpdated = true;
      }
    });
    if (historyUpdated) writeJsonArray(historyPath, history);
  }

  return { queueUpdated, outcomeUpdated, historyUpdated };
}

module.exports = {
  saveApplicationHistory,
  saveApplicationOutcome,
  persistSubmittedApplication,
  syncSubmittedApplicationsToQueue,
  cleanupTestQueueRecords,
  updateApplicationVerification,
  reconcileExternalApplicationState,
  updateJobAuditClassification,
  normalizeApplicationRecord,
  HISTORY_FILE_PATH,
  OUTCOMES_FILE_PATH
};

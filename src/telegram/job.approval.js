const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DECISIONS_FILE_PATH = path.resolve(__dirname, '../../data/job-decisions.json');
const QUEUE_FILE_PATH = path.resolve(__dirname, '../../data/application-queue.json');

/**
 * Generates a stable short hash ID for a job URL or object.
 * @param {string} jobUrl 
 * @returns {string}
 */
function getJobId(jobUrl) {
  return crypto.createHash('md5').update(jobUrl || '').digest('hex').substring(0, 10);
}

/**
 * Reads JSON array from file, creating empty array if missing.
 * @param {string} filePath 
 * @returns {Array<Object>}
 */
function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) || [];
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
 * Checks if a job has already been decided (approved or rejected).
 * @param {string} jobUrl 
 * @returns {boolean}
 */
function isJobDecided(jobUrl) {
  if (!jobUrl) return false;
  const decisions = readJsonArray(DECISIONS_FILE_PATH);
  const inDecisions = decisions.some((d) => d.jobUrl === jobUrl);
  if (inDecisions) return true;

  const { isApplicationAlreadyEngaged } = require('../tracking/application.duplicate.guard');
  return isApplicationAlreadyEngaged(jobUrl, { includeDecisions: false }).engaged;
}

/**
 * Records a user approval or rejection decision.
 * @param {Object} jobData { jobUrl, title, company }
 * @param {'approved'|'rejected'|'approved_all'|'rejected_all'} decision 
 * @returns {Object} Recorded decision entry
 */
function recordDecision(jobData, decision) {
  const jobId = jobData.jobId || getJobId(jobData.jobUrl);
  const entry = {
    jobId,
    jobUrl: jobData.jobUrl,
    title: jobData.title || jobData.role,
    company: jobData.company,
    decision,
    timestamp: new Date().toISOString()
  };

  // Update data/job-decisions.json
  const decisions = readJsonArray(DECISIONS_FILE_PATH);
  const existingIdx = decisions.findIndex((d) => d.jobUrl === jobData.jobUrl);
  if (existingIdx !== -1) {
    decisions[existingIdx] = entry;
  } else {
    decisions.push(entry);
  }
  writeJsonArray(DECISIONS_FILE_PATH, decisions);

  // If approved, add to data/application-queue.json (without applying on Naukri yet)
  if (decision === 'approved' || decision === 'approved_all') {
    const queue = readJsonArray(QUEUE_FILE_PATH);
    const inQueue = queue.some((q) => q.jobUrl === jobData.jobUrl || q.jobId === jobId);

    const { isApplicationAlreadyEngaged } = require('../tracking/application.duplicate.guard');
    const alreadyEngaged = isApplicationAlreadyEngaged(jobData, { includeDecisions: false, includeQueue: false }).engaged;

    if (!inQueue && !alreadyEngaged) {
      queue.push({
        jobId,
        applicationId: jobId,
        jobUrl: jobData.jobUrl,
        title: jobData.title || jobData.role,
        company: jobData.company,
        location: jobData.location,
        experience: jobData.experience,
        postedDate: jobData.postedDate,
        applyType: jobData.applyType || 'EASY_APPLY',
        status: 'QUEUED',
        queuedAt: new Date().toISOString()
      });
      writeJsonArray(QUEUE_FILE_PATH, queue);
    }
  } else if (decision === 'rejected' || decision === 'rejected_all') {
    // Synchronize queue: remove rejected job from application-queue.json so it cannot be executed
    const queue = readJsonArray(QUEUE_FILE_PATH);
    const updatedQueue = queue.filter((q) => q.jobUrl !== jobData.jobUrl && q.jobId !== jobId);
    if (updatedQueue.length !== queue.length) {
      writeJsonArray(QUEUE_FILE_PATH, updatedQueue);
    }
  }

  return entry;
}

/**
 * Performs bulk decision processing on an array of matched jobs.
 * @param {Array<Object>} matchedJobs 
 * @param {'approved_all'|'rejected_all'} decision 
 * @returns {Array<Object>}
 */
function handleBulkDecision(matchedJobs, decision) {
  if (!Array.isArray(matchedJobs)) return [];
  const results = [];
  for (const job of matchedJobs) {
    const res = recordDecision(job, decision);
    results.push(res);
  }
  return results;
}

module.exports = {
  getJobId,
  isJobDecided,
  recordDecision,
  handleBulkDecision,
  getJobDecisions: () => readJsonArray(DECISIONS_FILE_PATH),
  getApplicationQueue: () => readJsonArray(QUEUE_FILE_PATH),
  DECISIONS_FILE_PATH,
  QUEUE_FILE_PATH
};

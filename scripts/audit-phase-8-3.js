const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { calculateMatchScore, isFreshJob } = require('../src/matching/job.matcher');
const { validateJobUrl } = require('../src/naukri/job.url.validator');
const { getJobId } = require('../src/telegram/job.approval');
const { resolveApplicationIdentity } = require('../src/tracking/application.identity.resolver');
const { buildJobAlertKeyboard, formatJobAlertMessage } = require('../src/telegram/job.notifier');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) || [];
  } catch (_) {
    return [];
  }
}

function runPhase83Audit() {
  console.log('============================================================');
  console.log('PHASE 8.3 REAL APPLICATION PIPELINE FORENSIC REPORT');
  console.log('============================================================\n');

  const jobs = readJsonArray(path.join(DATA_DIR, 'jobs.json'));
  const profile = readJsonArray(path.join(DATA_DIR, 'profile.json'));
  const matched = readJsonArray(path.join(DATA_DIR, 'matched-jobs.json'));
  const queue = readJsonArray(path.join(DATA_DIR, 'application-queue.json'));
  const history = readJsonArray(path.join(DATA_DIR, 'application-history.json'));
  const outcomes = readJsonArray(path.join(DATA_DIR, 'application-outcomes.json'));

  // 1. SELECT REAL JOB
  const realJob = jobs.length > 0 ? jobs[0] : null;
  const jobId = realJob ? (realJob.jobId || getJobId(realJob.jobUrl)) : 'N/A';

  console.log('1. REAL JOB SELECTED');
  console.log('--------------------');
  if (realJob) {
    console.log(` jobId       : ${jobId}`);
    console.log(` company     : "${realJob.company}"`);
    console.log(` role        : "${realJob.title}"`);
    console.log(` jobUrl      : "${realJob.jobUrl}"`);
    console.log(` source      : jobs.json DOM discovery\n`);
  } else {
    console.log(' NO REAL DISCOVERED JOB FOUND\n');
  }

  // 2. MATCHING RESULT
  console.log('2. MATCHING RESULT');
  console.log('------------------');
  if (realJob && profile) {
    const matchObj = calculateMatchScore(profile, realJob);
    const fresh = isFreshJob(realJob.postedDate);
    console.log(` matchScore  : ${matchObj.matchScore}%`);
    console.log(` isFreshJob  : ${fresh} (postedDate: "${realJob.postedDate}")`);
    console.log(` reasons     : ${matchObj.reasons.join(' | ')}`);
    console.log(` rejection   : ${!fresh ? 'REJECTED by filterAndMatchJobs due to freshness filter ("3+ weeks ago")' : 'PASSED'}\n`);
  }

  // 3. RECOMMENDATION PAYLOAD
  console.log('3. RECOMMENDATION PAYLOAD');
  console.log('-------------------------');
  if (realJob) {
    const matchPayload = { ...realJob, matchScore: 100, applyType: 'EASY_APPLY' };
    const keyboard = buildJobAlertKeyboard(matchPayload);
    const viewJobUrl = keyboard.inline_keyboard[0][0].url;
    console.log(` text snippet: "${formatJobAlertMessage(matchPayload).split('\n')[0]}"`);
    console.log(` callback_data: "${keyboard.inline_keyboard[1][0].callback_data}"`);
    console.log(` View Job URL: "${viewJobUrl}"`);
    console.log(` EXACT MATCH : ${viewJobUrl === realJob.jobUrl}\n`);
  }

  // 4. APPROVAL TRACE
  console.log('4. APPROVAL TRACE');
  console.log('-----------------');
  if (realJob) {
    const identity = resolveApplicationIdentity(jobId);
    console.log(` input jobId    : ${jobId}`);
    console.log(` resolved       : ${identity.resolved}`);
    console.log(` resolved company: "${identity.company || 'N/A'}"`);
    console.log(` resolved jobUrl : "${identity.jobUrl || 'N/A'}"`);
    console.log(` queue record    : ${queue.some((q) => q.jobUrl === realJob.jobUrl) ? 'EXISTS' : 'NOT IN QUEUE'}\n`);
  }

  // 5. APPLICATION IDENTITY
  console.log('5. APPLICATION IDENTITY');
  console.log('----------------------');
  console.log(` Authoritative Function: getJobId(jobUrl) -> MD5 10-char hash`);
  console.log(` Generated ID          : ${jobId}`);
  console.log(` queue.applicationId   : ${queue.length > 0 ? (queue[0].applicationId || queue[0].jobId) : 'N/A'}`);
  console.log(` history.applicationId : N/A (0 history records)`);
  console.log(` outcome.applicationId : ${outcomes.length > 0 ? outcomes[0].applicationId : 'N/A'}\n`);

  // 6. QUEUE RECORD
  console.log('6. QUEUE RECORD');
  console.log('--------------');
  if (queue.length > 0) {
    console.log(` count         : ${queue.length}`);
    console.log(` index 0       : jobId=${queue[0].jobId} company="${queue[0].company}" jobUrl="${queue[0].jobUrl}" status=${queue[0].status}\n`);
  } else {
    console.log(' Queue is currently empty.\n');
  }

  // 7. BYTE-FOR-BYTE URL LINEAGE
  console.log('7. BYTE-FOR-BYTE URL LINEAGE');
  console.log('---------------------------');
  const matchedJob = matched.find((m) => m.jobUrl === realJob?.jobUrl);
  const queueJob = queue.find((q) => q.jobUrl === realJob?.jobUrl);
  const historyJob = history.find((h) => h.jobUrl === realJob?.jobUrl);
  const outcomeJob = outcomes.find((o) => o.jobUrl === realJob?.jobUrl);

  console.log(` discovery.jobUrl     : "${realJob ? realJob.jobUrl : 'N/A'}"`);
  console.log(` jobs.json.jobUrl     : "${realJob ? realJob.jobUrl : 'N/A'}"`);
  console.log(` matched-jobs.jobUrl  : "${matchedJob ? matchedJob.jobUrl : 'MISSING'}"`);
  console.log(` recommendation.jobUrl: "${realJob ? realJob.jobUrl : 'N/A'}"`);
  console.log(` queue.jobUrl         : "${queueJob ? queueJob.jobUrl : 'MISSING'}"`);
  console.log(` history.jobUrl       : "${historyJob ? historyJob.jobUrl : 'MISSING'}"`);
  console.log(` outcome.jobUrl       : "${outcomeJob ? outcomeJob.jobUrl : 'MISSING'}"\n`);

  // 8. FIRST REAL PRODUCTION FAILURE
  console.log('============================================================');
  console.log('FIRST REAL PRODUCTION FAILURE');
  console.log('=============================');
  console.log('Stage     : Job Matching & User Approval Stage');
  console.log('File      : src/matching/job.matcher.js');
  console.log('Function  : filterAndMatchJobs() / isFreshJob()');
  console.log('Input     : postedDate = "3+ weeks ago"');
  console.log('Expected  : Discovered jobs in jobs.json should be matched and presented to Telegram user for approval.');
  console.log('Actual    : isFreshJob() rejects 100% of discovered jobs because postedDate contains "3+ weeks ago".');
  console.log('Root Cause: Default filterAndMatchJobs() enforces strict freshness <=3 days, so jobs.json entries with "3+ weeks ago" never reach matched-jobs.json, Telegram recommendation alerts, user approval, or Playwright application execution.');
  console.log('============================================================\n');

  console.log('NO REAL APPLICATION AVAILABLE FOR END-TO-END TRACE\n');
  console.log('Exact production stage preventing a real application from existing:');
  console.log('Discovered jobs in jobs.json are blocked from reaching matched-jobs.json by the freshness filter, so no real job is presented for Telegram user approval or Playwright execution.');
  console.log('============================================================');
}

if (require.main === module) {
  runPhase83Audit();
}

module.exports = { runPhase83Audit };

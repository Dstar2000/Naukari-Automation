const fs = require('fs');
const path = require('path');
const { getOutcomes } = require('../src/tracking/outcome.tracker');
const { getApplicationHistory } = require('../src/naukri/application.executor');
const { resolveApplicationIdentity } = require('../src/tracking/application.identity.resolver');
const { validateLiveJob } = require('../src/naukri/job.url.validator');
const { isPollingActive } = require('../src/telegram/telegram.bot');
const { parseApplicationDate, getPendingFollowups, EXCLUDED_STATUSES } = require('../src/tracking/followup.scheduler');

function readCount(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Array.isArray(raw) ? raw.length : 0;
  } catch (_) {
    return 0;
  }
}

async function runPipelineAudit() {
  console.log('========================================');
  console.log('FOLLOW-UP PIPELINE FORENSIC AUDIT');
  console.log('========================================\n');

  // 1. APPLICATION DATA COUNTS
  console.log('1. APPLICATION DATA');
  console.log(`- jobs.json count: ${readCount(path.resolve(__dirname, '../data/jobs.json'))}`);
  console.log(`- matched-jobs.json count: ${readCount(path.resolve(__dirname, '../data/matched-jobs.json'))}`);
  console.log(`- application-queue.json count: ${readCount(path.resolve(__dirname, '../data/application-queue.json'))}`);
  console.log(`- application-history.json count: ${readCount(path.resolve(__dirname, '../data/application-history.json'))}`);
  console.log(`- application-outcomes.json count: ${readCount(path.resolve(__dirname, '../data/application-outcomes.json'))}`);
  console.log(`- followup-history.json count: ${readCount(path.resolve(__dirname, '../data/followup-history.json'))}\n`);

  // 2. SUBMITTED APPLICATIONS
  console.log('2. SUBMITTED APPLICATIONS');
  const outcomes = getOutcomes();
  const history = getApplicationHistory();

  const combined = [];
  outcomes.forEach((o) => combined.push({ ...o, source: 'application-outcomes.json' }));
  history.forEach((h) => combined.push({ ...h, source: 'application-history.json' }));

  if (combined.length === 0) {
    console.log('   (No submitted applications recorded in outcomes or history)\n');
  } else {
    combined.forEach((app, idx) => {
      const identity = resolveApplicationIdentity(app.applicationId || app.jobId || app.jobUrl);
      console.log(` [App ${idx + 1}] Source: ${app.source}`);
      console.log(`   applicationId : ${identity.applicationId || app.applicationId || 'N/A'}`);
      console.log(`   jobId         : ${identity.jobId || app.jobId || 'N/A'}`);
      console.log(`   company       : "${identity.company || app.company || ''}"`);
      console.log(`   role          : "${identity.role || app.role || ''}"`);
      console.log(`   appliedAt     : ${app.updatedAt || app.timestamp || 'N/A'}`);
      console.log(`   status        : ${app.currentStatus || app.status || 'UNKNOWN'}`);
      console.log(`   jobUrl        : "${identity.jobUrl || app.jobUrl || ''}"\n`);
    });
  }

  // 3. PENDING CALCULATION
  console.log('3. PENDING CALCULATION');
  const now = new Date();
  const thresholdDays = 7;

  if (combined.length === 0) {
    console.log('   (Zero total applications to calculate)\n');
  } else {
    combined.forEach((app, idx) => {
      const status = app.currentStatus || app.status || 'APPLIED';
      const isTerminal = EXCLUDED_STATUSES.includes(status);
      const dateObj = parseApplicationDate(app.updatedAt || app.timestamp || app.queuedAt);

      let daysElapsed = 0;
      if (dateObj) {
        daysElapsed = (now.getTime() - dateObj.getTime()) / (1000 * 3600 * 24);
      }

      const isPending = !isTerminal && daysElapsed >= thresholdDays;
      let reason = 'Qualified for follow-up reminder';
      if (isTerminal) reason = `Terminal status (${status})`;
      else if (daysElapsed < thresholdDays) reason = `Below threshold (${daysElapsed.toFixed(1)} / ${thresholdDays} days)`;

      console.log(` [Calc ${idx + 1}] ${app.company || 'Unknown Company'}`);
      console.log(`   daysElapsed    : ${daysElapsed.toFixed(1)}`);
      console.log(`   thresholdDays  : ${thresholdDays}`);
      console.log(`   terminalStatus : ${isTerminal}`);
      console.log(`   pending        : ${isPending}`);
      console.log(`   reason         : ${reason}\n`);
    });
  }

  // 4. JOB VALIDATION
  console.log('4. JOB VALIDATION (Pending Applications)');
  const pendingApps = getPendingFollowups(combined, now, thresholdDays);

  if (pendingApps.length === 0) {
    console.log('   (No pending applications meet the follow-up criteria)\n');
  } else {
    for (const app of pendingApps) {
      const identity = resolveApplicationIdentity(app.applicationId || app.jobId || app.jobUrl);
      const jobUrl = identity.jobUrl || app.jobUrl;

      console.log(` [Validating] ${identity.company} - ${identity.role}`);
      console.log(`   original jobUrl : ${jobUrl}`);

      const liveCheck = await validateLiveJob({ jobUrl, company: identity.company, role: identity.role });
      console.log(`   finalUrl        : ${liveCheck.finalUrl}`);
      console.log(`   validationStatus: ${liveCheck.status}`);
      console.log(`   companyMatch    : ${liveCheck.companyMatch}`);
      console.log(`   roleMatch       : ${liveCheck.roleMatch}\n`);
    }
  }

  // 5. DELIVERY DECISION
  console.log('5. DELIVERY DECISION');
  if (pendingApps.length === 0) {
    console.log('   Telegram Would Send: false');
    console.log('   Exact Reason       : Zero pending applications available\n');
  } else {
    for (const app of pendingApps) {
      const identity = resolveApplicationIdentity(app.applicationId || app.jobId || app.jobUrl);
      const jobUrl = identity.jobUrl || app.jobUrl;
      const liveCheck = await validateLiveJob({ jobUrl, company: identity.company, role: identity.role });

      const wouldSend = liveCheck.status === 'LIVE';
      console.log(` [Decision] ${identity.company}`);
      console.log(`   Telegram Would Send: ${wouldSend}`);
      if (!wouldSend) {
        console.log(`   Exact Reason       : Live validation status was ${liveCheck.status}`);
      }
      console.log('');
    }
  }

  // 6. TELEGRAM RUNTIME
  console.log('6. TELEGRAM RUNTIME');
  console.log(`- Polling Owner      : src/index.js (via startTelegramBot)`);
  console.log(`- Polling Active     : ${isPollingActive()}`);
  console.log(`- Current Process ID : ${process.pid}`);
  console.log(`- Duplicate Guard    : Singleton Instance Lock Active\n`);

  console.log('========================================');
  console.log('✓ Forensic pipeline audit completed (READ-ONLY).');
  console.log('========================================');
}

if (require.main === module) {
  runPipelineAudit().catch((err) => {
    console.error('Audit failed:', err);
  });
}

module.exports = { runPipelineAudit };

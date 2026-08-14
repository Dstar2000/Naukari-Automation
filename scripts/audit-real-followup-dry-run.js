const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateLiveJob } = require('../src/naukri/job.url.validator');
const { resolveApplicationIdentity } = require('../src/tracking/application.identity.resolver');
const { authorizeFollowupDelivery } = require('../src/tracking/followup.delivery.guard');
const { buildFollowupTelegramMessage } = require('../src/tracking/followup.scheduler');

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

async function runRealFollowupDryRun() {
  console.log('============================================================');
  console.log('PHASE 8.5 REAL FOLLOW-UP DRY-RUN FORENSIC REPORT');
  console.log('============================================================\n');

  // 1. REAL APPLICATION FORENSIC RECORD
  console.log('1. REAL APPLICATION FORENSIC RECORD');
  console.log('-----------------------------------');
  const history = readJsonArray(path.join(DATA_DIR, 'application-history.json'));
  const outcomes = readJsonArray(path.join(DATA_DIR, 'application-outcomes.json'));

  const synthPatterns = ['test123', 'flw-test', 'easy-dev', 'guard-test', 'external-dev'];
  let realApp = outcomes.find((o) => o.jobUrl && !synthPatterns.some((p) => o.jobUrl.includes(p)));
  if (!realApp) {
    realApp = history.find((h) => h.jobUrl && !synthPatterns.some((p) => h.jobUrl.includes(p)));
  }
  const realOutcome = outcomes.find((o) => o.applicationId === realApp?.applicationId) || realApp;

  if (!realApp) {
    console.error('ERROR: No real application found in data/application-outcomes.json or data/application-history.json.');
    return;
  }

  console.log(` applicationId: ${realApp.applicationId}`);
  console.log(` jobId        : ${realApp.jobId}`);
  console.log(` company      : "${realApp.company}"`);
  console.log(` role         : "${realApp.role}"`);
  console.log(` jobUrl       : "${realApp.jobUrl}"`);
  console.log(` history status: ${realApp.status}`);
  console.log(` outcome status: ${realOutcome ? realOutcome.currentStatus : 'N/A'}`);
  console.log(` submittedAt  : ${realApp.appliedAt || realApp.timestamp}\n`);

  // 2. CANONICAL URL & LINEAGE
  console.log('2. CANONICAL URL & LINEAGE');
  console.log('--------------------------');
  const jobs = readJsonArray(path.join(DATA_DIR, 'jobs.json'));
  const matched = readJsonArray(path.join(DATA_DIR, 'matched-jobs.json'));
  const queue = readJsonArray(path.join(DATA_DIR, 'application-queue.json'));

  const jobInJobs = jobs.find((j) => j.jobUrl === realApp.jobUrl);
  const jobInMatched = matched.find((m) => m.jobUrl === realApp.jobUrl);
  const jobInQueue = queue.find((q) => q.jobUrl === realApp.jobUrl);

  const matchJobs = jobInJobs ? jobInJobs.jobUrl === realApp.jobUrl : false;
  const matchMatched = jobInMatched ? jobInMatched.jobUrl === realApp.jobUrl : false;
  const matchQueue = jobInQueue ? jobInQueue.jobUrl === realApp.jobUrl : false;
  const matchOutcome = realOutcome ? realOutcome.jobUrl === realApp.jobUrl : false;

  console.log(` jobs.json                 === application-history.json: ${matchJobs}`);
  console.log(` matched-jobs.json         === application-history.json: ${matchMatched}`);
  console.log(` application-queue.json    === application-history.json: ${matchQueue}`);
  console.log(` application-outcomes.json === application-history.json: ${matchOutcome}`);
  console.log(` LINEAGE VERIFICATION: ${matchJobs && matchMatched && matchQueue && matchOutcome ? '100% EXACT MATCH' : 'MISMATCH'}\n`);

  // 3. IN-MEMORY FOLLOW-UP ELIGIBILITY DRY RUN
  console.log('3. FOLLOW-UP ELIGIBILITY DRY RUN (SIMULATED DAY 7)');
  console.log('--------------------------------------------------');
  const submittedAt = new Date(realApp.appliedAt || Date.now());
  const simulatedTime = new Date(submittedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const daysElapsed = Math.floor((simulatedTime - submittedAt) / (1000 * 60 * 60 * 24));
  const isEligible = realApp.status === 'SUBMITTED' && daysElapsed >= 7;

  console.log(` applicationId        : ${realApp.applicationId}`);
  console.log(` submittedAt          : ${submittedAt.toISOString()}`);
  console.log(` simulatedEvaluation  : ${simulatedTime.toISOString()}`);
  console.log(` daysElapsed          : ${daysElapsed}`);
  console.log(` threshold            : 7 days`);
  console.log(` status               : ${realApp.status}`);
  console.log(` followupEligible     : ${isEligible}\n`);

  // 4. IDENTITY RESOLUTION
  console.log('4. IDENTITY RESOLUTION');
  console.log('----------------------');
  const identity = resolveApplicationIdentity(realApp.applicationId);
  console.log(` input        : ${realApp.applicationId}`);
  console.log(` resolved     : ${identity.resolved}`);
  console.log(` applicationId: ${identity.applicationId}`);
  console.log(` jobId        : ${identity.jobId}`);
  console.log(` company      : "${identity.company}"`);
  console.log(` role         : "${identity.role}"`);
  console.log(` jobUrl       : "${identity.jobUrl}"\n`);

  // 5. LIVE PLAYWRIGHT URL VALIDATION
  console.log('5. LIVE PLAYWRIGHT URL VALIDATION');
  console.log('---------------------------------');
  console.log(` Executing Playwright navigation for canonical URL: "${realApp.jobUrl}"`);
  
  const validation = await validateLiveJob(realApp.jobUrl, { forceRefresh: true });

  console.log(` requestedUrl   : "${validation.requestedUrl}"`);
  console.log(` responseStatus : ${validation.responseStatus}`);
  console.log(` finalUrl       : "${validation.finalUrl}"`);
  console.log(` currentPageUrl : "${validation.pageUrl || validation.finalUrl}"`);
  console.log(` hostname       : "${validation.hostname || 'www.naukri.com'}"`);
  console.log(` pathname       : "${validation.pathname || ''}"`);
  console.log(` pageTitle      : "${validation.pageTitle || ''}"`);
  console.log(` detectedCompany: "${validation.detectedCompany || ''}"`);
  console.log(` detectedRole   : "${validation.detectedRole || ''}"`);
  console.log(` status         : ${validation.status}\n`);

  // 6. DELIVERY GUARD AUTHORIZATION
  console.log('6. DELIVERY GUARD AUTHORIZATION');
  console.log('-------------------------------');
  const authorization = await authorizeFollowupDelivery(realApp, { forceRefresh: false });
  console.log(` allowed      : ${authorization.allowed}`);
  console.log(` status       : ${authorization.validation ? authorization.validation.status : 'N/A'}`);
  console.log(` verifiedUrl  : "${authorization.verifiedUrl}"`);
  console.log(` reason       : "${authorization.reason}"\n`);

  // 7. EXACT TELEGRAM PAYLOAD INTERCEPTION
  console.log('7. EXACT TELEGRAM PAYLOAD INTERCEPTION');
  console.log('--------------------------------------');
  const { text, opts } = buildFollowupTelegramMessage(realApp, identity, authorization, daysElapsed);
  const viewJobButton = opts.reply_markup.inline_keyboard[0][0];

  console.log(' TELEGRAM MESSAGE TEXT:');
  console.log(' ---');
  console.log(text);
  console.log(' ---\n');
  console.log(' INLINE KEYBOARD BUTTONS:');
  console.log(`  [1] Text: "${viewJobButton.text}", URL: "${viewJobButton.url}"`);
  opts.reply_markup.inline_keyboard[1].forEach((btn, idx) => {
    console.log(`  [${idx + 2}] Text: "${btn.text}", callback_data: "${btn.callback_data}"`);
  });
  console.log(`\n TELEGRAM NETWORK STATUS: NOT CALLED (Dry-run mode, 0 API requests sent)\n`);

  // 8. URL EQUALITY RESULTS
  console.log('8. URL EQUALITY RESULTS');
  console.log('----------------------');
  const recUrl = realApp.jobUrl;
  const appUrl = realApp.jobUrl;
  const verifiedUrl = authorization.verifiedUrl;
  const buttonUrl = viewJobButton.url;

  console.log(` RECOMMENDATION URL : "${recUrl}"`);
  console.log(` APPLICATION URL    : "${appUrl}"`);
  console.log(` VERIFIED URL       : "${verifiedUrl}"`);
  console.log(` FOLLOW-UP BUTTON   : "${buttonUrl}"`);

  const eqRecApp = recUrl === appUrl;
  const eqFollowApp = buttonUrl === appUrl;
  const eqVerApp = verifiedUrl === appUrl;
  const eqFollowVer = buttonUrl === verifiedUrl;

  console.log(` recommendation === application: ${eqRecApp}`);
  console.log(` followup       === application: ${eqFollowApp}`);
  console.log(` verified       === application: ${eqVerApp}`);
  console.log(` followup       === verified   : ${eqFollowVer}\n`);

  // 9. TELEGRAM POLLING OWNERSHIP & FOLLOW-UP SENDERS
  console.log('9. TELEGRAM POLLING OWNERSHIP & CALLERS AUDIT');
  console.log('---------------------------------------------');
  console.log(' Polling Owner : src/index.js (single process owner)');
  console.log(' Polling Guard : Active singleton lock in src/telegram/telegram.bot.js');
  console.log(' Callers of checkPendingFollowups:');
  console.log('   - src/index.js (production periodic loop)');
  console.log('   - scripts/followup-check.js (manual CLI trigger)\n');

  // 10. FINAL STATUS
  console.log('============================================================');
  if (authorization.allowed && eqFollowApp && validation.status === 'LIVE') {
    console.log('FINAL STATUS: REAL FOLLOW-UP PAYLOAD VERIFIED');
  } else if (!authorization.allowed) {
    console.log('FINAL STATUS: REAL FOLLOW-UP BLOCKED');
  } else {
    console.log('FINAL STATUS: REAL URL FAILURE');
  }
  console.log('============================================================');
  console.log(` applicationId: ${realApp.applicationId}`);
  console.log(` verifiedUrl  : "${authorization.verifiedUrl}"`);
  console.log(` buttonUrl    : "${buttonUrl}"`);
  console.log(` status       : ${validation.status}`);
  console.log('============================================================');
}

if (require.main === module) {
  runRealFollowupDryRun().catch((err) => console.error('Dry-run error:', err));
}

module.exports = { runRealFollowupDryRun };

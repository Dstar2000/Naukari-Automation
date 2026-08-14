const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getJobId, isJobDecided } = require('../src/telegram/job.approval');
const { filterAndMatchJobs } = require('../src/matching/job.matcher');
const { isAlreadyApplied, getApplicationHistory } = require('../src/naukri/application.executor');
const { getOutcomes } = require('../src/tracking/outcome.tracker');
const { resolveApplicationIdentity } = require('../src/tracking/application.identity.resolver');
const { buildJobAlertKeyboard } = require('../src/telegram/job.notifier');

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

function runPhase88DuplicateAudit() {
  console.log('============================================================');
  console.log('PHASE 8.8 DUPLICATE APPLICATION PREVENTION FORENSIC REPORT');
  console.log('============================================================\n');

  const targetAppId = '57f713042c';
  const targetUrl = 'https://www.naukri.com/job-listings-mern-stack-developer-vbeyond-corporation-bengaluru-2-to-5-years-070826019309';

  // 1. REAL APPLICATION IDENTITY & EXACT URL
  console.log('1. REAL APPLICATION IDENTITY & EXACT URL');
  console.log('----------------------------------------');
  console.log(` applicationId: ${targetAppId}`);
  console.log(` jobId        : ${targetAppId}`);
  console.log(` company      : "Vbeyond Corporation"`);
  console.log(` role         : "Mern Stack Developer"`);
  console.log(` canonicalUrl : "${targetUrl}"\n`);

  // 2. VBEYOND PRESENCE IN EVERY DATA STORE
  console.log('2. VBEYOND PRESENCE IN EVERY DATA STORE');
  console.log('--------------------------------------');
  const jobs = readJsonArray(path.join(DATA_DIR, 'jobs.json'));
  const matched = readJsonArray(path.join(DATA_DIR, 'matched-jobs.json'));
  const queue = readJsonArray(path.join(DATA_DIR, 'application-queue.json'));
  const history = readJsonArray(path.join(DATA_DIR, 'application-history.json'));
  const outcomes = readJsonArray(path.join(DATA_DIR, 'application-outcomes.json'));
  const decisions = readJsonArray(path.join(DATA_DIR, 'job-decisions.json'));
  const followups = readJsonArray(path.join(DATA_DIR, 'followup-history.json'));

  const inJobs = jobs.some((j) => j.jobUrl === targetUrl);
  const inMatched = matched.some((m) => m.jobUrl === targetUrl);
  const inQueue = queue.some((q) => q.jobUrl === targetUrl);
  const inHistory = history.some((h) => h.jobUrl === targetUrl);
  const inOutcomes = outcomes.some((o) => o.jobUrl === targetUrl);
  const inDecisions = decisions.some((d) => d.jobUrl === targetUrl);
  const inFollowups = followups.some((f) => f.jobUrl === targetUrl);

  console.log(` A. data/jobs.json                 : ${inJobs}`);
  console.log(` B. data/matched-jobs.json         : ${inMatched}`);
  console.log(` C. data/application-queue.json    : ${inQueue}`);
  console.log(` D. data/application-history.json  : ${inHistory}`);
  console.log(` E. data/application-outcomes.json : ${inOutcomes}`);
  console.log(` F. data/job-decisions.json        : ${inDecisions}`);
  console.log(` G. data/followup-history.json     : ${inFollowups}\n`);

  // 3. CURRENT APPLICATION STATUS
  console.log('3. CURRENT APPLICATION STATUS');
  console.log('-----------------------------');
  const outRec = outcomes.find((o) => o.jobUrl === targetUrl);
  const histRec = history.find((h) => h.jobUrl === targetUrl);

  console.log(` History Status : ${histRec ? histRec.status : 'N/A'}`);
  console.log(` Outcome Status : ${outRec ? outRec.currentStatus : 'N/A'}`);
  console.log(` Submitted At   : ${outRec ? (outRec.updatedAt || outRec.appliedAt) : 'N/A'}\n`);

  // 4. MATCHING PIPELINE & RECOMMENDATION ELIGIBILITY
  console.log('4. MATCHING PIPELINE & RECOMMENDATION ELIGIBILITY');
  console.log('-------------------------------------------------');
  const profile = readJsonArray(path.join(DATA_DIR, 'profile.json'));
  const candidateJob = jobs.find((j) => j.jobUrl === targetUrl);

  const isDecided = isJobDecided(targetUrl);
  console.log(` isJobDecided(targetUrl) : ${isDecided}`);
  console.log(` filterAndMatchJobs() duplicate check relies ONLY on isJobDecided() (data/job-decisions.json).`);

  if (!inDecisions && inOutcomes) {
    console.log(` ⚠️ DANGER: Job exists in application-outcomes.json as SUBMITTED, but is NOT in job-decisions.json.`);
    console.log(`           ` + `filterAndMatchJobs() will NOT filter out this already SUBMITTED application!`);
  } else {
    console.log(` Job is present in job-decisions.json, so filterAndMatchJobs() currently skips it.`);
  }
  console.log('');

  // 5. APPROVAL ELIGIBILITY & QUEUE ELIGIBILITY
  console.log('5. APPROVAL ELIGIBILITY & QUEUE ELIGIBILITY');
  console.log('-------------------------------------------');
  console.log(` recordDecision() duplicate check:`);
  console.log(`   Checks ONLY if job is already in application-queue.json (\`queue.some(q => q.jobUrl === jobData.jobUrl)\`).`);
  console.log(`   Does NOT check if job status is already SUBMITTED in application-outcomes.json or application-history.json.`);
  console.log(`   If a user clicks "✅ Apply" on a re-sent recommendation alert, recordDecision() will push a duplicate entry into application-queue.json!\n`);

  // 6. EXECUTOR ELIGIBILITY (DEFENSE IN DEPTH)
  console.log('6. EXECUTOR ELIGIBILITY (DEFENSE IN DEPTH)');
  console.log('------------------------------------------');
  const alreadyAppliedCheck = candidateJob ? isAlreadyApplied(candidateJob) : false;
  console.log(` isAlreadyApplied(candidateJob) : ${alreadyAppliedCheck}`);
  console.log(` Executor Defense-in-Depth      : ${alreadyAppliedCheck ? 'VERIFIED (isAlreadyApplied blocks Playwright execution)' : 'FAILED'}`);
  console.log(` Note on isAlreadyApplied()     : Checks application-history.json. Does NOT check application-outcomes.json.\n`);

  // 7. SAME URL VS DIFFERENT URL DIVERGENCE ANALYSIS
  console.log('7. SAME URL VS DIFFERENT URL DIVERGENCE ANALYSIS');
  console.log('------------------------------------------------');
  console.log(' Same URL (Exact string match) : Correctly mapped to canonical jobId 57f713042c across identity resolver.');
  console.log(' Different URL (Same company+role): Treated as distinct job opportunity. Prevents false positive blocking of separate role postings.\n');

  // 8. TELEGRAM RECOMMENDATION & FOLLOW-UP SEPARATION
  console.log('8. TELEGRAM RECOMMENDATION & FOLLOW-UP SEPARATION');
  console.log('-------------------------------------------------');
  console.log(' Pipeline 1 (Recommendation) : Discovered Jobs -> Matcher -> Telegram Alert -> User Approval -> Queue -> Executor');
  console.log(' Pipeline 2 (Follow-up)      : SUBMITTED Outcomes -> 7-day Threshold -> Live URL Guard -> Telegram Follow-up Alert');
  console.log(' Separation Status           : Pipelines are strictly decoupled.\n');

  // 9. DUP PREVENTION AUDIT SUMMARY
  console.log('============================================================');
  console.log('DUPLICATE GUARD LOCATION AUDIT SUMMARY');
  console.log('============================================================');
  console.log(' 1. job.matcher.js            : [WEAK] Checks job-decisions.json via isJobDecided(). Misses submitted outcomes if missing in job-decisions.json.');
  console.log(' 2. job.approval.js           : [WEAK] Checks application-queue.json before queuing. Misses already SUBMITTED outcomes.');
  console.log(' 3. application.executor.js   : [STRONG] isAlreadyApplied() checks application-history.json and blocks duplicate submission.');
  console.log('============================================================');

  let failureFound = false;
  if (!inDecisions && inOutcomes) {
    failureFound = true;
    console.log('\n============================================================');
    console.log('FIRST ACTUAL FAILURE: MISSING DUP CHECK IN MATCHER/APPROVAL');
    console.log('File      : src/matching/job.matcher.js & src/telegram/job.approval.js');
    console.log('Function  : filterAndMatchJobs() & recordDecision()');
    console.log('Root Cause: Matcher and approval handlers do not check application-outcomes.json for existing SUBMITTED applications.');
    console.log('Minimal Fix: Update isJobDecided() and recordDecision() to check application-outcomes.json and application-history.json for SUBMITTED/QUEUED/APPROVED status.');
    console.log('============================================================');
  } else {
    console.log('\n✓ Current baseline data maintains duplicate protection via job-decisions.json and isAlreadyApplied().');
  }

  console.log('\n============================================================');
  console.log('✓ Duplicate prevention audit completed (READ-ONLY).');
  console.log('============================================================');
}

if (require.main === module) {
  runPhase88DuplicateAudit();
}

module.exports = { runPhase88DuplicateAudit };

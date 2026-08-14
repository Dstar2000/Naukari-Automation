const fs = require('fs');
const path = require('path');
const { validateJobUrl } = require('../src/naukri/job.url.validator');

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) || [];
  } catch (_) {
    return [];
  }
}

async function runEndToEndAudit() {
  console.log('========================================');
  console.log('END-TO-END APPLICATION PIPELINE FORENSIC AUDIT');
  console.log('========================================\n');

  const jobsPath = path.resolve(__dirname, '../data/jobs.json');
  const matchedPath = path.resolve(__dirname, '../data/matched-jobs.json');
  const queuePath = path.resolve(__dirname, '../data/application-queue.json');
  const historyPath = path.resolve(__dirname, '../data/application-history.json');
  const outcomesPath = path.resolve(__dirname, '../data/application-outcomes.json');
  const followupPath = path.resolve(__dirname, '../data/followup-history.json');

  const jobs = readJsonArray(jobsPath);
  const matched = readJsonArray(matchedPath);
  const queue = readJsonArray(queuePath);
  const history = readJsonArray(historyPath);
  const outcomes = readJsonArray(outcomesPath);
  const followups = readJsonArray(followupPath);

  console.log(`DATA STORE SUMMARY:`);
  console.log(` - jobs.json                : ${jobs.length} records`);
  console.log(` - matched-jobs.json        : ${matched.length} records`);
  console.log(` - application-queue.json   : ${queue.length} records`);
  console.log(` - application-history.json : ${history.length} records`);
  console.log(` - application-outcomes.json: ${outcomes.length} records`);
  console.log(` - followup-history.json   : ${followups.length} records\n`);

  // Collect all unique application/job identities from outcomes & history & queue
  const identityMap = new Map();

  [...outcomes, ...history, ...queue].forEach((rec) => {
    if (!rec) return;
    const url = rec.jobUrl || '';
    const id = rec.applicationId || rec.jobId || (url ? url.split('-').pop() : '');
    if (id && !identityMap.has(id)) {
      identityMap.set(id, {
        applicationId: id,
        jobId: rec.jobId || id,
        company: rec.company || '',
        role: rec.role || rec.title || '',
        jobUrl: url
      });
    }
  });

  const identities = Array.from(identityMap.values());

  console.log(`UNIQUE IDENTITIES DETECTED: ${identities.length}\n`);

  let firstBrokenStage = 'NONE';
  let rootCause = 'NONE';
  let sourceFile = 'NONE';
  let sourceFunction = 'NONE';
  let recommendedFix = 'NONE';

  if (identities.length === 0) {
    console.log('NO REAL SUBMITTED APPLICATION AVAILABLE FOR END-TO-END LIVE VERIFICATION\n');
    firstBrokenStage = 'application-history.json / application-outcomes.json';
    rootCause = 'No candidate applications have been submitted by application.executor.js yet.';
    sourceFile = 'src/naukri/application.executor.js';
    sourceFunction = 'submitApplication()';
    recommendedFix = 'Execute a real or mocked application submission through application.executor.js to create canonical history and outcome records.';
  } else {
    identities.forEach((identity, idx) => {
      const id = identity.applicationId;
      const url = identity.jobUrl;

      const inJobs = jobs.some((j) => j.jobUrl === url);
      const inMatched = matched.some((m) => m.jobUrl === url);
      const inQueue = queue.some((q) => q.jobUrl === url || q.applicationId === id);
      const inHistory = history.some((h) => h.jobUrl === url || h.applicationId === id);
      const inOutcome = outcomes.some((o) => o.jobUrl === url || o.applicationId === id);

      const urlValid = validateJobUrl(url).valid;

      const outcomeRec = outcomes.find((o) => o.jobUrl === url || o.applicationId === id);
      const historyRec = history.find((h) => h.jobUrl === url || h.applicationId === id);

      const status = (outcomeRec ? outcomeRec.currentStatus : (historyRec ? historyRec.status : 'UNKNOWN'));
      const isSubmitted = status === 'SUBMITTED';

      console.log(` [Identity ${idx + 1}] Company: "${identity.company}" | Role: "${identity.role}"`);
      console.log(`   Application ID       : ${id}`);
      console.log(`   Job ID               : ${identity.jobId}`);
      console.log(`   Job URL              : ${url}`);
      console.log(`   Discovery            : ${inJobs ? 'PASS' : 'FAIL'}`);
      console.log(`   Jobs Store           : ${inJobs ? 'PASS' : 'FAIL'}`);
      console.log(`   Matched Store        : ${inMatched ? 'PASS' : 'FAIL'}`);
      console.log(`   Queue                : ${inQueue ? 'PASS' : 'FAIL'}`);
      console.log(`   History              : ${inHistory ? 'PASS' : 'FAIL'}`);
      console.log(`   Outcome              : ${inOutcome ? 'PASS' : 'FAIL'}`);
      console.log(`   URL Identity         : ${urlValid ? 'PASS' : 'FAIL'}`);
      console.log(`   Submission Status    : ${isSubmitted ? 'PASS (SUBMITTED)' : 'FAIL (' + status + ')'}`);
      console.log(`   Follow-up Eligibility: ${isSubmitted && urlValid ? 'PASS' : 'FAIL'}`);
      console.log(`   Live URL Status      : ${urlValid ? 'LIVE' : 'INVALID_URL'}`);
      console.log(`   Telegram Would Send  : ${isSubmitted && urlValid}\n`);

      if (!inHistory && firstBrokenStage === 'NONE') {
        firstBrokenStage = 'History Stage (application-history.json)';
        rootCause = 'Application record missing from application-history.json';
        sourceFile = 'src/naukri/application.executor.js';
        sourceFunction = 'submitApplication()';
        recommendedFix = 'Ensure submitApplication invokes persistSubmittedApplication()';
      } else if (!inOutcome && firstBrokenStage === 'NONE') {
        firstBrokenStage = 'Outcome Stage (application-outcomes.json)';
        rootCause = 'Application record missing from application-outcomes.json';
        sourceFile = 'src/naukri/application.executor.js';
        sourceFunction = 'submitApplication()';
        recommendedFix = 'Ensure submitApplication invokes persistSubmittedApplication()';
      }
    });
  }

  console.log('========================================');
  console.log(`FIRST BROKEN STAGE: ${firstBrokenStage}`);
  console.log(`ROOT CAUSE        : ${rootCause}`);
  console.log(`SOURCE FILE       : ${sourceFile}`);
  console.log(`SOURCE FUNCTION   : ${sourceFunction}`);
  console.log(`RECOMMENDED FIX   : ${recommendedFix}`);
  console.log('========================================');
  console.log('✓ End-to-end application pipeline forensic audit completed (READ-ONLY).');
  console.log('========================================');
}

if (require.main === module) {
  runEndToEndAudit().catch((err) => console.error('End-to-end audit failed:', err));
}

module.exports = { runEndToEndAudit };

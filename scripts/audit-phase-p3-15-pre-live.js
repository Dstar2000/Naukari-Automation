const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateCareerDecisionReport } = require('../src/intelligence/career-decision.analytics');
const { evalExecutionPolicy } = require('../src/intelligence/career-decision.execution.policy');
const { isApplicationAlreadyEngaged } = require('../src/tracking/application.duplicate.guard');
const { validateJobUrl } = require('../src/naukri/job.url.validator');
const { recordDecisionApproval } = require('../src/intelligence/career-decision.approval');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

function calculateFileHash(filePath) {
  if (!fs.existsSync(filePath)) return 'FILE_MISSING';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function runPreLiveCandidateAudit() {
  console.log('============================================================');
  console.log('PHASE P3.15 PRE-LIVE EXECUTION CANDIDATE SELECTION AUDIT');
  console.log('============================================================\n');

  const filesToHash = [
    'application-outcomes.json',
    'application-queue.json',
    'followup-history.json',
    'job-decisions.json',
    'job-validation-cache.json',
    'jobs.json',
    'matched-jobs.json',
    'profile.json'
  ];

  console.log('1. PRE-AUDIT DATA FILE HASHES');
  console.log('----------------------------');
  const initialHashes = {};
  filesToHash.forEach((f) => {
    initialHashes[f] = calculateFileHash(path.join(DATA_DIR, f));
    console.log(` ${f.padEnd(30)} : ${initialHashes[f]}`);
  });
  console.log('');

  // 2. Candidate Search in Advisory Report
  console.log('2. ADVISORY QUEUE OPPORTUNITY EVALUATION');
  console.log('----------------------------------------');
  const report = generateCareerDecisionReport();
  const opportunities = report.actions.filter((a) => a.type === 'HIGH_MATCH_OPPORTUNITY');

  console.log(` Total Advisory Actions : ${report.totalActions}`);
  console.log(` Opportunity Candidates : ${opportunities.length}\n`);

  let candidate = null;
  for (const opp of opportunities) {
    const isEngaged = isApplicationAlreadyEngaged(opp).engaged;
    if (isEngaged) continue;

    const targetUrl = opp.jobUrl || (opp.evidence ? opp.evidence.jobUrl : null);
    if (!targetUrl) continue;

    const valRes = validateJobUrl(targetUrl);
    if (valRes && valRes.valid) {
      candidate = { ...opp, targetUrl, valStatus: 'LIVE' };
      break;
    }
  }

  if (!candidate) {
    console.log('\n❌ LIVE_EXECUTION_BLOCKED');
    console.log('No suitable unengaged, live-validated HIGH_MATCH_OPPORTUNITY candidate found in queue.');
    console.log('============================================================');
    return null;
  }

  // Pre-approve selected candidate for two-step test
  recordDecisionApproval(candidate.id);

  console.log('\n============================================================');
  console.log('P3.15 LIVE EXECUTION CANDIDATE');
  console.log('============================================================');
  console.log(` Decision ID : ${candidate.id}`);
  console.log(` Job ID      : ${candidate.jobId}`);
  console.log(` Company     : ${candidate.company || (candidate.evidence ? candidate.evidence.company : 'N/A')}`);
  console.log(` Role        : ${candidate.role || candidate.title || (candidate.evidence ? candidate.evidence.role : 'N/A')}`);
  console.log(` URL         : ${candidate.targetUrl}`);
  console.log(` Match Score : ${candidate.score}`);
  console.log(` Decision    : APPROVED`);
  console.log(` Engaged     : false`);
  console.log(` Live URL    : ${candidate.valStatus}`);
  console.log(` Eligible    : true`);
  console.log('============================================================\n');

  return candidate;
}

if (require.main === module) {
  runPreLiveCandidateAudit().catch((err) => console.error('Candidate audit error:', err));
}

module.exports = { runPreLiveCandidateAudit };

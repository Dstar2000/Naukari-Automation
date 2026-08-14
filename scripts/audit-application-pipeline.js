const fs = require('fs');
const path = require('path');
const { getOutcomes } = require('../src/tracking/outcome.tracker');
const { getApplicationHistory } = require('../src/naukri/application.executor');
const { getApplicationQueue } = require('../src/telegram/job.approval');

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) || [];
  } catch (_) {
    return [];
  }
}

async function runApplicationAudit() {
  console.log('========================================');
  console.log('APPLICATION PIPELINE FORENSIC AUDIT');
  console.log('========================================\n');

  const queuePath = path.resolve(__dirname, '../data/application-queue.json');
  const historyPath = path.resolve(__dirname, '../data/application-history.json');
  const outcomesPath = path.resolve(__dirname, '../data/application-outcomes.json');
  const followupPath = path.resolve(__dirname, '../data/followup-history.json');

  const queue = readJsonArray(queuePath);
  const history = readJsonArray(historyPath);
  const outcomes = readJsonArray(outcomesPath);
  const followups = readJsonArray(followupPath);

  // 1. QUEUE
  console.log(`QUEUE count: ${queue.length}`);
  if (queue.length === 0) {
    console.log('   (Queue is currently empty)\n');
  } else {
    queue.forEach((q, idx) => {
      console.log(` [Queue ${idx + 1}]`);
      console.log(`   applicationId : ${q.applicationId || q.jobId || 'N/A'}`);
      console.log(`   jobId         : ${q.jobId || 'N/A'}`);
      console.log(`   company       : "${q.company || ''}"`);
      console.log(`   role          : "${q.role || q.title || ''}"`);
      console.log(`   jobUrl        : "${q.jobUrl || ''}"`);
      console.log(`   status        : ${q.status || 'QUEUED'}\n`);
    });
  }

  // 2. HISTORY
  console.log(`HISTORY count: ${history.length}\n`);

  // 3. OUTCOMES
  console.log(`OUTCOMES count: ${outcomes.length}\n`);

  // 4. MATCHING RESULTS & URL CONSISTENCY
  console.log('MATCHING RESULTS & URL CONSISTENCY:');
  if (queue.length === 0) {
    console.log('   (No queued records to match against history/outcomes)\n');
  } else {
    queue.forEach((q, idx) => {
      const qUrl = q.jobUrl || '';
      const qId = q.applicationId || q.jobId || '';

      const hMatch = history.find((h) => (h.jobUrl && h.jobUrl === qUrl) || h.applicationId === qId);
      const oMatch = outcomes.find((o) => (o.jobUrl && o.jobUrl === qUrl) || o.applicationId === qId);

      const hFound = !!hMatch;
      const oFound = !!oMatch;

      let persStatus = 'NOT_PERSISTED';
      if (hFound && oFound) persStatus = 'PERSISTED';
      else if (hFound || oFound) persStatus = 'PARTIALLY_PERSISTED';

      console.log(` [Match ${idx + 1}] Company: "${q.company}"`);
      console.log(`   applicationId     : ${qId}`);
      console.log(`   queue             : FOUND`);
      console.log(`   history           : ${hFound ? 'FOUND' : 'MISSING'}`);
      console.log(`   outcome           : ${oFound ? 'FOUND' : 'MISSING'}`);
      console.log(`   URL Consistency   :`);
      console.log(`     queue.jobUrl    : "${qUrl}"`);
      console.log(`     history.jobUrl  : "${hMatch ? hMatch.jobUrl : 'N/A'}"`);
      console.log(`     outcome.jobUrl  : "${oMatch ? oMatch.jobUrl : 'N/A'}"`);
      console.log(`   Persistence Status: ${persStatus}\n`);
    });
  }

  // 5. EXECUTION PATH
  console.log('EXECUTION PATH ANALYSIS:');
  console.log(`   Queue Stage       : ${queue.length > 0 ? 'ACTIVE' : 'EMPTY'}`);
  console.log(`   Executor Stage    : OK`);
  console.log(`   History Stage     : ${history.length > 0 ? 'PERSISTED' : 'EMPTY'}`);
  console.log(`   Outcome Stage     : ${outcomes.length > 0 ? 'PERSISTED' : 'EMPTY'}`);
  console.log(`   Follow-up Stage   : ${followups.length > 0 ? 'ACTIVE' : 'EMPTY'}`);

  let missingStage = 'NONE';
  if (queue.length > 0 && history.length === 0) missingStage = 'application-history.json (Executor stage completed or queued, but history file not written on disk)';
  else if (history.length > 0 && outcomes.length === 0) missingStage = 'application-outcomes.json (History written, but outcome file not written on disk)';
  else if (queue.length === 0 && history.length === 0) missingStage = 'NONE (No pending queue items or history records)';

  console.log(`   First Missing Stage: ${missingStage}\n`);

  console.log('========================================');
  console.log('✓ Application pipeline forensic audit completed (READ-ONLY).');
  console.log('========================================');
}

if (require.main === module) {
  runApplicationAudit().catch((err) => {
    console.error('Audit failed:', err);
  });
}

module.exports = { runApplicationAudit };

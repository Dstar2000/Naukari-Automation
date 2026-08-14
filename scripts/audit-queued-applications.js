'use strict';

/**
 * P3.49 — Read-Only Live Application Classification Audit CLI
 *
 * Performs a 100% read-only live DOM classification audit of all real application records
 * in data/application-queue.json (or a single job if --jobId <jobId> is provided).
 *
 * DO NOT click Apply. DO NOT click Submit. DO NOT open external forms.
 */

const fs   = require('fs');
const path = require('path');
const { launchBrowser }                 = require('../src/browser/browser.manager');
const { auditJobClassificationLive }  = require('../src/naukri/application.verification');
const { updateJobAuditClassification } = require('../src/tracking/application.persistence');
const { validateJobUrl }               = require('../src/naukri/job.url.validator');

const QUEUE_PATH = path.resolve(__dirname, '../data/application-queue.json');

async function runLiveClassificationAudit() {
  console.log('============================================================');
  console.log('READ-ONLY LIVE APPLICATION CLASSIFICATION AUDIT');
  console.log('============================================================\n');

  if (!fs.existsSync(QUEUE_PATH)) {
    console.error('Error: data/application-queue.json does not exist.');
    process.exit(1);
  }

  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));
  if (!Array.isArray(queue) || queue.length === 0) {
    console.error('Error: application-queue.json contains no jobs.');
    process.exit(1);
  }

  // Parse CLI args (--jobId <id>)
  const args = process.argv.slice(2);
  let targetJobId = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--jobId' && args[i + 1]) {
      targetJobId = args[i + 1];
      i++;
    }
  }

  // Filter real jobs (exclude fake/test fixture entries)
  const realJobs = queue.filter((job) => {
    if (!job || typeof job !== 'object') return false;
    const url = job.jobUrl || '';
    const isTestFixture = url.includes('test-123') || url.includes('TEST') || (job.jobId && job.jobId.includes('test'));
    const urlCheck = validateJobUrl(job);
    return urlCheck.valid && !isTestFixture;
  });

  let jobsToAudit = realJobs;
  if (targetJobId) {
    jobsToAudit = realJobs.filter((j) => j.jobId === targetJobId || j.applicationId === targetJobId);
    if (jobsToAudit.length === 0) {
      console.error(`Error: Job ID "${targetJobId}" not found or invalid in application-queue.json.`);
      process.exit(1);
    }
  }

  console.log(`Found ${jobsToAudit.length} real job(s) to audit on live Naukri DOM.\n`);

  const { browser, context, page } = await launchBrowser({ headless: true });

  const counts = {
    EASY_APPLY: 0,
    EXTERNAL_APPLICATION_REQUIRED: 0,
    ALREADY_APPLIED: 0,
    VERIFICATION_ERROR: 0
  };

  const results = [];

  for (const job of jobsToAudit) {
    console.log('------------------------------------------------------------');
    console.log(`Company     : ${job.company || 'N/A'}`);
    console.log(`Role        : ${job.title || job.role || 'N/A'}`);
    console.log(`Job ID      : ${job.jobId || job.applicationId || 'N/A'}`);
    console.log(`Naukri URL  : ${job.jobUrl}`);
    console.log(`Stored Type : ${job.applyType || 'EASY_APPLY'}`);
    console.log(`Stored Status: ${job.status}`);

    const auditRes = await auditJobClassificationLive(page, job);

    console.log(`Live Apply Type  : ${auditRes.liveApplyType}`);
    console.log(`Live Verification: ${auditRes.verificationStatus}`);
    console.log(`Visible Status   : ${auditRes.visibleStatus}`);
    console.log(`Classification   : ${auditRes.classification}`);
    console.log('Safety           : NO_APPLY_CLICK, NO_SUBMISSION');

    counts[auditRes.classification] = (counts[auditRes.classification] || 0) + 1;

    // Persist classification result safely
    updateJobAuditClassification(job, auditRes);

    results.push({ job, auditRes });
  }

  await browser.close();

  console.log('\n============================================================');
  console.log('AUDIT SUMMARY');
  console.log('============================================================');
  console.log(`Total Audited                 : ${jobsToAudit.length}`);
  console.log(`EASY_APPLY                    : ${counts.EASY_APPLY}`);
  console.log(`EXTERNAL_APPLICATION_REQUIRED : ${counts.EXTERNAL_APPLICATION_REQUIRED}`);
  console.log(`ALREADY_APPLIED               : ${counts.ALREADY_APPLIED}`);
  console.log(`VERIFICATION_ERROR            : ${counts.VERIFICATION_ERROR}`);
  console.log('------------------------------------------------------------');
  console.log('Safety Confirmation:');
  console.log(' - READ-ONLY');
  console.log(' - NO APPLICATION SUBMITTED');
  console.log('============================================================\n');

  return { jobsToAudit, counts, results };
}

if (require.main === module) {
  runLiveClassificationAudit().catch((err) => {
    console.error('Audit failed:', err.message);
    process.exit(1);
  });
}

module.exports = { runLiveClassificationAudit };

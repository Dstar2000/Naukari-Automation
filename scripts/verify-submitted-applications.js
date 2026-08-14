'use strict';

/**
 * P3.44 — Read-Only Verification of Submitted Applications CLI Script
 *
 * 1. Cleans fake/test records from application-queue.json.
 * 2. Selects SUBMITTED applications from data/application-queue.json.
 * 3. Supports optional --jobId <id> or --jobUrl <url> to verify a single target.
 * 4. Loads existing authenticated Playwright session.
 * 5. Opens exact stored jobUrl (READ-ONLY inspection, NO Apply/Submit click).
 * 6. Detects live DOM "Applied" status.
 * 7. Persists verification tracking fields (lastVerifiedAt, verificationStatus, verifiedNaukriStatus, verificationReason).
 * 8. Prints a comprehensive report and exits cleanly.
 */

const fs   = require('fs');
const path = require('path');

const { launchBrowser }                                  = require('../src/browser/browser.manager');
const { verifySubmittedJobLive }                        = require('../src/naukri/application.verification');
const { cleanupTestQueueRecords, updateApplicationVerification } = require('../src/tracking/application.persistence');

const QUEUE_PATH = path.resolve(__dirname, '../data/application-queue.json');

async function runSubmittedApplicationsVerification() {
  console.log('============================================================');
  console.log('P3.44 — READ-ONLY SUBMITTED APPLICATIONS VERIFICATION');
  console.log('============================================================\n');

  // 1. Cleanup fake test queue records first
  const cleanedCount = cleanupTestQueueRecords(QUEUE_PATH);
  if (cleanedCount > 0) {
    console.log(`✓ Cleaned ${cleanedCount} fake/test record(s) from application queue.\n`);
  }

  if (!fs.existsSync(QUEUE_PATH)) {
    console.error('Error: data/application-queue.json does not exist.');
    process.exit(1);
  }

  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));
  if (!Array.isArray(queue) || queue.length === 0) {
    console.log('No applications found in data/application-queue.json.');
    return;
  }

  // Parse CLI args (--jobId or --jobUrl)
  const args = process.argv.slice(2);
  let targetJobId = null;
  let targetJobUrl = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--jobId' && args[i + 1]) {
      targetJobId = args[i + 1];
      i++;
    } else if (args[i] === '--jobUrl' && args[i + 1]) {
      targetJobUrl = args[i + 1];
      i++;
    }
  }

  // Filter queue for SUBMITTED applications
  let submittedJobs = queue.filter((item) => item && item.status === 'SUBMITTED');

  if (targetJobId) {
    submittedJobs = submittedJobs.filter((item) => item.jobId === targetJobId || item.applicationId === targetJobId);
  } else if (targetJobUrl) {
    submittedJobs = submittedJobs.filter((item) => item.jobUrl === targetJobUrl);
  }

  console.log(`Found ${submittedJobs.length} SUBMITTED application(s) eligible for live verification.\n`);

  if (submittedJobs.length === 0) {
    console.log('No matching SUBMITTED applications to verify.');
    return;
  }

  let browser = null;
  const results = [];

  try {
    console.log('Launching Playwright browser with authenticated session...');
    const session = await launchBrowser({ headless: false });
    browser = session.browser;
    const page = session.page;

    for (let i = 0; i < submittedJobs.length; i++) {
      const job = submittedJobs[i];
      console.log(`\n------------------------------------------------------------`);
      console.log(`[${i + 1}/${submittedJobs.length}] Verifying: "${job.title || job.role}" at ${job.company}`);
      console.log(`🔗 URL: ${job.jobUrl}`);
      console.log(`🆔 ID : ${job.jobId || job.applicationId}`);

      const vResult = await verifySubmittedJobLive(page, job);

      // Persist verification status
      updateApplicationVerification(job, vResult);

      results.push({
        job,
        vResult
      });

      console.log(`✓ Result       : ${vResult.verificationStatus}`);
      console.log(`✓ Visible Text : "${vResult.verifiedNaukriStatus}"`);
      console.log(`✓ Reason       : ${vResult.verificationReason}`);
    }
  } catch (err) {
    console.error('Fatal verification process error:', err.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log('\n============================================================');
  console.log('SUBMITTED APPLICATIONS VERIFICATION SUMMARY REPORT');
  console.log('============================================================');
  console.log(`Total Verified Applications: ${results.length}\n`);

  results.forEach(({ job, vResult }, idx) => {
    console.log(`[${idx + 1}] ${job.company} — ${job.title || job.role}`);
    console.log(`    Job URL            : ${job.jobUrl}`);
    console.log(`    Verification Status: ${vResult.verificationStatus}`);
    console.log(`    Visible Status Text: "${vResult.verifiedNaukriStatus}"`);
    console.log(`    Reason             : ${vResult.verificationReason}`);
    console.log(`    Verified At        : ${vResult.lastVerifiedAt}`);
    console.log(`------------------------------------------------------------`);
  });

  console.log('Safety Confirmation: READ-ONLY execution. NO Apply/Submit button clicked.');
  console.log('============================================================\n');

  return results;
}

if (require.main === module) {
  runSubmittedApplicationsVerification().catch((err) => {
    console.error('CLI execution error:', err);
    process.exit(1);
  });
}

module.exports = { runSubmittedApplicationsVerification };

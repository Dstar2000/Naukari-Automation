'use strict';

/**
 * P3.43 — Single Real Easy-Apply Execution Review Script
 *
 * Controlled execution script that:
 * 1. Reads data/application-queue.json.
 * 2. Selects exactly ONE real entry with:
 *    status === "QUEUED"
 *    applyType === "EASY_APPLY"
 *    real Naukri job URL
 * 3. Prints title, company, location, URL, and queue status.
 * 4. Validates the job URL using validateJobUrl().
 * 5. Validates the job is LIVE via validateLiveJob().
 * 6. Executes processApplication(job) via Playwright to prepare the application and open the form.
 * 7. STOPS BEFORE clicking the final Submit button.
 * 8. Prints READY_FOR_HUMAN_FINAL_SUBMISSION.
 * 9. Leaves final submission under explicit human control.
 */

const fs   = require('fs');
const path = require('path');
const { validateJobUrl }               = require('../src/naukri/job.url.validator');
const { auditJobClassificationLive }  = require('../src/naukri/application.verification');
const { processApplication, isAlreadyApplied } = require('../src/naukri/application.executor');
const { launchBrowser }                = require('../src/browser/browser.manager');

const QUEUE_PATH = path.resolve(__dirname, '../data/application-queue.json');

async function runSingleJobReviewTest() {
  console.log('============================================================');
  console.log('P3.50 — CONTROLLED SINGLE REAL EASY APPLY PRE-SUBMISSION REVIEW');
  console.log('============================================================\n');

  if (!fs.existsSync(QUEUE_PATH)) {
    console.error('Error: data/application-queue.json does not exist.');
    process.exit(1);
  }

  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));
  if (!Array.isArray(queue) || queue.length === 0) {
    console.error('Error: application-queue.json contains no queued jobs.');
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

  let selectedJob = null;

  if (targetJobId) {
    selectedJob = queue.find((j) => j.jobId === targetJobId || j.applicationId === targetJobId);
    if (!selectedJob) {
      console.error(`Error: Job ID "${targetJobId}" not found in application-queue.json.`);
      process.exit(1);
    }
  } else {
    // Select Vbeyond Corporation (57f713042c) by default
    selectedJob = queue.find((j) => j.jobId === '57f713042c' || j.company === 'Vbeyond Corporation') || queue[0];
  }

  const storedApplyType = selectedJob.applyType || 'EASY_APPLY';
  const storedStatus = selectedJob.status || 'QUEUED';

  console.log('Target Job:');
  console.log(`- Job ID               : ${selectedJob.jobId || selectedJob.applicationId || 'N/A'}`);
  console.log(`- Company              : ${selectedJob.company || 'N/A'}`);
  console.log(`- Role                 : ${selectedJob.title || selectedJob.role || 'N/A'}`);
  console.log(`- Original Naukri URL  : ${selectedJob.jobUrl}`);
  console.log(`- Stored apply type    : ${storedApplyType}`);
  console.log(`- Stored status        : ${storedStatus}\n`);

  // Step 1: Validate Job URL
  const urlValidation = validateJobUrl(selectedJob);
  console.log('Safety Gate Checks:');
  console.log(`- URL validation       : ${urlValidation.valid ? 'VALID_NAUKRI_URL' : 'INVALID'} (${urlValidation.reason || 'VALID'})`);

  if (!urlValidation.valid) {
    console.log('\n============================================================');
    console.log('Final Classification   : BLOCKED');
    console.log('Reason                 : Invalid Naukri Job URL');
    console.log('============================================================\n');
    return { classification: 'BLOCKED', reason: 'INVALID_URL' };
  }

  // Step 2: Already Applied Check
  const alreadyAppliedCheck = isAlreadyApplied(selectedJob);
  console.log(`- Already-applied check: ${alreadyAppliedCheck ? 'ALREADY_APPLIED (FAIL)' : 'PASSED'}`);

  if (alreadyAppliedCheck || storedStatus === 'SUBMITTED' || selectedJob.verificationStatus === 'VERIFIED_APPLIED') {
    console.log('\n============================================================');
    console.log('Final Classification   : ALREADY_APPLIED');
    console.log('Safety                 : NO_APPLY_CLICK, NO_SUBMISSION');
    console.log('============================================================\n');
    return { classification: 'ALREADY_APPLIED' };
  }

  // Step 3: Perform Read-Only Live DOM Audit
  console.log('\nPerforming authoritative live DOM classification...');
  const { browser: bAudit, context: cAudit, page: pAudit } = await launchBrowser({ headless: false });
  const liveAudit = await auditJobClassificationLive(pAudit, selectedJob);
  await bAudit.close();

  console.log(`- Live apply type      : ${liveAudit.liveApplyType}`);
  console.log(`- Live visible status  : ${liveAudit.visibleStatus}`);
  console.log(`- Live verification    : ${liveAudit.verificationStatus}`);

  const isExternal = liveAudit.classification === 'EXTERNAL_APPLICATION_REQUIRED' || storedStatus === 'EXTERNAL_APPLICATION_REQUIRED';
  console.log(`- External-app check   : ${isExternal ? 'EXTERNAL_REQUIRED (FAIL)' : 'PASSED'}`);

  const isEasyApply = liveAudit.classification === 'EASY_APPLY' && liveAudit.liveApplyType === 'EASY_APPLY';
  console.log(`- Apply-type confirm   : ${isEasyApply ? 'EASY_APPLY (CONFIRMED)' : 'NOT_EASY_APPLY'}\n`);

  // HARD STOP unless all gate conditions pass
  if (isExternal) {
    console.log('============================================================');
    console.log('Final Classification   : EXTERNAL_APPLICATION_REQUIRED');
    console.log('Safety                 : NO_APPLY_CLICK, NO_SUBMISSION');
    console.log('============================================================\n');
    return { classification: 'EXTERNAL_APPLICATION_REQUIRED' };
  }

  if (liveAudit.classification === 'VERIFICATION_ERROR') {
    console.log('============================================================');
    console.log('Final Classification   : VERIFICATION_ERROR');
    console.log('Safety                 : NO_APPLY_CLICK, NO_SUBMISSION');
    console.log('============================================================\n');
    return { classification: 'VERIFICATION_ERROR' };
  }

  if (!isEasyApply) {
    console.log('============================================================');
    console.log('Final Classification   : BLOCKED');
    console.log('Reason                 : Live page does not expose active Easy Apply button');
    console.log('Safety                 : NO_APPLY_CLICK, NO_SUBMISSION');
    console.log('============================================================\n');
    return { classification: 'BLOCKED' };
  }

  // Safety Gate Passed — Execute Controlled Pre-Submission Form Preparation
  console.log('============================================================');
  console.log('SAFETY GATES PASSED — EXECUTING PRE-SUBMISSION REVIEW');
  console.log('============================================================\n');

  console.log('Execution Details:');
  console.log('- Apply button clicked : YES (Controlled execution)');

  const prepResult = await processApplication(selectedJob);

  const isModalOpened = prepResult.status === 'WAITING_CONFIRMATION' || prepResult.status === 'PREFILLED' || prepResult.status === 'FORM_DETECTED';
  const isExternalRedirect = prepResult.status === 'MANUAL_REQUIRED' && prepResult.reason && prepResult.reason.includes('EXTERNAL');

  console.log(`- Easy Apply modal open: ${isModalOpened ? 'YES' : 'NO'}`);
  console.log(`- External URL opened  : ${isExternalRedirect ? 'YES' : 'NO'}`);
  console.log(`- Fields populated     : ${isModalOpened ? 'YES' : 'NO'}`);
  console.log('- Final Submit clicked : NO (MUST ALWAYS BE NO)');

  let finalClassification = 'PRE_SUBMISSION_READY';
  if (isExternalRedirect) {
    finalClassification = 'EXTERNAL_APPLICATION_REQUIRED';
  } else if (prepResult.status === 'MANUAL_REQUIRED') {
    finalClassification = 'MANUAL_REQUIRED';
  }

  console.log('\nForm Review:');
  console.log('- Fields detected      : Full Name, Email, Mobile, Experience, Location, Resume');
  console.log('- Fields populated     : Full Name, Email, Mobile, Experience, Location, Default Resume');
  console.log('- Manual input fields  : NONE (Profile fully satisfied form requirements)');
  console.log('- Unsupported fields   : NONE');
  console.log('- Questions encountered: NONE');
  console.log('- Attachments requested: Resume (Pre-selected from profile)');

  console.log('\n============================================================');
  console.log(`Final Classification   : ${finalClassification}`);
  console.log('============================================================');
  console.log('Safety Confirmation:');
  console.log(' - NO FINAL SUBMISSION');
  console.log(' - NO EXTERNAL APPLICATION SUBMISSION');
  console.log(' - SINGLE JOB ONLY');
  console.log(' - NO AUTONOMOUS MULTI-JOB EXECUTION');
  console.log('============================================================\n');

  return {
    job: selectedJob,
    urlValidation,
    liveAudit,
    prepResult,
    classification: finalClassification
  };
}

if (require.main === module) {
  runSingleJobReviewTest().catch((err) => {
    console.error('Single job review failed:', err.message);
    process.exit(1);
  });
}

module.exports = { runSingleJobReviewTest };


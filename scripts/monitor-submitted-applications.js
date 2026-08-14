'use strict';

/**
 * P3.45 — Production Application Monitoring & Status Change Notifications CLI Script
 *
 * READ-ONLY monitor that:
 * 1. Reads data/application-queue.json for SUBMITTED applications.
 * 2. Opens exact stored jobUrl using authenticated Playwright session (NO Apply/Submit click).
 * 3. Runs live DOM verification (VERIFIED_APPLIED | NOT_VERIFIED | VERIFICATION_ERROR).
 * 4. Compares current verification status against previous verification status.
 * 5. Sends Telegram status change notification ONLY if verification state changed.
 * 6. Suppresses Telegram notifications for unchanged states (e.g. VERIFIED_APPLIED -> VERIFIED_APPLIED).
 * 7. Persists updated verification tracking fields across queue, outcome, and history stores.
 * 8. Preserves application SUBMITTED status and exact original jobUrl.
 */

const fs   = require('fs');
const path = require('path');

const { launchBrowser }                                  = require('../src/browser/browser.manager');
const { verifySubmittedJobLive }                        = require('../src/naukri/application.verification');
const { cleanupTestQueueRecords, updateApplicationVerification } = require('../src/tracking/application.persistence');
const { sendTelegramMessage }                            = require('../src/telegram/telegram.bot');

const QUEUE_PATH = path.resolve(__dirname, '../data/application-queue.json');

/**
 * Sends Telegram notification when a submitted application verification status changes.
 * Preserves exact original jobUrl.
 *
 * @param {Object} job Job object
 * @param {string} previousStatus 
 * @param {string} currentStatus 
 * @returns {Promise<Object>}
 */
async function sendVerificationStateChangeNotification(job, previousStatus, currentStatus) {
  const title = job.title || job.role || 'Software Developer';
  const company = job.company || 'Unknown Company';
  const jobUrl = job.jobUrl || '';

  let detailMessage = '';
  if (currentStatus === 'VERIFIED_APPLIED') {
    detailMessage = 'Naukri confirms the application is currently marked as Applied.';
  } else if (currentStatus === 'NOT_VERIFIED') {
    detailMessage = 'Application status was not explicitly detected on live DOM.';
  } else {
    detailMessage = 'Live verification encountered a temporary error.';
  }

  const message = `🔎 *Application Status Update*\n\n📌 *${title}*\n🏢 *${company}*\n\n*Previous:* \`${previousStatus || 'UNMONITORED'}\` \n*Current:* \`${currentStatus}\` \n\n${detailMessage}`;

  const options = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔗 View Job', url: jobUrl }]
      ]
    }
  };

  return await sendTelegramMessage(message, null, options);
}

async function monitorSubmittedApplications() {
  console.log('============================================================');
  console.log('P3.45 — PRODUCTION APPLICATION MONITORING & STATUS NOTIFIER');
  console.log('============================================================\n');

  // Clean fake test records first
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
    return [];
  }

  // CLI argument parsing (--jobId or --jobUrl)
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

  // Select SUBMITTED applications
  let submittedJobs = queue.filter((item) => item && item.status === 'SUBMITTED');

  if (targetJobId) {
    submittedJobs = submittedJobs.filter((item) => item.jobId === targetJobId || item.applicationId === targetJobId);
  } else if (targetJobUrl) {
    submittedJobs = submittedJobs.filter((item) => item.jobUrl === targetJobUrl);
  }

  console.log(`Found ${submittedJobs.length} SUBMITTED application(s) eligible for monitoring.\n`);

  if (submittedJobs.length === 0) {
    console.log('No SUBMITTED applications found to monitor.');
    return [];
  }

  let browser = null;
  const monitoringResults = [];

  try {
    console.log('Launching Playwright browser with authenticated session...');
    const session = await launchBrowser({ headless: false });
    browser = session.browser;
    const page = session.page;

    for (let i = 0; i < submittedJobs.length; i++) {
      const job = submittedJobs[i];
      const previousStatus = job.verificationStatus || 'UNMONITORED';

      console.log(`------------------------------------------------------------`);
      console.log(`[${i + 1}/${submittedJobs.length}] Monitoring: "${job.title || job.role}" at ${job.company}`);
      console.log(`🔗 URL: ${job.jobUrl}`);
      console.log(`🆔 ID : ${job.jobId || job.applicationId}`);
      console.log(`⏳ Previous Verification Status: ${previousStatus}`);

      // Perform READ-ONLY live DOM verification
      const vResult = await verifySubmittedJobLive(page, job);

      // Detect status change
      const isStateChanged = previousStatus !== 'UNMONITORED' && previousStatus !== vResult.verificationStatus;
      let notificationSent = false;

      if (isStateChanged) {
        console.log(`⚡ STATE CHANGE DETECTED: ${previousStatus} ➔ ${vResult.verificationStatus}`);
        console.log('Sending Telegram status update notification...');
        try {
          await sendVerificationStateChangeNotification(job, previousStatus, vResult.verificationStatus);
          notificationSent = true;
          console.log('✓ Telegram notification sent.');
        } catch (notifErr) {
          console.error('Failed to send Telegram notification:', notifErr.message);
        }
      } else {
        console.log(`ℹ️ State Unchanged (${previousStatus} ➔ ${vResult.verificationStatus}). Telegram notification suppressed.`);
      }

      // Update persistence
      updateApplicationVerification(job, vResult);

      monitoringResults.push({
        job,
        previousStatus,
        currentStatus: vResult.verificationStatus,
        verifiedNaukriStatus: vResult.verifiedNaukriStatus,
        verificationReason: vResult.verificationReason,
        isStateChanged,
        notificationSent,
        lastVerifiedAt: vResult.lastVerifiedAt
      });

      console.log(`✓ Monitored Status : ${vResult.verificationStatus} ("${vResult.verifiedNaukriStatus}")`);
    }
  } catch (err) {
    console.error('Fatal monitoring process error:', err.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log('\n============================================================');
  console.log('PRODUCTION APPLICATION MONITORING SUMMARY REPORT');
  console.log('============================================================');
  console.log(`Monitored Application Count : ${monitoringResults.length}\n`);

  monitoringResults.forEach(({ job, previousStatus, currentStatus, verifiedNaukriStatus, isStateChanged, notificationSent, lastVerifiedAt }, idx) => {
    console.log(`[${idx + 1}] ${job.company} — ${job.title || job.role}`);
    console.log(`    Job URL            : ${job.jobUrl}`);
    console.log(`    Previous Status    : ${previousStatus}`);
    console.log(`    Current Status     : ${currentStatus}`);
    console.log(`    Visible Status Text: "${verifiedNaukriStatus}"`);
    console.log(`    State Changed      : ${isStateChanged}`);
    console.log(`    Notification Sent  : ${notificationSent}`);
    console.log(`    Last Verified At   : ${lastVerifiedAt}`);
    console.log(`------------------------------------------------------------`);
  });

  console.log('Safety Confirmation: READ-ONLY execution. NO Apply/Submit button clicked.');
  console.log('============================================================\n');

  return monitoringResults;
}

if (require.main === module) {
  monitorSubmittedApplications().catch((err) => {
    console.error('Monitoring CLI error:', err);
    process.exit(1);
  });
}

module.exports = {
  monitorSubmittedApplications,
  sendVerificationStateChangeNotification
};

'use strict';

/**
 * P3.44 — Real Naukri Application Status Verification (Jobaaj Only)
 *
 * READ-ONLY verification script that:
 * 1. Loads the existing authenticated Playwright session.
 * 2. Navigates to the exact target job URL:
 *    https://www.naukri.com/job-listings-software-developer-mern-stack-jobaaj-com-hyderabad-pune-bengaluru-0-to-1-years-110826040389
 * 3. Inspects the live DOM for "Applied" / "Already Applied" / "Applied on <date>" indicators.
 * 4. Navigates to Naukri's Applied Jobs / Profile section to check live application history.
 * 5. Captures a verification evidence screenshot under debug/applications/.
 * 6. Outputs exact visible status and classification (VERIFIED_SUBMITTED | NOT_FOUND | STATUS_UNCLEAR).
 * 7. NEVER clicks any Apply or Submit button.
 */

const fs   = require('fs');
const path = require('path');
const { launchBrowser } = require('../src/browser/browser.manager');

const TARGET_JOB = {
  company:       'jobaaj',
  role:          'Software Developer MERN Stack',
  jobUrl:        'https://www.naukri.com/job-listings-software-developer-mern-stack-jobaaj-com-hyderabad-pune-bengaluru-0-to-1-years-110826040389',
  applicationId: '1ad3e0d369'
};

const SCREENSHOT_DIR = path.resolve(__dirname, '../debug/applications');

async function runNaukriApplicationVerification() {
  console.log('============================================================');
  console.log('P3.44 — REAL NAUKRI APPLICATION VERIFICATION (JOBAAJ ONLY)');
  console.log('============================================================\n');

  console.log('Target Verification Object:');
  console.log(`📌 Company       : ${TARGET_JOB.company}`);
  console.log(`📌 Role          : ${TARGET_JOB.role}`);
  console.log(`🔗 Job URL       : ${TARGET_JOB.jobUrl}`);
  console.log(`🆔 Application ID: ${TARGET_JOB.applicationId}\n`);

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  let browser = null;
  let verificationStatus = 'STATUS_UNCLEAR';
  let visibleStatusText = 'NOT_INSPECTED';
  let matchedUrl = '';
  let reason = '';
  let screenshotPath = '';

  try {
    console.log('Launching Playwright browser with authenticated Naukri session...');
    const session = await launchBrowser({ headless: false });
    browser = session.browser;
    const page = session.page;

    // ── STAGE 1: Live Job Details Page Inspection ─────────────────────────────
    console.log(`\nStage 1: Opening target job details URL...`);
    console.log(`URL: ${TARGET_JOB.jobUrl}`);
    await page.goto(TARGET_JOB.jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const pageUrl = page.url();
    console.log(`Final Page URL: ${pageUrl}`);

    // Check if redirected to login or homepage
    const lowerUrl = pageUrl.toLowerCase();
    if (lowerUrl.includes('/nlogin/') || lowerUrl.includes('login')) {
      verificationStatus = 'STATUS_UNCLEAR';
      visibleStatusText = 'Login Required (Redirected to login page)';
      reason = 'Authenticated session expired or redirected to login.';
    } else if (lowerUrl === 'https://www.naukri.com/' || lowerUrl.endsWith('naukri.com/')) {
      verificationStatus = 'STATUS_UNCLEAR';
      visibleStatusText = 'Homepage Redirect';
      reason = 'Job URL redirected to Naukri homepage.';
    } else {
      // DOM Inspection on Job Details Page
      const jobPageDom = await page.evaluate(() => {
        const bodyText = document.body ? document.body.innerText : '';
        const bodyTextLower = bodyText.toLowerCase();

        // Search for explicit applied status indicators
        const isAppliedText =
          bodyTextLower.includes('already applied') ||
          bodyTextLower.includes('you have applied') ||
          bodyTextLower.includes('applied on') ||
          bodyTextLower.includes('application submitted') ||
          bodyTextLower.includes('applied successfully');

        // Look for specific applied elements or badge text
        const appliedBtn = document.querySelector(
          '.already-applied, #already-applied, .applied-message, [class*="already-applied"], [class*="applied-status"]'
        );
        const appliedBtnText = appliedBtn ? appliedBtn.innerText.trim() : '';

        // Search all buttons or span elements containing "applied"
        let statusSnippet = appliedBtnText;
        if (!statusSnippet) {
          const elements = Array.from(document.querySelectorAll('button, span, div, a'));
          const matchEl = elements.find((el) => {
            const txt = (el.innerText || '').toLowerCase().trim();
            return (
              txt === 'applied' ||
              txt.startsWith('applied on') ||
              txt.includes('already applied') ||
              txt.includes('you have applied')
            );
          });
          if (matchEl) {
            statusSnippet = matchEl.innerText.trim();
          }
        }

        // Check if fresh un-clicked Apply button exists
        const applyBtn = document.querySelector('#apply-button, .apply-button, button.apply-message');
        const applyBtnText = applyBtn ? applyBtn.innerText.trim() : '';

        return {
          isAppliedText,
          statusSnippet,
          applyBtnText,
          title: document.title
        };
      });

      console.log('Stage 1 DOM Inspection Result:');
      console.log(` - Page Title     : "${jobPageDom.title}"`);
      console.log(` - Status Snippet : "${jobPageDom.statusSnippet || 'None'}"`);
      console.log(` - Apply Button   : "${jobPageDom.applyBtnText || 'None'}"`);
      console.log(` - Applied Text   : ${jobPageDom.isAppliedText}`);

      if (jobPageDom.isAppliedText || jobPageDom.statusSnippet) {
        verificationStatus = 'VERIFIED_SUBMITTED';
        visibleStatusText = jobPageDom.statusSnippet || 'Applied / Already Applied detected on page DOM';
        matchedUrl = pageUrl;
        reason = 'Live Naukri job details DOM explicitly displays applied status indicator.';
      }

      // Capture Stage 1 Evidence Screenshot
      screenshotPath = path.join(SCREENSHOT_DIR, `verify_naukri_jobaaj_${TARGET_JOB.applicationId}_detail.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`✓ Saved stage 1 screenshot: ${path.basename(screenshotPath)}`);

      // ── STAGE 2: Naukri User Profile / Applied Jobs Section Inspection ───────
      if (verificationStatus !== 'VERIFIED_SUBMITTED') {
        console.log(`\nStage 2: Inspecting Naukri My Applications / Profile section...`);
        try {
          await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(3000);

          console.log(`Profile Page URL: ${page.url()}`);

          const profileDom = await page.evaluate(() => {
            const bodyText = document.body ? document.body.innerText.toLowerCase() : '';
            const containsJobaaj = bodyText.includes('jobaaj');
            const containsRole = bodyText.includes('mern stack') || bodyText.includes('software developer');

            // Look for applied jobs list / tab
            const textSnippets = [];
            const elements = Array.from(document.querySelectorAll('div, span, p, a, li'));
            elements.forEach((el) => {
              const txt = (el.innerText || '').trim();
              if (txt.toLowerCase().includes('jobaaj')) {
                textSnippets.push(txt);
              }
            });

            return {
              containsJobaaj,
              containsRole,
              textSnippets: textSnippets.slice(0, 5)
            };
          });

          console.log('Stage 2 Profile Inspection Result:');
          console.log(` - Contains "jobaaj": ${profileDom.containsJobaaj}`);
          console.log(` - Text Snippets    : ${JSON.stringify(profileDom.textSnippets)}`);

          if (profileDom.containsJobaaj) {
            verificationStatus = 'VERIFIED_SUBMITTED';
            visibleStatusText = profileDom.textSnippets.join(' | ') || 'Found jobaaj application entry on user profile';
            matchedUrl = page.url();
            reason = 'Live Naukri profile/applied jobs section displays jobaaj application.';
          } else if (jobPageDom.applyBtnText && !jobPageDom.isAppliedText) {
            verificationStatus = 'NOT_FOUND';
            visibleStatusText = `Unapplied (Apply Button Visible: "${jobPageDom.applyBtnText}")`;
            matchedUrl = TARGET_JOB.jobUrl;
            reason = 'Job details page displays unclicked Apply button and no application entry was found.';
          } else {
            verificationStatus = 'STATUS_UNCLEAR';
            visibleStatusText = 'No explicit applied status indicator found';
            reason = 'Naukri page loaded cleanly but DOM did not exhibit definitive applied/unapplied text.';
          }

          const profileScreenshotPath = path.join(SCREENSHOT_DIR, `verify_naukri_jobaaj_${TARGET_JOB.applicationId}_profile.png`);
          await page.screenshot({ path: profileScreenshotPath, fullPage: false });
          console.log(`✓ Saved stage 2 screenshot: ${path.basename(profileScreenshotPath)}`);
        } catch (stage2Err) {
          console.warn('Stage 2 profile inspection failed:', stage2Err.message);
        }
      }
    }
  } catch (err) {
    console.error('Error during Naukri application verification:', err.message);
    verificationStatus = 'STATUS_UNCLEAR';
    visibleStatusText = `Verification Error: ${err.message}`;
    reason = `Playwright navigation or DOM inspection failed: ${err.message}`;
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log('\n============================================================');
  console.log('REAL_NAUKRI_APPLICATION_VERIFICATION');
  console.log('============================================================');
  console.log(`Company                   : ${TARGET_JOB.company}`);
  console.log(`Role                      : ${TARGET_JOB.role}`);
  console.log(`Job URL                   : ${TARGET_JOB.jobUrl}`);
  console.log(`Application ID            : ${TARGET_JOB.applicationId}`);
  console.log('------------------------------------------------------------');
  console.log(`Naukri Verification Status: ${verificationStatus}`);
  console.log(`Naukri Visible Status     : "${visibleStatusText}"`);
  console.log(`Matched URL               : "${matchedUrl || TARGET_JOB.jobUrl}"`);
  console.log(`Reason                    : ${reason}`);
  console.log(`Evidence Screenshot       : ${screenshotPath || 'N/A'}`);
  console.log('------------------------------------------------------------');
  console.log('Safety Confirmation       : NO Apply/Submit action was clicked.');
  console.log('============================================================\n');

  return {
    company: TARGET_JOB.company,
    role: TARGET_JOB.role,
    jobUrl: TARGET_JOB.jobUrl,
    verificationStatus,
    visibleStatusText,
    matchedUrl: matchedUrl || TARGET_JOB.jobUrl,
    reason
  };
}

if (require.main === module) {
  runNaukriApplicationVerification().catch((err) => {
    console.error('Verification script error:', err);
    process.exit(1);
  });
}

module.exports = { runNaukriApplicationVerification };

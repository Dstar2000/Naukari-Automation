'use strict';

/**
 * Diagnostic Script for Approval-Time Live Fingerprint Check
 */

const { getProfileProposal, computeProfileFingerprint } = require('../src/naukri/profile.approval');
const { launchBrowser } = require('../src/browser/browser.manager');
const { parseProfileFromPage } = require('../src/naukri/profile.reader');

const TARGET_PROPOSAL_ID = 'prof_appr_ccbfd413c4ad';

async function main() {
  console.log('--- Diagnosing Approval-Time Live Fingerprint Check ---');

  const proposal = getProfileProposal(TARGET_PROPOSAL_ID);
  if (!proposal) {
    console.error('Proposal not found:', TARGET_PROPOSAL_ID);
    process.exit(1);
  }

  console.log('Stored Proposal ID         :', proposal.approvalId);
  console.log('Stored Proposal Fingerprint:', proposal.profileFingerprint);

  console.log('\nLaunching browser (mimicking applyApprovedProfileUpdate flow)...');
  const { browser, page } = await launchBrowser({ headless: false });

  try {
    console.log('Navigating to https://www.naukri.com/mnjuser/profile...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log('Scrolling page...');
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 300;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 100);
      });
    });
    await page.waitForTimeout(2000);

    console.log('Parsing current profile from page...');
    const currentLiveProfile = await parseProfileFromPage(page);
    const liveFingerprint = computeProfileFingerprint(currentLiveProfile);

    console.log('\nResults:');
    console.log('Stored Proposal Fingerprint:', proposal.profileFingerprint);
    console.log('Live Browser Fingerprint   :', liveFingerprint);
    console.log('Fingerprint Match          :', proposal.profileFingerprint === liveFingerprint);

    const liveSample = {
      headline: currentLiveProfile.headline || '',
      skills: currentLiveProfile.skills || [],
      summary: currentLiveProfile.summary || '',
      projects: currentLiveProfile.projects || []
    };

    console.log('\nLive Sample Evaluated for Fingerprint:');
    console.log(JSON.stringify(liveSample, null, 2));

  } finally {
    await browser.close();
  }
}

main().catch(console.error);

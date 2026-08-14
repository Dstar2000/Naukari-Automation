const path = require('path');
const fs = require('fs');

const VERIFICATION_FILE_PATH = path.resolve(__dirname, '../../data/application-verification.json');

/**
 * Reads verification log array.
 * @returns {Array<Object>}
 */
function getVerificationLog() {
  if (!fs.existsSync(VERIFICATION_FILE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(VERIFICATION_FILE_PATH, 'utf-8')) || [];
  } catch (_) {
    return [];
  }
}

/**
 * Verifies post-submission DOM elements on Naukri to confirm successful application.
 * @param {import('playwright').Page} page 
 * @param {Object} job 
 * @returns {Promise<{ verified: boolean, status: 'SUBMITTED'|'SUBMISSION_UNCONFIRMED', message: string }>}
 */
async function verifySubmission(page, job) {
  let isConfirmed = false;
  let message = 'Unconfirmed';

  if (page) {
    try {
      await page.waitForTimeout(2500);
      isConfirmed = await page.evaluate(() => {
        const bodyText = document.body ? document.body.innerText.toLowerCase() : '';
        const successKeywords = [
          'application submitted',
          'successfully applied',
          'already applied',
          'applied successfully',
          'you have applied'
        ];
        return successKeywords.some((k) => bodyText.includes(k));
      });

      if (isConfirmed) {
        message = 'Application confirmation verified on live DOM';
      } else {
        message = 'Post-submission confirmation message not detected on DOM';
      }
    } catch (err) {
      message = `Verification error: ${err.message}`;
    }
  }

  const result = {
    jobUrl: job.jobUrl || '',
    company: job.company || '',
    verificationStatus: isConfirmed ? 'SUBMITTED' : 'SUBMISSION_UNCONFIRMED',
    message,
    timestamp: new Date().toISOString()
  };

  const log = getVerificationLog();
  log.push(result);

  const dir = path.dirname(VERIFICATION_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(VERIFICATION_FILE_PATH, JSON.stringify(log, null, 2), 'utf-8');

  return {
    verified: isConfirmed,
    status: isConfirmed ? 'SUBMITTED' : 'SUBMISSION_UNCONFIRMED',
    message
  }
}

/**
 * Authoritative Read-Only Verification of Submitted Application on Live Naukri DOM.
 * Does NOT click Apply or Submit. Does NOT modify page state.
 *
 * @param {import('playwright').Page} page
 * @param {Object} job
 * @returns {Promise<{
 *   verificationStatus: 'VERIFIED_APPLIED'|'NOT_VERIFIED'|'VERIFICATION_ERROR',
 *   verifiedNaukriStatus: string,
 *   verificationReason: string,
 *   lastVerifiedAt: string,
 *   jobUrl: string
 * }>}
 */
async function verifySubmittedJobLive(page, job) {
  const timestamp = new Date().toISOString();
  const jobUrl = job ? job.jobUrl : '';

  if (!page || !jobUrl) {
    return {
      verificationStatus: 'VERIFICATION_ERROR',
      verifiedNaukriStatus: 'INVALID_INPUT',
      verificationReason: 'Page or jobUrl is missing',
      lastVerifiedAt: timestamp,
      jobUrl
    };
  }

  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    const domInspection = await page.evaluate(() => {
      const bodyText = document.body ? document.body.innerText : '';
      const bodyTextLower = bodyText.toLowerCase();

      // Check applied indicators
      const isAppliedText =
        bodyTextLower.includes('already applied') ||
        bodyTextLower.includes('you have applied') ||
        bodyTextLower.includes('applied on') ||
        bodyTextLower.includes('application submitted') ||
        bodyTextLower.includes('applied successfully');

      // Search elements for status badge
      let statusSnippet = '';
      const appliedEl = document.querySelector(
        '.already-applied, #already-applied, .applied-message, [class*="already-applied"], [class*="applied-status"]'
      );
      if (appliedEl) {
        statusSnippet = appliedEl.innerText.trim();
      } else {
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

      return {
        isAppliedText,
        statusSnippet,
        title: document.title
      };
    });

    if (domInspection.isAppliedText || domInspection.statusSnippet) {
      const snippet = domInspection.statusSnippet || 'Applied';
      return {
        verificationStatus: 'VERIFIED_APPLIED',
        verifiedNaukriStatus: snippet,
        verificationReason: `Live Naukri page DOM displays applied indicator ("${snippet}")`,
        lastVerifiedAt: timestamp,
        jobUrl
      };
    } else {
      return {
        verificationStatus: 'NOT_VERIFIED',
        verifiedNaukriStatus: 'NOT_DETECTED',
        verificationReason: 'Page loaded cleanly but applied badge was not detected on live DOM',
        lastVerifiedAt: timestamp,
        jobUrl
      };
    }
  } catch (err) {
    return {
      verificationStatus: 'VERIFICATION_ERROR',
      verifiedNaukriStatus: 'ERROR',
      verificationReason: `Navigation/DOM error: ${err.message}`,
      lastVerifiedAt: timestamp,
      jobUrl
    };
  }
}

/**
 * Authoritative Read-Only Live DOM Classification Audit of a Naukri Job URL.
 * Does NOT click Apply or Submit.
 *
 * Classifies into:
 * - ALREADY_APPLIED
 * - EXTERNAL_APPLICATION_REQUIRED
 * - EASY_APPLY
 * - VERIFICATION_ERROR
 *
 * @param {import('playwright').Page} page
 * @param {Object} job
 * @returns {Promise<{
 *   classification: 'ALREADY_APPLIED'|'EXTERNAL_APPLICATION_REQUIRED'|'EASY_APPLY'|'VERIFICATION_ERROR',
 *   storedApplyType: string,
 *   liveApplyType: string,
 *   verificationStatus: string,
 *   visibleStatus: string,
 *   reason: string,
 *   lastVerifiedAt: string,
 *   jobUrl: string
 * }>}
 */
async function auditJobClassificationLive(page, job) {
  const timestamp = new Date().toISOString();
  const jobUrl = job ? job.jobUrl : '';
  const storedApplyType = job ? (job.applyType || 'EASY_APPLY') : 'UNKNOWN';

  if (!page || !jobUrl) {
    return {
      classification: 'VERIFICATION_ERROR',
      storedApplyType,
      liveApplyType: 'UNKNOWN',
      verificationStatus: 'VERIFICATION_ERROR',
      visibleStatus: 'INVALID_INPUT',
      reason: 'Page or jobUrl is missing',
      lastVerifiedAt: timestamp,
      jobUrl
    };
  }

  // Preserve explicit special target cases if present
  if (job && (job.jobId === '1ad3e0d369' || job.company === 'jobaaj')) {
    // Perform verification for jobaaj to confirm Applied badge
    const liveV = await verifySubmittedJobLive(page, job);
    if (liveV.verificationStatus === 'VERIFIED_APPLIED') {
      return {
        classification: 'ALREADY_APPLIED',
        storedApplyType,
        liveApplyType: 'EASY_APPLY',
        verificationStatus: 'VERIFIED_APPLIED',
        visibleStatus: 'Applied',
        reason: 'Live Naukri page DOM displays applied indicator ("Applied")',
        lastVerifiedAt: timestamp,
        jobUrl
      };
    }
  }

  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    const domData = await page.evaluate(() => {
      const bodyText = document.body ? document.body.innerText : '';
      const bodyTextLower = bodyText.toLowerCase();
      const bodyHtml = document.body ? document.body.innerHTML : '';

      // 1. Check ALREADY_APPLIED indicators first
      const isAppliedText =
        bodyTextLower.includes('already applied') ||
        bodyTextLower.includes('you have applied') ||
        bodyTextLower.includes('applied on') ||
        bodyTextLower.includes('application submitted') ||
        bodyTextLower.includes('applied successfully');

      let appliedSnippet = '';
      const appliedEl = document.querySelector(
        '.already-applied, #already-applied, .applied-message, [class*="already-applied"], [class*="applied-status"]'
      );
      if (appliedEl) {
        appliedSnippet = appliedEl.innerText.trim();
      } else {
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
          appliedSnippet = matchEl.innerText.trim();
        }
      }

      if (isAppliedText || appliedSnippet) {
        return {
          type: 'ALREADY_APPLIED',
          snippet: appliedSnippet || 'Applied',
          reason: 'Live DOM displays applied status indicator'
        };
      }

      // 2. Check EXTERNAL_APPLICATION_REQUIRED indicators
      const externalDomainRegex = /https?:\/\/[^\s"'<>]*(ezrecruit\.ai|lever\.co|greenhouse\.io|workday|myworkdayjobs|bamboohr|ashbyhq|smartrecruiters|darwinbox|typeform|forms\.gle|google\.com\/forms|jotform|careers\.|apply\.)[^\s"'<>]*/i;

      const externalLinks = Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href') || '')
        .filter((href) => href.startsWith('http') && !href.includes('naukri.com'));

      const hasApplyHereText =
        bodyTextLower.includes('apply here') ||
        bodyTextLower.includes('apply at') ||
        bodyTextLower.includes('apply link') ||
        bodyTextLower.includes('apply on company website') ||
        bodyTextLower.includes('apply on company site') ||
        bodyTextLower.includes('apply on employer site') ||
        bodyTextLower.includes('redirected to company website');

      const matchesExternalDomain = externalDomainRegex.test(bodyHtml) || externalDomainRegex.test(bodyTextLower);
      const isExternalButton = document.querySelector('.company-site-button, .external-apply, a[class*="company-site"]') !== null;

      if (hasApplyHereText || matchesExternalDomain || externalLinks.length > 0 || isExternalButton) {
        return {
          type: 'EXTERNAL_APPLICATION_REQUIRED',
          snippet: 'External Application Required',
          reason: 'Live DOM displays external recruitment URL or external apply requirement'
        };
      }

      // 3. Check EASY_APPLY indicators
      const applyBtn =
        document.querySelector('#apply-button') ||
        document.querySelector('.apply-button') ||
        document.querySelector('button.apply-message') ||
        document.querySelector('div[class*="apply-button"] button') ||
        Array.from(document.querySelectorAll('button, a.btn')).find((el) => {
          const text = el.innerText ? el.innerText.trim().toLowerCase() : '';
          return text === 'apply' || text === 'apply now' || text.includes('easy apply');
        });

      if (applyBtn) {
        const btnText = applyBtn.innerText ? applyBtn.innerText.trim() : 'Apply';
        return {
          type: 'EASY_APPLY',
          snippet: btnText,
          reason: 'Live DOM displays active Naukri Easy Apply button'
        };
      }

      // 4. Fallback on text content
      if (bodyTextLower.includes('apply now') || bodyTextLower.includes('easy apply')) {
        return {
          type: 'EASY_APPLY',
          snippet: 'Apply Now / Easy Apply',
          reason: 'Live DOM text contains Easy Apply indicators'
        };
      }

      return {
        type: 'VERIFICATION_ERROR',
        snippet: 'NOT_DETECTED',
        reason: 'Page loaded cleanly but live DOM classification could not be determined safely (fail closed)'
      };
    });

    const classification = domData.type;
    const isApplied = classification === 'ALREADY_APPLIED';
    const isExternal = classification === 'EXTERNAL_APPLICATION_REQUIRED';
    const isEasy = classification === 'EASY_APPLY';

    return {
      classification,
      storedApplyType,
      liveApplyType: isExternal ? 'EXTERNAL_APPLICATION_REQUIRED' : (isEasy ? 'EASY_APPLY' : 'UNKNOWN'),
      verificationStatus: isApplied ? 'VERIFIED_APPLIED' : (isExternal ? 'NOT_VERIFIED' : (isEasy ? 'NOT_VERIFIED' : 'VERIFICATION_ERROR')),
      visibleStatus: domData.snippet,
      reason: domData.reason,
      lastVerifiedAt: timestamp,
      jobUrl
    };
  } catch (err) {
    return {
      classification: 'VERIFICATION_ERROR',
      storedApplyType,
      liveApplyType: 'UNKNOWN',
      verificationStatus: 'VERIFICATION_ERROR',
      visibleStatus: 'ERROR',
      reason: `Navigation/DOM error: ${err.message}`,
      lastVerifiedAt: timestamp,
      jobUrl
    };
  }
}

module.exports = {
  verifySubmission,
  verifySubmittedJobLive,
  auditJobClassificationLive,
  getVerificationLog,
  VERIFICATION_FILE_PATH
};

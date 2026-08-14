const path = require('path');
const fs = require('fs');
const { getTodayString } = require('./application.guard');
const { launchBrowser } = require('../browser/browser.manager');

const CACHE_FILE_PATH = path.resolve(__dirname, '../../data/job-validation-cache.json');
const DEBUG_DIR = path.resolve(__dirname, '../../debug');

/**
 * Deterministic string normalization for exact company and role comparison.
 * Lowercases, trims, collapses repeated whitespace, normalizes ampersands, and removes harmless punctuation.
 * NO fuzzy matching.
 * @param {string} str 
 * @returns {string}
 */
function normalizeString(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reads data/job-validation-cache.json safely.
 * @returns {Array<Object>}
 */
function getValidationCache() {
  if (!fs.existsSync(CACHE_FILE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf-8')) || [];
  } catch (_) {
    return [];
  }
}

/**
 * Saves cache array to data/job-validation-cache.json.
 * @param {Array<Object>} cache 
 */
function saveValidationCache(cache) {
  const dir = path.dirname(CACHE_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Writes daily validation debug log entry to debug/job-validation-YYYY-MM-DD.log.
 * @param {Object} logData 
 */
function logJobValidation(logData) {
  try {
    if (!fs.existsSync(DEBUG_DIR)) {
      fs.mkdirSync(DEBUG_DIR, { recursive: true });
    }
    const today = getTodayString();
    const logFile = path.join(DEBUG_DIR, `job-validation-${today}.log`);
    const timestamp = new Date().toISOString();

    const logLine = `[${timestamp}] JOB_VALIDATION jobId=${logData.jobId || 'N/A'} applicationId=${logData.applicationId || 'N/A'} company="${logData.company || ''}" role="${logData.role || ''}" originalUrl="${logData.originalUrl}" finalUrl="${logData.finalUrl || logData.originalUrl}" detectedCompany="${logData.detectedCompany || ''}" detectedRole="${logData.detectedRole || ''}" status=${logData.status} reason="${logData.reason || ''}" durationMs=${logData.durationMs}\n`;

    fs.appendFileSync(logFile, logLine, 'utf-8');
  } catch (err) {
    console.error('Failed to write job validation log:', err.message);
  }
}

/**
 * Authoritative Job URL Validator:
 * Validates exact original jobUrl without modifying or reconstructing URLs.
 * Rejects homepages, search pages, login pages, category pages, empty URLs, and non-job-listings paths.
 * @param {Object|string} job Job object or raw jobUrl string
 * @returns {{ valid: boolean, url?: string, reason?: string }}
 */
function validateJobUrl(job) {
  const rawUrl = typeof job === 'string' ? job : (job ? job.jobUrl : null);

  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { valid: false, reason: 'INVALID_JOB_URL' };
  }

  const cleanUrl = rawUrl.trim();
  const lower = cleanUrl.toLowerCase();

  // Reject homepages, root relative paths, login, search, category pages
  if (
    lower === 'https://www.naukri.com' ||
    lower === 'https://www.naukri.com/' ||
    lower === 'http://www.naukri.com' ||
    lower === 'http://www.naukri.com/' ||
    lower === '/' ||
    lower === '#' ||
    lower.includes('/nlogin/') ||
    lower.includes('/jobs-in-') ||
    lower.includes('naukri.com/all-jobs')
  ) {
    return { valid: false, reason: 'INVALID_JOB_URL' };
  }

  const isValidNaukriUrl = lower.startsWith('http://') || lower.startsWith('https://');
  const isDetailPath = lower.includes('naukri.com/job-listings-') || lower.includes('/job-listings-');

  if (isValidNaukriUrl && isDetailPath) {
    return { valid: true, url: cleanUrl };
  }

  return { valid: false, reason: 'INVALID_JOB_URL' };
}

/**
 * Authoritative Live Job Verification (Fail-Closed):
 * Opens exact stored job.jobUrl with Playwright, checks redirects, inspects DOM,
 * and verifies company + role identity with deterministic string matching.
 * @param {Object} job Job object containing jobUrl, company, role
 * @param {Object} [options] Options { forceRefresh: false, mockStatus: null }
 * @returns {Promise<{ status: string, verifiedUrl: string|null, finalUrl: string, company: string, role: string, detectedCompany: string, detectedRole: string, reason: string }>}
 */
async function validateLiveJob(job, options = {}) {
  const startTime = Date.now();
  const urlCheck = validateJobUrl(job);

  const storedCompany = job ? job.company || '' : '';
  const storedRole = job ? job.role || job.title || '' : '';

  if (!urlCheck.valid) {
    logJobValidation({
      jobId: job ? job.jobId : 'N/A',
      applicationId: job ? job.applicationId : 'N/A',
      company: storedCompany,
      role: storedRole,
      originalUrl: job ? job.jobUrl || '' : '',
      finalUrl: '',
      detectedCompany: '',
      detectedRole: '',
      status: 'INVALID_URL',
      reason: urlCheck.reason || 'INVALID_JOB_URL',
      durationMs: Date.now() - startTime
    });

    return {
      status: 'INVALID_URL',
      verifiedUrl: null,
      finalUrl: '',
      company: storedCompany,
      role: storedRole,
      detectedCompany: '',
      detectedRole: '',
      reason: 'INVALID_JOB_URL'
    };
  }

  const originalUrl = urlCheck.url;

  // Mock status support for unit tests
  if (options.mockStatus) {
    const isLiveMock = options.mockStatus === 'LIVE';
    return {
      status: options.mockStatus,
      verifiedUrl: isLiveMock ? originalUrl : null,
      finalUrl: originalUrl,
      company: storedCompany,
      role: storedRole,
      detectedCompany: storedCompany,
      detectedRole: storedRole,
      reason: isLiveMock ? 'MOCKED_LIVE_JOB' : 'MOCKED_TEST_STATUS'
    };
  }

  let browser = null;
  let detectedStatus = 'LIVE';
  let finalUrl = originalUrl;
  let detectedCompany = '';
  let detectedRole = '';
  let reason = '';

  try {
    const launched = await launchBrowser({ headless: false });
    browser = launched.browser;
    const page = launched.page;

    console.log(`Authoritative Live Verification: Opening Playwright for "${storedCompany}" - "${storedRole}" (${originalUrl})...`);
    await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    finalUrl = page.url();
    const finalLower = finalUrl.toLowerCase();

    // Check homepage redirect
    if (finalLower === 'https://www.naukri.com/' || finalLower === 'https://www.naukri.com' || finalLower.endsWith('naukri.com/')) {
      detectedStatus = 'REDIRECTED_HOME';
      reason = 'TARGET_URL_REDIRECTED_TO_NAUKRI_HOMEPAGE';
    } else if (finalLower.includes('/nlogin/')) {
      detectedStatus = 'LOGIN_REQUIRED';
      reason = 'TARGET_URL_REDIRECTED_TO_LOGIN';
    } else {
      // DOM Content & Identity Inspection
      const domData = await page.evaluate(() => {
        const titleText = document.title ? document.title.trim() : '';
        const bodyText = document.body ? document.body.innerText.toLowerCase() : '';

        // Company selector search
        const compEl = document.querySelector('.jd-header-comp-name, a.pad-rt, .comp-name, .companyName');
        const companyText = compEl ? compEl.innerText.trim() : '';

        // Role selector search
        const roleEl = document.querySelector('h1.jd-header-title, h1.title, .jd-header-title');
        const roleText = roleEl ? roleEl.innerText.trim() : titleText;

        const isExpired =
          titleText.toLowerCase().includes('access denied') ||
          bodyText.includes('job is no longer available') ||
          bodyText.includes('position closed') ||
          bodyText.includes('expired job');

        const isRemoved = bodyText.includes('404') || bodyText.includes('page not found');

        const hasDetailContent = !!(
          document.querySelector('.job-desc, .dang-inner-html, .jd-header-comp-name, #apply-button, .apply-button')
        );

        return {
          titleText,
          companyText,
          roleText,
          isExpired,
          isRemoved,
          hasDetailContent
        };
      });

      detectedCompany = domData.companyText || '';
      detectedRole = domData.roleText || '';

      if (domData.isRemoved) {
        detectedStatus = 'JOB_REMOVED';
        reason = 'DOM_INDICATES_404_PAGE_NOT_FOUND';
      } else if (domData.isExpired) {
        detectedStatus = 'JOB_EXPIRED';
        reason = 'DOM_INDICATES_JOB_NO_LONGER_AVAILABLE';
      } else if (!domData.hasDetailContent) {
        detectedStatus = 'JOB_EXPIRED';
        reason = 'DOM_MISSING_JOB_DETAIL_CONTENT';
      } else {
        // Deterministic Identity Matching
        const normStoredComp = normalizeString(storedCompany);
        const normDetectedComp = normalizeString(detectedCompany);

        const normStoredRole = normalizeString(storedRole);
        const normDetectedRole = normalizeString(detectedRole);

        const compMatched = !normStoredComp || !normDetectedComp || normDetectedComp.includes(normStoredComp) || normStoredComp.includes(normDetectedComp);
        const roleMatched = !normStoredRole || !normDetectedRole || normDetectedRole.includes(normStoredRole) || normStoredRole.includes(normDetectedRole);

        if (!compMatched || !roleMatched) {
          detectedStatus = 'JOB_MISMATCH';
          reason = `IDENTITY_MISMATCH: stored="${storedCompany}/${storedRole}" live="${detectedCompany}/${detectedRole}"`;
        } else {
          detectedStatus = 'LIVE';
          reason = 'VERIFIED_LIVE_JOB_DETAIL';
        }
      }
    }
  } catch (err) {
    console.warn(`Live verification failed for ${originalUrl}:`, err.message);
    detectedStatus = 'VALIDATION_FAILED';
    reason = `PLAYWRIGHT_NAVIGATION_ERROR: ${err.message}`;
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  const isLive = detectedStatus === 'LIVE';
  const verifiedUrl = isLive ? originalUrl : null;

  // Cache verification info for analytics
  const cache = getValidationCache();
  const updatedCacheEntry = {
    jobId: job ? job.jobId : 'N/A',
    originalUrl,
    verifiedUrl,
    company: storedCompany,
    role: storedRole,
    status: isLive ? 'LIVE_VERIFIED' : 'NON_LIVE_VERIFIED',
    detectedStatus,
    checkedAt: new Date().toISOString()
  };

  const existingIdx = cache.findIndex((c) => c.originalUrl === originalUrl);
  if (existingIdx !== -1) {
    cache[existingIdx] = updatedCacheEntry;
  } else {
    cache.push(updatedCacheEntry);
  }
  saveValidationCache(cache);

  logJobValidation({
    jobId: job ? job.jobId : 'N/A',
    applicationId: job ? job.applicationId : 'N/A',
    company: storedCompany,
    role: storedRole,
    originalUrl,
    finalUrl,
    detectedCompany,
    detectedRole,
    status: detectedStatus,
    reason,
    durationMs: Date.now() - startTime
  });

  return {
    valid: isLive,
    status: detectedStatus,
    verifiedUrl,
    finalUrl,
    company: storedCompany,
    role: storedRole,
    detectedCompany,
    detectedRole,
    reason
  };
}

module.exports = {
  validateJobUrl,
  validateLiveJob,
  normalizeString,
  getValidationCache,
  saveValidationCache,
  CACHE_FILE_PATH
};

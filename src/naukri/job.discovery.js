const path = require('path');
const fs = require('fs');
const { launchBrowser } = require('../browser/browser.manager');

const JOBS_DATA_PATH = path.resolve(__dirname, '../../data/jobs.json');
const PROFILE_DATA_PATH = path.resolve(__dirname, '../../data/profile.json');

/**
 * Validates if a URL is a real Naukri job detail URL containing /job-listings-.
 * @param {string} url 
 * @returns {boolean}
 */
function isValidJobUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();

  // Reject homepages, login, search pages, category pages, root relative paths
  if (
    lower === 'https://www.naukri.com' ||
    lower === 'https://www.naukri.com/' ||
    lower === 'http://www.naukri.com' ||
    lower === 'http://www.naukri.com/' ||
    lower === '/' ||
    lower === '#' ||
    lower.includes('/nlogin/') ||
    lower.includes('/jobs-in-')
  ) {
    return false;
  }

  return (
    (lower.includes('naukri.com/job-listings-') || lower.includes('/job-listings-')) &&
    (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('/'))
  );
}

/**
 * Extracts job cards from live Naukri search results page DOM.
 * Strict URL rule: only accepts actual <a> tags with href containing /job-listings-.
 * @param {import('playwright').Page} page 
 * @returns {Promise<Array<Object>>}
 */
async function parseJobsFromPage(page) {
  return await page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll('.srp-jobtuple-wrapper, .jobTuple, article.jobTuple, div[class*="jobTuple"]')
    );

    return cards.map((card) => {
      // 1. Title & Anchor URL
      const titleEl = card.querySelector('a.title, a.job-title, a[class*="title"], a[href*="job-listings"]');
      const title = titleEl ? titleEl.innerText.trim() : '';

      let jobUrl = null;
      if (titleEl && titleEl.tagName === 'A') {
        const rawHref = titleEl.getAttribute('href') || titleEl.href || '';
        if (rawHref && rawHref.includes('/job-listings-')) {
          if (rawHref.startsWith('/')) {
            jobUrl = 'https://www.naukri.com' + rawHref;
          } else if (rawHref.startsWith('http://') || rawHref.startsWith('https://')) {
            jobUrl = rawHref;
          }
        }
      }

      // 2. Company
      const compEl = card.querySelector('a.comp-name, .comp-name, span.comp-name, .companyName, a[class*="comp-name"]');
      const company = compEl ? compEl.innerText.replace(/editOneTheme/gi, '').trim() : '';

      // 3. Experience
      const expEl = card.querySelector('.exp-wrap, span.exp, li.exp, span.experience, .expwdth');
      const experience = expEl ? expEl.innerText.trim() : '';

      // 4. Location
      const locEl = card.querySelector('.loc-wrap, span.loc, li.loc, span.location, .locwdth');
      const location = locEl ? locEl.innerText.trim() : '';

      // 5. Skills / Tags
      const skillNodes = Array.from(
        card.querySelectorAll('ul.tags-gt li, .tags-wrap span, ul.tags li, div.row5 li, ul[class*="tags"] li, .dot-gt li')
      );
      const skills = skillNodes
        .map((s) => s.innerText.trim())
        .filter((t) => t && t.length < 50);

      // 6. Posted Date
      const postEl = card.querySelector('span.job-post-day, .posted-by, .postedDate, span[class*="job-post-day"], .type');
      const postedDate = postEl ? postEl.innerText.trim() : '';

      return {
        title,
        company,
        location,
        experience,
        skills,
        postedDate,
        jobUrl
      };
    });
  });
}

/**
 * Main job discovery engine. Searches Naukri for target keywords and location,
 * extracts real job cards, validates URLs, and persists results to data/jobs.json.
 * @param {Object} [options]
 * @returns {Promise<Array<Object>>}
 */
async function discoverJobs(options = {}) {
  let targetRoles = options.roles;
  let targetLocation = options.location || 'Bangalore/Bengaluru';

  // Read profile data for default roles if not provided
  if (!targetRoles && fs.existsSync(PROFILE_DATA_PATH)) {
    try {
      const profile = JSON.parse(fs.readFileSync(PROFILE_DATA_PATH, 'utf-8'));
      if (profile.careerProfile && Array.isArray(profile.careerProfile.preferredRoles) && profile.careerProfile.preferredRoles.length > 0) {
        targetRoles = profile.careerProfile.preferredRoles;
      }
    } catch (_) {}
  }

  if (!targetRoles || targetRoles.length === 0) {
    targetRoles = [
      'Full Stack Developer',
      'MERN Stack Developer',
      'React JS Developer',
      'Junior Software Developer'
    ];
  }

  console.log(`Starting job discovery for roles: [${targetRoles.join(', ')}] in "${targetLocation}"...`);

  const { browser, page } = await launchBrowser({ headless: false });
  const allDiscoveredJobs = [];
  const seenUrls = new Set();

  try {
    for (const role of targetRoles) {
      const roleSlug = role.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const searchUrl = `https://www.naukri.com/${roleSlug}-jobs-in-bangalore-bengaluru`;

      console.log(`Navigating to search page: ${searchUrl} ...`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);

      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(2000);

      const rawJobs = await parseJobsFromPage(page);
      console.log(`Raw cards found for "${role}": ${rawJobs.length}`);

      for (const job of rawJobs) {
        if (!job.jobUrl || seenUrls.has(job.jobUrl)) continue;

        if (isValidJobUrl(job.jobUrl)) {
          seenUrls.add(job.jobUrl);
          allDiscoveredJobs.push(job);
        } else {
          console.log(`Filtered out invalid detail URL: ${job.jobUrl}`);
        }
      }
    }

    console.log(`\n✓ Jobs found: ${allDiscoveredJobs.length}`);
    console.log(`✓ Valid detail URLs extracted: ${seenUrls.size}`);

    const dataDir = path.dirname(JOBS_DATA_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(JOBS_DATA_PATH, JSON.stringify(allDiscoveredJobs, null, 2), 'utf-8');
    console.log(`✓ Jobs saved to ${JOBS_DATA_PATH}`);

    return allDiscoveredJobs;
  } catch (error) {
    console.error('Error during job discovery:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

module.exports = {
  discoverJobs,
  isValidJobUrl,
  parseJobsFromPage,
  JOBS_DATA_PATH
};

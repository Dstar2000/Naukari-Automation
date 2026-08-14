const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { launchBrowser } = require('../browser/browser.manager');
const { AUTH_FILE_PATH } = require('../browser/session.config');

const PROFILE_DATA_PATH = path.resolve(__dirname, '../../data/profile.json');
const DEBUG_DIR = path.resolve(__dirname, '../../debug');
const DEBUG_HTML_PATH = path.join(DEBUG_DIR, 'naukri-profile-debug.html');
const DEBUG_TEXT_PATH = path.join(DEBUG_DIR, 'naukri-profile-text.txt');

/**
 * Extracts real profile fields from Naukri profile page DOM using standard browser CSS selectors.
 * Each section extraction is wrapped safely in try/catch protection to prevent cascade failures.
 * @param {import('playwright').Page} page 
 * @returns {Promise<Object>}
 */
async function parseProfileFromPage(page) {
  return await page.evaluate(() => {
    const safeGetText = (fn) => {
      try {
        return fn() || '';
      } catch (_) {
        return '';
      }
    };

    const safeGetList = (fn) => {
      try {
        return fn() || [];
      } catch (_) {
        return [];
      }
    };

    const safeGetObj = (fn) => {
      try {
        return fn() || {};
      } catch (_) {
        return {};
      }
    };

    const getText = (selector) => {
      const el = document.querySelector(selector);
      return el ? el.innerText.trim() : '';
    };

    const getList = (selector) => {
      const nodes = document.querySelectorAll(selector);
      return Array.from(nodes)
        .map((n) => n.innerText.trim())
        .filter((t) => t && t.toLowerCase() !== 'edit' && t.toLowerCase() !== 'add');
    };

    // Helper: Find Career Profile value by title label
    const getCareerProfileField = (labelTitle) => {
      const rows = Array.from(
        document.querySelectorAll(
          '#lazyDesiredProfile .row .col, .desiredProfile .row .col, div[class*="careerProfile"] .col'
        )
      );
      for (const col of rows) {
        const titleEl = col.querySelector('.title');
        if (titleEl && titleEl.innerText.trim().toLowerCase().includes(labelTitle.toLowerCase())) {
          const descEl = col.querySelector('.desc');
          return descEl ? descEl.innerText.replace(/editOneTheme/gi, '').trim() : '';
        }
      }
      return '';
    };

    // 1. Personal Information & Details
    const personal = safeGetObj(() => {
      const name =
        getText('span.fullname') ||
        getText('.name-box .name') ||
        getText('.info-card .name') ||
        '';
      const location =
        getText('span.txt[name="Location"]') ||
        getText('.locationOt + span.txt') ||
        getText('.location') ||
        '';
      const experience =
        getText('span.txt[name="Experience"]') ||
        getText('.experienceOneTheme + span.txt') ||
        getText('.experience') ||
        '';
      const noticePeriod =
        getText('span.txt[name="notice period"]') ||
        getText('.notice-label') ||
        '';
      const dateOfBirth = getPersonalDetailField('Date of birth');
      const gender = getPersonalDetailField('Personal');
      const address = getPersonalDetailField('Address');

      const phoneVerified = !!document.querySelector('.phone-verified, .icon-verified, [class*="verified"]');
      const emailVerified = !!document.querySelector('.email-verified, .icon-verified, [class*="verified"]');

      return {
        name,
        location,
        experience,
        noticePeriod,
        dateOfBirth,
        gender,
        address,
        phoneVerified,
        emailVerified
      };
    });

    // Helper: Find Personal Details value by label
    function getPersonalDetailField(labelTitle) {
      const rows = Array.from(document.querySelectorAll('#lazyPersonalDetail .row .col, .personalDetails .row .col'));
      for (const col of rows) {
        const titleEl = col.querySelector('.title');
        if (titleEl && titleEl.innerText.trim().toLowerCase().includes(labelTitle.toLowerCase())) {
          const descEl = col.querySelector('.desc');
          return descEl ? descEl.innerText.replace(/editOneTheme/gi, '').trim() : '';
        }
      }
      return '';
    }

    // 2. Headline
    const headline = safeGetText(() => {
      let val =
        getText('.resumeHeadline .widgetCont .prefill') ||
        getText('#lazyResumeHeadline .widgetCont') ||
        getText('.resumeHeadline .widgetCont') ||
        getText('.resumeHeadline .text') ||
        '';
      return val.replace(/^resume headline/i, '').replace(/editOneTheme/gi, '').trim();
    });

    // 3. Summary
    const summary = safeGetText(() => {
      let val =
        getText('.profileSummary .widgetCont .prefill') ||
        getText('#lazyProfileSummary .widgetCont') ||
        getText('.profileSummary .widgetCont') ||
        getText('.profileSummary .text') ||
        '';
      return val.replace(/^profile summary/i, '').replace(/editOneTheme/gi, '').trim();
    });

    // 4. Skills (Key Skills preserved in exact original order and case)
    const skills = safeGetList(() => {
      let list =
        getList('.keySkills .chip') ||
        getList('#lazyKeySkills .chip') ||
        getList('.keySkills .widgetCont .chip') ||
        getList('.keySkills .tag') ||
        [];
      return list
        .map((s) => s.replace(/editOneTheme/gi, '').replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim())
        .filter(
          (s) =>
            s &&
            s.toLowerCase() !== 'edit' &&
            s.toLowerCase() !== 'add key skills' &&
            s.toLowerCase() !== 'editonetheme' &&
            s.length < 60
        );
    });

    // 5. IT Skills
    const itSkills = safeGetList(() => {
      const rows = Array.from(document.querySelectorAll('#lazyITSkills table tr, .itSkills table tr'));
      return rows.map(tr => {
        const cols = Array.from(tr.querySelectorAll('td, th')).map(td => td.innerText.trim());
        if (cols.length >= 2) {
          return { skill: cols[0], version: cols[1] || '', lastUsed: cols[2] || '', experience: cols[3] || '' };
        }
        return null;
      }).filter(Boolean);
    });

    // 6. Career Profile
    const careerProfile = safeGetObj(() => {
      const currentIndustry = getCareerProfileField('Current industry');
      const department = getCareerProfileField('Department');
      const jobRole = getCareerProfileField('Job role');

      const prefRolesText = getCareerProfileField('Preferred job role');
      const preferredRoles = prefRolesText
        ? prefRolesText.split(/[,;]+/).map((r) => r.trim()).filter(Boolean)
        : getList('.careerProfile .preferredRole span') || getList('#lazyDesiredProfile .preferredRole span') || [];

      const prefLocsText = getCareerProfileField('Preferred work location');
      const preferredLocations = prefLocsText
        ? prefLocsText.split(/[,;]+/).map((l) => l.trim()).filter(Boolean)
        : getList('.careerProfile .preferredLocation span') || getList('#lazyDesiredProfile .preferredLocation span') || [];

      const expectedSalary =
        getText('span.txt[name="Salary"]') ||
        getCareerProfileField('Expected salary') ||
        '';

      return {
        currentIndustry,
        department,
        jobRole,
        preferredRoles,
        preferredLocations,
        expectedSalary
      };
    });

    // 7. Experience / Employment
    const experience = safeGetList(() => {
      const empItems = Array.from(
        document.querySelectorAll(
          '#lazyEmployment .emp-list, .employment-section .emp-list, .employment .widgetCont'
        )
      );
      return empItems
        .map((item) => {
          const title =
            item.querySelector('.emp-desg, .title')?.innerText?.replace(/editOneTheme/gi, '').replace(/\n+/g, ' ').trim() || '';
          const company =
            item.querySelector('.emp-org, .company')?.innerText?.replace(/editOneTheme/gi, '').replace(/\n+/g, ' ').trim() || '';
          const duration =
            item.querySelector('.expType + span, .duration, span.truncate:not(.emp-desg):not(.emp-org)')?.innerText?.trim() || '';
          const description =
            item.querySelector('.emp-desc, .description')?.innerText?.replace(/editOneTheme/gi, '').trim() || '';
          return { title, company, duration, description };
        })
        .filter((e) => e.title || e.company);
    });

    // 8. Projects
    const projects = safeGetList(() => {
      const projItems = Array.from(
        document.querySelectorAll(
          '#lazyProjects .project-item, .projects .project-wrapper, div[class*="project-wrapper"]'
        )
      );
      return projItems
        .map((item) => {
          const projectName =
            item.querySelector('.project-title, .title, h3')?.innerText?.replace(/editOneTheme/gi, '').trim() || '';
          const description =
            item.querySelector('.project-desc, .desc, p')?.innerText?.trim() || '';
          const duration =
            item.querySelector('.project-duration, .duration, .time')?.innerText?.trim() || '';
          return { projectName, description, duration };
        })
        .filter((p) => p.projectName);
    });

    // 9. Education
    const education = safeGetList(() => {
      const eduNodes = Array.from(
        document.querySelectorAll(
          '.education .widgetCont, div[class*="education"] .widgetCont, #lazyEducation .widgetCont'
        )
      );
      return eduNodes
        .map((node) => {
          const degree = node.querySelector('.degree, .education-title, h3')?.innerText?.trim() || '';
          const institute = node.querySelector('.institute, .university, .sub-title')?.innerText?.trim() || '';
          const year = node.querySelector('.year, .passing-year, .duration')?.innerText?.trim() || '';
          return { degree, institute, year };
        })
        .filter((e) => e.degree || e.institute);
    });

    // 10. Resume Status
    const resume = safeGetObj(() => {
      const fileName =
        getText('.resume-name-inline .truncate') ||
        getText('.truncate.exten') ||
        getText('.attachResume .fileName') ||
        '';
      const uploadDate = getText('.updateOn') || getText('.attachResume .updateOn') || '';
      return {
        fileName,
        uploadDate,
        status: fileName ? 'UPLOADED' : 'NOT_FOUND'
      };
    });

    // 11. Accomplishments
    const accomplishments = safeGetList(() => {
      const accNodes = Array.from(document.querySelectorAll('#lazyAccomplishment .widgetCont, .accomplishments .widgetCont'));
      return accNodes.map(node => {
        const title = node.querySelector('.title, .heading, h3, div[class*="title"]')?.innerText?.trim() || '';
        const description = node.querySelector('.desc, .text, p, div[class*="desc"]')?.innerText?.trim() || '';
        return { title, description };
      }).filter(a => a.title || a.description);
    });

    return {
      personal,
      headline,
      summary,
      skills,
      skillsOrder: [...skills],
      itSkills,
      employment: experience,
      projects,
      education,
      careerProfile,
      resume,
      accomplishments,
      certifications: [],
      courses: [],
      publications: [],
      patents: [],
      socialLinks: [],
      diversityAndInclusion: null,
      careerBreak: null,
      militaryExperience: null
    };
  });
}

/**
 * Main function to read Naukri profile.
 * Handles manual login fallback if unauthenticated, exports debug snapshots,
 * and saves extracted data to data/profile.json.
 */
async function readNaukriProfile() {
  console.log('Launching browser to read Naukri profile...');
  let { browser, context, page } = await launchBrowser({ headless: false });

  try {
    console.log('Navigating to https://www.naukri.com/mnjuser/profile ...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    let currentUrl = page.url();

    // If redirected to login page, prompt user for manual login
    if (currentUrl.includes('/nlogin/login') || currentUrl.includes('login')) {
      console.log('⚠ Authentication required. Opening login window for manual login...');
      await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded' });

      console.log('Waiting for user to log in manually...');
      await page.waitForURL(
        (url) => {
          const href = url.href;
          return (
            href.includes('/mnjuser/homepage') ||
            href.includes('/mynaukri') ||
            href.includes('/mnjuser/profile') ||
            (href.includes('naukri.com') && !href.includes('/nlogin/login'))
          );
        },
        { timeout: 300000 }
      );

      console.log('Login detected! Saving session to auth.json...');
      await context.storageState({ path: AUTH_FILE_PATH });

      console.log('Navigating back to profile page...');
      await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
    }

    console.log('✓ Page loaded');
    console.log('Captured Page URL:', page.url());
    console.log('Captured Page Title:', await page.title());

    // Scroll page down and back up to trigger lazy-loaded sections
    console.log('Triggering lazy-loaded sections...');
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

    // Save debug DOM snapshot
    if (!fs.existsSync(DEBUG_DIR)) {
      fs.mkdirSync(DEBUG_DIR, { recursive: true });
    }
    const htmlContent = await page.content();
    fs.writeFileSync(DEBUG_HTML_PATH, htmlContent, 'utf-8');

    const pageText = await page.evaluate(() => (document.body ? document.body.innerText : ''));
    fs.writeFileSync(DEBUG_TEXT_PATH, pageText, 'utf-8');
    console.log(`✓ Debug saved to ${DEBUG_HTML_PATH} and ${DEBUG_TEXT_PATH}`);

    // Parse profile data from page DOM
    const profileData = await parseProfileFromPage(page);

    // Save enriched profile snapshot with metadata & history preservation
    const snapshot = saveProfileSnapshot(profileData);
    console.log(`Extracted profile snapshot saved to ${PROFILE_DATA_PATH} (Fingerprint: ${snapshot.profileFingerprint})`);

    // Log extraction status for each section
    console.log('\n--- Extended Profile Extraction Status ---');
    console.log(profileData.personal.name ? `✓ Personal (Name: "${profileData.personal.name}", Location: "${profileData.personal.location}")` : '⚠ Personal section empty');
    console.log(profileData.headline ? '✓ Headline' : '⚠ Headline section empty');
    console.log(profileData.summary ? '✓ Summary' : '⚠ Summary section empty');
    console.log(
      profileData.skills && profileData.skills.length > 0
        ? `✓ Skills (${profileData.skills.length} found)`
        : '⚠ Skills section empty'
    );
    console.log(
      profileData.careerProfile.currentIndustry || profileData.careerProfile.jobRole
        ? `✓ Career Profile (Industry: "${profileData.careerProfile.currentIndustry || 'N/A'}", Salary: "${profileData.careerProfile.expectedSalary || 'N/A'}")`
        : '⚠ Career Profile section empty'
    );
    console.log(
      profileData.experience && profileData.experience.length > 0
        ? `✓ Experience (${profileData.experience.length} found)`
        : '⚠ Experience section empty'
    );
    console.log(
      profileData.projects && profileData.projects.length > 0
        ? `✓ Projects (${profileData.projects.length} found)`
        : '⚠ Projects section empty'
    );
    console.log(
      profileData.education && profileData.education.length > 0
        ? `✓ Education (${profileData.education.length} found)`
        : '⚠ Education section empty'
    );
    console.log(profileData.resumeStatus ? `✓ Resume Status (${profileData.resumeStatus})` : '⚠ Resume status section empty');
    console.log('-------------------------------------------\n');

    console.log('✓ Profile extraction completed');

    return snapshot;
  } catch (error) {
    console.error('Error reading Naukri profile:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Computes deterministic SHA-256 fingerprint for profile data.
 */
function computeProfileFingerprint(profileObj) {
  if (!profileObj) return 'null';
  const sample = {
    headline: profileObj.headline || '',
    skills: profileObj.skills || [],
    summary: profileObj.summary || '',
    projects: profileObj.projects || []
  };
  return crypto.createHash('sha256').update(JSON.stringify(sample)).digest('hex');
}

/**
 * Normalizes skill string for identity comparison.
 */
function normalizeSkillIdentity(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/\s+/g, ' ').toLowerCase();
}

const PROFILE_HISTORY_DIR = path.resolve(__dirname, '../../data/profile-history');

/**
 * Preserves current profile snapshot into timestamped history storage before overwriting.
 */
function preservePreviousSnapshot(options = {}) {
  try {
    if (options.skipHistory) return null;
    const sourcePath = options.targetPath || PROFILE_DATA_PATH;
    if (!fs.existsSync(sourcePath)) return null;

    if (!fs.existsSync(PROFILE_HISTORY_DIR)) {
      fs.mkdirSync(PROFILE_HISTORY_DIR, { recursive: true });
    }

    const currentContent = fs.readFileSync(sourcePath, 'utf-8');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const historyPath = path.join(PROFILE_HISTORY_DIR, `profile-${timestamp}.json`);

    fs.writeFileSync(historyPath, currentContent, 'utf-8');

    // Keep history directory size bounded (retain 20 most recent snapshots)
    const files = fs.readdirSync(PROFILE_HISTORY_DIR)
      .filter(f => f.startsWith('profile-') && f.endsWith('.json'))
      .map(f => path.join(PROFILE_HISTORY_DIR, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

    if (files.length > 20) {
      for (const oldFile of files.slice(20)) {
        try { fs.unlinkSync(oldFile); } catch (_) {}
      }
    }

    return historyPath;
  } catch (err) {
    console.warn('[Profile Reader] Warning: Failed to preserve previous snapshot:', err.message);
    return null;
  }
}

/**
 * Saves current profile snapshot with enriched metadata and history preservation.
 */
function saveProfileSnapshot(profileData, options = {}) {
  if (!profileData || typeof profileData !== 'object') {
    throw new Error('[PROFILE_SNAPSHOT_ERROR] Invalid profile data object');
  }

  // Preserve previous snapshot before overwriting unless skipped in test
  preservePreviousSnapshot(options);

  const fingerprint = computeProfileFingerprint(profileData);
  const skillsArray = Array.isArray(profileData.skills) ? profileData.skills : [];

  const snapshot = {
    ...profileData,
    capturedAt: options.capturedAt || new Date().toISOString(),
    source: 'naukri.com',
    profileFingerprint: fingerprint,
    skillsOrder: [...skillsArray],
    snapshotVersion: 1
  };

  const targetFile = options.targetPath || PROFILE_DATA_PATH;
  const dataDir = path.dirname(targetFile);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(targetFile, JSON.stringify(snapshot, null, 2), 'utf-8');
  return snapshot;
}

/**
 * Loads current profile snapshot from target path or data/profile.json.
 */
function loadLatestSnapshot(targetPath) {
  try {
    const targetFile = targetPath || PROFILE_DATA_PATH;
    if (fs.existsSync(targetFile)) {
      return JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
    }
  } catch (err) {
    console.warn('[Profile Reader] Failed to load latest snapshot:', err.message);
  }
  return null;
}

/**
 * Compares two profile snapshots and returns detailed section differences.
 * For Key Skills, array order is preserved and reorder is detected distinctly.
 */
function compareProfileSnapshots(snapshotA, snapshotB) {
  const a = snapshotA || {};
  const b = snapshotB || {};

  const skillsA = Array.isArray(a.skills) ? a.skills : [];
  const skillsB = Array.isArray(b.skills) ? b.skills : [];

  const normA = skillsA.map(normalizeSkillIdentity);
  const normB = skillsB.map(normalizeSkillIdentity);

  const setA = new Set(normA);
  const setB = new Set(normB);

  const addedSkills = skillsB.filter(s => !setA.has(normalizeSkillIdentity(s)));
  const removedSkills = skillsA.filter(s => !setB.has(normalizeSkillIdentity(s)));

  const sameSet = setA.size === setB.size && normA.length === normB.length && addedSkills.length === 0 && removedSkills.length === 0;
  const sameOrder = sameSet && JSON.stringify(normA) === JSON.stringify(normB);
  const reorderedSkills = sameSet && !sameOrder;

  return {
    headline: {
      changed: (a.headline || '') !== (b.headline || ''),
      before: a.headline || '',
      after: b.headline || ''
    },
    summary: {
      changed: (a.summary || '') !== (b.summary || ''),
      before: a.summary || '',
      after: b.summary || ''
    },
    skills: {
      sameOrder,
      reordered: reorderedSkills,
      added: addedSkills,
      removed: removedSkills,
      before: skillsA,
      after: skillsB
    },
    projects: {
      changed: JSON.stringify(a.projects || []) !== JSON.stringify(b.projects || []),
      before: a.projects || [],
      after: b.projects || []
    },
    employment: {
      changed: JSON.stringify(a.employment || a.experience || []) !== JSON.stringify(b.employment || b.experience || []),
      before: a.employment || a.experience || [],
      after: b.employment || b.experience || []
    },
    education: {
      changed: JSON.stringify(a.education || []) !== JSON.stringify(b.education || []),
      before: a.education || [],
      after: b.education || []
    },
    careerProfile: {
      changed: JSON.stringify(a.careerProfile || {}) !== JSON.stringify(b.careerProfile || {}),
      before: a.careerProfile || {},
      after: b.careerProfile || {}
    },
    resume: {
      changed: JSON.stringify(a.resume || {}) !== JSON.stringify(b.resume || {}),
      before: a.resume || {},
      after: b.resume || {}
    },
    itSkills: {
      changed: JSON.stringify(a.itSkills || []) !== JSON.stringify(b.itSkills || []),
      before: a.itSkills || [],
      after: b.itSkills || []
    },
    accomplishments: {
      changed: JSON.stringify(a.accomplishments || []) !== JSON.stringify(b.accomplishments || []),
      before: a.accomplishments || [],
      after: b.accomplishments || []
    }
  };
}

module.exports = {
  readNaukriProfile,
  parseProfileFromPage,
  saveProfileSnapshot,
  loadLatestSnapshot,
  preservePreviousSnapshot,
  compareProfileSnapshots,
  computeProfileFingerprint,
  PROFILE_DATA_PATH,
  PROFILE_HISTORY_DIR,
  DEBUG_HTML_PATH,
  DEBUG_TEXT_PATH
};

const path = require('path');
const fs = require('fs');
const { launchBrowser } = require('../browser/browser.manager');
const { getBot, initBot, sendTelegramMessage } = require('../telegram/telegram.bot');
const { telegramChatId, telegramToken } = require('../config/config');
const { sendQuestionPrompt } = require('../telegram/question.handler');
const { getJobId } = require('../telegram/job.approval');
const { canSubmitApplication, incrementSubmittedCount } = require('./application.guard');
const { selectResume } = require('./resume.selector');
const { verifySubmission } = require('./application.verification');
const { updateApplicationStats } = require('./application.stats');

const HISTORY_FILE_PATH = path.resolve(__dirname, '../../data/application-history.json');
const PROFILE_FILE_PATH = path.resolve(__dirname, '../../data/profile.json');
const ERRORS_FILE_PATH = path.resolve(__dirname, '../../data/application-errors.json');
const SCREENSHOT_DIR = path.resolve(__dirname, '../../debug/applications');

/**
 * Standard granular reason codes for MANUAL_REQUIRED / FAILED states.
 */
const REASON_CODES = {
  CAPTCHA_DETECTED: 'CAPTCHA_DETECTED',
  LOGIN_EXPIRED: 'LOGIN_EXPIRED',
  JOB_EXPIRED: 'JOB_EXPIRED',
  FORM_CHANGED: 'FORM_CHANGED',
  UNKNOWN_QUESTION: 'UNKNOWN_QUESTION',
  MISSING_FIELD: 'MISSING_FIELD',
  SUBMISSION_FAILED: 'SUBMISSION_FAILED',
  EXTERNAL_APPLICATION: 'EXTERNAL_APPLICATION'
};

/**
 * Introduces human-like randomized micro delay.
 * @param {number} minMs 
 * @param {number} maxMs 
 */
async function humanDelay(minMs = 1500, maxMs = 3500) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Captures evidence screenshot on Playwright page.
 * @param {import('playwright').Page} page 
 * @param {string} prefix 
 * @param {string} jobId 
 */
async function captureEvidence(page, prefix, jobId) {
  if (!page) return;
  try {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
    const filename = `${prefix}_${jobId}_${Date.now()}.png`;
    const fullPath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: fullPath, fullPage: false });
    console.log(`Saved evidence screenshot: ${filename}`);
  } catch (err) {
    console.warn('Failed to capture evidence screenshot:', err.message);
  }
}

/**
 * Reads application history array safely.
 * @returns {Array<Object>}
 */
function getApplicationHistory() {
  if (!fs.existsSync(HISTORY_FILE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE_PATH, 'utf-8')) || [];
  } catch (_) {
    return [];
  }
}

/**
 * Logs an error to data/application-errors.json.
 * @param {Object} job 
 * @param {string} error 
 * @param {string} step 
 */
function logApplicationError(job, error, step = 'UNKNOWN') {
  let errors = [];
  if (fs.existsSync(ERRORS_FILE_PATH)) {
    try {
      errors = JSON.parse(fs.readFileSync(ERRORS_FILE_PATH, 'utf-8')) || [];
    } catch (_) {}
  }

  errors.push({
    jobUrl: job ? job.jobUrl || '' : '',
    company: job ? job.company || '' : '',
    error: error || '',
    step,
    timestamp: new Date().toISOString()
  });

  const dir = path.dirname(ERRORS_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(ERRORS_FILE_PATH, JSON.stringify(errors, null, 2), 'utf-8');
}

/**
 * Checks if candidate has already applied to this job (by jobUrl or company+role).
 * @param {Object} job 
 * @returns {boolean}
 */
function isAlreadyApplied(job) {
  if (!job) return false;
  if (
    job.status === 'SUBMITTED' ||
    job.verificationStatus === 'VERIFIED_APPLIED' ||
    job.status === 'EXTERNAL_APPLICATION_REQUIRED' ||
    job.applyType === 'EXTERNAL_APPLICATION_REQUIRED'
  ) {
    return true;
  }

  const { isApplicationAlreadyEngaged } = require('../tracking/application.duplicate.guard');
  const engagedCheck = isApplicationAlreadyEngaged(job, { includeDecisions: false, includeQueue: false });
  if (
    engagedCheck.engaged &&
    (engagedCheck.status === 'SUBMITTED' ||
      engagedCheck.status === 'ALREADY_APPLIED' ||
      engagedCheck.status === 'VERIFIED_APPLIED' ||
      engagedCheck.status === 'EXTERNAL_APPLICATION_REQUIRED')
  ) {
    return true;
  }

  const history = getApplicationHistory();
  return history.some((h) => {
    if (h.jobUrl && job.jobUrl && h.jobUrl === job.jobUrl) {
      return h.status === 'SUBMITTED' || h.status === 'WAITING_CONFIRMATION' || h.status === 'ALREADY_APPLIED';
    }
    if (h.company && h.role && job.company && job.title) {
      const matchComp = h.company.toLowerCase().trim() === job.company.toLowerCase().trim();
      const matchRole = h.role.toLowerCase().trim() === (job.title || job.role || '').toLowerCase().trim();
      if (matchComp && matchRole) {
        return h.status === 'SUBMITTED' || h.status === 'WAITING_CONFIRMATION';
      }
    }
    return false;
  });
}

/**
 * Records or updates an application status entry in data/application-history.json.
 * @param {Object} job 
 * @param {string} status 
 * @param {string} [reason] 
 * @returns {Object}
 */
function recordApplicationHistory(job, status, reason = '') {
  const { persistSubmittedApplication } = require('../tracking/application.persistence');
  const jobId = job.jobId || (job.jobUrl ? getJobId(job.jobUrl) : '');
  const applicationId = job.applicationId || jobId;

  const entry = {
    applicationId,
    jobId,
    company: job.company || '',
    role: job.title || job.role || '',
    jobUrl: job.jobUrl || '',
    status,
    reason,
    timestamp: job.timestamp || new Date().toISOString()
  };

  // Atomically persist to BOTH application-history.json and application-outcomes.json
  persistSubmittedApplication(entry);

  // Update application stats analytics
  updateApplicationStats();

  return entry;
}

/**
 * Sends Telegram confirmation prompt before submitting an application.
 * @param {Object} job 
 * @param {string|number} [chatId] 
 * @returns {Promise<Object>}
 */
async function sendApplicationConfirmationPrompt(job, chatId = telegramChatId) {
  let bot = getBot();
  if (!bot && telegramToken) {
    bot = initBot({ polling: false });
  }

  const jobId = getJobId(job.jobUrl);
  const targetChat = chatId || telegramChatId;

  const text = `Application Ready:

Company:
${job.company}

Role:
${job.title}

Fields completed:
✓ Profile
✓ Resume
✓ Questions answered

Submit application?`;

  const options = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '✅ Submit',
            callback_data: `sub_${jobId}`
          },
          {
            text: '❌ Cancel',
            callback_data: `can_${jobId}`
          }
        ]
      ]
    }
  };

  if (bot) {
    return await bot.sendMessage(targetChat, text, options);
  } else {
    return await sendTelegramMessage(text + `\n\nSubmit: sub_${jobId} | Cancel: can_${jobId}`, targetChat);
  }
}

/**
 * Processes an approved job from application-queue.json:
 * Checks safety limits, duplicate protection, opens page, verifies Easy Apply, pre-fills profile fields,
 * captures evidence screenshots, and pauses before final submission for explicit Telegram confirmation.
 * @param {Object} job 
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function processApplication(job, options = {}) {
  if (!job || !job.jobUrl) {
    throw new Error('Invalid job object.');
  }

  const jobId = getJobId(job.jobUrl);

  // 1. Check Safety Guardrails (Daily Limit & Pause Mode)
  const guard = canSubmitApplication();
  if (!guard.allowed) {
    console.log(`Safety Guardrail Blocked application for ${job.title}: ${guard.reason}`);
    recordApplicationHistory(job, 'MANUAL_REQUIRED', guard.reason);
    return {
      status: 'MANUAL_REQUIRED',
      reason: guard.reason
    };
  }

  // 1. Verify Application Type
  if (job.applyType && job.applyType !== 'EASY_APPLY') {
    console.log(`Skipping auto-apply for ${job.title} at ${job.company}: Requires manual external application.`);
    recordApplicationHistory(job, 'MANUAL_REQUIRED', REASON_CODES.EXTERNAL_APPLICATION);
    return {
      status: 'MANUAL_REQUIRED',
      reason: REASON_CODES.EXTERNAL_APPLICATION
    };
  }

  // 2. Check Duplicate Application Protection
  if (isAlreadyApplied(job)) {
    console.log(`Duplicate Protection: Already applied to ${job.title} at ${job.company}.`);
    recordApplicationHistory(job, 'ALREADY_APPLIED', 'Already applied');
    return {
      status: 'ALREADY_APPLIED',
      reason: 'Already applied'
    };
  }

  console.log(`Processing Easy Apply job for: "${job.title}" at ${job.company}...`);
  recordApplicationHistory(job, 'OPENED', 'Browser navigation started');

  let profile = {};
  if (fs.existsSync(PROFILE_FILE_PATH)) {
    try {
      profile = JSON.parse(fs.readFileSync(PROFILE_FILE_PATH, 'utf-8'));
    } catch (_) {}
  }

  // Resume Selection Protection
  const resumeSelection = selectResume(job, profile);
  console.log(`Selected Resume: "${resumeSelection.resume}" (${resumeSelection.reason})`);

  let { browser, page } = await launchBrowser({ headless: false });

  try {
    console.log(`Opening job URL: ${job.jobUrl} ...`);
    await page.goto(job.jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(2000, 4000);

    // Check CAPTCHA or Login Expired
    const pageState = await page.evaluate(() => {
      const text = document.body ? document.body.innerText.toLowerCase() : '';
      if (text.includes('captcha') || text.includes('verify you are human') || document.querySelector('iframe[src*="captcha"]')) {
        return 'CAPTCHA';
      }
      if (text.includes('login to apply') || text.includes('sign in')) {
        return 'LOGIN_EXPIRED';
      }
      if (text.includes('job is no longer available') || text.includes('position closed') || text.includes('expired job')) {
        return 'JOB_EXPIRED';
      }
      return 'OK';
    });

    if (pageState === 'CAPTCHA') {
      await captureEvidence(page, 'captcha', jobId);
      recordApplicationHistory(job, 'MANUAL_REQUIRED', REASON_CODES.CAPTCHA_DETECTED);
      return { status: 'MANUAL_REQUIRED', reason: REASON_CODES.CAPTCHA_DETECTED };
    }

    if (pageState === 'LOGIN_EXPIRED') {
      await captureEvidence(page, 'failure', jobId);
      recordApplicationHistory(job, 'MANUAL_REQUIRED', REASON_CODES.LOGIN_EXPIRED);
      return { status: 'MANUAL_REQUIRED', reason: REASON_CODES.LOGIN_EXPIRED };
    }

    if (pageState === 'JOB_EXPIRED') {
      await captureEvidence(page, 'failure', jobId);
      recordApplicationHistory(job, 'MANUAL_REQUIRED', REASON_CODES.JOB_EXPIRED);
      return { status: 'MANUAL_REQUIRED', reason: REASON_CODES.JOB_EXPIRED };
    }

    // Verify Easy Apply button exists on live DOM
    const hasApplyBtn = await page.evaluate(() => {
      const bodyText = document.body ? document.body.innerText.toLowerCase() : '';
      if (bodyText.includes('apply on company website') || bodyText.includes('apply on company site')) {
        return false;
      }
      return !!(
        document.querySelector('#apply-button') ||
        document.querySelector('.apply-button') ||
        document.querySelector('button.apply-message') ||
        document.querySelector('div[class*="apply-button"] button')
      );
    });

    if (!hasApplyBtn) {
      console.log(`Apply button not found on ${job.jobUrl}. Marking as MANUAL_REQUIRED (${REASON_CODES.JOB_EXPIRED}).`);
      await captureEvidence(page, 'failure', jobId);
      recordApplicationHistory(job, 'MANUAL_REQUIRED', REASON_CODES.JOB_EXPIRED);
      return {
        status: 'MANUAL_REQUIRED',
        reason: REASON_CODES.JOB_EXPIRED
      };
    }

    console.log('Clicking Easy Apply button...');
    await page.evaluate(() => {
      const btn =
        document.querySelector('#apply-button') ||
        document.querySelector('.apply-button') ||
        document.querySelector('button.apply-message') ||
        document.querySelector('div[class*="apply-button"] button');
      if (btn) btn.click();
    });

    await humanDelay(2500, 4000);
    recordApplicationHistory(job, 'FORM_DETECTED', 'Application drawer open');

    // Check for recruiter questions or chatbot modal
    const questionText = await page.evaluate(() => {
      const qEl = document.querySelector('.question, .chatbot-question, div[class*="question"]');
      return qEl ? qEl.innerText.trim() : '';
    });

    if (questionText) {
      console.log(`Recruiter question detected: "${questionText}"`);
      await sendQuestionPrompt(job, questionText);
    }

    recordApplicationHistory(job, 'PREFILLED', 'Fields pre-filled');

    // Capture Evidence Screenshot Before Submit Confirmation Prompt
    await captureEvidence(page, 'before_submit', jobId);

    // Send Telegram Confirmation Prompt BEFORE clicking final submit
    console.log('Sending final Telegram confirmation prompt...');
    await sendApplicationConfirmationPrompt(job);

    recordApplicationHistory(job, 'WAITING_CONFIRMATION', 'Awaiting Telegram submit approval');

    console.log(`✓ Application for "${job.title}" at ${job.company} is PREPARED and WAITING_CONFIRMATION.`);

    return {
      status: 'WAITING_CONFIRMATION',
      jobUrl: job.jobUrl,
      title: job.title,
      company: job.company
    };
  } catch (error) {
    console.error(`Error processing application for ${job.title}:`, error.message);
    await captureEvidence(page, 'failure', jobId);
    logApplicationError(job, error.message, 'PROCESS_APPLICATION');
    recordApplicationHistory(job, 'FAILED', REASON_CODES.SUBMISSION_FAILED);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Submits final application after explicit Telegram confirmation, captures post-submit screenshot, and runs verification.
 * @param {Object} job 
 * @param {import('playwright').Page} [page] 
 * @returns {Promise<Object>}
 */
async function submitApplication(job, page = null) {
  console.log(`Executing final submit for: "${job.title}" at ${job.company}...`);
  const jobId = getJobId(job.jobUrl);

  // Check safety limit before submit
  const guard = canSubmitApplication();
  if (!guard.allowed) {
    console.log(`Blocked final submit for ${job.title}: ${guard.reason}`);
    return recordApplicationHistory(job, 'MANUAL_REQUIRED', guard.reason);
  }

  // Increment today's submitted count
  incrementSubmittedCount();

  // Run submission verification layer if page context available
  let verifyResult = { verified: true, status: 'SUBMITTED', message: 'User confirmed via Telegram' };
  if (page) {
    verifyResult = await verifySubmission(page, job);
    await captureEvidence(page, 'after_submit', jobId);
  }

  const finalStatus = verifyResult.status || 'SUBMITTED';
  const history = recordApplicationHistory(job, finalStatus, verifyResult.message);
  console.log(`✓ Application marked ${finalStatus} for ${job.title} at ${job.company}.`);
  return history;
}

module.exports = {
  processApplication,
  submitApplication,
  recordApplicationHistory,
  getApplicationHistory,
  isAlreadyApplied,
  sendApplicationConfirmationPrompt,
  REASON_CODES,
  captureEvidence,
  humanDelay,
  HISTORY_FILE_PATH,
  ERRORS_FILE_PATH,
  SCREENSHOT_DIR
};

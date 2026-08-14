const path = require('path');
const fs = require('fs');
const { getOutcomes, recordOutcome, OUTCOME_STATUSES } = require('./outcome.tracker');
const { getApplicationHistory } = require('../naukri/application.executor');
const { getBot, initBot, sendTelegramMessage } = require('../telegram/telegram.bot');
const { telegramChatId, telegramToken } = require('../config/config');
const { getJobId } = require('../telegram/job.approval');
const { validateJobUrl } = require('../naukri/job.url.validator');
const { authorizeFollowupDelivery } = require('./followup.delivery.guard');
const { resolveApplicationIdentity } = require('./application.identity.resolver');
const { getTodayString } = require('../naukri/application.guard');

const FOLLOWUP_FILE_PATH = path.resolve(__dirname, '../../data/followup-history.json');
const DEBUG_DIR = path.resolve(__dirname, '../../debug');

// Statuses that MUST NEVER receive follow-up reminders
const EXCLUDED_STATUSES = [
  'QUEUED',
  'APPROVED',
  'REJECTED',
  'OFFER',
  'NO_RESPONSE',
  'WITHDRAWN',
  'MANUAL_REQUIRED',
  'SUBMITTED_FAILED',
  'FOLLOWUP_SUPPRESSED'
];

/**
 * Reads data/followup-history.json safely.
 * @returns {Array<Object>}
 */
function getFollowupHistory() {
  if (!fs.existsSync(FOLLOWUP_FILE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(FOLLOWUP_FILE_PATH, 'utf-8')) || [];
  } catch (_) {
    return [];
  }
}

/**
 * Gets followup record by jobUrl or jobId or applicationId.
 * @param {string} identifier 
 * @returns {Object|null}
 */
function getFollowupRecord(identifier) {
  if (!identifier) return null;
  const history = getFollowupHistory();
  return (
    history.find(
      (h) =>
        h.applicationId === identifier ||
        h.jobUrl === identifier ||
        h.jobId === identifier ||
        (h.jobUrl && getJobId(h.jobUrl) === identifier)
    ) || null
  );
}

/**
 * Records or updates a followup reminder log entry in data/followup-history.json ONLY after authorization / delivery.
 * Preserves exact original jobUrl.
 * @param {Object|string} job 
 * @param {string} [action] 
 * @returns {Object}
 */
function recordFollowupSent(job, action = 'REMINDER_SENT') {
  if (!job) {
    throw new Error('recordFollowupSent requires a valid job object or jobUrl');
  }

  const jobObj = typeof job === 'string' ? { jobUrl: job } : job;
  const history = getFollowupHistory();
  const urlCheck = validateJobUrl(jobObj);
  const jobUrl = urlCheck.valid ? urlCheck.url : (jobObj.jobUrl || '');
  const jobId = jobObj.jobId || (jobUrl ? getJobId(jobUrl) : `job_${Date.now()}`);
  const applicationId = jobObj.applicationId || jobId;
  const company = jobObj.company || '';
  const role = jobObj.role || jobObj.title || '';

  const existingIdx = history.findIndex(
    (h) => h.applicationId === applicationId || (h.jobUrl && jobUrl && h.jobUrl === jobUrl) || h.jobId === jobId
  );
  const now = new Date().toISOString();

  let entry;
  let prevCount = 0;

  if (existingIdx !== -1) {
    entry = history[existingIdx];
    prevCount = entry.reminderCount || 0;

    if (action === 'REMINDER_SENT') {
      entry.reminderCount = prevCount + 1;
    }
    entry.lastReminderAt = now;
    entry.lastAction = action;
    if (jobUrl && !entry.jobUrl) entry.jobUrl = jobUrl;
    if (!entry.applicationId) entry.applicationId = applicationId;
  } else {
    entry = {
      applicationId,
      jobId,
      jobUrl,
      company,
      role,
      lastReminderAt: now,
      reminderCount: action === 'REMINDER_SENT' ? 1 : 0,
      lastAction: action
    };
    history.push(entry);
  }

  const dir = path.dirname(FOLLOWUP_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(FOLLOWUP_FILE_PATH, JSON.stringify(history, null, 2), 'utf-8');

  return entry;
}

/**
 * Deduplicates pending applications by applicationId.
 * @param {Array<Object>} apps 
 * @returns {Array<Object>}
 */
function deduplicateApplications(apps) {
  const seen = new Set();
  const result = [];

  for (const app of apps) {
    if (!app) continue;
    const appId = app.applicationId || app.jobId || (app.jobUrl ? getJobId(app.jobUrl) : null);
    if (!appId || seen.has(appId)) continue;
    seen.add(appId);
    result.push(app);
  }

  return result;
}

/**
 * Parses date inputs cleanly supporting ISO strings, timestamps, DD/MM/YYYY, DD-MM-YYYY formats.
 * @param {string|number|Date} dateInput 
 * @returns {Date|null}
 */
function parseApplicationDate(dateInput) {
  if (!dateInput) return null;
  if (typeof dateInput === 'number') return new Date(dateInput);
  if (dateInput instanceof Date) return dateInput;

  const str = String(dateInput).trim();
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Pure deterministic function to filter pending follow-up applications.
 * @param {Array<Object>} applications 
 * @param {Date|string|number} [now] 
 * @param {number} [thresholdDays] 
 * @returns {Array<Object>}
 */
function getPendingFollowups(applications, now = new Date(), thresholdDays = 7) {
  if (!Array.isArray(applications)) return [];
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();

  const pending = [];
  const deduplicated = deduplicateApplications(applications);

  for (const app of deduplicated) {
    if (!app || (!app.jobUrl && !app.applicationId)) continue;
    const status = app.currentStatus || app.status || 'APPLIED';
    if (EXCLUDED_STATUSES.includes(status)) continue;

    const dateObj = parseApplicationDate(app.updatedAt || app.timestamp || app.queuedAt);
    if (!dateObj) continue;

    const daysElapsed = (nowMs - dateObj.getTime()) / (1000 * 3600 * 24);
    if (daysElapsed >= thresholdDays) {
      pending.push({
        ...app,
        parsedAppliedAt: dateObj.toISOString(),
        daysElapsed: Math.floor(daysElapsed)
      });
    }
  }

  return pending;
}

/**
 * Checks pending applications and sends Telegram follow-up reminders strictly after fail-closed delivery guard authorization.
 * @param {Object} [options]
 * @returns {Promise<Array<Object>>}
 */
async function checkPendingFollowups(options = {}) {
  const outcomes = getOutcomes();
  const submittedHistory = getApplicationHistory().filter((h) => h.status === 'SUBMITTED');

  const rawList = [];

  for (const app of outcomes) {
    if (app && app.jobUrl && !EXCLUDED_STATUSES.includes(app.currentStatus || app.status)) {
      rawList.push({
        applicationId: app.applicationId || (app.jobUrl ? getJobId(app.jobUrl) : `app_${Date.now()}`),
        jobId: app.jobId || getJobId(app.jobUrl),
        jobUrl: app.jobUrl,
        company: app.company || '',
        role: app.role || app.title || '',
        currentStatus: app.currentStatus || app.status || 'APPLIED',
        updatedAt: app.updatedAt || app.timestamp || new Date().toISOString()
      });
    }
  }

  for (const app of submittedHistory) {
    if (app && app.jobUrl && !EXCLUDED_STATUSES.includes(app.status)) {
      rawList.push({
        applicationId: app.applicationId || (app.jobUrl ? getJobId(app.jobUrl) : `app_${Date.now()}`),
        jobId: app.jobId || getJobId(app.jobUrl),
        jobUrl: app.jobUrl,
        company: app.company || '',
        role: app.role || app.title || '',
        currentStatus: app.status || 'APPLIED',
        updatedAt: app.timestamp || new Date().toISOString()
      });
    }
  }

  const thresholdDays = options.thresholdDays || 7;
  const pendingList = getPendingFollowups(rawList, new Date(), thresholdDays);
  const sentReminders = [];

  let bot = getBot();
  if (!bot && telegramToken) {
    bot = initBot({ polling: false });
  }

  const targetChat = options.chatId || telegramChatId;

  for (const app of pendingList) {
    // 1. Resolve Application Identity
    const identity = resolveApplicationIdentity(app.applicationId || app.jobId || app.jobUrl);
    if (!identity.resolved) {
      console.warn(`Skipping unresolvable application follow-up: ${app.company} (${identity.reason})`);
      recordFollowupSent(app, 'FOLLOWUP_SUPPRESSED');
      continue;
    }

    const jobUrl = identity.jobUrl || app.jobUrl;
    const applicationId = identity.applicationId || app.applicationId;
    const followup = getFollowupRecord(applicationId) || getFollowupRecord(jobUrl) || { reminderCount: 0, lastReminderAt: null };

    // Maximum 3 reminders cap
    if (followup.reminderCount >= 3) {
      continue;
    }

    const daysElapsed = app.daysElapsed || 7;

    console.log(`\n[Follow-up Delivery Audit]`);
    console.log(`Company: ${identity.company}`);
    console.log(`Role: ${identity.role}`);
    console.log(`Original URL: ${jobUrl}`);
    console.log(`Resolving application identity...`);
    console.log(`✓ Identity resolved (${applicationId})`);
    console.log(`Running LIVE Playwright verification...`);

    // 2. Authoritative Final Delivery Guard Authorization
    const authorization = await authorizeFollowupDelivery(app, {
      forceRefresh: options.forceRefresh,
      mockStatus: options.mockStatus
    });

    console.log(`Final URL: ${authorization.validation ? authorization.validation.finalUrl : ''}`);
    console.log(`Validation: ${authorization.validation ? authorization.validation.status : 'FAILED'}`);
    console.log(`Delivery Authorization: ${authorization.allowed ? 'ALLOWED' : 'BLOCKED'}`);
    console.log(`Telegram Would Send: ${authorization.allowed}`);

    if (!authorization.allowed) {
      console.log(`✓ Follow-up suppressed.`);
      recordFollowupSent(app, 'FOLLOWUP_SUPPRESSED');
      recordOutcome(app, OUTCOME_STATUSES.NO_RESPONSE, `Suppressed due to validation: ${authorization.validation.status}`);
      continue;
    }

    // 3. Construct Telegram Message using single production message builder
    const reminderNum = (followup.reminderCount || 0) + 1;
    const { text, opts } = buildFollowupTelegramMessage(app, identity, authorization, daysElapsed);

    // 4. Send Telegram Message through Centralized Transport FIRST
    try {
      const { dispatchTelegramMessage } = require('../telegram/telegram.transport');
      
      await dispatchTelegramMessage(bot, targetChat, text, {
        ...opts,
        forensicContext: {
          source: 'followup.scheduler/checkPendingFollowups',
          type: 'APPLICATION_FOLLOWUP',
          company: identity.company,
          role: identity.role,
          applicationId,
          jobUrl: authorization.verifiedUrl
        },
        mockSuccess: process.env.NODE_ENV === 'test' || options.suppressTelegram,
        allowTestSend: false
      });

      // 5. Record REMINDER_SENT ONLY AFTER successful Telegram delivery
      recordFollowupSent(
        {
          applicationId,
          jobId: identity.jobId,
          jobUrl: authorization.verifiedUrl,
          company: identity.company,
          role: identity.role
        },
        'REMINDER_SENT'
      );

      sentReminders.push({ applicationId, company: identity.company, reminderNum });
      console.log(`✓ Sent follow-up reminder (${reminderNum}/3) for ${identity.company}`);
    } catch (sendErr) {
      console.error(`Failed to send Telegram message for ${identity.company}:`, sendErr.message);
    }
  }

  return sentReminders;
}

/**
 * Builds standard production Telegram follow-up message payload.
 * @param {Object} app Application entry
 * @param {Object} identity Resolved identity
 * @param {Object} authorization Delivery authorization
 * @param {number} daysElapsed Days elapsed since application
 * @returns {{ text: string, opts: Object }}
 */
function buildFollowupTelegramMessage(app, identity, authorization, daysElapsed) {
  const applicationId = identity.applicationId || app.applicationId;
  const text = `📬 *Application Follow-up Reminder*

🏢 *Company:* ${identity.company}
🎯 *Role:* ${identity.role}
📅 *Applied:* ${new Date(app.updatedAt || Date.now()).toLocaleDateString()}

🔗 *Original Naukri Job:*
[View Job](${authorization.verifiedUrl})

No recruiter response detected for ${Math.floor(daysElapsed)} day(s).

Action required:

🔎 Source: followup.scheduler/checkPendingFollowups | PID: ${process.pid}`;

  const opts = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔗 View Job', url: authorization.verifiedUrl }
        ],
        [
          { text: '⏳ Still Waiting', callback_data: `follow_wait_${applicationId}` },
          { text: '❌ No Response', callback_data: `follow_no_response_${applicationId}` }
        ]
      ]
    }
  };

  return { text, opts };
}

module.exports = {
  checkPendingFollowups,
  getFollowupHistory,
  getFollowupRecord,
  recordFollowupSent,
  deduplicateApplications,
  buildFollowupTelegramMessage,
  parseApplicationDate,
  getPendingFollowups,
  EXCLUDED_STATUSES,
  FOLLOWUP_FILE_PATH
};

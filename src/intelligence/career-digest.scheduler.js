const fs = require('fs');
const path = require('path');
const { generateCareerPerformanceReport } = require('./career.performance.analytics');
const { buildCareerDigestMessage } = require('../telegram/career.digest');
const { dispatchTelegramMessage } = require('../telegram/telegram.transport');
const { telegramChatId } = require('../config/config');

const DIGEST_HISTORY_PATH = path.resolve(__dirname, '../../data/career-digest-history.json');

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readDigestHistory() {
  if (!fs.existsSync(DIGEST_HISTORY_PATH)) {
    return { lastSentDate: null, lastMessageId: null, history: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DIGEST_HISTORY_PATH, 'utf-8')) || {};
  } catch (_) {
    return { lastSentDate: null, lastMessageId: null, history: [] };
  }
}

function writeDigestHistory(data) {
  const dir = path.dirname(DIGEST_HISTORY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DIGEST_HISTORY_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Executes a daily career performance digest run.
 * Checks for same-day duplicate delivery and sends message via dispatchTelegramMessage.
 * Safe, fail-closed, and non-throwing.
 *
 * @param {Object} [options] Options { suppressTelegram, force, customReport }
 * @returns {Promise<Object>} Execution status object
 */
async function sendCareerPerformanceDigest(options = {}) {
  const todayStr = getTodayDateString();
  const isTestEnv = process.env.NODE_ENV === 'test' || options.suppressTelegram;
  const { enableCareerDigest } = require('../config/config');
  const isEnabled = options.enabled !== undefined ? options.enabled : (enableCareerDigest || process.env.CAREER_DIGEST_ENABLED === 'true');

  try {
    const historyData = readDigestHistory();

    // 0. Feature Flag Check
    if (!options.force && !isEnabled) {
      console.log('[Career Digest] Career digest disabled by configuration (CAREER_DIGEST_ENABLED != true). Skipping dispatch.');
      return {
        sent: false,
        date: todayStr,
        reason: 'DIGEST_DISABLED_BY_CONFIG'
      };
    }

    // 1. Same-day Duplicate Delivery Protection
    if (!options.force && historyData.lastSentDate === todayStr) {
      console.log(`[Career Digest] Today's digest (${todayStr}) has already been delivered. Skipping duplicate send.`);
      return {
        sent: false,
        date: todayStr,
        reason: 'ALREADY_SENT_TODAY',
        lastMessageId: historyData.lastMessageId
      };
    }

    // 2. Generate Analytics Report & Payload
    let report;
    if (typeof options.customReport === 'function') {
      report = options.customReport();
    } else {
      report = options.customReport || generateCareerPerformanceReport({ period: 'allTime' });
    }
    const payload = buildCareerDigestMessage(report);

    // 3. Test Mode Network Isolation
    if (isTestEnv) {
      console.log('[Career Digest] Test environment detected. Suppressing live Telegram dispatch.');
      return {
        sent: true,
        date: todayStr,
        mock: true,
        messageId: 999,
        text: payload.text,
        report
      };
    }

    // 4. Dispatch Telegram Message
    const targetChatId = options.chatId || process.env.TELEGRAM_CHAT_ID || telegramChatId;
    const dispatchRes = await dispatchTelegramMessage(null, targetChatId, payload.text, {
      reply_markup: payload.reply_markup,
      parse_mode: 'Markdown',
      forensicContext: { source: 'career-digest.scheduler', type: 'CAREER_DIGEST' }
    });

    if (dispatchRes && (dispatchRes.success || dispatchRes.message_id)) {
      const messageId = dispatchRes.message_id || (dispatchRes.res ? dispatchRes.res.message_id : null);

      // Record successful delivery atomically
      if (!options.isMock) {
        historyData.lastSentDate = todayStr;
        historyData.lastMessageId = messageId;
        historyData.sentAt = new Date().toISOString();

        if (!Array.isArray(historyData.history)) historyData.history = [];
        historyData.history.push({ date: todayStr, messageId, sentAt: historyData.sentAt });
        writeDigestHistory(historyData);
      }

      console.log(`✓ Career Digest delivered successfully for ${todayStr} (message_id: ${messageId})`);
      return {
        sent: true,
        date: todayStr,
        messageId,
        report
      };
    }

    console.warn(`⚠️ [Career Digest] Telegram dispatch failed: ${dispatchRes ? dispatchRes.reason : 'UNKNOWN'}`);
    return {
      sent: false,
      date: todayStr,
      reason: dispatchRes ? dispatchRes.reason : 'TELEGRAM_DISPATCH_FAILED'
    };
  } catch (err) {
    console.error('❌ [Career Digest] Error executing daily digest:', err.message);
    return {
      sent: false,
      date: todayStr,
      reason: 'EXCEPTION_OCCURRED',
      error: err.message
    };
  }
}

let digestTimer = null;
let isDigestSchedulerActive = false;

/**
 * Starts the background daily digest scheduler.
 * Enforces singleton initialization to prevent duplicate timers.
 *
 * @param {Object} [options] Options { hour: 18, minute: 0 }
 * @returns {boolean} True if initialized, false if already active
 */
function startCareerDigestScheduler(options = {}) {
  if (isDigestSchedulerActive && digestTimer) {
    console.log('[Career Digest Scheduler] Timer is already active. Reusing existing scheduler.');
    return false;
  }

  const hour = options.hour || parseInt(process.env.CAREER_DIGEST_HOUR || '18', 10);
  const minute = options.minute || parseInt(process.env.CAREER_DIGEST_MINUTE || '0', 10);

  // Check hourly interval check
  const CHECK_INTERVAL_MS = 3600 * 1000;

  digestTimer = setInterval(async () => {
    const now = new Date();
    if (now.getHours() === hour) {
      console.log(`[Career Digest Scheduler] Scheduled time reached (${hour}:00). Executing digest check...`);
      await sendCareerPerformanceDigest();
    }
  }, CHECK_INTERVAL_MS);

  isDigestSchedulerActive = true;
  console.log(`✓ Career Digest Scheduler online (Configured target hour: ${hour}:00 local time)`);
  return true;
}

function stopCareerDigestScheduler() {
  if (digestTimer) {
    clearInterval(digestTimer);
    digestTimer = null;
  }
  isDigestSchedulerActive = false;
}

module.exports = {
  sendCareerPerformanceDigest,
  startCareerDigestScheduler,
  stopCareerDigestScheduler,
  getTodayDateString,
  readDigestHistory,
  writeDigestHistory,
  DIGEST_HISTORY_PATH
};

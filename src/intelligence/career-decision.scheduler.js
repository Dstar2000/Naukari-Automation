const fs = require('fs');
const path = require('path');
const { generateCareerDecisionReport } = require('./career-decision.analytics');
const { buildCareerDecisionDigestMessage } = require('../telegram/career.decision.digest');
const { dispatchTelegramMessage } = require('../telegram/telegram.transport');
const { telegramChatId } = require('../config/config');

const DIGEST_HISTORY_PATH = path.resolve(__dirname, '../../data/career-decision-history.json');

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
 * Executes a daily career decision advisory digest run.
 * Checks for same-day duplicate delivery and dispatches via dispatchTelegramMessage.
 * Safe, fail-closed, and non-throwing.
 *
 * @param {Object} [options] Options { suppressTelegram, force, customReport }
 * @returns {Promise<Object>} Execution status object
 */
async function sendCareerDecisionDigest(options = {}) {
  const todayStr = getTodayDateString();
  const isTestEnv = process.env.NODE_ENV === 'test' || options.suppressTelegram;

  try {
    const historyData = readDigestHistory();

    // 1. Same-day Duplicate Delivery Protection
    if (!options.force && historyData.lastSentDate === todayStr) {
      console.log(`[Career Decision Digest] Today's digest (${todayStr}) has already been delivered. Skipping duplicate send.`);
      return {
        sent: false,
        date: todayStr,
        reason: 'ALREADY_SENT_TODAY',
        lastMessageId: historyData.lastMessageId
      };
    }

    // 2. Generate Decision Report & Payload
    let report;
    if (typeof options.customReport === 'function') {
      report = options.customReport();
    } else {
      report = options.customReport || generateCareerDecisionReport({ customData: options.customData });
    }
    const payload = buildCareerDecisionDigestMessage(report);

    // 3. Test Mode Network Isolation
    if (isTestEnv) {
      console.log('[Career Decision Digest] Test environment detected. Suppressing live Telegram dispatch.');
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
      forensicContext: { source: 'career-decision.scheduler', type: 'CAREER_DECISION_DIGEST' }
    });

    if (dispatchRes && (dispatchRes.success || dispatchRes.message_id)) {
      const messageId = dispatchRes.message_id || (dispatchRes.res ? dispatchRes.res.message_id : null);

      if (!options.isMock) {
        historyData.lastSentDate = todayStr;
        historyData.lastMessageId = messageId;
        historyData.sentAt = new Date().toISOString();

        if (!Array.isArray(historyData.history)) historyData.history = [];
        historyData.history.push({ date: todayStr, messageId, sentAt: historyData.sentAt });
        writeDigestHistory(historyData);
      }

      console.log(`✓ Career Decision Digest delivered successfully for ${todayStr} (message_id: ${messageId})`);
      return {
        sent: true,
        date: todayStr,
        messageId,
        report
      };
    }

    console.warn(`⚠️ [Career Decision Digest] Telegram dispatch failed: ${dispatchRes ? dispatchRes.reason : 'UNKNOWN'}`);
    return {
      sent: false,
      date: todayStr,
      reason: dispatchRes ? dispatchRes.reason : 'TELEGRAM_DISPATCH_FAILED'
    };
  } catch (err) {
    console.error('❌ [Career Decision Digest] Error executing daily decision digest:', err.message);
    return {
      sent: false,
      date: todayStr,
      reason: 'EXCEPTION_OCCURRED',
      error: err.message
    };
  }
}

let decisionTimer = null;
let isDecisionSchedulerActive = false;

/**
 * Starts the background daily decision digest scheduler.
 * Enforces singleton initialization to prevent duplicate timers.
 *
 * @param {Object} [options] Options { hour: 18, minute: 30 }
 * @returns {boolean} True if initialized, false if already active
 */
function startCareerDecisionScheduler(options = {}) {
  if (isDecisionSchedulerActive && decisionTimer) {
    console.log('[Career Decision Scheduler] Timer is already active. Reusing existing scheduler.');
    return false;
  }

  const hour = options.hour || parseInt(process.env.CAREER_DECISION_HOUR || '18', 10);
  const CHECK_INTERVAL_MS = 3600 * 1000;

  decisionTimer = setInterval(async () => {
    const now = new Date();
    if (now.getHours() === hour) {
      console.log(`[Career Decision Scheduler] Scheduled time reached (${hour}:00). Executing decision digest check...`);
      await sendCareerDecisionDigest();
    }
  }, CHECK_INTERVAL_MS);

  isDecisionSchedulerActive = true;
  console.log(`✓ Career Decision Scheduler online (Configured target hour: ${hour}:00 local time)`);
  return true;
}

function stopCareerDecisionScheduler() {
  if (decisionTimer) {
    clearInterval(decisionTimer);
    decisionTimer = null;
  }
  isDecisionSchedulerActive = false;
}

module.exports = {
  sendCareerDecisionDigest,
  startCareerDecisionScheduler,
  stopCareerDecisionScheduler,
  getTodayDateString,
  readDigestHistory,
  writeDigestHistory,
  DIGEST_HISTORY_PATH
};

const path = require('path');
const fs = require('fs');

const FORENSICS_DIR = path.resolve(__dirname, '../../debug');

/**
 * Gets formatted today date string (YYYY-MM-DD).
 * @returns {string}
 */
function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Writes forensic log entry for every Telegram send attempt.
 * @param {Object} logEntry 
 */
function logSendForensics(logEntry) {
  try {
    if (!fs.existsSync(FORENSICS_DIR)) {
      fs.mkdirSync(FORENSICS_DIR, { recursive: true });
    }
    const today = getTodayString();
    const logFile = path.join(FORENSICS_DIR, `telegram-send-forensics-${today}.log`);
    const line = `[${new Date().toISOString()}] PID=${process.pid} SOURCE=${logEntry.source || 'UNKNOWN'} TYPE=${logEntry.type || 'GENERAL'} COMPANY="${logEntry.company || ''}" ROLE="${logEntry.role || ''}" APPLICATION_ID="${logEntry.applicationId || ''}" JOB_URL="${logEntry.jobUrl || ''}" CHAT_ID="${logEntry.chatId || ''}"\n`;
    fs.appendFileSync(logFile, line, 'utf-8');
  } catch (err) {
    console.warn('Failed to log Telegram send forensics:', err.message);
  }
}

/**
 * Checks if current runtime is inside Jest / unit test execution.
 * @returns {boolean}
 */
function isTestRuntime() {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.JEST_WORKER_ID !== undefined ||
    typeof global.jest !== 'undefined'
  );
}

/**
 * Centralized Telegram Message Transport Dispatcher.
 * Enforces production/test boundaries, prevents real network calls during tests, and logs send forensics.
 * @param {Object|null} bot Telegram bot instance
 * @param {string|number} chatId Target chat ID
 * @param {string} text Message text payload
 * @param {Object} [options] Message options (reply_markup, parse_mode, forensicContext)
 * @returns {Promise<Object>}
 */
async function dispatchTelegramMessage(bot, chatId, text, options = {}) {
  const forensicCtx = options.forensicContext || {};
  logSendForensics({
    source: forensicCtx.source || 'dispatchTelegramMessage',
    type: forensicCtx.type || 'MESSAGE',
    company: forensicCtx.company,
    role: forensicCtx.role,
    applicationId: forensicCtx.applicationId,
    jobUrl: forensicCtx.jobUrl,
    chatId
  });

  if (isTestRuntime() && !options.allowTestSend) {
    if (options.mockSuccess) {
      return { message_id: 999, chat: { id: chatId || 123456 }, text };
    }
    // Strict guard: Throw if real Telegram network API call attempted during Jest
    throw new Error('TEST_TELEGRAM_NETWORK_BLOCKED: Real Telegram network calls are strictly prohibited during Jest tests.');
  }

  const { getBot, initBot } = require('./telegram.bot');
  let activeBot = bot || getBot();

  if (!activeBot) {
    activeBot = initBot({ polling: false });
  }

  if (!activeBot) {
    throw new Error('Telegram bot is not initialized. Token is missing.');
  }

  const sendOptions = { ...options };
  delete sendOptions.forensicContext;
  delete sendOptions.mockSuccess;
  delete sendOptions.allowTestSend;

  return await activeBot.sendMessage(chatId, text, sendOptions);
}

/**
 * Centralized Telegram Message Edit Dispatcher.
 * @param {Object|null} bot 
 * @param {string|number} chatId 
 * @param {number} messageId 
 * @param {string} text 
 * @param {Object} [options] 
 * @returns {Promise<Object>}
 */
async function dispatchTelegramEdit(bot, chatId, messageId, text, options = {}) {
  if (isTestRuntime() && !options.allowTestSend) {
    if (options.mockSuccess || (bot && bot.editMessageText && typeof bot.editMessageText.mockResolvedValue === 'function')) {
      return { message_id: messageId, chat: { id: chatId }, text };
    }
    throw new Error('TEST_TELEGRAM_NETWORK_BLOCKED: Real Telegram edit calls are strictly prohibited during Jest tests.');
  }

  const { getBot, initBot } = require('./telegram.bot');
  let activeBot = bot || getBot();
  if (!activeBot) {
    activeBot = initBot({ polling: false });
  }

  if (!activeBot) {
    throw new Error('Telegram bot is not initialized.');
  }

  const editOptions = { ...options, chat_id: chatId, message_id: messageId };
  delete editOptions.forensicContext;
  delete editOptions.mockSuccess;
  delete editOptions.allowTestSend;

  return await activeBot.editMessageText(text, editOptions);
}

/**
 * Centralized Callback Query Answer Dispatcher.
 * @param {Object|null} bot 
 * @param {string} queryId 
 * @param {string} [text] 
 * @returns {Promise<boolean>}
 */
async function dispatchTelegramAnswerCallback(bot, queryId, text = '') {
  if (isTestRuntime()) {
    if (bot && typeof bot.answerCallbackQuery === 'function') {
      return await bot.answerCallbackQuery(queryId, text);
    }
    return true;
  }

  const { getBot } = require('./telegram.bot');
  const activeBot = bot || getBot();
  if (activeBot) {
    return await activeBot.answerCallbackQuery(queryId, text);
  }
  return false;
}

module.exports = {
  dispatchTelegramMessage,
  dispatchTelegramEdit,
  dispatchTelegramAnswerCallback,
  isTestRuntime,
  logSendForensics,
  FORENSICS_DIR
};

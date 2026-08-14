const RawTelegramBot = require('node-telegram-bot-api');
const TelegramBot =
  typeof RawTelegramBot === 'function'
    ? RawTelegramBot
    : RawTelegramBot.TelegramBot || RawTelegramBot.default;
const { telegramToken, telegramChatId } = require('../config/config');
const path = require('path');
const fs = require('fs');
const { validateJobUrl } = require('../naukri/job.url.validator');

let bot = null;
let pendingQuestion = null;

/**
 * Authoritative Job Resolution: Searches all local JSON data stores in strict priority.
 * Candidate match is valid ONLY if it passes validateJobUrl() with a non-empty, valid Naukri jobUrl.
 * REMOVES ALL DUMMY FALLBACKS. Returns null if resolution fails.
 * @param {string} jobId 
 * @returns {Object|null}
 */
function findJobByHashId(jobId) {
  if (!jobId || typeof jobId !== 'string') return null;
  const targetId = jobId.trim();
  const { getJobId } = require('./job.approval');

  const files = [
    path.resolve(__dirname, '../../data/application-history.json'),
    path.resolve(__dirname, '../../data/application-queue.json'),
    path.resolve(__dirname, '../../data/application-outcomes.json'),
    path.resolve(__dirname, '../../data/followup-history.json'),
    path.resolve(__dirname, '../../data/matched-jobs.json'),
    path.resolve(__dirname, '../../data/jobs.json')
  ];

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (!Array.isArray(records)) continue;

      for (const rec of records) {
        if (!rec || typeof rec !== 'object') continue;

        const isMatch =
          rec.jobId === targetId ||
          rec.applicationId === targetId ||
          (rec.jobUrl && getJobId(rec.jobUrl) === targetId);

        if (isMatch) {
          const urlCheck = validateJobUrl(rec);
          if (urlCheck.valid) {
            return rec;
          }
        }
      }
    } catch (_) {}
  }

  return null;
}

/**
 * Initializes the Telegram Bot instance and registers message & callback_query event listeners.
 * @param {Object} options Options for TelegramBot constructor
 * @returns {TelegramBot|null}
 */
const RUNTIME_LOG_DIR = path.resolve(__dirname, '../../debug');

/**
 * Logs Telegram runtime lifecycle diagnostics.
 * @param {string} event 
 * @param {string} details 
 */
function logTelegramRuntime(event, details = '') {
  try {
    if (!fs.existsSync(RUNTIME_LOG_DIR)) {
      fs.mkdirSync(RUNTIME_LOG_DIR, { recursive: true });
    }
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(RUNTIME_LOG_DIR, `telegram-runtime-${today}.log`);
    const line = `[${new Date().toISOString()}] PID=${process.pid} EVENT=${event} DETAILS="${details}"\n`;
    fs.appendFileSync(logFile, line, 'utf-8');
  } catch (_) {}
}

/**
 * Initializes the Telegram Bot instance without starting polling by default.
 * @param {Object} options Options for TelegramBot constructor
 * @returns {TelegramBot|null}
 */
function initBot(options = {}) {
  if (!telegramToken) {
    console.warn('TELEGRAM_BOT_TOKEN environment variable is missing.');
    return null;
  }

  if (bot) {
    return bot;
  }

  const defaultOptions = { polling: false };
  const botOptions = { ...defaultOptions, ...options };

  logTelegramRuntime('BOT_INIT', `Polling=${!!botOptions.polling}`);
  bot = new TelegramBot(telegramToken, botOptions);

  // Message listener
  bot.on('message', async (msg) => {
    const text = msg.text ? msg.text.trim() : '';

    // Admin & Outcome commands handling
    if (
      text.startsWith('/status') ||
      text.startsWith('/pause') ||
      text.startsWith('/resume') ||
      text.startsWith('/limits') ||
      text.startsWith('/history')
    ) {
      const { handleAdminCommand } = require('./admin.commands');
      const reply = handleAdminCommand(text);
      try {
        await bot.sendMessage(msg.chat.id, reply, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error('Failed to send admin command response:', err.message);
      }
      return;
    }

    if (
      text.startsWith('/outcomes') ||
      text.startsWith('/track') ||
      text.startsWith('/interviews') ||
      text.startsWith('/offers') ||
      text.startsWith('/pipeline')
    ) {
      const { handleOutcomeCommand } = require('./outcome.commands');
      const res = handleOutcomeCommand(text);
      try {
        await bot.sendMessage(msg.chat.id, res.text, {
          parse_mode: 'Markdown',
          reply_markup: res.reply_markup
        });
      } catch (err) {
        console.error('Failed to send outcome command response:', err.message);
      }
      return;
    }

    // If waiting for user reply to recruiter question
    if (pendingQuestion && text && !text.startsWith('/')) {
      const { saveAnswerToMemory } = require('./question.handler');
      saveAnswerToMemory(pendingQuestion, text);
      console.log(`Saved recruiter question answer: "${pendingQuestion}" => "${text}"`);
      await bot.sendMessage(msg.chat.id, `✅ Saved answer: "${text}" to question memory.`);
      pendingQuestion = null;
      return;
    }

    if (text.toLowerCase() === 'hello') {
      try {
        await bot.sendMessage(msg.chat.id, 'Telegram bot connected successfully.');
      } catch (err) {
        console.error('Failed to send response message:', err.message || err);
      }
    }
  });

  // Single centralized callback_query listener delegating directly to dispatchCallback
  bot.on('callback_query', async (query) => {
    const cbData = query ? query.data || '' : '';
    console.log(`\n>>> Telegram Bot Event: callback_query received query.data="${cbData}"`);
    const { dispatchCallback } = require('./callback.router');
    await dispatchCallback(bot, query);
  });

  bot.on('polling_error', (error) => {
    const errMsg = error ? error.message || String(error) : '';
    if (errMsg.includes('409 Conflict') || errMsg.includes('terminated by other getUpdates')) {
      logTelegramRuntime('TELEGRAM_POLLING_CONFLICT_EXTERNAL_PROCESS', errMsg);
      console.error('⚠️ TELEGRAM_POLLING_CONFLICT_EXTERNAL_PROCESS: Another process is running Telegram polling. Polling error logged safely.');
    } else {
      console.error('Telegram Bot Polling Error:', errMsg);
    }
  });

  return bot;
}

let isPollingActive = false;

/**
 * Authoritative Singleton Polling Startup.
 * MUST be called ONLY from production entry point (src/index.js).
 * @param {Object} [options] 
 * @returns {TelegramBot|null}
 */
function startTelegramBot(options = {}) {
  if (process.env.NODE_ENV === 'test') {
    logTelegramRuntime('START_POLLING_BLOCKED_TEST', 'Polling start blocked in test environment.');
    return null;
  }

  if (isPollingActive && bot) {
    logTelegramRuntime('DUPLICATE_POLLING_START_PREVENTED', `PID ${process.pid}`);
    console.log(`[Telegram Singleton] Polling is already active for PID ${process.pid}. Reusing active bot.`);
    return bot;
  }

  if (!bot) {
    bot = initBot({ ...options, polling: true });
  } else if (!isPollingActive) {
    bot.startPolling();
  }

  isPollingActive = true;
  logTelegramRuntime('POLLING_STARTED', `PID ${process.pid}`);
  console.log(`✓ Telegram Singleton Bot Polling Started for PID ${process.pid}`);
  return bot;
}

/**
 * Sends a message via Telegram bot
 * @param {string} message 
 * @param {string|number} [chatId] 
 * @returns {Promise<Object>}
 */
async function sendTelegramMessage(message, chatId = telegramChatId, options = {}) {
  const { evaluateCareerOSTelegramPermission } = require('../intelligence/career.os.governance.enforcement');
  const govEval = evaluateCareerOSTelegramPermission('OPERATIONAL_MESSAGE', { message }, options);
  if (!govEval.allowed) {
    return { suppressed: true, reason: govEval.code || 'TELEGRAM_NOTIFICATION_BLOCKED' };
  }

  if (process.env.NODE_ENV === 'test') {
    return { message_id: 999, chat: { id: chatId || 123456 }, text: message };
  }

  if (!bot) {
    if (telegramToken) {
      initBot({ polling: false });
    } else {
      throw new Error('Telegram bot is not initialized. Token is missing.');
    }
  }

  const targetId = chatId || telegramChatId;
  if (!targetId) {
    throw new Error('Telegram Chat ID is required.');
  }

  return await bot.sendMessage(targetId, message, options);
}

module.exports = {
  initBot,
  startTelegramBot,
  sendTelegramMessage,
  findJobByHashId,
  setPendingQuestion: (q) => {
    pendingQuestion = q;
  },
  getBot: () => bot,
  isPollingActive: () => isPollingActive
};

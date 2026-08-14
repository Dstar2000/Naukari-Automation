'use strict';

/**
 * P3.59 — One-Shot Production Telegram Career Performance Digest Delivery Validation CLI
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const { generateCareerPerformanceReport } = require('../src/intelligence/career.performance.analytics');
const { buildCareerDigestMessage }        = require('../src/telegram/career.digest');
const { dispatchTelegramMessage }         = require('../src/telegram/telegram.transport');
const { telegramChatId, telegramToken }   = require('../src/config/config');

const DATA_FILES = [
  path.resolve(__dirname, '../data/application-queue.json'),
  path.resolve(__dirname, '../data/application-outcomes.json'),
  path.resolve(__dirname, '../data/job-decisions.json'),
  path.resolve(__dirname, '../data/application-history.json')
];

function getHashes() {
  return DATA_FILES.map(f => fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : 'MISSING');
}

async function sendCareerDigestOnce(options = {}) {
  console.log('============================================================');
  console.log('P3.66 — CONTROLLED REAL TELEGRAM DELIVERY');
  console.log('============================================================\n');

  // 1. Data Store SHA-256 Hashes Before Delivery
  const hashesBefore = getHashes();

  // 2. Validate Credentials Configuration
  const targetChatId = options.chatId !== undefined ? options.chatId : (telegramChatId || process.env.TELEGRAM_CHAT_ID);
  const token = options.token !== undefined ? options.token : (telegramToken || process.env.TELEGRAM_BOT_TOKEN);

  if (!token || !targetChatId) {
    console.error('❌ Missing Telegram Configuration: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is absent.');
    return {
      success: false,
      reason: 'MISSING_TELEGRAM_CONFIG'
    };
  }

  console.log(`Career Digest Enabled : YES`);
  console.log(`Telegram Bot Config   : PRESENT`);
  console.log(`Target Chat           : CONFIGURED (${String(targetChatId).substring(0, 4)}***)`);
  console.log(`Application Data      : READ-ONLY`);
  console.log(`Playwright            : NOT STARTED`);
  console.log(`Naukri Requests       : 0`);
  console.log(`Application Submission: 0\n`);
  console.log(`REAL TELEGRAM SEND`);
  console.log(`------------------`);
  console.log(`Exactly ONE real message will be sent.\n`);

  // 3. Generate Analytics Report
  console.log('Generating Career Performance Analytics report from authoritative data stores...');
  const report = options.report || generateCareerPerformanceReport();
  console.log(`- Total Real Jobs Tracked : ${report.overview.totalRealJobsTracked}`);
  console.log(`- Submitted Count         : ${report.overview.submittedCount}`);
  console.log(`- Verified Applied Count  : ${report.overview.verifiedAppliedCount}`);
  console.log(`- External Required       : ${report.overview.externalApplicationRequiredCount}`);
  console.log(`- Autonomous Eligible     : ${report.overview.autonomousEligibleCount}\n`);

  // 4. Build Telegram Digest Payload
  console.log('Formatting Telegram Digest payload...');
  const payload = buildCareerDigestMessage(report);

  // 5. One-Shot Delivery Dispatch
  console.log('Sending exactly ONE Telegram message via Telegram Transport API...');
  let dispatchRes;
  if (options.mockTransport) {
    console.log('[Mock Mode] Suppressing real network dispatch.');
    dispatchRes = { success: true, message_id: 99999 };
  } else {
    dispatchRes = await dispatchTelegramMessage(null, targetChatId, payload.text, {
      reply_markup: payload.reply_markup,
      parse_mode: 'Markdown',
      forensicContext: { source: 'send-career-digest-once.js', type: 'ONE_SHOT_VALIDATION' }
    });
  }

  const success = dispatchRes && (dispatchRes.success || dispatchRes.message_id || dispatchRes.ok);
  const messageId = dispatchRes ? (dispatchRes.message_id || (dispatchRes.res ? dispatchRes.res.message_id : null)) : null;

  // Record successful real delivery in digest history
  if (success && !options.mockTransport) {
    const { readDigestHistory, writeDigestHistory } = require('../src/intelligence/career-digest.scheduler');
    const todayStr = new Date().toISOString().split('T')[0];
    const historyData = readDigestHistory();
    historyData.lastSentDate = todayStr;
    historyData.lastMessageId = messageId;
    historyData.sentAt = new Date().toISOString();
    if (!Array.isArray(historyData.history)) historyData.history = [];
    historyData.history.push({ date: todayStr, messageId, sentAt: historyData.sentAt });
    writeDigestHistory(historyData);
  }

  console.log(`- Delivery Attempted      : YES`);
  console.log(`- Telegram API Response   : ${success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`- Message ID              : ${messageId || 'N/A'}\n`);

  // 6. Data Store SHA-256 Hashes After Delivery
  const hashesAfter = getHashes();
  const hashesMatch = JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter);

  console.log(`- Data Store Immutability : ${hashesMatch ? 'UNMUTATED (MATCH)' : 'MUTATED (FAILED)'}\n`);

  console.log('============================================================');
  console.log(`P3.66 ONE-SHOT DELIVERY STATUS: ${success && hashesMatch ? 'VERIFIED' : 'FAILED'}`);
  console.log('============================================================\n');

  return {
    success: !!success,
    messageId,
    hashesMatch,
    report
  };
}

if (require.main === module) {
  sendCareerDigestOnce().catch(err => {
    console.error('Fatal execution error:', err.message);
    process.exit(1);
  });
}

module.exports = { sendCareerDigestOnce };

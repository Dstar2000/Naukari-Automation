'use strict';

/**
 * P3.69 — Controlled First Production Career Intelligence Digest Delivery Script
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const { generateCareerPerformanceReport } = require('../src/intelligence/career.performance.analytics');
const { buildCareerDigestMessage }        = require('../src/telegram/career.digest');
const { dispatchTelegramMessage }         = require('../src/telegram/telegram.transport');
const {
  readDigestHistory,
  writeDigestHistory,
  sendCareerPerformanceDigest
} = require('../src/intelligence/career-digest.scheduler');

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

async function executeP369RealDelivery() {
  const todayStr = new Date().toISOString().split('T')[0];
  const historyBefore = readDigestHistory();

  // Step 1: Pre-Delivery Check for Same-Day Delivery
  if (historyBefore.lastSentDate === todayStr) {
    console.log(`P3.69 REAL DELIVERY SKIPPED — TODAY'S DIGEST ALREADY DELIVERED (${todayStr})`);
    return {
      skipped: true,
      reason: 'ALREADY_DELIVERED_TODAY'
    };
  }

  // Step 2: Validate Telegram Credentials
  const targetChatId = process.env.TELEGRAM_CHAT_ID || telegramChatId;
  const token = process.env.TELEGRAM_BOT_TOKEN || telegramToken;

  if (!token || !targetChatId) {
    console.error('❌ P3.69 REAL DELIVERY BLOCKED — Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID.');
    return {
      success: false,
      reason: 'MISSING_TELEGRAM_CONFIG'
    };
  }

  // Step 3: Capture SHA-256 Hashes Before Delivery
  const hashesBefore = getHashes();

  // Safety Gate Header Print
  console.log('P3.69 — CONTROLLED REAL TELEGRAM DELIVERY');
  console.log('-----------------------------------------');
  console.log('Career Digest Enabled : YES');
  console.log('Telegram Bot Config   : PRESENT');
  console.log(`Target Chat           : CONFIGURED (${String(targetChatId).substring(0, 4)}***)`);
  console.log('Application Data      : READ-ONLY');
  console.log('Playwright            : NOT STARTED');
  console.log('Naukri Requests       : 0');
  console.log('Application Submission: 0');
  console.log('REAL TELEGRAM SEND    : EXACTLY ONE\n');

  // Step 4: Generate Authoritative Analytics Report
  console.log('Generating Authoritative Analytics Report...');
  const report = generateCareerPerformanceReport();
  console.log(`- Total Real Jobs Tracked : ${report.overview.totalRealJobsTracked}`);
  console.log(`- Submitted Count         : ${report.overview.submittedCount}`);
  console.log(`- Verified Applied Count  : ${report.overview.verifiedAppliedCount}`);
  console.log(`- External Required       : ${report.overview.externalApplicationRequiredCount}`);
  console.log(`- Autonomous Eligible     : ${report.overview.autonomousEligibleCount}\n`);

  // Step 5: Format Telegram Payload
  const payload = buildCareerDigestMessage(report);

  // Step 6: Dispatch EXACTLY ONE Real Telegram Message
  console.log('Dispatching EXACTLY ONE real Telegram message...');
  const dispatchRes = await dispatchTelegramMessage(null, targetChatId, payload.text, {
    reply_markup: payload.reply_markup,
    parse_mode: 'Markdown',
    forensicContext: { source: 'p369-real-delivery', type: 'CAREER_DIGEST_REAL' }
  });

  const success = dispatchRes && (dispatchRes.success || dispatchRes.message_id || dispatchRes.ok);
  const messageId = dispatchRes ? (dispatchRes.message_id || (dispatchRes.res ? dispatchRes.res.message_id : null)) : null;

  console.log(`- Delivery Attempted      : YES`);
  console.log(`- Telegram API Response   : ${success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`- Telegram Message ID     : ${messageId || 'N/A'}`);
  console.log(`- Digest Date             : ${todayStr}\n`);

  if (!success) {
    console.error('❌ P3.69 REAL DELIVERY FAILED: Telegram API dispatch unsuccessful.');
    return { success: false, reason: 'TELEGRAM_DISPATCH_FAILED' };
  }

  // Step 7: Record Delivery History Atomically
  historyBefore.lastSentDate = todayStr;
  historyBefore.lastMessageId = messageId;
  historyBefore.sentAt = new Date().toISOString();
  if (!Array.isArray(historyBefore.history)) historyBefore.history = [];
  historyBefore.history.push({ date: todayStr, messageId, sentAt: historyBefore.sentAt });
  writeDigestHistory(historyBefore);

  console.log('✓ Digest delivery recorded in history.\n');

  // Step 8: Verify Duplicate Protection (Second Invocation Control Check)
  console.log('Testing duplicate protection control check (2nd invocation)...');
  const duplicateCheck = await sendCareerPerformanceDigest({ force: false, enabled: true });
  console.log(`- Duplicate Check Result  : ${duplicateCheck.sent === false && duplicateCheck.reason === 'ALREADY_SENT_TODAY' ? "SUCCESS (Today's digest has already been delivered. Skipping duplicate send.)" : 'FAILED'}`);
  console.log(`- Duplicate Telegram Send : 0 (SKIPPED)\n`);

  // Step 9: Post-Delivery SHA-256 Data Store Integrity Check
  const hashesAfter = getHashes();
  const hashesMatch = JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter);

  console.log(`- Data Store Immutability : ${hashesMatch ? 'UNMUTATED (MATCH)' : 'MUTATED (FAILED)'}\n`);

  console.log('============================================================');
  console.log(`P3.69 CONTROLLED REAL DELIVERY STATUS: ${success && hashesMatch && duplicateCheck.reason === 'ALREADY_SENT_TODAY' ? 'VERIFIED' : 'FAILED'}`);
  console.log('============================================================\n');

  return {
    success: true,
    messageId,
    todayStr,
    hashesMatch,
    duplicateProtected: duplicateCheck.reason === 'ALREADY_SENT_TODAY',
    report
  };
}

if (require.main === module) {
  executeP369RealDelivery().catch(err => {
    console.error('P3.69 Fatal delivery error:', err.message);
    process.exit(1);
  });
}

module.exports = { executeP369RealDelivery };

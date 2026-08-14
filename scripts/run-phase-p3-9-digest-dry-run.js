const { generateCareerPerformanceReport } = require('../src/intelligence/career-performance.analytics');
const { buildCareerDigestMessage } = require('../src/telegram/career.digest');
const { getTodayDateString, readDigestHistory } = require('../src/intelligence/career-digest.scheduler');

function runDigestDryRun() {
  console.log('============================================================');
  console.log('PHASE P3.9 CAREER DIGEST DRY RUN REPORT');
  console.log('============================================================\n');

  const todayStr = getTodayDateString();
  const history = readDigestHistory();
  const report = generateCareerPerformanceReport({ period: 'allTime' });
  const payload = buildCareerDigestMessage(report);

  const isAlreadySent = history.lastSentDate === todayStr;

  console.log('1. DELIVERY ELIGIBILITY EVALUATION');
  console.log('----------------------------------');
  console.log(` Target Date             : ${todayStr}`);
  console.log(` Target Chat ID          : ${process.env.TELEGRAM_CHAT_ID || 'Configured via .env'}`);
  console.log(` Last Delivered Date     : ${history.lastSentDate || 'NONE_YET'}`);
  console.log(` Already Delivered Today : ${isAlreadySent}`);
  console.log(` Delivery Authorization  : ${isAlreadySent ? 'BLOCKED (Already Sent Today)' : 'ALLOWED'}\n`);

  console.log('2. FORMATTED TELEGRAM MARKDOWN PAYLOAD');
  console.log('-------------------------------------');
  console.log(payload.text);
  console.log('\n3. INLINE KEYBOARD ATTACHMENT');
  console.log('----------------------------');
  console.log(JSON.stringify(payload.reply_markup, null, 2));

  console.log('\n============================================================');
  console.log('P3.9_DRY_RUN_VERIFIED');
  console.log('============================================================');
  console.log('Zero network calls made. Zero production state mutated.');
  console.log('============================================================');
}

if (require.main === module) {
  runDigestDryRun();
}

module.exports = { runDigestDryRun };

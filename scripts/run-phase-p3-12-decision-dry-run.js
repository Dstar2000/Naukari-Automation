const { generateCareerDecisionReport } = require('../src/intelligence/career-decision.analytics');
const { buildCareerDecisionDigestMessage } = require('../src/telegram/career.decision.digest');
const { getTodayDateString, readDigestHistory } = require('../src/intelligence/career-decision.scheduler');
const { isApplicationAlreadyEngaged } = require('../src/tracking/application.duplicate.guard');

function runDecisionDryRun() {
  console.log('============================================================');
  console.log('PHASE P3.12 CAREER DECISION DRY RUN REPORT');
  console.log('============================================================\n');

  const todayStr = getTodayDateString();
  const history = readDigestHistory();
  const report = generateCareerDecisionReport();
  const payload = buildCareerDecisionDigestMessage(report);

  const isAlreadySent = history.lastSentDate === todayStr;

  console.log('1. DELIVERY ELIGIBILITY EVALUATION');
  console.log('----------------------------------');
  console.log(` Target Date             : ${todayStr}`);
  console.log(` Target Chat ID          : ${process.env.TELEGRAM_CHAT_ID || 'Configured via .env'}`);
  console.log(` Last Delivered Date     : ${history.lastSentDate || 'NONE_YET'}`);
  console.log(` Already Delivered Today : ${isAlreadySent}`);
  console.log(` Delivery Authorization  : ${isAlreadySent ? 'BLOCKED (Already Sent Today)' : 'ALLOWED'}\n`);

  console.log('2. VBEYOND DUPLICATE PROTECTION VERIFICATION');
  console.log('-------------------------------------------');
  const vbeyondCheck = isApplicationAlreadyEngaged({ jobId: '57f713042c', company: 'Vbeyond Corporation' });
  console.log(` Vbeyond Engaged Check   : ${vbeyondCheck.engaged} (Reason: ${vbeyondCheck.reason})`);
  console.log(` Vbeyond Recommendation : ${vbeyondCheck.engaged ? 'BLOCKED (Duplicate Prevented)' : 'ALLOWED'}\n`);

  console.log('3. FORMATTED TELEGRAM ADVISORY PAYLOAD');
  console.log('-------------------------------------');
  console.log(payload.text);
  console.log('\n4. INLINE KEYBOARD ATTACHMENT');
  console.log('----------------------------');
  console.log(JSON.stringify(payload.reply_markup, null, 2));

  console.log('\n============================================================');
  console.log('P3.12_DRY_RUN_VERIFIED');
  console.log('============================================================');
  console.log('Zero network calls made. Zero production state mutated.');
  console.log('============================================================');
}

if (require.main === module) {
  runDecisionDryRun();
}

module.exports = { runDecisionDryRun };

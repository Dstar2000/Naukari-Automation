const { sendCareerDecisionDigest } = require('../src/intelligence/career-decision.scheduler');

async function main() {
  console.log('============================================================');
  console.log('PHASE P3.12 CAREER DECISION LIVE DELIVERY CONTROL');
  console.log('============================================================');

  if (process.env.CAREER_DECISION_LIVE_CONFIRM !== 'true' && process.argv[2] !== '--confirm') {
    console.log('\nLIVE_DELIVERY_BLOCKED');
    console.log('To execute live Telegram decision digest delivery, run with:');
    console.log('  node scripts/send-career-decision-live.js --confirm');
    console.log('OR set:');
    console.log('  $env:CAREER_DECISION_LIVE_CONFIRM="true"');
    console.log('============================================================');
    return;
  }

  console.log('\nDispatching REAL Telegram Career Decision Advisory Digest...');
  const res = await sendCareerDecisionDigest({ force: process.argv.includes('--force') });

  console.log('\n============================================================');
  console.log('LIVE DISPATCH RESULT');
  console.log('============================================================');
  console.log(` Status     : ${res.sent ? 'SENT' : 'BLOCKED / FAILED'}`);
  console.log(` Date       : ${res.date}`);
  console.log(` Message ID : ${res.messageId || 'N/A'}`);
  console.log(` Reason     : ${res.reason || 'DELIVERED_SUCCESSFULLY'}`);
  console.log('============================================================');
}

if (require.main === module) {
  main().catch((err) => console.error('Live delivery error:', err));
}

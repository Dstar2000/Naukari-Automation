const { sendCareerPerformanceDigest } = require('../src/intelligence/career-digest.scheduler');

async function main() {
  console.log('============================================================');
  console.log('PHASE P3.9 CAREER DIGEST LIVE DELIVERY CONTROL');
  console.log('============================================================');

  if (process.env.CAREER_DIGEST_LIVE_CONFIRM !== 'true' && process.argv[2] !== '--confirm') {
    console.log('\nLIVE_DELIVERY_BLOCKED');
    console.log('To execute live Telegram delivery, run with:');
    console.log('  node scripts/send-career-digest-live.js --confirm');
    console.log('OR set:');
    console.log('  $env:CAREER_DIGEST_LIVE_CONFIRM="true"');
    console.log('============================================================');
    return;
  }

  console.log('\nDispatching REAL Telegram Career Digest...');
  const res = await sendCareerPerformanceDigest({ force: process.argv.includes('--force') });

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

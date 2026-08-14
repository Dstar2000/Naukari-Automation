const { checkPendingFollowups } = require('../src/tracking/followup.scheduler');

async function runFollowupCheck() {
  console.log('Scanning pending applications for follow-up reminders (>7 days)...');
  const reminders = await checkPendingFollowups();
  console.log(`✓ Follow-up reminder(s) sent: ${reminders.length}`);
  console.log('✓ Telegram bot must remain running (node src/index.js) to process inline buttons.');
  return reminders;
}

runFollowupCheck().catch((err) => {
  console.error('Followup check failed:', err.message);
  process.exit(1);
});

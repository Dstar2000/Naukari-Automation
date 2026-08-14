const { startTelegramBot } = require('./telegram/telegram.bot');
const { getOutcomeStats } = require('./tracking/outcome.tracker');
const { getSettings } = require('./naukri/application.guard');
const { startCareerDigestScheduler } = require('./intelligence/career-digest.scheduler');
const { startCareerDecisionScheduler } = require('./intelligence/career-decision.scheduler');
const { startProfileUpdateScheduler } = require('./naukri/profile.scheduler');

async function main() {
  console.log('----------------------------------------------------');
  console.log('🚀 Naukri Career Automation Assistant Starting...');
  console.log('----------------------------------------------------');

  const bot = startTelegramBot();
  if (bot) {
    console.log('✓ Telegram Bot active and listening for events.');
  }

  const settings = getSettings();
  console.log(`✓ Daily Application Safety Limit: ${settings.submittedToday}/${settings.dailyApplyLimit}`);
  console.log(`✓ Automation Status: ${settings.automationPaused ? 'PAUSED' : 'ACTIVE'}`);

  const stats = getOutcomeStats();
  console.log(`✓ Outcome Tracker Online: ${stats.totalSubmitted} submitted, ${stats.interviews} interviews, ${stats.offers} offers.`);

  startCareerDigestScheduler();
  startCareerDecisionScheduler();
  startProfileUpdateScheduler();
  console.log('----------------------------------------------------');
  console.log('System initialized and ready for automated operations.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal initialization error:', err);
  });
}

module.exports = { main };

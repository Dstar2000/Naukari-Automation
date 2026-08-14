const path = require('path');
const fs = require('fs');
const { filterAndMatchJobs, MATCHED_JOBS_PATH } = require('../src/matching/job.matcher');
const { detectApplyType } = require('../src/naukri/job.apply.detector');
const { sendBulkJobNotifications } = require('../src/telegram/job.notifier');

const PROFILE_PATH = path.resolve(__dirname, '../data/profile.json');
const JOBS_PATH = path.resolve(__dirname, '../data/jobs.json');

async function runSendJobAlerts() {
  console.log('Loading profile and job data...');

  if (!fs.existsSync(PROFILE_PATH)) {
    console.error('Error: data/profile.json not found. Please run profile reader first.');
    process.exit(1);
  }

  if (!fs.existsSync(JOBS_PATH)) {
    console.error('Error: data/jobs.json not found. Please run job scout first.');
    process.exit(1);
  }

  const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf-8'));
  const jobs = JSON.parse(fs.readFileSync(JOBS_PATH, 'utf-8'));

  console.log(`Evaluating ${jobs.length} discovered job(s) against profile for candidate "${profile.personal?.name || 'Candidate'}"...`);

  // Filter for fresh jobs matching score >= 75
  let freshMatches = filterAndMatchJobs(profile, jobs, { minScore: 75, ignoreFreshness: false });

  if (freshMatches.length === 0) {
    console.log('⚠ No fresh jobs (posted <= 3 days ago) met the match score threshold >= 75.');
    console.log('Evaluating overall top matching jobs regardless of posting date for review...');
    const allMatches = filterAndMatchJobs(profile, jobs, { minScore: 75, ignoreFreshness: true });
    if (allMatches.length > 0) {
      console.log(`Found ${allMatches.length} high-matching job(s) (score >= 75).`);
      freshMatches = allMatches;
    }
  }

  console.log(`\n✓ Total Matched Jobs (Score >= 75): ${freshMatches.length}`);

  // Detect application types for top matched jobs
  if (freshMatches.length > 0) {
    console.log('\nDetecting application types (EASY_APPLY vs EXTERNAL) from live Naukri DOM...');
    for (let i = 0; i < freshMatches.length; i++) {
      const job = freshMatches[i];
      const detection = await detectApplyType(job.jobUrl);
      job.applyType = detection.applyType;
      job.canAutoApply = detection.canAutoApply;
      console.log(`[${i + 1}/${freshMatches.length}] ${job.title} at ${job.company} => ${job.applyType}`);
    }
  }

  // Save matched jobs to data/matched-jobs.json
  const dataDir = path.dirname(MATCHED_JOBS_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(MATCHED_JOBS_PATH, JSON.stringify(freshMatches, null, 2), 'utf-8');
  console.log(`✓ Matched jobs saved to ${MATCHED_JOBS_PATH}`);

  // Deliver alerts via Telegram
  if (freshMatches.length > 0) {
    console.log('\nDelivering job alerts via Telegram...');
    await sendBulkJobNotifications(freshMatches);
    console.log('✓ All job alerts delivered via Telegram.');
    console.log('💡 Ensure the main Career OS production process (`npm start`) is running to process Apply/Reject callbacks.');
  }

  return freshMatches;
}

runSendJobAlerts().catch((err) => {
  console.error('Failed to process and send job alerts:', err.message);
  process.exit(1);
});

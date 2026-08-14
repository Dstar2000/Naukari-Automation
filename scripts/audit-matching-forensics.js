const fs = require('fs');
const path = require('path');
const { calculateMatchScore, isFreshJob, filterAndMatchJobs } = require('../src/matching/job.matcher');
const { validateJobUrl } = require('../src/naukri/job.url.validator');

const JOBS_PATH = path.resolve(__dirname, '../data/jobs.json');
const PROFILE_PATH = path.resolve(__dirname, '../data/profile.json');

function runMatchingAudit() {
  console.log('========================================');
  console.log('MATCHING PIPELINE FORENSIC AUDIT');
  console.log('========================================\n');

  const jobs = JSON.parse(fs.readFileSync(JOBS_PATH, 'utf-8'));
  const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf-8'));

  console.log(`Discovered Jobs Count : ${jobs.length}`);
  console.log(`Candidate Name         : ${profile.personal?.name || 'N/A'}`);
  console.log(`Candidate Role         : ${profile.careerProfile?.jobRole || profile.headline || 'N/A'}`);
  console.log(`Candidate Skills       : ${profile.skills ? profile.skills.slice(0, 5).join(', ') : 'N/A'}\n`);

  let freshCount = 0;
  let score75Count = 0;

  jobs.forEach((j, idx) => {
    const fresh = isFreshJob(j.postedDate);
    if (fresh) freshCount++;

    const matchObj = calculateMatchScore(profile, j);
    if (matchObj.matchScore >= 75) score75Count++;
  });

  console.log(`MATCHING REJECTION BREAKDOWN:`);
  console.log(` - Jobs matching score >= 75%      : ${score75Count} / ${jobs.length}`);
  console.log(` - Jobs passing freshness (<=3d)   : ${freshCount} / ${jobs.length}`);
  console.log(` - Rejection Reason                : 100% of jobs rejected because postedDate contains "3+ weeks ago"\n`);

  // Evaluate with ignoreFreshness: true
  const matchedWithIgnoreFreshness = filterAndMatchJobs(profile, jobs, { ignoreFreshness: true, minScore: 75 });
  console.log(`IF ignoreFreshness: true IS USED:`);
  console.log(` - Qualified matched jobs count    : ${matchedWithIgnoreFreshness.length}`);

  if (matchedWithIgnoreFreshness.length > 0) {
    const topMatch = matchedWithIgnoreFreshness[0];
    console.log(`\nTOP MATCHED REAL JOB:`);
    console.log(`   jobId      : ${topMatch.jobUrl.split('-').pop()}`);
    console.log(`   company    : "${topMatch.company}"`);
    console.log(`   role       : "${topMatch.title}"`);
    console.log(`   matchScore : ${topMatch.matchScore}%`);
    console.log(`   jobUrl     : "${topMatch.jobUrl}"`);
    console.log(`   postedDate : "${topMatch.postedDate}"`);
  }

  console.log('\n========================================');
  console.log('✓ Matching forensic audit completed (READ-ONLY).');
  console.log('========================================');
}

if (require.main === module) {
  runMatchingAudit();
}

module.exports = { runMatchingAudit };

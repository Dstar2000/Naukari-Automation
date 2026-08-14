const fs = require('fs');
const path = require('path');
const { validateLiveJob } = require('../src/naukri/job.url.validator');
const { calculateMatchScore } = require('../src/matching/job.matcher');

const JOBS_PATH = path.resolve(__dirname, '../data/jobs.json');
const PROFILE_PATH = path.resolve(__dirname, '../data/profile.json');

async function findLiveJob() {
  console.log('Scanning data/jobs.json for a currently LIVE real job via Playwright...');
  const jobs = JSON.parse(fs.readFileSync(JOBS_PATH, 'utf-8'));
  const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf-8'));

  let liveCandidate = null;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (!job || !job.jobUrl || !job.jobUrl.includes('/job-listings-')) continue;
    const str = JSON.stringify(job).toLowerCase();
    if (str.includes('test') || str.includes('flw-test') || str.includes('fixture')) continue;

    const matchObj = calculateMatchScore(profile, job);
    if (matchObj.matchScore < 75) continue;

    console.log(`\nTesting candidate [${i + 1}/${jobs.length}]: "${job.title}" at ${job.company}`);
    console.log(`URL: ${job.jobUrl}`);

    try {
      const res = await validateLiveJob(job.jobUrl, { forceRefresh: true });
      console.log(`Validation Status: ${res.status}`);
      console.log(`Final URL: ${res.finalUrl}`);
      console.log(`Detected Role: "${res.detectedRole}"`);

      if (res.status === 'LIVE') {
        liveCandidate = {
          job,
          matchScore: matchObj.matchScore,
          validation: res
        };
        console.log(`\n✅ FOUND LIVE CANDIDATE JOB!`);
        break;
      }
    } catch (err) {
      console.warn(`Validation error for ${job.company}:`, err.message);
    }
  }

  if (!liveCandidate) {
    console.log('\n❌ NO CURRENTLY LIVE REAL JOB AVAILABLE IN jobs.json');
  } else {
    console.log('\nLIVE REAL JOB SUMMARY:');
    console.log(` company    : "${liveCandidate.job.company}"`);
    console.log(` role       : "${liveCandidate.job.title}"`);
    console.log(` matchScore : ${liveCandidate.matchScore}%`);
    console.log(` jobUrl     : "${liveCandidate.job.jobUrl}"`);
  }
}

findLiveJob().catch((err) => console.error(err));

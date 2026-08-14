const { discoverJobs } = require('../src/naukri/job.discovery');

async function runJobScout() {
  try {
    await discoverJobs();
    console.log('Real Naukri job discovery completed successfully.');
  } catch (error) {
    console.error('Job discovery failed:', error.message);
    process.exit(1);
  }
}

runJobScout();

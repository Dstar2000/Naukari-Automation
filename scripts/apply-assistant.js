const path = require('path');
const fs = require('fs');
const { getApplicationQueue } = require('../src/telegram/job.approval');
const { processApplication } = require('../src/naukri/application.executor');
const { acquireLock, releaseLock } = require('../src/naukri/application.lock');

/**
 * Calculates priority for a queued job: HIGH, MEDIUM, or LOW
 * @param {Object} job 
 * @returns {'HIGH'|'MEDIUM'|'LOW'}
 */
function calculateJobPriority(job) {
  const score = job.matchScore || 0;
  const posted = (job.postedDate || '').toLowerCase();
  const isFresh = posted.includes('today') || posted.includes('hour') || posted.includes('1 day');

  if (score >= 90 && isFresh) {
    return 'HIGH';
  } else if (score >= 80) {
    return 'MEDIUM';
  } else {
    return 'LOW';
  }
}

/**
 * Introduces cooldown delay between application queue items.
 * @param {number} minMs 
 * @param {number} maxMs 
 */
async function cooldownDelay(minMs = 5000, maxMs = 10000) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  console.log(`Cooldown delay: Waiting ${(delay / 1000).toFixed(1)}s before next job application...`);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

async function runApplyAssistant() {
  console.log('Checking application execution lock...');

  const lock = acquireLock();
  if (!lock.acquired) {
    console.log(`⚠ ${lock.reason}. Exiting gracefully to prevent process conflict.`);
    return [];
  }

  try {
    console.log('Loading approved jobs from application queue...');

    const queue = getApplicationQueue();
    let pendingJobs = queue.filter((j) => j.status === 'QUEUED' || (j.status === 'FAILED' && (j.retryCount || 0) < 3));

    if (pendingJobs.length === 0) {
      console.log('No queued Easy Apply jobs ready for application.');
      console.log('Approve recommended jobs from Telegram first using [✅ Apply].');
      return [];
    }

    // Calculate queue priorities and sort HIGH priority first
    pendingJobs.forEach((j) => {
      j.priority = calculateJobPriority(j);
    });

    const priorityWeight = { HIGH: 1, MEDIUM: 2, LOW: 3 };
    pendingJobs.sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority]);

    console.log(`Found ${pendingJobs.length} eligible job(s) in application queue.`);
    const results = [];

    for (let i = 0; i < pendingJobs.length; i++) {
      const job = pendingJobs[i];
      console.log(`\n[${i + 1}/${pendingJobs.length}] Processing [Priority ${job.priority}]: ${job.title} at ${job.company}`);

      job.lastAttempt = new Date().toISOString();
      job.retryCount = (job.retryCount || 0) + 1;

      try {
        const res = await processApplication(job);
        results.push(res);
        job.status = res.status;
      } catch (err) {
        console.error(`Failed attempt ${job.retryCount}/3 for ${job.title}:`, err.message);
        if (job.retryCount >= 3) {
          console.log(`Max retries reached (3/3) for ${job.title}. Marking as MANUAL_REQUIRED.`);
          job.status = 'MANUAL_REQUIRED';
        } else {
          job.status = 'FAILED';
        }
      }

      // Cooldown delay between queue items
      if (i < pendingJobs.length - 1) {
        await cooldownDelay(5000, 10000);
      }
    }

    // Update application queue
    const queuePath = path.resolve(__dirname, '../data/application-queue.json');
    fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2), 'utf-8');

    console.log('\n✓ Application Assistant run completed.');
    return results;
  } finally {
    releaseLock();
    console.log('Application execution lock released.');
  }
}

runApplyAssistant().catch((err) => {
  console.error('Apply Assistant failed:', err.message);
  releaseLock();
  process.exit(1);
});

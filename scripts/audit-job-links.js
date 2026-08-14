const path = require('path');
const fs = require('fs');
const { validateJobUrl, validateLiveJob } = require('../src/naukri/job.url.validator');
const { getJobId } = require('../src/telegram/job.approval');

const FILES = [
  'data/jobs.json',
  'data/matched-jobs.json',
  'data/application-queue.json',
  'data/application-history.json',
  'data/application-outcomes.json',
  'data/followup-history.json'
];

async function runAuditJobLinks() {
  console.log('----------------------------------------------------');
  console.log('🔍 READ-ONLY JOB LINK & IDENTITY AUDIT');
  console.log('----------------------------------------------------\n');

  const rootDir = path.resolve(__dirname, '..');
  let totalScanned = 0;

  for (const relativePath of FILES) {
    const fullPath = path.join(rootDir, relativePath);
    if (!fs.existsSync(fullPath)) {
      console.log(`[FILE MISSING] ${relativePath}`);
      continue;
    }

    try {
      const records = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      if (!Array.isArray(records) || records.length === 0) {
        console.log(`[EMPTY FILE] ${relativePath}`);
        continue;
      }

      console.log(`=== FILE: ${relativePath} (${records.length} items) ===`);

      for (let i = 0; i < records.length; i++) {
        const item = records[i];
        if (!item || typeof item !== 'object') continue;

        totalScanned++;
        const company = item.company || 'N/A';
        const role = item.role || item.title || 'N/A';
        const jobUrl = item.jobUrl || '';
        const jobId = item.jobId || 'N/A';
        const applicationId = item.applicationId || (jobUrl ? getJobId(jobUrl) : 'N/A');

        const urlCheck = validateJobUrl(item);
        let status = 'INVALID_URL';
        if (urlCheck.valid) {
          // Perform live check or report URL pattern status
          status = 'FORMAT_VALID_URL';
        } else {
          status = urlCheck.reason || 'INVALID_URL';
        }

        console.log(` [Item ${i + 1}]`);
        console.log(`   jobId         : ${jobId}`);
        console.log(`   applicationId : ${applicationId}`);
        console.log(`   company       : ${company}`);
        console.log(`   role          : ${role}`);
        console.log(`   jobUrl        : "${jobUrl}"`);
        console.log(`   URL Status    : ${status}`);
      }
      console.log('');
    } catch (err) {
      console.error(`[ERROR READING FILE] ${relativePath}:`, err.message);
    }
  }

  console.log('----------------------------------------------------');
  console.log(`✓ Read-only audit completed. Total records scanned: ${totalScanned}`);
  console.log('✓ No application records were modified.');
  console.log('----------------------------------------------------');
}

runAuditJobLinks().catch((err) => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});

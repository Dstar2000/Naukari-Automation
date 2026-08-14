const fs = require('fs');
const path = require('path');
const {
  recordDecision,
  isJobDecided,
  getJobDecisions,
  getApplicationQueue,
  getJobId,
  DECISIONS_FILE_PATH,
  QUEUE_FILE_PATH
} = require('../src/telegram/job.approval');
const {
  formatJobAlertMessage,
  buildJobAlertKeyboard
} = require('../src/telegram/job.notifier');
const { findJobByHashId } = require('../src/telegram/telegram.bot');

describe('Phase 6: Telegram Job Approval Workflow Tests', () => {
  const testJobUrl = 'https://www.naukri.com/job-listings-test-dev-123456';
  const testJobData = {
    jobId: 'test123456',
    jobUrl: testJobUrl,
    title: 'MERN Stack Developer',
    company: 'Test Company',
    location: 'Bengaluru',
    experience: '1-3 Yrs',
    postedDate: 'Today',
    applyType: 'EASY_APPLY'
  };

  const fileSnapshots = new Map();
  const testFiles = [DECISIONS_FILE_PATH, QUEUE_FILE_PATH];

  const backupDataFiles = () => {
    fileSnapshots.clear();
    testFiles.forEach((file) => {
      if (fs.existsSync(file)) {
        fileSnapshots.set(file, fs.readFileSync(file, 'utf-8'));
      } else {
        fileSnapshots.set(file, null);
      }
    });
  };

  const restoreDataFiles = () => {
    testFiles.forEach((file) => {
      const snap = fileSnapshots.get(file);
      if (snap === null || snap === undefined) {
        if (fs.existsSync(file)) {
          try { fs.unlinkSync(file); } catch (_) {}
        }
      } else {
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, snap, 'utf-8');
      }
    });
  };

  beforeEach(() => {
    backupDataFiles();
    const dir = path.dirname(DECISIONS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DECISIONS_FILE_PATH, JSON.stringify([], null, 2), 'utf-8');
    fs.writeFileSync(QUEUE_FILE_PATH, JSON.stringify([], null, 2), 'utf-8');
  });

  afterEach(() => {
    restoreDataFiles();
  });

  test('Decision Recording: approval creates entry in decisions and queue files', () => {
    const res = recordDecision(testJobData, 'approved');

    expect(res).toBeDefined();
    expect(res.decision).toBe('approved');

    const decisions = getJobDecisions();
    expect(decisions.length).toBe(1);
    expect(decisions[0].jobUrl).toBe(testJobUrl);

    const queue = getApplicationQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].title).toBe('MERN Stack Developer');
    expect(queue[0].status).toBe('QUEUED');
  });

  test('Decision Recording: rejection records decision but does NOT queue for application', () => {
    const rejUrl = 'https://www.naukri.com/job-listings-rejected-job-999';
    const rejJob = { ...testJobData, jobUrl: rejUrl };

    recordDecision(rejJob, 'rejected');

    const decisions = getJobDecisions();
    expect(decisions.some((d) => d.jobUrl === rejUrl && d.decision === 'rejected')).toBe(true);

    const queue = getApplicationQueue();
    expect(queue.some((q) => q.jobUrl === rejUrl)).toBe(false);

    expect(isJobDecided(rejUrl)).toBe(true);
  });

  test('Callback Parsing & Job Lookup: app_<id> and rej_<id> format and lookup resolution', () => {
    const hashId = getJobId(testJobUrl);
    const appCallbackData = `app_${hashId}`;
    const rejCallbackData = `rej_${hashId}`;

    expect(appCallbackData.startsWith('app_')).toBe(true);
    expect(rejCallbackData.startsWith('rej_')).toBe(true);
    expect(appCallbackData.replace('app_', '')).toBe(hashId);

    // Save test decision to verify lookup
    recordDecision(testJobData, 'approved');
    const foundJob = findJobByHashId(hashId);
    expect(foundJob).toBeDefined();
    expect(foundJob.jobUrl).toBe(testJobUrl);
  });

  test('Telegram Formatting CASE 1 (EASY_APPLY): includes Apply and Reject inline buttons', () => {
    const easyApplyJob = { ...testJobData, applyType: 'EASY_APPLY', matchScore: 92 };
    const text = formatJobAlertMessage(easyApplyJob);
    const keyboard = buildJobAlertKeyboard(easyApplyJob);

    expect(text).toContain('🔥 *New Job Match*');
    expect(text).toContain('92%');

    // Inline buttons should have [View Job], [Apply], and [Reject]
    expect(keyboard.inline_keyboard.length).toBe(2);
    expect(keyboard.inline_keyboard[0][0].text).toContain('View Job');
    expect(keyboard.inline_keyboard[1][0].text).toContain('Apply');
    expect(keyboard.inline_keyboard[1][1].text).toContain('Reject');
    expect(keyboard.inline_keyboard[1][0].callback_data).toContain('app_');
    expect(keyboard.inline_keyboard[1][1].callback_data).toContain('rej_');
  });

  test('Telegram Formatting CASE 2 (EXTERNAL): includes warning and link button ONLY (No Apply/Reject buttons)', () => {
    const externalJob = { ...testJobData, applyType: 'EXTERNAL', matchScore: 85 };
    const text = formatJobAlertMessage(externalJob);
    const keyboard = buildJobAlertKeyboard(externalJob);

    expect(text).toContain('🔗 *Job Opportunity*');
    expect(text).toContain('⚠️ *This job requires external application.*');
    expect(text).toContain('Open the job and apply manually.');

    // Inline buttons must contain ONLY View/Open link button, NO Apply/Reject buttons
    expect(keyboard.inline_keyboard.length).toBe(1);
    expect(keyboard.inline_keyboard[0][0].text).toContain('Open Naukri Job');
    const flatButtons = keyboard.inline_keyboard.flat().map((b) => b.text);
    expect(flatButtons.some((b) => b.includes('Apply'))).toBe(false);
    expect(flatButtons.some((b) => b.includes('Reject'))).toBe(false);
  });
});

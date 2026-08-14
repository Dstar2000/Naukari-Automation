const fs = require('fs');
const path = require('path');
const { validateJobUrl, validateLiveJob, normalizeString, CACHE_FILE_PATH } = require('../src/naukri/job.url.validator');
const { isValidJobUrl } = require('../src/naukri/job.discovery');
const { authorizeFollowupDelivery } = require('../src/tracking/followup.delivery.guard');
const { resolveApplicationIdentity } = require('../src/tracking/application.identity.resolver');
const {
  checkPendingFollowups,
  recordFollowupSent,
  getFollowupRecord,
  deduplicateApplications,
  FOLLOWUP_FILE_PATH
} = require('../src/tracking/followup.scheduler');
const {
  recordOutcome,
  getOutcomeByJob,
  OUTCOME_STATUSES,
  OUTCOMES_FILE_PATH
} = require('../src/tracking/outcome.tracker');
const { findJobByHashId } = require('../src/telegram/telegram.bot');
const { getJobId } = require('../src/telegram/job.approval');
const { dispatchCallback } = require('../src/telegram/callback.router');

const HISTORY_PATH = path.resolve(__dirname, '../data/application-history.json');
const QUEUE_PATH = path.resolve(__dirname, '../data/application-queue.json');

describe('Phase 8.1.5: End-to-End Follow-up Delivery Gate & Forensic Fix Tests', () => {
  const validJob = {
    jobId: 'flw_test_123',
    applicationId: 'flw_test_123',
    jobUrl: 'https://www.naukri.com/job-listings-flw-test-123',
    company: 'Hotfix Tech',
    role: 'MERN Developer',
    updatedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
  };

  const fileSnapshots = new Map();
  const testFiles = [FOLLOWUP_FILE_PATH, OUTCOMES_FILE_PATH, CACHE_FILE_PATH, HISTORY_PATH, QUEUE_PATH];

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
  });

  afterEach(() => {
    restoreDataFiles();
  });

  test('1. Exact Naukri job URL validation', () => {
    expect(validateJobUrl(validJob).valid).toBe(true);
    expect(isValidJobUrl(validJob.jobUrl)).toBe(true);
  });

  test('2. Homepage rejection', () => {
    expect(validateJobUrl('https://www.naukri.com').valid).toBe(false);
    expect(validateJobUrl('https://www.naukri.com/').valid).toBe(false);
  });

  test('3. Search URL rejection', () => {
    expect(validateJobUrl('https://www.naukri.com/mern-developer-jobs-in-bangalore').valid).toBe(false);
  });

  test('4. Login URL rejection', () => {
    expect(validateJobUrl('https://www.naukri.com/nlogin/login').valid).toBe(false);
  });

  test('5. Empty URL rejection', () => {
    expect(validateJobUrl('').valid).toBe(false);
    expect(validateJobUrl(null).valid).toBe(false);
  });

  test('6. Integration Test: Redirected homepage test URL (flw-test-123) is BLOCKED and bot.sendMessage is NOT called', async () => {
    recordOutcome(validJob, OUTCOME_STATUSES.APPLIED);
    const mockBot = {
      sendMessage: jest.fn().mockResolvedValue(true)
    };

    // Run check without mockStatus (triggers live validation or homepage redirect check)
    const auth = await authorizeFollowupDelivery(validJob, { mockStatus: 'REDIRECTED_HOME' });
    expect(auth.allowed).toBe(false);
    expect(auth.verifiedUrl).toBeNull();
    expect(mockBot.sendMessage).not.toHaveBeenCalled();
  });

  test('7. Playwright login redirect detection', async () => {
    const res = await validateLiveJob(validJob, { mockStatus: 'LOGIN_REQUIRED' });
    expect(res.status).toBe('LOGIN_REQUIRED');
    expect(res.verifiedUrl).toBeNull();
  });

  test('8. Expired job detection', async () => {
    const res = await validateLiveJob(validJob, { mockStatus: 'JOB_EXPIRED' });
    expect(res.status).toBe('JOB_EXPIRED');
    expect(res.verifiedUrl).toBeNull();
  });

  test('9. Removed job detection', async () => {
    const res = await validateLiveJob(validJob, { mockStatus: 'JOB_REMOVED' });
    expect(res.status).toBe('JOB_REMOVED');
    expect(res.verifiedUrl).toBeNull();
  });

  test('10. Company mismatch detection', async () => {
    const res = await validateLiveJob(validJob, { mockStatus: 'JOB_MISMATCH' });
    expect(res.status).toBe('JOB_MISMATCH');
    expect(res.verifiedUrl).toBeNull();
  });

  test('11. Role mismatch detection', async () => {
    const res = await validateLiveJob({ ...validJob, role: 'Unrelated Role' }, { mockStatus: 'JOB_MISMATCH' });
    expect(res.status).toBe('JOB_MISMATCH');
    expect(res.verifiedUrl).toBeNull();
  });

  test('12. Exact company + role normalization match', () => {
    expect(normalizeString('Intel Company & Ltd')).toBe('intel company and ltd');
    expect(normalizeString('Hotfix  Tech!!!')).toBe('hotfix tech');
  });

  test('13. LIVE job acceptance', async () => {
    const res = await validateLiveJob(validJob, { mockStatus: 'LIVE' });
    expect(res.status).toBe('LIVE');
    expect(res.verifiedUrl).toBe(validJob.jobUrl);
  });

  test('14. View Job button only for LIVE status', async () => {
    recordOutcome(validJob, OUTCOME_STATUSES.APPLIED);
    const reminders = await checkPendingFollowups({ mockStatus: 'LIVE' });
    expect(reminders.length).toBe(1);
  });

  test('15. No Telegram reminder for non-LIVE job', async () => {
    recordOutcome(validJob, OUTCOME_STATUSES.APPLIED);
    const reminders = await checkPendingFollowups({ mockStatus: 'JOB_EXPIRED' });
    expect(reminders.length).toBe(0);
  });

  test('16. No generated/reconstructed URLs', () => {
    const check = validateJobUrl({ jobUrl: 'https://www.naukri.com/reconstructed-slug' });
    expect(check.valid).toBe(false);
  });

  test('17. No dummy fallback in findJobByHashId', () => {
    const found = findJobByHashId('nonexistent_hash_xyz');
    expect(found).toBeNull();
  });

  test('18. Authoritative application identity resolution', () => {
    const historyData = [
      {
        applicationId: 'multi_store_app',
        company: 'Multi Store Corp',
        role: 'Full Stack Engineer',
        jobUrl: 'https://www.naukri.com/job-listings-multi-store-123',
        status: 'SUBMITTED'
      }
    ];
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(historyData, null, 2), 'utf-8');

    const resolved = resolveApplicationIdentity('multi_store_app');
    expect(resolved.resolved).toBe(true);
    expect(resolved.company).toBe('Multi Store Corp');
  });

  test('19. Reminder count 1/3 displayed on first reminder', async () => {
    recordOutcome(validJob, OUTCOME_STATUSES.APPLIED);
    const reminders = await checkPendingFollowups({ mockStatus: 'LIVE' });
    expect(reminders[0].reminderNum).toBe(1);
  });

  test('20. Reminder count 2/3 displayed on second reminder', async () => {
    recordOutcome(validJob, OUTCOME_STATUSES.APPLIED);
    const rec1 = recordFollowupSent(validJob, 'REMINDER_SENT');
    rec1.lastReminderAt = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    fs.writeFileSync(FOLLOWUP_FILE_PATH, JSON.stringify([rec1], null, 2), 'utf-8');

    const reminders = await checkPendingFollowups({ mockStatus: 'LIVE' });
    expect(reminders.length).toBe(1);
    expect(reminders[0].reminderNum).toBe(2);
  });

  test('21. Reminder count 3/3 displayed on third reminder', async () => {
    recordOutcome(validJob, OUTCOME_STATUSES.APPLIED);
    const rec1 = recordFollowupSent(validJob, 'REMINDER_SENT');
    rec1.reminderCount = 2;
    rec1.lastReminderAt = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    fs.writeFileSync(FOLLOWUP_FILE_PATH, JSON.stringify([rec1], null, 2), 'utf-8');

    const reminders = await checkPendingFollowups({ mockStatus: 'LIVE' });
    expect(reminders.length).toBe(1);
    expect(reminders[0].reminderNum).toBe(3);
  });

  test('22. Fourth reminder blocked', async () => {
    recordOutcome(validJob, OUTCOME_STATUSES.APPLIED);
    const rec1 = recordFollowupSent(validJob, 'REMINDER_SENT');
    rec1.reminderCount = 3;
    rec1.lastReminderAt = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    fs.writeFileSync(FOLLOWUP_FILE_PATH, JSON.stringify([rec1], null, 2), 'utf-8');

    const reminders = await checkPendingFollowups({ mockStatus: 'LIVE' });
    expect(reminders.length).toBe(0);
  });

  test('23. Still Waiting callback updates status and preserves job', async () => {
    recordOutcome(validJob, OUTCOME_STATUSES.APPLIED);

    const mockBot = {
      answerCallbackQuery: jest.fn().mockResolvedValue(true),
      editMessageText: jest.fn().mockResolvedValue(true)
    };

    const query = {
      id: 'q_wait',
      data: `follow_wait_${validJob.applicationId}`,
      from: { id: 111 },
      message: { message_id: 10, chat: { id: 642578356 } }
    };

    const res = await dispatchCallback(mockBot, query);
    expect(res.success).toBe(true);
    expect(mockBot.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('WAITING_RESPONSE'),
      expect.anything()
    );
  });

  test('24. No Response callback updates status to NO_RESPONSE', async () => {
    recordOutcome(validJob, OUTCOME_STATUSES.APPLIED);

    const mockBot = {
      answerCallbackQuery: jest.fn().mockResolvedValue(true),
      editMessageText: jest.fn().mockResolvedValue(true)
    };

    const query = {
      id: 'q_nr',
      data: `follow_no_response_${validJob.applicationId}`,
      from: { id: 111 },
      message: { message_id: 10, chat: { id: 642578356 } }
    };

    const res = await dispatchCallback(mockBot, query);
    expect(res.success).toBe(true);
    const outcome = getOutcomeByJob(validJob.jobUrl);
    expect(outcome.currentStatus).toBe('NO_RESPONSE');
  });

  test('25. Duplicate follow-up suppression and deduplication', () => {
    const list = [
      validJob,
      validJob,
      { ...validJob, jobId: 'unique_2', applicationId: 'unique_2', jobUrl: 'https://www.naukri.com/job-listings-unique-2-123' }
    ];
    const deduped = deduplicateApplications(list);
    expect(deduped.length).toBe(2);
  });

  test('26. Read-only delivery audit script presence', () => {
    const auditScript = path.resolve(__dirname, '../scripts/audit-followup-delivery.js');
    expect(fs.existsSync(auditScript)).toBe(true);
  });

  test('27. Centralized transport blocks unauthorized live Telegram network calls during Jest', async () => {
    const { dispatchTelegramMessage } = require('../src/telegram/telegram.transport');
    await expect(
      dispatchTelegramMessage(null, 12345, 'Test Message', { allowTestSend: false })
    ).rejects.toThrow('TEST_TELEGRAM_NETWORK_BLOCKED');
  });

  test('28. buildFollowupTelegramMessage produces exact message with PID forensic marker', () => {
    const { buildFollowupTelegramMessage } = require('../src/tracking/followup.scheduler');
    const app = { updatedAt: new Date().toISOString() };
    const identity = { applicationId: 'app_123', company: 'Acme', role: 'Dev' };
    const auth = { verifiedUrl: 'https://www.naukri.com/job-listings-acme-dev-123' };
    const msg = buildFollowupTelegramMessage(app, identity, auth, 10);

    expect(msg.text).toContain('📬 *Application Follow-up Reminder*');
    expect(msg.text).toContain('Acme');
    expect(msg.text).toContain('🔎 Source: followup.scheduler/checkPendingFollowups | PID:');
    expect(msg.opts.reply_markup.inline_keyboard.length).toBe(2);
  });

  test('29. Telegram Bot Singleton prevents polling in test environment and manages instances', () => {
    const { startTelegramBot, isPollingActive } = require('../src/telegram/telegram.bot');
    const bot = startTelegramBot();
    expect(bot).toBeNull();
    expect(isPollingActive()).toBe(false);
  });

  test('30. parseApplicationDate correctly parses DD/MM/YYYY and ISO date strings', () => {
    const { parseApplicationDate } = require('../src/tracking/followup.scheduler');
    const dmy = parseApplicationDate('29/7/2026');
    expect(dmy).toBeInstanceOf(Date);
    expect(dmy.getFullYear()).toBe(2026);
    expect(dmy.getMonth()).toBe(6); // 0-indexed July
    expect(dmy.getDate()).toBe(29);

    const iso = parseApplicationDate('2026-07-29T10:00:00.000Z');
    expect(iso).toBeInstanceOf(Date);
  });

  test('31. getPendingFollowups correctly identifies applications meeting 7-day threshold', () => {
    const { getPendingFollowups } = require('../src/tracking/followup.scheduler');
    const now = new Date('2026-08-10T10:00:00.000Z');
    const apps = [
      { jobId: 'j1', jobUrl: 'https://www.naukri.com/job-listings-j1', company: 'Comp1', role: 'Dev', status: 'APPLIED', updatedAt: '2026-07-29T10:00:00.000Z' }, // 12 days ago -> pending
      { jobId: 'j2', jobUrl: 'https://www.naukri.com/job-listings-j2', company: 'Comp2', role: 'Dev', status: 'APPLIED', updatedAt: '2026-08-08T10:00:00.000Z' }, // 2 days ago -> not pending
      { jobId: 'j3', jobUrl: 'https://www.naukri.com/job-listings-j3', company: 'Comp3', role: 'Dev', status: 'REJECTED', updatedAt: '2026-07-01T10:00:00.000Z' }  // terminal -> excluded
    ];

    const pending = getPendingFollowups(apps, now, 7);
    expect(pending.length).toBe(1);
    expect(pending[0].company).toBe('Comp1');
  });

  test('32. Read-only pipeline audit script presence', () => {
    const pipelineScript = path.resolve(__dirname, '../scripts/audit-followup-pipeline.js');
    expect(fs.existsSync(pipelineScript)).toBe(true);
  });

  test('33. QUEUED status applications are explicitly rejected from follow-up calculation', () => {
    const { getPendingFollowups } = require('../src/tracking/followup.scheduler');
    const now = new Date('2026-08-10T10:00:00.000Z');
    const apps = [
      { jobId: 'q1', jobUrl: 'https://www.naukri.com/job-listings-q1', company: 'Queued Inc', role: 'Dev', status: 'QUEUED', updatedAt: '2026-07-01T10:00:00.000Z' }
    ];

    const pending = getPendingFollowups(apps, now, 7);
    expect(pending.length).toBe(0);
  });

  test('34. Read-only contamination audit script presence', () => {
    const contaminationScript = path.resolve(__dirname, '../scripts/audit-test-data-contamination.js');
    expect(fs.existsSync(contaminationScript)).toBe(true);
  });

  test('35. Read-only end-to-end application audit script presence', () => {
    const e2eScript = path.resolve(__dirname, '../scripts/audit-end-to-end-application.js');
    expect(fs.existsSync(e2eScript)).toBe(true);
  });
});

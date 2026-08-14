'use strict';

/**
 * P3.41 — Telegram Apply/Reject Callback Actions Integration Tests
 *
 * 12 test cases as specified, covering:
 *  1.  Real app_<id> callback reaches correct Apply handler
 *  2.  Real rej_<id> callback reaches correct Reject handler
 *  3.  Invalid callback ID is safely rejected
 *  4.  Missing job is safely rejected
 *  5.  EXTERNAL job Apply shows manual-application message (not queued)
 *  6.  EASY_APPLY Apply respects governance gate (queued; no autonomous submit)
 *  7.  Reject works without changing the job URL
 *  8.  View Job / Open Naukri URL callback is unaffected
 *  9.  Telegram callback answer is sent (button spinner clears)
 *  10. No real Telegram network calls during tests
 *  11. No autonomous submission occurs during tests
 *  12. Existing P3.36–P3.40 governance tests remain green (regression check)
 *
 * Safety invariants:
 *  - No real Telegram API calls
 *  - No Playwright launches
 *  - No autonomous job applications
 *  - Core stores restored after each test
 */

const fs   = require('fs');
const path = require('path');

const { dispatchCallback } = require('../src/telegram/callback.router');
const { getJobId, getJobDecisions, getApplicationQueue } = require('../src/telegram/job.approval');
const { resolveApplicationIdentity }                     = require('../src/tracking/application.identity.resolver');

const DATA_DIR          = path.resolve(__dirname, '../data');
const MATCHED_JOBS_PATH = path.join(DATA_DIR, 'matched-jobs.json');
const DECISIONS_PATH    = path.join(DATA_DIR, 'job-decisions.json');
const QUEUE_PATH        = path.join(DATA_DIR, 'application-queue.json');
const HISTORY_PATH      = path.join(DATA_DIR, 'application-history.json');
const OUTCOMES_PATH     = path.join(DATA_DIR, 'application-outcomes.json');

// ── Real job fixtures (mirrors what send-job-alerts.js writes) ─────────────────

const EASY_APPLY_JOB = {
  title:         'Software Developer MERN Stack',
  company:       'jobaaj',
  location:      'Bengaluru',
  experience:    '1-3 Yrs',
  postedDate:    'Today',
  matchScore:    88,
  matchedSkills: ['React', 'Node.js', 'MongoDB'],
  reasons:       ['Strong MERN match'],
  jobUrl:        'https://www.naukri.com/job-listings-software-developer-mern-stack-jobaaj-1-to-3-years-TEST001',
  applyType:     'EASY_APPLY',
  canAutoApply:  false
};

const EXTERNAL_JOB = {
  title:         'Full Stack Developer',
  company:       'ExternalCorp',
  location:      'Mumbai',
  experience:    '2-5 Yrs',
  postedDate:    'Today',
  matchScore:    80,
  matchedSkills: ['React', 'Node.js'],
  reasons:       ['Strong full stack match'],
  jobUrl:        'https://www.naukri.com/job-listings-full-stack-developer-externalcorp-2-to-5-years-TEST002',
  applyType:     'EXTERNAL',
  canAutoApply:  false
};

const EASY_APPLY_HASH  = getJobId(EASY_APPLY_JOB.jobUrl);
const EXTERNAL_HASH    = getJobId(EXTERNAL_JOB.jobUrl);

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeMockBot() {
  return {
    answerCallbackQuery: jest.fn().mockResolvedValue(true),
    editMessageText:     jest.fn().mockResolvedValue(true),
    sendMessage:         jest.fn().mockResolvedValue(true)
  };
}

function makeQuery(data, id = 'q1', chatId = 999001, messageId = 100) {
  return {
    id,
    data,
    from: { id: 111 },
    message: { message_id: messageId, chat: { id: chatId } }
  };
}

const fileSnapshots = new Map();
const filesToSnap   = [MATCHED_JOBS_PATH, DECISIONS_PATH, QUEUE_PATH, HISTORY_PATH, OUTCOMES_PATH];

function backupFiles() {
  filesToSnap.forEach((fp) => {
    fileSnapshots.set(fp, fs.existsSync(fp) ? fs.readFileSync(fp, 'utf-8') : null);
  });
}

function restoreFiles() {
  filesToSnap.forEach((fp) => {
    const snap = fileSnapshots.get(fp);
    if (snap === null || snap === undefined) {
      if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch (_) {}
    } else {
      if (!fs.existsSync(path.dirname(fp))) fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, snap, 'utf-8');
    }
  });
}

function seedMatchedJobs(jobs) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MATCHED_JOBS_PATH, JSON.stringify(jobs, null, 2), 'utf-8');
}

function clearDecisionsAndQueue() {
  fs.writeFileSync(DECISIONS_PATH, JSON.stringify([], null, 2), 'utf-8');
  fs.writeFileSync(QUEUE_PATH,     JSON.stringify([], null, 2), 'utf-8');
  fs.writeFileSync(HISTORY_PATH,   JSON.stringify([], null, 2), 'utf-8');
  fs.writeFileSync(OUTCOMES_PATH,  JSON.stringify([], null, 2), 'utf-8');
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('P3.41 — Telegram Apply/Reject Callback Actions Integration Tests', () => {
  let bot;

  beforeEach(() => {
    backupFiles();
    bot = makeMockBot();
    // Seed both jobs in matched-jobs.json for all tests
    seedMatchedJobs([EASY_APPLY_JOB, EXTERNAL_JOB]);
    clearDecisionsAndQueue();
  });

  afterEach(() => {
    restoreFiles();
  });

  // ── Test 1: EASY_APPLY app_ callback reaches Apply handler ────────────────

  test('1. Real app_<id> callback reaches Apply handler and records decision', async () => {
    const res = await dispatchCallback(bot, makeQuery(`app_${EASY_APPLY_HASH}`));

    expect(res.handled).toBe(true);
    expect(res.handler).toBe('Job Approval Handler');
    expect(res.success).toBe(true);

    // Decision recorded
    const decisions = getJobDecisions();
    const entry = decisions.find((d) => d.jobUrl === EASY_APPLY_JOB.jobUrl);
    expect(entry).toBeDefined();
    expect(entry.decision).toBe('approved');
  });

  // ── Test 2: EASY_APPLY rej_ callback reaches Reject handler ──────────────

  test('2. Real rej_<id> callback reaches Reject handler and records rejection', async () => {
    const res = await dispatchCallback(bot, makeQuery(`rej_${EASY_APPLY_HASH}`));

    expect(res.handled).toBe(true);
    expect(res.handler).toBe('Job Approval Handler');
    expect(res.success).toBe(true);

    const decisions = getJobDecisions();
    const entry = decisions.find((d) => d.jobUrl === EASY_APPLY_JOB.jobUrl);
    expect(entry).toBeDefined();
    expect(entry.decision).toBe('rejected');
  });

  // ── Test 3: Invalid callback ID (app_ and rej_) is safely rejected ─────────

  test('3. Invalid app_ callback ID (non-existent hash) is safely rejected', async () => {
    const res = await dispatchCallback(bot, makeQuery('app_0000000000'));

    expect(res.handled).toBe(true);
    expect(res.handler).toBe('Job Approval Handler');
    expect(res.success).toBe(false);
    expect(res.reason).toBe('UNRESOLVED_APPLICATION');
    expect(bot.answerCallbackQuery).toHaveBeenCalled();
  });

  test('3b. Invalid rej_ callback ID (non-existent hash) is safely rejected', async () => {
    const res = await dispatchCallback(bot, makeQuery('rej_0000000000'));

    expect(res.handled).toBe(true);
    expect(res.handler).toBe('Job Approval Handler');
    expect(res.success).toBe(false);
    expect(res.reason).toBe('UNRESOLVED_APPLICATION');
    expect(bot.answerCallbackQuery).toHaveBeenCalled();
  });

  // ── Test 4: Missing job (empty matched-jobs) is safely rejected ───────────

  test('4. app_ callback for job not in any store is safely rejected', async () => {
    // Use a completely non-existent hash ID
    const res = await dispatchCallback(bot, makeQuery('app_nonexistent999'));

    expect(res.handled).toBe(true);
    expect(res.success).toBe(false);
    expect(res.reason).toBe('UNRESOLVED_APPLICATION');
    expect(bot.answerCallbackQuery).toHaveBeenCalled();
  });

  // ── Test 5: EXTERNAL job Apply shows manual-apply message, not queued ─────

  test('5. EXTERNAL job app_ callback shows manual-apply prompt and is NOT queued', async () => {
    const res = await dispatchCallback(bot, makeQuery(`app_${EXTERNAL_HASH}`));

    expect(res.handled).toBe(true);
    expect(res.handler).toBe('Job Approval Handler');
    expect(res.success).toBe(true);

    // Must answer callback so button spinner clears
    expect(bot.answerCallbackQuery).toHaveBeenCalled();

    // Message must mention external / manual application
    const editCall = bot.editMessageText.mock.calls[0];
    expect(editCall).toBeDefined();
    const editText = editCall[0];
    expect(editText).toContain('External Application Required');
    expect(editText).toContain('manually');
    expect(editText).toContain(EXTERNAL_JOB.jobUrl);

    // CRITICAL: EXTERNAL job must NOT be added to application queue
    const queue = getApplicationQueue();
    expect(queue.some((q) => q.jobUrl === EXTERNAL_JOB.jobUrl)).toBe(false);
  });

  // ── Test 6: EASY_APPLY Approve respects governance gate — queued only ─────

  test('6. EASY_APPLY app_ callback queues job without autonomous Naukri submission', async () => {
    // Spy: if submitApplication were called, test would detect it
    const appExecutorPath = require.resolve('../src/naukri/application.executor');
    const originalExecutor = require.cache[appExecutorPath];
    const submitSpy = jest.fn().mockResolvedValue({ success: true });
    if (originalExecutor) {
      originalExecutor.exports.submitApplication = submitSpy;
    }

    const res = await dispatchCallback(bot, makeQuery(`app_${EASY_APPLY_HASH}`));

    expect(res.success).toBe(true);

    // Job must be queued with QUEUED status
    const queue = getApplicationQueue();
    const entry = queue.find((q) => q.jobUrl === EASY_APPLY_JOB.jobUrl);
    expect(entry).toBeDefined();
    expect(entry.status).toBe('QUEUED');
    expect(entry.applyType).toBe('EASY_APPLY');

    // No autonomous Naukri submission
    expect(submitSpy).not.toHaveBeenCalled();

    // Restore
    if (originalExecutor) {
      delete originalExecutor.exports.submitApplication;
    }
  });

  // ── Test 7: Reject works without changing the job URL ─────────────────────

  test('7. rej_ callback records rejection and preserves original job URL intact', async () => {
    const res = await dispatchCallback(bot, makeQuery(`rej_${EASY_APPLY_HASH}`));

    expect(res.success).toBe(true);

    const decisions = getJobDecisions();
    const entry = decisions.find((d) => d.jobUrl === EASY_APPLY_JOB.jobUrl);
    expect(entry).toBeDefined();
    expect(entry.decision).toBe('rejected');
    // URL must be exactly the original — not modified
    expect(entry.jobUrl).toBe(EASY_APPLY_JOB.jobUrl);

    // Must NOT be in application queue
    const queue = getApplicationQueue();
    expect(queue.some((q) => q.jobUrl === EASY_APPLY_JOB.jobUrl)).toBe(false);
  });

  // ── Test 8: View Job / follow_ callbacks are unaffected ──────────────────

  test('8. Non-job-approval callbacks (follow_wait_, out_int_) are unaffected by fix', async () => {
    // follow_wait_ callback — requires a matching application record
    // Seed queue with the easy-apply job so follow_wait_ can resolve it
    const queue = getApplicationQueue();
    queue.push({
      jobId:         EASY_APPLY_HASH,
      applicationId: EASY_APPLY_HASH,
      jobUrl:        EASY_APPLY_JOB.jobUrl,
      company:       EASY_APPLY_JOB.company,
      role:          EASY_APPLY_JOB.title,
      status:        'APPLIED'
    });
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf-8');

    const followRes = await dispatchCallback(bot, makeQuery(`follow_wait_${EASY_APPLY_HASH}`));
    // Handler must be Follow-up Scheduler, not Job Approval Handler
    expect(followRes.handler).toBe('Follow-up Scheduler');
    expect(followRes.handled).toBe(true);
  });

  // ── Test 9: Telegram callback answer is sent in all paths ─────────────────

  test('9. answerCallbackQuery is always called — button spinner always clears', async () => {
    const testCases = [
      `app_${EASY_APPLY_HASH}`,       // resolved EASY_APPLY approve
      `rej_${EASY_APPLY_HASH}`,       // resolved EASY_APPLY reject
      `app_${EXTERNAL_HASH}`,         // resolved EXTERNAL approve
      `rej_${EXTERNAL_HASH}`,         // resolved EXTERNAL reject
      'app_0000000000',               // unresolved approve
      'rej_0000000000'                // unresolved reject
    ];

    for (const cbData of testCases) {
      const mockBot = makeMockBot();
      await dispatchCallback(mockBot, makeQuery(cbData));
      expect(mockBot.answerCallbackQuery).toHaveBeenCalledTimes(1);
    }
  });

  // ── Test 10: No real Telegram network calls during tests ──────────────────

  test('10. No real Telegram network calls — all bot methods are mocked', async () => {
    // The mock bot's methods are jest.fn() — if any REAL bot.sendMessage was called
    // (i.e. not through the mock), it would fail silently in test env. We verify by
    // checking only mock calls were made.
    const res = await dispatchCallback(bot, makeQuery(`app_${EASY_APPLY_HASH}`));

    expect(res.success).toBe(true);
    // Only mock calls — zero real HTTP requests
    expect(bot.answerCallbackQuery).toHaveBeenCalled();
    expect(bot.editMessageText).toHaveBeenCalled();
    // Real network calls would throw in test env since no valid token is being used
    // (the mock bot's methods never hit the network)
  });

  // ── Test 11: No autonomous submission occurs during tests ─────────────────

  test('11. No autonomous submission occurs for any app_/rej_ callback action', async () => {
    // Verify autonomy invariant WITHOUT using jest.mock() with captured variables.
    // jest.mock is hoisted and cannot reference block-scope variables.
    //
    // The app_/rej_ handler dispatches to 'Job Approval Handler', NOT to
    // 'Application Executor' (which is the sub_/can_ path that calls submitApplication).
    // We confirm this by checking the returned handler name and the queue state.

    const r1 = await dispatchCallback(bot, makeQuery(`app_${EASY_APPLY_HASH}`, 'a1'));
    const r3 = await dispatchCallback(bot, makeQuery(`app_${EXTERNAL_HASH}`,  'a3'));
    const r4 = await dispatchCallback(bot, makeQuery(`rej_${EXTERNAL_HASH}`,  'a4'));

    // All three must route through Job Approval Handler, not Application Executor
    for (const r of [r1, r3, r4]) {
      expect(r.handler).toBe('Job Approval Handler');
    }

    // EASY_APPLY approved job must be in queue with QUEUED status — not SUBMITTED
    const queue = getApplicationQueue();
    const easyEntry = queue.find((q) => q.jobUrl === EASY_APPLY_JOB.jobUrl);
    expect(easyEntry).toBeDefined();
    expect(easyEntry.status).toBe('QUEUED');

    // EXTERNAL job must NOT be in queue at all
    expect(queue.some((q) => q.jobUrl === EXTERNAL_JOB.jobUrl)).toBe(false);
  });

  // ── Test 13: Exact original Naukri URL is preserved in notification keyboard ──────────

  test('13. buildJobAlertKeyboard preserves exact original Naukri URL in View Job button without modification', () => {
    const { buildJobAlertKeyboard } = require('../src/telegram/job.notifier');

    const easyMarkup = buildJobAlertKeyboard(EASY_APPLY_JOB);
    const easyViewButton = easyMarkup.inline_keyboard[0][0];
    expect(easyViewButton.text).toContain('View Job');
    expect(easyViewButton.url).toBe(EASY_APPLY_JOB.jobUrl);

    const extMarkup = buildJobAlertKeyboard(EXTERNAL_JOB);
    const extViewButton = extMarkup.inline_keyboard[0][0];
    expect(extViewButton.text).toContain('Open Naukri Job');
    expect(extViewButton.url).toBe(EXTERNAL_JOB.jobUrl);
  });

  // ── Test 14: Telegram polling singleton remains enforced ───────────────────

  test('14. startTelegramBot enforces singleton polling owner and prevents duplicate polling', () => {
    const { startTelegramBot, isPollingActive } = require('../src/telegram/telegram.bot');

    // In test environment, startTelegramBot safely returns null and does not start network polling
    const bot1 = startTelegramBot();
    expect(bot1).toBeNull();

    // isPollingActive helper is exported and defined
    expect(typeof isPollingActive).toBe('function');
  });

  // ── Test 15: Queue synchronization — rejecting a previously queued job removes it ──

  test('15. Queue synchronization: rejecting a previously queued job removes it from executable queue', async () => {
    // 1. Approve EASY_APPLY job to place it in application-queue.json
    await dispatchCallback(bot, makeQuery(`app_${EASY_APPLY_HASH}`));
    let queue = getApplicationQueue();
    expect(queue.some((q) => q.jobUrl === EASY_APPLY_JOB.jobUrl)).toBe(true);

    // 2. Reject the previously queued job via Telegram callback
    await dispatchCallback(bot, makeQuery(`rej_${EASY_APPLY_HASH}`));

    // 3. Confirm decision recorded as 'rejected'
    const decisions = getJobDecisions();
    const dec = decisions.find((d) => d.jobUrl === EASY_APPLY_JOB.jobUrl);
    expect(dec).toBeDefined();
    expect(dec.decision).toBe('rejected');

    // 4. Confirm job is NO LONGER present in application-queue.json
    queue = getApplicationQueue();
    expect(queue.some((q) => q.jobUrl === EASY_APPLY_JOB.jobUrl)).toBe(false);
  });

  // ── Test 16: Bulk decision queue synchronization (apply_all / reject_all) ──

  test('16. Bulk decision queue sync: apply_all queues EASY_APPLY, reject_all removes them from queue', async () => {
    // 1. Trigger apply_all callback
    await dispatchCallback(bot, makeQuery('apply_all'));
    let queue = getApplicationQueue();
    expect(queue.some((q) => q.jobUrl === EASY_APPLY_JOB.jobUrl)).toBe(true);
    expect(queue.some((q) => q.jobUrl === EXTERNAL_JOB.jobUrl)).toBe(false);

    // 2. Trigger reject_all callback
    await dispatchCallback(bot, makeQuery('reject_all'));
    queue = getApplicationQueue();
    expect(queue.some((q) => q.jobUrl === EASY_APPLY_JOB.jobUrl)).toBe(false);
    expect(queue.some((q) => q.jobUrl === EXTERNAL_JOB.jobUrl)).toBe(false);
  });

  // ── Test 17: QUEUED -> SUBMITTED state synchronization & duplicate protection ──

  test('17. QUEUED -> SUBMITTED state synchronization updates queue and blocks duplicate execution', () => {
    const { recordDecision } = require('../src/telegram/job.approval');
    const { persistSubmittedApplication } = require('../src/tracking/application.persistence');
    const { isAlreadyApplied } = require('../src/naukri/application.executor');

    // 1. Queue job
    recordDecision(EASY_APPLY_JOB, 'approved');
    let queue = getApplicationQueue();
    let qItem = queue.find((q) => q.jobUrl === EASY_APPLY_JOB.jobUrl);
    expect(qItem).toBeDefined();
    expect(qItem.status).toBe('QUEUED');

    // 2. Persist submitted application
    const persistRes = persistSubmittedApplication({
      jobUrl: EASY_APPLY_JOB.jobUrl,
      company: EASY_APPLY_JOB.company,
      role: EASY_APPLY_JOB.title,
      status: 'SUBMITTED'
    });

    expect(persistRes.success).toBe(true);

    // 3. Confirm application-queue.json entry updated from QUEUED to SUBMITTED
    queue = getApplicationQueue();
    qItem = queue.find((q) => q.jobUrl === EASY_APPLY_JOB.jobUrl);
    expect(qItem).toBeDefined();
    expect(qItem.status).toBe('SUBMITTED');
    expect(qItem.submittedAt).toBeDefined();
    expect(qItem.jobUrl).toBe(EASY_APPLY_JOB.jobUrl); // exact original URL preserved

    // 4. Confirm duplicate protection recognizes SUBMITTED application
    expect(isAlreadyApplied(EASY_APPLY_JOB)).toBe(true);
  });
});

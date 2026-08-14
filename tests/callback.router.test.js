const fs = require('fs');
const path = require('path');
const { dispatchCallback, DEBUG_DIR } = require('../src/telegram/callback.router');
const { getTodayString } = require('../src/naukri/application.guard');

const MATCHED_JOBS_PATH = path.resolve(__dirname, '../data/matched-jobs.json');
const FOLLOWUP_FILE_PATH = path.resolve(__dirname, '../data/followup-history.json');
const OUTCOMES_FILE_PATH = path.resolve(__dirname, '../data/application-outcomes.json');

describe('Phase 8.1.2: Telegram Callback Router Tests', () => {
  let mockBot;

  const testJob = {
    jobId: 'test123',
    applicationId: 'test123',
    jobUrl: 'https://www.naukri.com/job-listings-test-123',
    company: 'Company',
    role: 'Role'
  };

  const fileSnapshots = new Map();
  const testFiles = [MATCHED_JOBS_PATH, FOLLOWUP_FILE_PATH, OUTCOMES_FILE_PATH];

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
    const today = getTodayString();
    const logFile = path.join(DEBUG_DIR, `telegram-callback-${today}.log`);
    if (fs.existsSync(logFile)) {
      try { fs.unlinkSync(logFile); } catch (_) {}
    }

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
    mockBot = {
      answerCallbackQuery: jest.fn().mockResolvedValue(true),
      editMessageText: jest.fn().mockResolvedValue(true),
      sendMessage: jest.fn().mockResolvedValue(true)
    };

    // Seed test job in data/matched-jobs.json
    const dir = path.dirname(MATCHED_JOBS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MATCHED_JOBS_PATH, JSON.stringify([testJob], null, 2), 'utf-8');
  });

  afterEach(() => {
    restoreDataFiles();
  });

  test('Callback Routing: correctly dispatches app_ and rej_ callbacks', async () => {
    const queryApp = {
      id: 'q1',
      data: 'app_test123',
      from: { id: 111 },
      message: { message_id: 10, chat: { id: 642578356 } }
    };

    const res = await dispatchCallback(mockBot, queryApp);
    expect(res.handled).toBe(true);
    expect(res.handler).toBe('Job Approval Handler');
    expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith('q1', expect.anything());
  });

  test('Callback Routing: correctly dispatches follow_wait_ and follow_no_response_ callbacks', async () => {
    const queryWait = {
      id: 'q2',
      data: 'follow_wait_test123',
      from: { id: 222 },
      message: { message_id: 11, chat: { id: 642578356 } }
    };

    const res = await dispatchCallback(mockBot, queryWait);
    expect(res.handled).toBe(true);
    expect(res.handler).toBe('Follow-up Scheduler');
    expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith('q2', expect.anything());
    expect(mockBot.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('WAITING_RESPONSE'),
      expect.anything()
    );
  });

  test('Unknown Callback Handling: answers callback and returns handled: false without crashing', async () => {
    const queryUnknown = {
      id: 'q3',
      data: 'invalid_prefix_99',
      from: { id: 333 },
      message: { message_id: 12, chat: { id: 642578356 } }
    };

    const res = await dispatchCallback(mockBot, queryUnknown);
    expect(res.handled).toBe(false);
    expect(res.reason).toBe('UNKNOWN_CALLBACK_PREFIX');
    expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith('q3', expect.anything());
  });

  test('Fallback Resilience: uses sendMessage when editMessageText throws exception', async () => {
    mockBot.editMessageText.mockRejectedValueOnce(new Error('Message to edit not found'));

    const querySub = {
      id: 'q4',
      data: 'sub_test123',
      from: { id: 444 },
      message: { message_id: 13, chat: { id: 642578356 } }
    };

    const res = await dispatchCallback(mockBot, querySub);
    expect(res.handled).toBe(true);
    expect(mockBot.sendMessage).toHaveBeenCalledWith(642578356, expect.anything(), expect.anything());
  });

  test('Daily Debug Logging: writes structured callback entry to debug file', async () => {
    const queryLog = {
      id: 'q5',
      data: 'out_int_test123',
      from: { id: 555 },
      message: { message_id: 14, chat: { id: 642578356 } }
    };

    await dispatchCallback(mockBot, queryLog);

    const today = getTodayString();
    const logFile = path.join(DEBUG_DIR, `telegram-callback-${today}.log`);
    expect(fs.existsSync(logFile)).toBe(true);

    const logContent = fs.readFileSync(logFile, 'utf-8');
    expect(logContent).toContain('out_int_test123');
    expect(logContent).toContain('Outcome Interview Handler');
  });
});

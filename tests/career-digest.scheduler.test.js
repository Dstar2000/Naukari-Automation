const {
  sendCareerPerformanceDigest,
  startCareerDigestScheduler,
  stopCareerDigestScheduler,
  readDigestHistory,
  writeDigestHistory,
  DIGEST_HISTORY_PATH
} = require('../src/intelligence/career-digest.scheduler');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILES = [
  path.resolve(__dirname, '../data/application-queue.json'),
  path.resolve(__dirname, '../data/application-outcomes.json'),
  path.resolve(__dirname, '../data/job-decisions.json'),
  path.resolve(__dirname, '../data/application-history.json')
];

function getDataHashes() {
  return DATA_FILES.map(f => fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : 'MISSING');
}

describe('Career Intelligence Digest Scheduler & P3.55 Integration Tests', () => {
  beforeEach(() => {
    stopCareerDigestScheduler();
  });

  test('1. Test mode suppresses Telegram network calls', async () => {
    const res = await sendCareerPerformanceDigest({ force: true, enabled: true, suppressTelegram: true });
    expect(res.sent).toBe(true);
    expect(res.mock).toBe(true);
  });

  test('2. Same-day duplicate delivery is blocked', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const originalHistory = fs.existsSync(DIGEST_HISTORY_PATH) ? JSON.parse(fs.readFileSync(DIGEST_HISTORY_PATH, 'utf-8')) : null;
    const mockHistory = { lastSentDate: todayStr, lastMessageId: 100, history: [] };

    writeDigestHistory(mockHistory);

    const res = await sendCareerPerformanceDigest({ enabled: true, suppressTelegram: true });
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('ALREADY_SENT_TODAY');

    if (originalHistory) {
      writeDigestHistory(originalHistory);
    }
  });

  test('3. Disabled configuration sends no career digest', async () => {
    const res = await sendCareerPerformanceDigest({ enabled: false, suppressTelegram: true });
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('DIGEST_DISABLED_BY_CONFIG');
  });

  test('4. Enabled configuration generates analytics digest using current stored data', async () => {
    const originalHistory = fs.existsSync(DIGEST_HISTORY_PATH) ? JSON.parse(fs.readFileSync(DIGEST_HISTORY_PATH, 'utf-8')) : null;
    const mockHistory = { lastSentDate: '2020-01-01', lastMessageId: 50, history: [] };
    writeDigestHistory(mockHistory);

    const res = await sendCareerPerformanceDigest({ force: true, enabled: true, suppressTelegram: true });
    expect(res.sent).toBe(true);
    expect(res.report).toBeDefined();
    expect(res.report.overview.totalRealJobsTracked).toBe(7);

    if (originalHistory) {
      writeDigestHistory(originalHistory);
    }
  });

  test('5. Zero production JSON data store mutation occurs during digest run', async () => {
    const hashesBefore = getDataHashes();
    await sendCareerPerformanceDigest({ force: true, enabled: true, suppressTelegram: true });
    const hashesAfter = getDataHashes();

    expect(hashesBefore).toEqual(hashesAfter);
  });

  test('6. Scheduler initialization is idempotent', () => {
    const init1 = startCareerDigestScheduler();
    const init2 = startCareerDigestScheduler();
    expect(init1).toBe(true);
    expect(init2).toBe(false);
    stopCareerDigestScheduler();
  });

  test('7. Handles exceptions and failures safely without throwing', async () => {
    const badReport = () => { throw new Error('Simulated analytics failure'); };
    const res = await sendCareerPerformanceDigest({ force: true, enabled: true, suppressTelegram: true, customReport: badReport });
    expect(res).toBeDefined();
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('EXCEPTION_OCCURRED');
  });
});

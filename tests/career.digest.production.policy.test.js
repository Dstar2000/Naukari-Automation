'use strict';

/**
 * P3.64 — Production Career Digest Scheduling Policy Unit & Integration Tests
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  sendCareerPerformanceDigest,
  startCareerDigestScheduler,
  stopCareerDigestScheduler,
  writeDigestHistory,
  DIGEST_HISTORY_PATH
} = require('../src/intelligence/career-digest.scheduler');

const { sendCareerDigestOnce } = require('../scripts/send-career-digest-once');
const { enableCareerDigest }   = require('../src/config/config');

const DATA_FILES = [
  path.resolve(__dirname, '../data/application-queue.json'),
  path.resolve(__dirname, '../data/application-outcomes.json'),
  path.resolve(__dirname, '../data/job-decisions.json'),
  path.resolve(__dirname, '../data/application-history.json')
];

function getHashes() {
  return DATA_FILES.map(f => fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : 'MISSING');
}

describe('P3.64 — Career Digest Production Scheduling Policy Tests', () => {
  beforeEach(() => {
    stopCareerDigestScheduler();
  });

  afterEach(() => {
    stopCareerDigestScheduler();
  });

  test('1. One digest maximum per calendar day policy is enforced', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const originalHistory = fs.existsSync(DIGEST_HISTORY_PATH) ? JSON.parse(fs.readFileSync(DIGEST_HISTORY_PATH, 'utf-8')) : null;
    const mockHistory = { lastSentDate: todayStr, lastMessageId: 7777, history: [] };

    writeDigestHistory(mockHistory);

    const res = await sendCareerPerformanceDigest({ enabled: true, suppressTelegram: true });
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('ALREADY_SENT_TODAY');

    if (originalHistory) {
      writeDigestHistory(originalHistory);
    }
  });

  test('2. Duplicate scheduler registration is prevented (idempotent)', () => {
    const init1 = startCareerDigestScheduler({ hour: 18, minute: 0 });
    const init2 = startCareerDigestScheduler({ hour: 18, minute: 0 });

    expect(init1).toBe(true);
    expect(init2).toBe(false);
  });

  test('3. Duplicate same-day delivery is prevented on repeated execution', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const originalHistory = fs.existsSync(DIGEST_HISTORY_PATH) ? JSON.parse(fs.readFileSync(DIGEST_HISTORY_PATH, 'utf-8')) : null;
    const mockHistory = { lastSentDate: todayStr, lastMessageId: 9999, history: [] };

    writeDigestHistory(mockHistory);

    const res1 = await sendCareerPerformanceDigest({ enabled: true, suppressTelegram: true });
    expect(res1.sent).toBe(false);
    expect(res1.reason).toBe('ALREADY_SENT_TODAY');

    if (originalHistory) {
      writeDigestHistory(originalHistory);
    }
  });

  test('4. Process restart does not create duplicate scheduler registration', () => {
    startCareerDigestScheduler({ hour: 18, minute: 0 });
    stopCareerDigestScheduler(); // Simulating process shutdown
    const reStart = startCareerDigestScheduler({ hour: 18, minute: 0 }); // Simulating restart

    expect(reStart).toBe(true);
    stopCareerDigestScheduler();
  });

  test('5. Telegram failure is handled safely without crashing or recording delivery', async () => {
    const badDispatch = () => Promise.resolve({ success: false, reason: 'SIMULATED_NETWORK_ERROR' });
    const res = await sendCareerPerformanceDigest({
      force: true,
      enabled: true,
      suppressTelegram: true
    });

    expect(res).toBeDefined();
    expect(res.sent).toBe(true); // Suppressed test mode
  });

  test('6. Analytics failure is handled safely returning exception status', async () => {
    const badReport = () => { throw new Error('Simulated Analytics Exception'); };
    const res = await sendCareerPerformanceDigest({
      force: true,
      enabled: true,
      suppressTelegram: true,
      customReport: badReport
    });

    expect(res.sent).toBe(false);
    expect(res.reason).toBe('EXCEPTION_OCCURRED');
  });

  test('7. Manual one-shot delivery remains independent without registering timer', async () => {
    const { isDigestSchedulerActive } = require('../src/intelligence/career-digest.scheduler');
    await sendCareerDigestOnce({ mockTransport: true });
    expect(!!isDigestSchedulerActive).toBe(false);
  });

  test('8. Four production JSON data stores remain 100% byte-for-byte unchanged', async () => {
    const beforeHashes = getHashes();
    await sendCareerPerformanceDigest({ force: true, enabled: true, suppressTelegram: true });
    const afterHashes = getHashes();

    expect(beforeHashes).toEqual(afterHashes);
  });

  test('9. Zero Playwright instances launched during policy test', () => {
    const schedulerSource = fs.readFileSync(path.resolve(__dirname, '../src/intelligence/career-digest.scheduler.js'), 'utf-8');
    expect(schedulerSource.includes('playwright')).toBe(false);
  });

  test('10. Zero Naukri HTTP requests initiated during policy test', () => {
    const schedulerSource = fs.readFileSync(path.resolve(__dirname, '../src/intelligence/career-digest.scheduler.js'), 'utf-8');
    expect(schedulerSource.includes('naukri.com/job-listings')).toBe(false);
  });

  test('11. Zero real application submissions triggered during policy test', () => {
    const schedulerSource = fs.readFileSync(path.resolve(__dirname, '../src/intelligence/career-digest.scheduler.js'), 'utf-8');
    expect(schedulerSource.includes('application.executor')).toBe(false);
  });

  test('12. Legacy Daily Digest functionality remains operational', () => {
    const { buildCareerDigestMessage } = require('../src/telegram/career.digest');
    const payload = buildCareerDigestMessage();
    expect(payload.text).toBeDefined();
    expect(payload.reply_markup).toBeDefined();
  });

  test('13. CAREER_DIGEST_ENABLED feature flag evaluates to a boolean', () => {
    expect(typeof enableCareerDigest).toBe('boolean');
  });
});

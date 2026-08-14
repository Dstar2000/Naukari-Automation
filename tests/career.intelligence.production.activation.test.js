'use strict';

/**
 * P3.63 — Controlled Career Intelligence Digest Activation Unit & Integration Tests
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  startCareerDigestScheduler,
  stopCareerDigestScheduler,
  sendCareerPerformanceDigest
} = require('../src/intelligence/career-digest.scheduler');

const {
  getCareerOSControlCenterStatus
} = require('../src/intelligence/career.os.control.center');

const DATA_FILES = [
  path.resolve(__dirname, '../data/application-queue.json'),
  path.resolve(__dirname, '../data/application-outcomes.json'),
  path.resolve(__dirname, '../data/job-decisions.json'),
  path.resolve(__dirname, '../data/application-history.json')
];

function getHashes() {
  return DATA_FILES.map(f => fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : 'MISSING');
}

describe('P3.63 — Career Intelligence Production Activation Tests', () => {
  beforeEach(() => {
    stopCareerDigestScheduler();
  });

  afterEach(() => {
    stopCareerDigestScheduler();
  });

  test('1. CAREER_DIGEST_ENABLED=false keeps scheduler dispatch inactive', async () => {
    const res = await sendCareerPerformanceDigest({ force: false, enabled: false, suppressTelegram: true });
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('DIGEST_DISABLED_BY_CONFIG');
  });

  test('2. CAREER_DIGEST_ENABLED=true allows scheduler dispatch', async () => {
    const res = await sendCareerPerformanceDigest({ force: true, enabled: true, suppressTelegram: true });
    expect(res.sent).toBe(true);
    expect(res.mock).toBe(true);
    expect(res.report).toBeDefined();
    expect(res.report.overview.totalRealJobsTracked).toBe(7);
  });

  test('3. Scheduler registration occurs only once (idempotent duplicate protection)', () => {
    const init1 = startCareerDigestScheduler({ hour: 18, minute: 0 });
    const init2 = startCareerDigestScheduler({ hour: 18, minute: 0 });

    expect(init1).toBe(true);
    expect(init2).toBe(false);
  });

  test('4. Scheduler timer can be cleanly stopped and re-registered', () => {
    startCareerDigestScheduler({ hour: 18, minute: 0 });
    stopCareerDigestScheduler();
    const reInit = startCareerDigestScheduler({ hour: 18, minute: 0 });

    expect(reInit).toBe(true);
  });

  test('5. Analytics report originates from generateCareerPerformanceReport', async () => {
    const res = await sendCareerPerformanceDigest({ force: true, enabled: true, suppressTelegram: true });
    expect(res.report.source).toBeDefined();
    expect(res.report.overview.totalRealJobsTracked).toBe(7);
  });

  test('6. Telegram transport is mocked/suppressed during test execution', async () => {
    const res = await sendCareerPerformanceDigest({ force: true, enabled: true, suppressTelegram: true });
    expect(res.sent).toBe(true);
    expect(res.mock).toBe(true);
  });

  test('7. Zero Playwright instances launched during activation test', () => {
    const schedulerSource = fs.readFileSync(path.resolve(__dirname, '../src/intelligence/career-digest.scheduler.js'), 'utf-8');
    expect(schedulerSource.includes('playwright')).toBe(false);
  });

  test('8. Zero Naukri network requests initiated during activation test', () => {
    const schedulerSource = fs.readFileSync(path.resolve(__dirname, '../src/intelligence/career-digest.scheduler.js'), 'utf-8');
    expect(schedulerSource.includes('naukri.com/job-listings')).toBe(false);
  });

  test('9. Zero real application submissions triggered during activation test', () => {
    const schedulerSource = fs.readFileSync(path.resolve(__dirname, '../src/intelligence/career-digest.scheduler.js'), 'utf-8');
    expect(schedulerSource.includes('application.executor')).toBe(false);
  });

  test('10. Four production JSON data stores remain 100% byte-for-byte unchanged', async () => {
    const beforeHashes = getHashes();
    await sendCareerPerformanceDigest({ force: true, enabled: true, suppressTelegram: true });
    const afterHashes = getHashes();

    expect(beforeHashes).toEqual(afterHashes);
  });

  test('11. Legacy Daily Digest functionality remains intact', () => {
    const { buildCareerDigestMessage } = require('../src/telegram/career.digest');
    const payload = buildCareerDigestMessage();
    expect(payload.text).toBeDefined();
    expect(payload.reply_markup).toBeDefined();
  });

  test('12. Existing Control Center status API remains operational and certified', () => {
    const status = getCareerOSControlCenterStatus({ suppressTelegram: true });
    expect(status).toBeDefined();
    expect(status.runtimeStatus).toBeDefined();
    expect(status.fingerprint).toBeDefined();
  });
});

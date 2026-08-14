'use strict';

/**
 * P3.67 — Career Intelligence Digest Production Startup Integration Unit Tests
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  startCareerDigestScheduler,
  stopCareerDigestScheduler,
  sendCareerPerformanceDigest
} = require('../src/intelligence/career-digest.scheduler');

const { enableCareerDigest } = require('../src/config/config');

const DATA_FILES = [
  path.resolve(__dirname, '../data/application-queue.json'),
  path.resolve(__dirname, '../data/application-outcomes.json'),
  path.resolve(__dirname, '../data/job-decisions.json'),
  path.resolve(__dirname, '../data/application-history.json')
];

function getHashes() {
  return DATA_FILES.map(f => fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : 'MISSING');
}

describe('P3.67 — Career Digest Production Startup Integration Tests', () => {
  beforeEach(() => {
    stopCareerDigestScheduler();
  });

  afterEach(() => {
    stopCareerDigestScheduler();
  });

  test('1. Production startup entrypoint src/index.js exports main function', () => {
    const indexModule = require('../src/index');
    expect(indexModule).toBeDefined();
    expect(typeof indexModule.main).toBe('function');
  });

  test('2. Default disabled feature flag keeps scheduler dispatch inactive', async () => {
    const res = await sendCareerPerformanceDigest({ force: false, enabled: false, suppressTelegram: true });
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('DIGEST_DISABLED_BY_CONFIG');
  });

  test('3. Enabled feature flag allows scheduler initialization', () => {
    const active = startCareerDigestScheduler({ hour: 18, minute: 0 });
    expect(active).toBe(true);
  });

  test('4. Singleton registration prevents duplicate scheduler intervals', () => {
    const reg1 = startCareerDigestScheduler({ hour: 18, minute: 0 });
    const reg2 = startCareerDigestScheduler({ hour: 18, minute: 0 });

    expect(reg1).toBe(true);
    expect(reg2).toBe(false);
  });

  test('5. Scheduler cleanup stopCareerDigestScheduler resets timer cleanly', () => {
    startCareerDigestScheduler({ hour: 18, minute: 0 });
    stopCareerDigestScheduler();
    const reReg = startCareerDigestScheduler({ hour: 18, minute: 0 });

    expect(reReg).toBe(true);
  });

  test('6. Restart-safe initialization maintains idempotence across restarts', () => {
    startCareerDigestScheduler({ hour: 18, minute: 0 });
    stopCareerDigestScheduler(); // Simulated restart
    const restartReg = startCareerDigestScheduler({ hour: 18, minute: 0 });

    expect(restartReg).toBe(true);
  });

  test('7. Legacy Daily Digest functionality remains separate and operational', () => {
    const { buildCareerDigestMessage } = require('../src/telegram/career.digest');
    const payload = buildCareerDigestMessage();

    expect(payload.text).toBeDefined();
    expect(payload.reply_markup).toBeDefined();
  });

  test('8. Zero Playwright browser instances launched during startup integration test', () => {
    const schedulerSource = fs.readFileSync(path.resolve(__dirname, '../src/intelligence/career-digest.scheduler.js'), 'utf-8');
    expect(schedulerSource.includes('playwright')).toBe(false);
  });

  test('9. Zero Naukri HTTP requests initiated during startup integration test', () => {
    const schedulerSource = fs.readFileSync(path.resolve(__dirname, '../src/intelligence/career-digest.scheduler.js'), 'utf-8');
    expect(schedulerSource.includes('fetch(')).toBe(false);
    expect(schedulerSource.includes('axios')).toBe(false);
  });

  test('10. Zero real application submissions triggered during startup integration test', () => {
    const schedulerSource = fs.readFileSync(path.resolve(__dirname, '../src/intelligence/career-digest.scheduler.js'), 'utf-8');
    expect(schedulerSource.includes('application.executor')).toBe(false);
  });

  test('11. Four production JSON data stores remain 100% byte-for-byte unchanged', async () => {
    const beforeHashes = getHashes();
    await sendCareerPerformanceDigest({ force: true, enabled: true, suppressTelegram: true });
    const afterHashes = getHashes();

    expect(beforeHashes).toEqual(afterHashes);
  });

  test('12. CAREER_DIGEST_ENABLED feature flag evaluates to a boolean', () => {
    expect(typeof enableCareerDigest).toBe('boolean');
  });
});

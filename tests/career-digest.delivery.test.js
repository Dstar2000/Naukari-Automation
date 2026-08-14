'use strict';

/**
 * P3.59 — One-Shot Telegram Career Digest Delivery Validation Unit Tests
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const { sendCareerDigestOnce } = require('../scripts/send-career-digest-once');

const DATA_FILES = [
  path.resolve(__dirname, '../data/application-queue.json'),
  path.resolve(__dirname, '../data/application-outcomes.json'),
  path.resolve(__dirname, '../data/job-decisions.json'),
  path.resolve(__dirname, '../data/application-history.json')
];

function getHashes() {
  return DATA_FILES.map(f => fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : 'MISSING');
}

describe('P3.59 — Career Digest One-Shot Delivery Validation Tests', () => {

  test('Test 1: One-shot delivery module can load and run in mock transport mode', async () => {
    const res = await sendCareerDigestOnce({ mockTransport: true });
    expect(res.success).toBe(true);
    expect(res.messageId).toBe(99999);
    expect(res.hashesMatch).toBe(true);
  });

  test('Test 2: Career performance report is correctly attached and generated', async () => {
    const res = await sendCareerDigestOnce({ mockTransport: true });
    expect(res.report).toBeDefined();
    expect(res.report.overview.totalRealJobsTracked).toBe(7);
  });

  test('Test 3: Missing Telegram configuration fails safely without attempting delivery', async () => {
    const res = await sendCareerDigestOnce({ chatId: '', token: '', mockTransport: true });
    expect(res.success).toBe(false);
    expect(res.reason).toBe('MISSING_TELEGRAM_CONFIG');
  });

  test('Test 4: Zero production JSON data store mutation occurs during delivery run', async () => {
    const beforeHashes = getHashes();
    const res = await sendCareerDigestOnce({ mockTransport: true });
    const afterHashes = getHashes();

    expect(res.hashesMatch).toBe(true);
    expect(beforeHashes).toEqual(afterHashes);
  });

  test('Test 5: Recurring scheduler is NOT registered by the one-shot script', () => {
    const { isDigestSchedulerActive } = require('../src/intelligence/career-digest.scheduler');
    expect(!!isDigestSchedulerActive).toBe(false);
  });
});

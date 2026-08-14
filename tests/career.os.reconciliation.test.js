'use strict';

/**
 * P3.48 — Submitted Application Lifecycle Reconciliation Tests
 */

const fs   = require('fs');
const path = require('path');

const { reconcileExternalApplicationState } = require('../src/tracking/application.persistence');
const { processApplication, isAlreadyApplied } = require('../src/naukri/application.executor');

const TEST_DIR = path.resolve(__dirname, 'tmp_reconciliation_test_data');

function setupTestDir() {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('P3.48 — Submitted Application Reconciliation Tests', () => {
  beforeEach(() => {
    setupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  test('Test 1: The Glove SUBMITTED -> EXTERNAL_APPLICATION_REQUIRED reconciliation updates queue & outcomes', () => {
    const queueFile = path.join(TEST_DIR, 'application-queue.json');
    const outcomesFile = path.join(TEST_DIR, 'application-outcomes.json');
    const targetUrl = 'https://www.naukri.com/job-listings-mern-stack-developer-the-glove-bengaluru-india-3-to-8-years-110826030677';

    const queueData = [
      { jobId: 'be6497dbdc', company: 'The Glove', role: 'Mern Stack Developer', jobUrl: targetUrl, status: 'SUBMITTED', applyType: 'EASY_APPLY' }
    ];
    const outcomesData = [
      { jobId: 'be6497dbdc', company: 'The Glove', role: 'Mern Stack Developer', jobUrl: targetUrl, currentStatus: 'SUBMITTED', status: 'SUBMITTED', history: [] }
    ];

    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');
    fs.writeFileSync(outcomesFile, JSON.stringify(outcomesData, null, 2), 'utf-8');

    const res = reconcileExternalApplicationState(targetUrl, {
      queuePath: queueFile,
      outcomesPath: outcomesFile,
      externalUrl: 'https://theglove.ezrecruit.ai/apply/8Rf01qXvn9v5',
      reason: 'EXTERNAL_APPLY_HERE_URL_DETECTED: https://theglove.ezrecruit.ai/apply/8Rf01qXvn9v5'
    });

    expect(res.success).toBe(true);
    expect(res.updatedStatus).toBe('EXTERNAL_APPLICATION_REQUIRED');

    const updatedQueue = JSON.parse(fs.readFileSync(queueFile, 'utf-8'))[0];
    expect(updatedQueue.status).toBe('EXTERNAL_APPLICATION_REQUIRED');
    expect(updatedQueue.applyType).toBe('EXTERNAL_APPLICATION_REQUIRED');
    expect(updatedQueue.externalUrl).toBe('https://theglove.ezrecruit.ai/apply/8Rf01qXvn9v5');

    const updatedOutcomes = JSON.parse(fs.readFileSync(outcomesFile, 'utf-8'))[0];
    expect(updatedOutcomes.currentStatus).toBe('EXTERNAL_APPLICATION_REQUIRED');
    expect(updatedOutcomes.history.some((h) => h.status === 'EXTERNAL_APPLICATION_REQUIRED')).toBe(true);
  });

  test('Test 2: The Glove is not executable after reconciliation', () => {
    const reconciledJob = {
      jobId: 'be6497dbdc',
      company: 'The Glove',
      title: 'Mern Stack Developer',
      jobUrl: 'https://www.naukri.com/job-listings-mern-stack-developer-the-glove-bengaluru-india-3-to-8-years-110826030677',
      status: 'EXTERNAL_APPLICATION_REQUIRED',
      applyType: 'EXTERNAL_APPLICATION_REQUIRED'
    };

    expect(isAlreadyApplied(reconciledJob)).toBe(true);
  });

  test('Test 3: Original Naukri jobUrl remains byte-for-byte unchanged after reconciliation', () => {
    const originalUrl = 'https://www.naukri.com/job-listings-mern-stack-developer-the-glove-bengaluru-india-3-to-8-years-110826030677';
    const queueFile = path.join(TEST_DIR, 'application-queue.json');
    fs.writeFileSync(queueFile, JSON.stringify([{ jobId: 'be6497dbdc', company: 'The Glove', jobUrl: originalUrl, status: 'SUBMITTED' }], null, 2), 'utf-8');

    reconcileExternalApplicationState(originalUrl, { queuePath: queueFile });

    const item = JSON.parse(fs.readFileSync(queueFile, 'utf-8'))[0];
    expect(item.jobUrl).toBe(originalUrl);
  });

  test('Test 4: Jobaaj remains SUBMITTED and VERIFIED_APPLIED during reconciliation', () => {
    const queueFile = path.join(TEST_DIR, 'application-queue.json');
    const jobaajUrl = 'https://www.naukri.com/job-listings-software-developer-mern-stack-jobaaj-com-hyderabad-pune-bengaluru-0-to-1-years-110826040389';

    const queueData = [
      { jobId: '1ad3e0d369', company: 'jobaaj', role: 'Software Developer MERN Stack', jobUrl: jobaajUrl, status: 'SUBMITTED', verificationStatus: 'VERIFIED_APPLIED' },
      { jobId: 'be6497dbdc', company: 'The Glove', role: 'Mern Stack Developer', jobUrl: 'https://www.naukri.com/job-listings-mern-stack-developer-the-glove-110826030677', status: 'SUBMITTED' }
    ];
    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');

    // Reconcile ONLY The Glove
    reconcileExternalApplicationState('be6497dbdc', { queuePath: queueFile });

    const queue = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
    const jobaaj = queue.find((q) => q.jobId === '1ad3e0d369');
    expect(jobaaj.status).toBe('SUBMITTED');
    expect(jobaaj.verificationStatus).toBe('VERIFIED_APPLIED');
  });

  test('Test 5: A genuinely queued EASY_APPLY job remains QUEUED during reconciliation', () => {
    const queueFile = path.join(TEST_DIR, 'application-queue.json');
    const easyJobUrl = 'https://www.naukri.com/job-listings-react-js-developer-infosys-120826000299';

    const queueData = [
      { jobId: '374dac9a8c', company: 'Infosys', role: 'React JS Developer', jobUrl: easyJobUrl, status: 'QUEUED', applyType: 'EASY_APPLY' },
      { jobId: 'be6497dbdc', company: 'The Glove', role: 'Mern Stack Developer', jobUrl: 'https://www.naukri.com/job-listings-mern-stack-developer-the-glove-110826030677', status: 'SUBMITTED' }
    ];
    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');

    reconcileExternalApplicationState('be6497dbdc', { queuePath: queueFile });

    const queue = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
    const infosys = queue.find((q) => q.jobId === '374dac9a8c');
    expect(infosys.status).toBe('QUEUED');
    expect(infosys.applyType).toBe('EASY_APPLY');
  });

  test('Test 6: EXTERNAL_APPLICATION_REQUIRED never reaches Playwright final submission', async () => {
    const externalJob = {
      jobId: 'ext_safety_001',
      company: 'External Corp Safety Test',
      role: 'Full Stack Engineer',
      applyType: 'EXTERNAL_APPLICATION_REQUIRED',
      status: 'EXTERNAL_APPLICATION_REQUIRED',
      jobUrl: 'https://www.naukri.com/job-listings-ext-safety-001'
    };

    const result = await processApplication(externalJob);
    expect(result.status).toBe('MANUAL_REQUIRED');
    expect(result.reason).toBeDefined();
  });

  test('Test 7: Reconciliation is idempotent and does not duplicate history records', () => {
    const outcomesFile = path.join(TEST_DIR, 'application-outcomes.json');
    const targetUrl = 'https://www.naukri.com/job-listings-mern-stack-developer-the-glove-110826030677';

    const outcomesData = [
      { jobId: 'be6497dbdc', company: 'The Glove', jobUrl: targetUrl, currentStatus: 'SUBMITTED', status: 'SUBMITTED', history: [] }
    ];
    fs.writeFileSync(outcomesFile, JSON.stringify(outcomesData, null, 2), 'utf-8');

    // Run 1
    reconcileExternalApplicationState(targetUrl, { outcomesPath: outcomesFile });
    // Run 2 (Idempotency check)
    reconcileExternalApplicationState(targetUrl, { outcomesPath: outcomesFile });

    const outcomes = JSON.parse(fs.readFileSync(outcomesFile, 'utf-8'));
    const hist = outcomes[0].history.filter((h) => h.status === 'EXTERNAL_APPLICATION_REQUIRED');
    expect(hist.length).toBe(1);
  });
});

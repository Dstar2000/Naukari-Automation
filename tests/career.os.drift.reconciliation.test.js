'use strict';

/**
 * P3.51 — Live Apply-Type Drift & Queue Reconciliation Unit/Integration Tests
 */

const fs   = require('fs');
const path = require('path');

const { reconcileExternalApplicationState } = require('../src/tracking/application.persistence');
const { processApplication, isAlreadyApplied } = require('../src/naukri/application.executor');
const { validateJobUrl }              = require('../src/naukri/job.url.validator');

const TEST_DIR = path.resolve(__dirname, 'tmp_drift_test_data');

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

describe('P3.51 — Live Apply-Type Drift & Queue Reconciliation Tests', () => {
  beforeEach(() => {
    setupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  test('Test 1: Vbeyond Corporation 57f713042c drift reconciliation updates queue and outcomes', () => {
    const queueFile = path.join(TEST_DIR, 'application-queue.json');
    const outcomesFile = path.join(TEST_DIR, 'application-outcomes.json');
    const vbeyondUrl = 'https://www.naukri.com/job-listings-mern-stack-developer-vbeyond-corporation-bengaluru-india-3-to-8-years-110826030691';

    const queueData = [
      { jobId: '57f713042c', company: 'Vbeyond Corporation', role: 'Mern Stack Developer', jobUrl: vbeyondUrl, status: 'QUEUED', applyType: 'EASY_APPLY' }
    ];
    const outcomesData = [
      { jobId: '57f713042c', company: 'Vbeyond Corporation', role: 'Mern Stack Developer', jobUrl: vbeyondUrl, currentStatus: 'QUEUED', status: 'QUEUED', applyType: 'EASY_APPLY', history: [] }
    ];

    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');
    fs.writeFileSync(outcomesFile, JSON.stringify(outcomesData, null, 2), 'utf-8');

    const res = reconcileExternalApplicationState('57f713042c', {
      queuePath: queueFile,
      outcomesPath: outcomesFile,
      reason: 'Live DOM audit detected external recruitment URL'
    });

    expect(res.success).toBe(true);
    expect(res.updatedStatus).toBe('EXTERNAL_APPLICATION_REQUIRED');

    const updatedQueue = JSON.parse(fs.readFileSync(queueFile, 'utf-8'))[0];
    expect(updatedQueue.status).toBe('EXTERNAL_APPLICATION_REQUIRED');
    expect(updatedQueue.applyType).toBe('EXTERNAL_APPLICATION_REQUIRED');

    const updatedOutcomes = JSON.parse(fs.readFileSync(outcomesFile, 'utf-8'))[0];
    expect(updatedOutcomes.currentStatus).toBe('EXTERNAL_APPLICATION_REQUIRED');
  });

  test('Test 2: Sixsigma, Infosys, and Nasu Group drift reconciliation to EXTERNAL_APPLICATION_REQUIRED', () => {
    const queueFile = path.join(TEST_DIR, 'application-queue.json');
    const queueData = [
      { jobId: 'b00c6b8697', company: 'Sixsigma Technosoft', jobUrl: 'https://www.naukri.com/job-listings-sixsigma-b00c6b8697', status: 'QUEUED', applyType: 'EASY_APPLY' },
      { jobId: '374dac9a8c', company: 'Infosys', jobUrl: 'https://www.naukri.com/job-listings-infosys-374dac9a8c', status: 'QUEUED', applyType: 'EASY_APPLY' },
      { jobId: 'abcf6c3be6', company: 'Nasu Group', jobUrl: 'https://www.naukri.com/job-listings-nasu-abcf6c3be6', status: 'QUEUED', applyType: 'EASY_APPLY' }
    ];
    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');

    ['b00c6b8697', '374dac9a8c', 'abcf6c3be6'].forEach((id) => {
      reconcileExternalApplicationState(id, { queuePath: queueFile });
    });

    const updated = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
    updated.forEach((q) => {
      expect(q.status).toBe('EXTERNAL_APPLICATION_REQUIRED');
      expect(q.applyType).toBe('EXTERNAL_APPLICATION_REQUIRED');
    });
  });

  test('Test 3: Jobaaj VERIFIED_APPLIED state remains protected', () => {
    const jobaaj = {
      jobId: '1ad3e0d369',
      company: 'jobaaj',
      title: 'Software Developer MERN Stack',
      jobUrl: 'https://www.naukri.com/job-listings-software-developer-mern-stack-jobaaj-com-hyderabad-pune-bengaluru-0-to-1-years-110826040389',
      status: 'SUBMITTED',
      verificationStatus: 'VERIFIED_APPLIED'
    };

    expect(isAlreadyApplied(jobaaj)).toBe(true);
    expect(jobaaj.verificationStatus).toBe('VERIFIED_APPLIED');
  });

  test('Test 4: The Glove EXTERNAL_APPLICATION_REQUIRED state remains protected', () => {
    const glove = {
      jobId: 'be6497dbdc',
      company: 'The Glove',
      title: 'Mern Stack Developer',
      jobUrl: 'https://www.naukri.com/job-listings-mern-stack-developer-the-glove-bengaluru-india-3-to-8-years-110826030677',
      applyType: 'EXTERNAL_APPLICATION_REQUIRED',
      status: 'EXTERNAL_APPLICATION_REQUIRED'
    };

    expect(isAlreadyApplied(glove)).toBe(true);
    expect(glove.status).toBe('EXTERNAL_APPLICATION_REQUIRED');
  });

  test('Test 5: Original Naukri job URLs remain 100% byte-for-byte unchanged', () => {
    const targetUrl = 'https://www.naukri.com/job-listings-mern-stack-developer-vbeyond-corporation-bengaluru-india-3-to-8-years-110826030691';
    const queueFile = path.join(TEST_DIR, 'application-queue.json');
    fs.writeFileSync(queueFile, JSON.stringify([{ jobId: '57f713042c', company: 'Vbeyond', jobUrl: targetUrl, status: 'QUEUED' }], null, 2), 'utf-8');

    reconcileExternalApplicationState('57f713042c', { queuePath: queueFile });

    const item = JSON.parse(fs.readFileSync(queueFile, 'utf-8'))[0];
    expect(item.jobUrl).toBe(targetUrl);
    expect(validateJobUrl(item).valid).toBe(true);
  });

  test('Test 6: Reconciled external jobs return MANUAL_REQUIRED and cannot be autonomously submitted', async () => {
    const reconciledJob = {
      jobId: '57f713042c',
      company: 'Vbeyond Corporation Test',
      role: 'Mern Stack Developer',
      jobUrl: 'https://www.naukri.com/job-listings-vbeyond-57f713042c',
      applyType: 'EXTERNAL_APPLICATION_REQUIRED',
      status: 'EXTERNAL_APPLICATION_REQUIRED'
    };

    const res = await processApplication(reconciledJob);
    expect(res.status).toBe('MANUAL_REQUIRED');
  });

  test('Test 7: Drift reconciliation is idempotent', () => {
    const queueFile = path.join(TEST_DIR, 'application-queue.json');
    const queueData = [{ jobId: '57f713042c', company: 'Vbeyond Corporation', jobUrl: 'https://www.naukri.com/job-listings-vbeyond-57f713042c', status: 'QUEUED' }];
    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');

    reconcileExternalApplicationState('57f713042c', { queuePath: queueFile });
    reconcileExternalApplicationState('57f713042c', { queuePath: queueFile });

    const queue = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
    expect(queue.length).toBe(1);
    expect(queue[0].status).toBe('EXTERNAL_APPLICATION_REQUIRED');
  });
});

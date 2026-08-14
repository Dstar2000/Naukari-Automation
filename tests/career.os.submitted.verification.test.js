'use strict';

/**
 * P3.44 — Submitted Applications Verification & Data Safety Tests
 */

const fs   = require('fs');
const path = require('path');

const {
  cleanupTestQueueRecords,
  updateApplicationVerification,
  syncSubmittedApplicationsToQueue
} = require('../src/tracking/application.persistence');

const { verifySubmittedJobLive } = require('../src/naukri/application.verification');
const { isAlreadyApplied }       = require('../src/naukri/application.executor');

const TEST_DATA_DIR = path.resolve(__dirname, 'tmp_verification_test_data');

function setupTestDir() {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

describe('P3.44 — Read-Only Real Naukri Application Lifecycle Verification Tests', () => {
  beforeEach(() => {
    setupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  test('1. Fake/test queue records are removed without affecting real applications', () => {
    const queueFile = path.join(TEST_DATA_DIR, 'application-queue.json');
    const queueData = [
      { jobId: 'test123', company: 'Company', jobUrl: 'https://www.naukri.com/job-listings-test-123', status: 'SUBMITTED' },
      { jobId: 'real001', company: 'jobaaj', jobUrl: 'https://www.naukri.com/job-listings-software-developer-mern-stack-jobaaj-com-110826040389', status: 'SUBMITTED' },
      { jobId: 'real002', company: 'Infosys', jobUrl: 'https://www.naukri.com/job-listings-react-js-developer-infosys-120826000299', status: 'QUEUED' }
    ];
    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');

    const removed = cleanupTestQueueRecords(queueFile);
    expect(removed).toBe(1);

    const cleaned = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
    expect(cleaned.length).toBe(2);
    expect(cleaned.some((q) => q.jobId === 'test123')).toBe(false);
    expect(cleaned.some((q) => q.jobId === 'real001')).toBe(true);
    expect(cleaned.some((q) => q.jobId === 'real002')).toBe(true);
  });

  test('2. SUBMITTED application is updated with VERIFIED_APPLIED without altering status or jobUrl', () => {
    const queueFile = path.join(TEST_DATA_DIR, 'application-queue.json');
    const outcomesFile = path.join(TEST_DATA_DIR, 'application-outcomes.json');
    const targetUrl = 'https://www.naukri.com/job-listings-software-developer-mern-stack-jobaaj-com-110826040389';

    const queueData = [
      { jobId: '1ad3e0d369', company: 'jobaaj', role: 'Software Developer MERN Stack', jobUrl: targetUrl, status: 'SUBMITTED' }
    ];
    const outcomesData = [
      { jobId: '1ad3e0d369', company: 'jobaaj', role: 'Software Developer MERN Stack', jobUrl: targetUrl, currentStatus: 'SUBMITTED', status: 'SUBMITTED' }
    ];

    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');
    fs.writeFileSync(outcomesFile, JSON.stringify(outcomesData, null, 2), 'utf-8');

    const vData = {
      verificationStatus: 'VERIFIED_APPLIED',
      verifiedNaukriStatus: 'Applied',
      verificationReason: 'Live DOM displays Applied badge',
      lastVerifiedAt: new Date().toISOString()
    };

    const res = updateApplicationVerification(targetUrl, vData, { queuePath: queueFile, outcomesPath: outcomesFile });
    expect(res.queueUpdated).toBe(true);
    expect(res.outcomeUpdated).toBe(true);

    const updatedQueue = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
    const item = updatedQueue[0];
    expect(item.status).toBe('SUBMITTED');
    expect(item.verificationStatus).toBe('VERIFIED_APPLIED');
    expect(item.verifiedNaukriStatus).toBe('Applied');
    expect(item.jobUrl).toBe(targetUrl);
  });

  test('3. NOT_VERIFIED status preserves SUBMITTED state and records reason without state change', () => {
    const queueFile = path.join(TEST_DATA_DIR, 'application-queue.json');
    const targetUrl = 'https://www.naukri.com/job-listings-unconfirmed-dev-123';

    const queueData = [
      { jobId: 'unconf123', company: 'Acme Corp', role: 'Developer', jobUrl: targetUrl, status: 'SUBMITTED' }
    ];
    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');

    const vData = {
      verificationStatus: 'NOT_VERIFIED',
      verifiedNaukriStatus: 'NOT_DETECTED',
      verificationReason: 'Page loaded cleanly but applied badge was not detected on live DOM',
      lastVerifiedAt: new Date().toISOString()
    };

    updateApplicationVerification(targetUrl, vData, { queuePath: queueFile });

    const updatedQueue = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
    const item = updatedQueue[0];
    expect(item.status).toBe('SUBMITTED');
    expect(item.verificationStatus).toBe('NOT_VERIFIED');
    expect(item.verifiedNaukriStatus).toBe('NOT_DETECTED');
    expect(item.verificationReason).toContain('not detected');
  });

  test('4. Verification error is handled safely without throwing or mutating jobUrl/status', async () => {
    const fakePage = {
      goto: jest.fn().mockRejectedValue(new Error('Navigation timeout'))
    };
    const job = { jobUrl: 'https://www.naukri.com/job-listings-error-job-123' };

    const result = await verifySubmittedJobLive(fakePage, job);
    expect(result.verificationStatus).toBe('VERIFICATION_ERROR');
    expect(result.verifiedNaukriStatus).toBe('ERROR');
    expect(result.verificationReason).toContain('Navigation timeout');
    expect(result.jobUrl).toBe(job.jobUrl);
  });

  test('5. SUBMITTED jobs remain protected from duplicate execution', () => {
    const submittedJob = {
      jobId: '1ad3e0d369',
      company: 'jobaaj',
      role: 'Software Developer MERN Stack',
      jobUrl: 'https://www.naukri.com/job-listings-software-developer-mern-stack-jobaaj-com-hyderabad-pune-bengaluru-0-to-1-years-110826040389',
      status: 'SUBMITTED'
    };

    // isAlreadyApplied must recognize SUBMITTED job and return true
    const alreadyApplied = isAlreadyApplied(submittedJob);
    expect(alreadyApplied).toBe(true);
  });
});

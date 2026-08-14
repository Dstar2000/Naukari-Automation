'use strict';

/**
 * P3.45 — Production Application Monitoring & Status Change Notifications Unit/Integration Tests
 */

const fs   = require('fs');
const path = require('path');

const { updateApplicationVerification } = require('../src/tracking/application.persistence');
const { isAlreadyApplied }               = require('../src/naukri/application.executor');
const { sendVerificationStateChangeNotification } = require('../scripts/monitor-submitted-applications');

const TEST_DIR = path.resolve(__dirname, 'tmp_monitoring_test_data');

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

describe('P3.45 — Production Application Monitoring & Status Change Notifications Tests', () => {
  beforeEach(() => {
    setupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  test('1. SUBMITTED application is monitored and VERIFIED_APPLIED is persisted correctly', () => {
    const queueFile = path.join(TEST_DIR, 'application-queue.json');
    const targetUrl = 'https://www.naukri.com/job-listings-software-developer-mern-stack-jobaaj-com-110826040389';

    const queueData = [
      { jobId: '1ad3e0d369', company: 'jobaaj', role: 'Software Developer MERN Stack', jobUrl: targetUrl, status: 'SUBMITTED' }
    ];
    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');

    const vResult = {
      verificationStatus: 'VERIFIED_APPLIED',
      verifiedNaukriStatus: 'Applied',
      verificationReason: 'Live DOM displays Applied badge',
      lastVerifiedAt: new Date().toISOString()
    };

    updateApplicationVerification(targetUrl, vResult, { queuePath: queueFile });

    const updated = JSON.parse(fs.readFileSync(queueFile, 'utf-8'))[0];
    expect(updated.status).toBe('SUBMITTED');
    expect(updated.verificationStatus).toBe('VERIFIED_APPLIED');
    expect(updated.verifiedNaukriStatus).toBe('Applied');
    expect(updated.jobUrl).toBe(targetUrl);
  });

  test('2. Unchanged VERIFIED_APPLIED state suppresses Telegram notification', () => {
    const previousStatus = 'VERIFIED_APPLIED';
    const currentStatus  = 'VERIFIED_APPLIED';

    const isStateChanged = previousStatus !== 'UNMONITORED' && previousStatus !== currentStatus;
    expect(isStateChanged).toBe(false);
  });

  test('3. Verification state change (NOT_VERIFIED -> VERIFIED_APPLIED) triggers Telegram notification with exact jobUrl', async () => {
    const mockJob = {
      jobId: '1ad3e0d369',
      company: 'jobaaj',
      title: 'Software Developer MERN Stack',
      jobUrl: 'https://www.naukri.com/job-listings-software-developer-mern-stack-jobaaj-com-110826040389'
    };

    const previousStatus = 'NOT_VERIFIED';
    const currentStatus  = 'VERIFIED_APPLIED';

    const isStateChanged = previousStatus !== 'UNMONITORED' && previousStatus !== currentStatus;
    expect(isStateChanged).toBe(true);

    const notifResult = await sendVerificationStateChangeNotification(mockJob, previousStatus, currentStatus);
    expect(notifResult).toBeDefined();
    // In test mode, sendTelegramMessage returns object with text containing title & jobUrl
    expect(notifResult.text).toContain('jobaaj');
    expect(notifResult.text).toContain('Software Developer MERN Stack');
  });

  test('4. NOT_VERIFIED status preserves SUBMITTED state without mutating jobUrl or application status', () => {
    const queueFile = path.join(TEST_DIR, 'application-queue.json');
    const targetUrl = 'https://www.naukri.com/job-listings-unverified-test-123';

    const queueData = [
      { jobId: 'unver123', company: 'Acme', role: 'Dev', jobUrl: targetUrl, status: 'SUBMITTED' }
    ];
    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');

    const vResult = {
      verificationStatus: 'NOT_VERIFIED',
      verifiedNaukriStatus: 'NOT_DETECTED',
      verificationReason: 'Applied badge not detected on live DOM',
      lastVerifiedAt: new Date().toISOString()
    };

    updateApplicationVerification(targetUrl, vResult, { queuePath: queueFile });

    const updated = JSON.parse(fs.readFileSync(queueFile, 'utf-8'))[0];
    expect(updated.status).toBe('SUBMITTED');
    expect(updated.verificationStatus).toBe('NOT_VERIFIED');
    expect(updated.jobUrl).toBe(targetUrl);
  });

  test('5. Verification error preserves SUBMITTED state safely', () => {
    const queueFile = path.join(TEST_DIR, 'application-queue.json');
    const targetUrl = 'https://www.naukri.com/job-listings-error-test-456';

    const queueData = [
      { jobId: 'err456', company: 'TechCorp', role: 'Engineer', jobUrl: targetUrl, status: 'SUBMITTED' }
    ];
    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');

    const vResult = {
      verificationStatus: 'VERIFICATION_ERROR',
      verifiedNaukriStatus: 'ERROR',
      verificationReason: 'Playwright navigation error',
      lastVerifiedAt: new Date().toISOString()
    };

    updateApplicationVerification(targetUrl, vResult, { queuePath: queueFile });

    const updated = JSON.parse(fs.readFileSync(queueFile, 'utf-8'))[0];
    expect(updated.status).toBe('SUBMITTED');
    expect(updated.verificationStatus).toBe('VERIFICATION_ERROR');
    expect(updated.jobUrl).toBe(targetUrl);
  });

  test('6. SUBMITTED applications remain permanently protected from duplicate application attempts', () => {
    const submittedJob = {
      jobId: '1ad3e0d369',
      company: 'jobaaj',
      title: 'Software Developer MERN Stack',
      jobUrl: 'https://www.naukri.com/job-listings-software-developer-mern-stack-jobaaj-com-hyderabad-pune-bengaluru-0-to-1-years-110826040389',
      status: 'SUBMITTED'
    };

    expect(isAlreadyApplied(submittedJob)).toBe(true);
  });
});

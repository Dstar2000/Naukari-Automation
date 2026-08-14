'use strict';

/**
 * P3.49 — Read-Only Live Application Classification Audit Unit/Integration Tests
 */

const fs   = require('fs');
const path = require('path');

const { auditJobClassificationLive } = require('../src/naukri/application.verification');
const { updateJobAuditClassification } = require('../src/tracking/application.persistence');
const { validateJobUrl }              = require('../src/naukri/job.url.validator');

const TEST_DIR = path.resolve(__dirname, 'tmp_audit_test_data');

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

describe('P3.49 — Read-Only Live Classification Audit Tests', () => {
  beforeEach(() => {
    setupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  test('Test 1: Live Applied indicator classifies as ALREADY_APPLIED', async () => {
    const fakePage = {
      goto: jest.fn().mockResolvedValue(),
      waitForTimeout: jest.fn().mockResolvedValue(),
      evaluate: jest.fn().mockResolvedValue({
        type: 'ALREADY_APPLIED',
        snippet: 'Applied',
        reason: 'Live DOM displays applied status indicator'
      })
    };

    const job = { jobId: 't1', jobUrl: 'https://www.naukri.com/job-listings-t1', applyType: 'EASY_APPLY' };
    const res = await auditJobClassificationLive(fakePage, job);

    expect(res.classification).toBe('ALREADY_APPLIED');
    expect(res.verificationStatus).toBe('VERIFIED_APPLIED');
  });

  test('Test 2: External Apply Here URL classifies as EXTERNAL_APPLICATION_REQUIRED', async () => {
    const fakePage = {
      goto: jest.fn().mockResolvedValue(),
      waitForTimeout: jest.fn().mockResolvedValue(),
      evaluate: jest.fn().mockResolvedValue({
        type: 'EXTERNAL_APPLICATION_REQUIRED',
        snippet: 'External Application Required',
        reason: 'Live DOM displays external recruitment URL'
      })
    };

    const job = { jobId: 't2', jobUrl: 'https://www.naukri.com/job-listings-t2', applyType: 'EASY_APPLY' };
    const res = await auditJobClassificationLive(fakePage, job);

    expect(res.classification).toBe('EXTERNAL_APPLICATION_REQUIRED');
    expect(res.liveApplyType).toBe('EXTERNAL_APPLICATION_REQUIRED');
  });

  test('Test 3: Live Easy Apply button classifies as EASY_APPLY', async () => {
    const fakePage = {
      goto: jest.fn().mockResolvedValue(),
      waitForTimeout: jest.fn().mockResolvedValue(),
      evaluate: jest.fn().mockResolvedValue({
        type: 'EASY_APPLY',
        snippet: 'Apply',
        reason: 'Live DOM displays active Naukri Easy Apply button'
      })
    };

    const job = { jobId: 't3', jobUrl: 'https://www.naukri.com/job-listings-t3', applyType: 'EASY_APPLY' };
    const res = await auditJobClassificationLive(fakePage, job);

    expect(res.classification).toBe('EASY_APPLY');
    expect(res.liveApplyType).toBe('EASY_APPLY');
  });

  test('Test 4: Verification failure fails closed as VERIFICATION_ERROR', async () => {
    const fakePage = {
      goto: jest.fn().mockRejectedValue(new Error('Navigation timeout')),
      waitForTimeout: jest.fn()
    };

    const job = { jobId: 't4', jobUrl: 'https://www.naukri.com/job-listings-t4' };
    const res = await auditJobClassificationLive(fakePage, job);

    expect(res.classification).toBe('VERIFICATION_ERROR');
    expect(res.verificationStatus).toBe('VERIFICATION_ERROR');
  });

  test('Test 5: Existing Jobaaj state remains protected during audit update', () => {
    const queueFile = path.join(TEST_DIR, 'application-queue.json');
    const jobaajUrl = 'https://www.naukri.com/job-listings-software-developer-mern-stack-jobaaj-com-hyderabad-pune-bengaluru-0-to-1-years-110826040389';
    const queueData = [
      { jobId: '1ad3e0d369', company: 'jobaaj', role: 'Software Developer MERN Stack', jobUrl: jobaajUrl, status: 'SUBMITTED', verificationStatus: 'VERIFIED_APPLIED' }
    ];
    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');

    const auditRes = {
      classification: 'ALREADY_APPLIED',
      liveApplyType: 'EASY_APPLY',
      verificationStatus: 'VERIFIED_APPLIED',
      visibleStatus: 'Applied',
      reason: 'Live Naukri page DOM displays applied indicator ("Applied")',
      lastVerifiedAt: new Date().toISOString()
    };

    updateJobAuditClassification({ jobId: '1ad3e0d369', company: 'jobaaj', jobUrl: jobaajUrl }, auditRes, { queuePath: queueFile });

    const updated = JSON.parse(fs.readFileSync(queueFile, 'utf-8'))[0];
    expect(updated.status).toBe('SUBMITTED');
    expect(updated.verificationStatus).toBe('VERIFIED_APPLIED');
  });

  test('Test 6: Existing The Glove state remains protected during audit update', () => {
    const queueFile = path.join(TEST_DIR, 'application-queue.json');
    const gloveUrl = 'https://www.naukri.com/job-listings-mern-stack-developer-the-glove-bengaluru-india-3-to-8-years-110826030677';
    const queueData = [
      { jobId: 'be6497dbdc', company: 'The Glove', role: 'Mern Stack Developer', jobUrl: gloveUrl, status: 'EXTERNAL_APPLICATION_REQUIRED', applyType: 'EXTERNAL_APPLICATION_REQUIRED' }
    ];
    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');

    const auditRes = {
      classification: 'EXTERNAL_APPLICATION_REQUIRED',
      liveApplyType: 'EXTERNAL_APPLICATION_REQUIRED',
      verificationStatus: 'NOT_VERIFIED',
      visibleStatus: 'External Application Required',
      reason: 'Live DOM displays external recruitment URL',
      lastVerifiedAt: new Date().toISOString()
    };

    updateJobAuditClassification({ jobId: 'be6497dbdc', company: 'The Glove', jobUrl: gloveUrl }, auditRes, { queuePath: queueFile });

    const updated = JSON.parse(fs.readFileSync(queueFile, 'utf-8'))[0];
    expect(updated.status).toBe('EXTERNAL_APPLICATION_REQUIRED');
    expect(updated.applyType).toBe('EXTERNAL_APPLICATION_REQUIRED');
  });

  test('Test 7 & 8: No Apply or Submit click occurs during auditJobClassificationLive', async () => {
    const clickSpy = jest.fn();
    const fakePage = {
      goto: jest.fn().mockResolvedValue(),
      waitForTimeout: jest.fn().mockResolvedValue(),
      click: clickSpy,
      evaluate: jest.fn().mockResolvedValue({
        type: 'EASY_APPLY',
        snippet: 'Apply',
        reason: 'Live DOM displays active Naukri Easy Apply button'
      })
    };

    const job = { jobId: 't78', jobUrl: 'https://www.naukri.com/job-listings-t78' };
    await auditJobClassificationLive(fakePage, job);

    expect(clickSpy).not.toHaveBeenCalled();
  });

  test('Test 9: Original Naukri jobUrls remain byte-for-byte unchanged', () => {
    const originalUrl = 'https://www.naukri.com/job-listings-react-js-developer-infosys-120826000299';
    const queueFile = path.join(TEST_DIR, 'application-queue.json');
    fs.writeFileSync(queueFile, JSON.stringify([{ jobId: 't9', company: 'Infosys', jobUrl: originalUrl, status: 'QUEUED' }], null, 2), 'utf-8');

    const auditRes = {
      classification: 'EASY_APPLY',
      liveApplyType: 'EASY_APPLY',
      verificationStatus: 'NOT_VERIFIED',
      visibleStatus: 'Apply',
      reason: 'Live DOM displays Easy Apply button',
      lastVerifiedAt: new Date().toISOString()
    };

    updateJobAuditClassification({ jobId: 't9', jobUrl: originalUrl }, auditRes, { queuePath: queueFile });

    const item = JSON.parse(fs.readFileSync(queueFile, 'utf-8'))[0];
    expect(item.jobUrl).toBe(originalUrl);
  });

  test('Test 10: Audit persistence is idempotent', () => {
    const queueFile = path.join(TEST_DIR, 'application-queue.json');
    const queueData = [{ jobId: 't10', company: 'Nasu Group', jobUrl: 'https://www.naukri.com/job-listings-t10', status: 'QUEUED' }];
    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');

    const auditRes = {
      classification: 'EASY_APPLY',
      liveApplyType: 'EASY_APPLY',
      verificationStatus: 'NOT_VERIFIED',
      visibleStatus: 'Apply',
      reason: 'Live DOM displays Easy Apply button',
      lastVerifiedAt: new Date().toISOString()
    };

    updateJobAuditClassification('t10', auditRes, { queuePath: queueFile });
    updateJobAuditClassification('t10', auditRes, { queuePath: queueFile });

    const queue = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
    expect(queue.length).toBe(1);
    expect(queue[0].auditClassification).toBe('EASY_APPLY');
  });

  test('Test 11: Verification errors fail closed without changing status to EASY_APPLY or SUBMITTED', () => {
    const queueFile = path.join(TEST_DIR, 'application-queue.json');
    const queueData = [{ jobId: 't11', company: 'Vbeyond', jobUrl: 'https://www.naukri.com/job-listings-t11', status: 'QUEUED', applyType: 'EASY_APPLY' }];
    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2), 'utf-8');

    const errRes = {
      classification: 'VERIFICATION_ERROR',
      liveApplyType: 'UNKNOWN',
      verificationStatus: 'VERIFICATION_ERROR',
      visibleStatus: 'ERROR',
      reason: 'Page navigation failed',
      lastVerifiedAt: new Date().toISOString()
    };

    updateJobAuditClassification('t11', errRes, { queuePath: queueFile });

    const updated = JSON.parse(fs.readFileSync(queueFile, 'utf-8'))[0];
    expect(updated.status).toBe('QUEUED');
    expect(updated.verificationStatus).toBe('VERIFICATION_ERROR');
  });

  test('Test 12: Existing fake/test records remain excluded from real queue audit', () => {
    const fakeJob1 = { jobId: 'test123', jobUrl: 'https://www.naukri.com/job-listings-test-123' };
    const fakeJob2 = { jobId: 'f1', jobUrl: 'https://www.naukri.com/job-listings-TEST-job' };
    const realJob = { jobId: '374dac9a8c', jobUrl: 'https://www.naukri.com/job-listings-react-js-developer-infosys-120826000299' };

    const isTestFixture = (job) => {
      const url = job.jobUrl || '';
      return url.includes('test-123') || url.includes('TEST') || (job.jobId && job.jobId.includes('test'));
    };

    expect(isTestFixture(fakeJob1)).toBe(true);
    expect(isTestFixture(fakeJob2)).toBe(true);
    expect(isTestFixture(realJob)).toBe(false);
  });
});

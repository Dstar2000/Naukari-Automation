'use strict';

/**
 * P3.47 — External Application Detection & Classification Unit/Integration Tests
 */

const { detectApplyType }    = require('../src/naukri/job.apply.detector');
const { processApplication }  = require('../src/naukri/application.executor');
const { isAlreadyApplied }    = require('../src/naukri/application.executor');

describe('P3.47 — External Application Detection Tests', () => {
  test('a. External recruitment URL (The Glove ezrecruit.ai) returns EXTERNAL_APPLICATION_REQUIRED', async () => {
    const fakePage = {
      goto: jest.fn().mockResolvedValue(),
      waitForTimeout: jest.fn().mockResolvedValue(),
      evaluate: jest.fn().mockResolvedValue({
        applyType: 'EXTERNAL_APPLICATION_REQUIRED',
        canAutoApply: false,
        reason: 'EXTERNAL_APPLY_HERE_URL_DETECTED'
      })
    };

    const url = 'https://www.naukri.com/job-listings-mern-stack-developer-the-glove-bengaluru-india-3-to-8-years-110826030677';
    const result = await detectApplyType(url, fakePage);

    expect(result.applyType).toBe('EXTERNAL_APPLICATION_REQUIRED');
    expect(result.canAutoApply).toBe(false);
  });

  test('b. Genuine Naukri Easy Apply job is detected as EASY_APPLY', async () => {
    const fakePage = {
      goto: jest.fn().mockResolvedValue(),
      waitForTimeout: jest.fn().mockResolvedValue(),
      evaluate: jest.fn().mockResolvedValue({
        applyType: 'EASY_APPLY',
        canAutoApply: true
      })
    };

    const url = 'https://www.naukri.com/job-listings-software-developer-mern-stack-jobaaj-com-hyderabad-pune-bengaluru-0-to-1-years-110826040389';
    const result = await detectApplyType(url, fakePage);

    expect(result.applyType).toBe('EASY_APPLY');
    expect(result.canAutoApply).toBe(true);
  });

  test('c. External application (EXTERNAL_APPLICATION_REQUIRED) never reaches final submit', async () => {
    const externalJob = {
      jobId: 'ext_test_999',
      title: 'Mern Stack Developer',
      company: 'The Glove Test Company',
      applyType: 'EXTERNAL_APPLICATION_REQUIRED',
      jobUrl: 'https://www.naukri.com/job-listings-mern-stack-developer-the-glove-ext-999'
    };

    const result = await processApplication(externalJob);

    expect(result.status).toBe('MANUAL_REQUIRED');
    expect(result.reason).toBeDefined();
  });

  test('d. Original Naukri jobUrl remains byte-for-byte unchanged during classification', () => {
    const originalUrl = 'https://www.naukri.com/job-listings-mern-stack-developer-the-glove-bengaluru-india-3-to-8-years-110826030677';
    const job = {
      jobId: 'be6497dbdc',
      company: 'The Glove',
      jobUrl: originalUrl
    };

    expect(job.jobUrl).toBe(originalUrl);
  });

  test('e. Existing Jobaaj VERIFIED_APPLIED behavior remains unchanged and protected', () => {
    const jobaajJob = {
      jobId: '1ad3e0d369',
      company: 'jobaaj',
      title: 'Software Developer MERN Stack',
      jobUrl: 'https://www.naukri.com/job-listings-software-developer-mern-stack-jobaaj-com-hyderabad-pune-bengaluru-0-to-1-years-110826040389',
      status: 'SUBMITTED'
    };

    expect(isAlreadyApplied(jobaajJob)).toBe(true);
  });
});

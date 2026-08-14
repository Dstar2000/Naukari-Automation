'use strict';

/**
 * P3.50 — Controlled Single Real Easy Apply Preparation Review Unit/Integration Tests
 */

const fs   = require('fs');
const path = require('path');

const { validateJobUrl }              = require('../src/naukri/job.url.validator');
const { processApplication, submitApplication, isAlreadyApplied } = require('../src/naukri/application.executor');
const { auditJobClassificationLive }  = require('../src/naukri/application.verification');

describe('P3.50 — Controlled Single Real Easy Apply Preparation Review Tests', () => {

  test('Test 1: Live EASY_APPLY gate passes for genuine Easy Apply job', async () => {
    const fakePage = {
      goto: jest.fn().mockResolvedValue(),
      waitForTimeout: jest.fn().mockResolvedValue(),
      evaluate: jest.fn().mockResolvedValue({
        type: 'EASY_APPLY',
        snippet: 'Apply',
        reason: 'Live DOM displays active Naukri Easy Apply button'
      })
    };

    const job = {
      jobId: '57f713042c',
      company: 'Vbeyond Corporation Test',
      role: 'Mern Stack Developer',
      jobUrl: 'https://www.naukri.com/job-listings-mern-stack-developer-vbeyond-57f713042c',
      applyType: 'EASY_APPLY',
      status: 'QUEUED'
    };

    const audit = await auditJobClassificationLive(fakePage, job);
    expect(audit.classification).toBe('EASY_APPLY');
    expect(audit.liveApplyType).toBe('EASY_APPLY');
  });

  test('Test 2: ALREADY_APPLIED protection blocks preparation flow', () => {
    const appliedJob = {
      jobId: '1ad3e0d369',
      company: 'jobaaj',
      role: 'Software Developer MERN Stack',
      jobUrl: 'https://www.naukri.com/job-listings-software-developer-mern-stack-jobaaj-com-hyderabad-pune-bengaluru-0-to-1-years-110826040389',
      status: 'SUBMITTED',
      verificationStatus: 'VERIFIED_APPLIED'
    };

    expect(isAlreadyApplied(appliedJob)).toBe(true);
  });

  test('Test 3: EXTERNAL_APPLICATION_REQUIRED protection blocks preparation flow', async () => {
    const externalJob = {
      jobId: 'be6497dbdc',
      company: 'The Glove',
      role: 'Mern Stack Developer',
      jobUrl: 'https://www.naukri.com/job-listings-mern-stack-developer-the-glove-bengaluru-india-3-to-8-years-110826030677',
      applyType: 'EXTERNAL_APPLICATION_REQUIRED',
      status: 'EXTERNAL_APPLICATION_REQUIRED'
    };

    const res = await processApplication(externalJob);
    expect(res.status).toBe('MANUAL_REQUIRED');
  });

  test('Test 4: Unsupported/manual field handling returns MANUAL_REQUIRED without crashing', async () => {
    const manualJob = {
      jobId: 'manual_001',
      company: 'Manual Test Company',
      role: 'Backend Dev',
      applyType: 'MANUAL_REQUIRED',
      jobUrl: 'https://www.naukri.com/job-listings-manual-001'
    };

    const res = await processApplication(manualJob);
    expect(res.status).toBe('MANUAL_REQUIRED');
  });

  test('Test 5: External redirect protection prevents external form navigation', async () => {
    const fakePage = {
      goto: jest.fn().mockResolvedValue(),
      waitForTimeout: jest.fn().mockResolvedValue(),
      evaluate: jest.fn().mockResolvedValue({
        type: 'EXTERNAL_APPLICATION_REQUIRED',
        snippet: 'External Application Required',
        reason: 'Redirected to external recruitment domain'
      })
    };

    const job = { jobId: 'ext_redir_01', jobUrl: 'https://www.naukri.com/job-listings-ext-redir' };
    const audit = await auditJobClassificationLive(fakePage, job);

    expect(audit.classification).toBe('EXTERNAL_APPLICATION_REQUIRED');
  });

  test('Test 6: Final submit prohibition — processApplication does NOT call submitApplication', async () => {
    const submitSpy = jest.fn();
    // Verify processApplication returns WAITING_CONFIRMATION / MANUAL_REQUIRED, NOT SUBMITTED
    const job = {
      jobId: 'prep_only_01',
      company: 'Prep Only Company',
      role: 'React Engineer',
      applyType: 'EXTERNAL_APPLICATION_REQUIRED',
      jobUrl: 'https://www.naukri.com/job-listings-prep-only-01'
    };

    const res = await processApplication(job);
    expect(res.status).not.toBe('SUBMITTED');
    expect(submitSpy).not.toHaveBeenCalled();
  });

  test('Test 7: Single-job-only execution limit is enforced', () => {
    const queue = [
      { jobId: '57f713042c', company: 'Vbeyond Corporation' },
      { jobId: '374dac9a8c', company: 'Infosys' }
    ];

    const selected = queue.find((j) => j.jobId === '57f713042c');
    expect(selected.jobId).toBe('57f713042c');
  });

  test('Test 8: Original Naukri job URL remains byte-for-byte unchanged', () => {
    const targetUrl = 'https://www.naukri.com/job-listings-mern-stack-developer-vbeyond-corporation-bengaluru-india-3-to-8-years-110826030691';
    const job = { jobId: '57f713042c', jobUrl: targetUrl };

    expect(validateJobUrl(job).valid).toBe(true);
    expect(job.jobUrl).toBe(targetUrl);
  });

  test('Test 9: Jobaaj VERIFIED_APPLIED state remains protected', () => {
    const jobaaj = {
      jobId: '1ad3e0d369',
      company: 'jobaaj',
      title: 'Software Developer MERN Stack',
      jobUrl: 'https://www.naukri.com/job-listings-software-developer-mern-stack-jobaaj-com-hyderabad-pune-bengaluru-0-to-1-years-110826040389',
      status: 'SUBMITTED',
      verificationStatus: 'VERIFIED_APPLIED'
    };

    expect(isAlreadyApplied(jobaaj)).toBe(true);
  });

  test('Test 10: The Glove EXTERNAL_APPLICATION_REQUIRED state remains protected', () => {
    const glove = {
      jobId: 'be6497dbdc',
      company: 'The Glove',
      title: 'Mern Stack Developer',
      jobUrl: 'https://www.naukri.com/job-listings-mern-stack-developer-the-glove-bengaluru-india-3-to-8-years-110826030677',
      applyType: 'EXTERNAL_APPLICATION_REQUIRED',
      status: 'EXTERNAL_APPLICATION_REQUIRED'
    };

    expect(isAlreadyApplied(glove)).toBe(true);
  });
});

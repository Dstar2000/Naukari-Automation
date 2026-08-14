'use strict';

/**
 * P3.52 — Post-Reconciliation Read-Only System Integrity Validation Tests
 */

const fs   = require('fs');
const path = require('path');

const { validateJobUrl }                       = require('../src/naukri/job.url.validator');
const { processApplication, isAlreadyApplied } = require('../src/naukri/application.executor');
const { reconcileExternalApplicationState }   = require('../src/tracking/application.persistence');
const { formatJobAlertMessage }                 = require('../src/telegram/job.notifier');

const QUEUE_PATH = path.resolve(__dirname, '../data/application-queue.json');

describe('P3.52 — Post-Reconciliation System Integrity Validation Tests', () => {

  test('Test 1: External application remains blocked after reconciliation', async () => {
    const job = {
      jobId: 'be6497dbdc',
      company: 'The Glove',
      title: 'Mern Stack Developer',
      applyType: 'EXTERNAL_APPLICATION_REQUIRED',
      status: 'EXTERNAL_APPLICATION_REQUIRED',
      jobUrl: 'https://www.naukri.com/job-listings-mern-stack-developer-the-glove-bengaluru-india-3-to-8-years-110826030677'
    };

    const res = await processApplication(job);
    expect(res.status).toBe('MANUAL_REQUIRED');
  });

  test('Test 2: Already-applied remains blocked after reconciliation', () => {
    const job = {
      jobId: '1ad3e0d369',
      company: 'jobaaj',
      title: 'Software Developer MERN Stack',
      status: 'SUBMITTED',
      verificationStatus: 'VERIFIED_APPLIED'
    };

    expect(isAlreadyApplied(job)).toBe(true);
  });

  test('Test 3: Submitted status remains blocked', async () => {
    const job = {
      jobId: 'sub_test_01',
      company: 'Submitted Test Company',
      title: 'Backend Dev',
      status: 'SUBMITTED',
      jobUrl: 'https://www.naukri.com/job-listings-sub-test-01'
    };

    const res = await processApplication(job);
    expect(res.status).toBe('ALREADY_APPLIED');
  });

  test('Test 4: Verified-applied status remains blocked', () => {
    const job = {
      jobId: 'v_applied_01',
      company: 'Verified Corp',
      title: 'Full Stack Dev',
      verificationStatus: 'VERIFIED_APPLIED',
      status: 'SUBMITTED'
    };

    expect(isAlreadyApplied(job)).toBe(true);
  });

  test('Test 5: Naukri URL remains byte-for-byte immutable for all real queue records', () => {
    const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));
    const realJobs = queue.filter(q => q.jobUrl && !q.jobUrl.includes('test-123'));

    expect(realJobs.length).toBe(7);
    realJobs.forEach(job => {
      expect(validateJobUrl(job).valid).toBe(true);
      expect(job.jobUrl).toMatch(/^https:\/\/www\.naukri\.com\/job-listings-/);
      expect(job.jobUrl).not.toContain('ezrecruit.ai');
    });
  });

  test('Test 6: Zero eligible autonomous application candidates from current real queue', () => {
    const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));
    const realJobs = queue.filter(q => q.jobUrl && !q.jobUrl.includes('test-123'));

    const eligibleCandidates = realJobs.filter(job => {
      const isQueued = job.status === 'QUEUED';
      const isEasyApply = (job.applyType || 'EASY_APPLY') === 'EASY_APPLY';
      const alreadyApplied = isAlreadyApplied(job);
      return isQueued && isEasyApply && !alreadyApplied;
    });

    expect(eligibleCandidates.length).toBe(0);
  });

  test('Test 7: Notification classification formatting is truthful for EXTERNAL_APPLICATION_REQUIRED', () => {
    const externalJobMatch = {
      title: 'Mern Stack Developer',
      company: 'The Glove',
      location: 'Bengaluru',
      experience: '3-8 Yrs',
      jobUrl: 'https://www.naukri.com/job-listings-mern-stack-developer-the-glove-bengaluru-india-3-to-8-years-110826030677',
      applyType: 'EXTERNAL_APPLICATION_REQUIRED',
      matchScore: 90
    };

    const msg = formatJobAlertMessage(externalJobMatch);
    expect(msg).toContain('The Glove');
    expect(msg).toContain('requires external application');
  });

  test('Test 8: Executor / Scheduler cannot dispatch an external application', async () => {
    const externalJob = {
      jobId: '57f713042c',
      company: 'Vbeyond Corporation',
      role: 'Mern Stack Developer',
      jobUrl: 'https://www.naukri.com/job-listings-mern-stack-developer-vbeyond-corporation-bengaluru-india-3-to-8-years-110826030691',
      applyType: 'EXTERNAL_APPLICATION_REQUIRED',
      status: 'EXTERNAL_APPLICATION_REQUIRED'
    };

    const result = await processApplication(externalJob);
    expect(result.status).toBe('MANUAL_REQUIRED');
  });

  test('Test 9: Reconciliation remains idempotent', () => {
    const targetUrl = 'https://www.naukri.com/job-listings-mern-stack-developer-vbeyond-corporation-bengaluru-india-3-to-8-years-110826030691';
    
    const res1 = reconcileExternalApplicationState(targetUrl);
    const res2 = reconcileExternalApplicationState(targetUrl);

    expect(res1.updatedStatus).toBe('EXTERNAL_APPLICATION_REQUIRED');
    expect(res2.updatedStatus).toBe('EXTERNAL_APPLICATION_REQUIRED');
  });
});

const { isApplicationAlreadyEngaged, ENGAGED_STATUSES } = require('../src/tracking/application.duplicate.guard');
const { isAlreadyApplied } = require('../src/naukri/application.executor');
const { isJobDecided } = require('../src/telegram/job.approval');

describe('Unified Duplicate Application Guard', () => {
  test('1. Detects engaged job by exact jobUrl in outcomes', () => {
    const jobUrl = 'https://www.naukri.com/job-listings-mern-stack-developer-vbeyond-corporation-bengaluru-2-to-5-years-070826019309';
    const res = isApplicationAlreadyEngaged(jobUrl);
    expect(res.engaged).toBe(true);
    expect(res.status).toBe('SUBMITTED');
  });

  test('2. Detects engaged job by job object with company/role match', () => {
    const job = {
      company: 'Vbeyond Corporation',
      role: 'Mern Stack Developer',
      jobUrl: 'https://www.naukri.com/job-listings-different-url-same-role'
    };
    const res = isApplicationAlreadyEngaged(job);
    expect(res.engaged).toBe(true);
  });

  test('3. Returns false for un-engaged new job URL', () => {
    const newUrl = 'https://www.naukri.com/job-listings-brand-new-company-role-999999';
    const res = isApplicationAlreadyEngaged(newUrl);
    expect(res.engaged).toBe(false);
  });

  test('4. Executor isAlreadyApplied() uses unified guard and returns true for submitted outcome', () => {
    const job = {
      jobUrl: 'https://www.naukri.com/job-listings-mern-stack-developer-vbeyond-corporation-bengaluru-2-to-5-years-070826019309',
      company: 'Vbeyond Corporation',
      title: 'Mern Stack Developer'
    };
    expect(isAlreadyApplied(job)).toBe(true);
  });

  test('5. isJobDecided() returns true for submitted outcomes', () => {
    const jobUrl = 'https://www.naukri.com/job-listings-mern-stack-developer-vbeyond-corporation-bengaluru-2-to-5-years-070826019309';
    expect(isJobDecided(jobUrl)).toBe(true);
  });
});

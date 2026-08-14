const fs = require('fs');
const path = require('path');
const { isValidJobUrl, JOBS_DATA_PATH } = require('../src/naukri/job.discovery');

describe('Naukri Job Discovery Engine Tests', () => {
  test('Module loading: exports discoverJobs and isValidJobUrl', () => {
    const jobDiscovery = require('../src/naukri/job.discovery');
    expect(jobDiscovery).toBeDefined();
    expect(typeof jobDiscovery.discoverJobs).toBe('function');
    expect(typeof jobDiscovery.isValidJobUrl).toBe('function');
    expect(jobDiscovery.JOBS_DATA_PATH).toBeDefined();
  });

  test('URL Validation: correctly identifies valid Naukri job detail URLs', () => {
    const validUrl1 = 'https://www.naukri.com/job-listings-full-stack-developer-softreey-tech-bangalore-1-to-3-years-070826001234';
    const validUrl2 = 'https://www.naukri.com/job-listings-mern-stack-dev-company-bengaluru-0-to-2-years-123456';
    const invalidUrl1 = 'https://www.naukri.com/full-stack-developer-jobs-in-bangalore-bengaluru';
    const invalidUrl2 = 'https://www.naukri.com/nlogin/login';
    const invalidUrl3 = '';

    expect(isValidJobUrl(validUrl1)).toBe(true);
    expect(isValidJobUrl(validUrl2)).toBe(true);
    expect(isValidJobUrl(invalidUrl1)).toBe(false);
    expect(isValidJobUrl(invalidUrl2)).toBe(false);
    expect(isValidJobUrl(invalidUrl3)).toBe(false);
  });

  test('Storage format: job item schema validation', () => {
    const sampleJobSchema = {
      title: 'Full Stack Developer',
      company: 'Tech Solutions Ltd',
      location: 'Bangalore/Bengaluru',
      experience: '0-2 Yrs',
      skills: ['React.js', 'Node.js', 'Express.js'],
      postedDate: '1 Day Ago',
      jobUrl: 'https://www.naukri.com/job-listings-full-stack-dev-123'
    };

    expect(typeof sampleJobSchema.title).toBe('string');
    expect(typeof sampleJobSchema.company).toBe('string');
    expect(typeof sampleJobSchema.location).toBe('string');
    expect(typeof sampleJobSchema.experience).toBe('string');
    expect(Array.isArray(sampleJobSchema.skills)).toBe(true);
    expect(typeof sampleJobSchema.postedDate).toBe('string');
    expect(isValidJobUrl(sampleJobSchema.jobUrl)).toBe(true);
  });
});

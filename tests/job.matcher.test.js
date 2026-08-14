const { isFreshJob, calculateMatchScore, filterAndMatchJobs } = require('../src/matching/job.matcher');
const { formatJobAlertMessage } = require('../src/telegram/job.notifier');

describe('Fresh Job Matcher & Telegram Delivery Tests', () => {
  const sampleProfile = {
    personal: {
      name: 'Dileep kumar',
      location: 'Bangalore, INDIA',
      experience: '1 Year 5 Months',
      noticePeriod: 'Available to join in 15 Days or less'
    },
    headline: 'Full Stack Developer | React.js | Next.js | Node.js | Express.js | JavaScript',
    summary: 'MERN Stack Developer | Full Stack Developer',
    skills: ['React.js', 'Node.js', 'Express.js', 'JavaScript', 'MongoDB', 'MERN Stack', 'Redux', 'HTML', 'CSS'],
    careerProfile: {
      currentIndustry: 'Software Product',
      department: 'Engineering - Software & QA',
      jobRole: 'Full Stack Developer',
      preferredRoles: ['Mern Stack Developer', 'React Js Developer', 'Junior Software Developer'],
      preferredLocations: ['Bangalore/Bengaluru'],
      expectedSalary: '₹ 4,00,000'
    }
  };

  test('Freshness filtering: correctly identifies fresh vs old jobs', () => {
    expect(isFreshJob('Today')).toBe(true);
    expect(isFreshJob('Just Now')).toBe(true);
    expect(isFreshJob('Few Hours Ago')).toBe(true);
    expect(isFreshJob('1 Day Ago')).toBe(true);
    expect(isFreshJob('2 Days Ago')).toBe(true);
    expect(isFreshJob('3 Days Ago')).toBe(true);
    expect(isFreshJob('3+ Weeks Ago')).toBe(false);
    expect(isFreshJob('1 Month Ago')).toBe(false);
    expect(isFreshJob('')).toBe(false);
  });

  test('Score calculation: high compatibility job yields score >= 75', () => {
    const HighMatchJob = {
      title: 'MERN Stack Developer',
      company: 'Tech Solutions',
      location: 'Bengaluru',
      experience: '0-2 Yrs',
      skills: ['react.js', 'node.js', 'express.js', 'mongodb', 'javascript'],
      postedDate: '1 Day Ago',
      jobUrl: 'https://www.naukri.com/job-listings-mern-stack-dev-123456'
    };

    const match = calculateMatchScore(sampleProfile, HighMatchJob);
    expect(match.matchScore).toBeGreaterThanOrEqual(75);
    expect(match.jobUrl).toBe('https://www.naukri.com/job-listings-mern-stack-dev-123456');
    expect(match.matchedSkills.length).toBeGreaterThan(0);
    expect(match.reasons.length).toBeGreaterThan(0);
  });

  test('Score calculation: low compatibility job yields score < 75', () => {
    const LowMatchJob = {
      title: 'Data Analyst / Python Accountant',
      company: 'Finance Corp',
      location: 'Delhi',
      experience: '8-10 Yrs',
      skills: ['excel', 'accounting', 'tally', 'finance'],
      postedDate: '2 Days Ago',
      jobUrl: 'https://www.naukri.com/job-listings-data-analyst-789'
    };

    const match = calculateMatchScore(sampleProfile, LowMatchJob);
    expect(match.matchScore).toBeLessThan(75);
  });

  test('URL preservation: matched job preserves exact Naukri jobUrl', () => {
    const job = {
      title: 'React JS Developer',
      company: 'Innovate Labs',
      location: 'Bangalore',
      experience: '1-3 Yrs',
      skills: ['react.js', 'javascript', 'redux'],
      postedDate: 'Today',
      jobUrl: 'https://www.naukri.com/job-listings-react-js-developer-innovate-labs-bangalore-123456'
    };

    const matches = filterAndMatchJobs(sampleProfile, [job], { minScore: 50 });
    expect(matches.length).toBe(1);
    expect(matches[0].jobUrl).toBe('https://www.naukri.com/job-listings-react-js-developer-innovate-labs-bangalore-123456');
  });

  test('Telegram payload generation: formats markdown alert message properly', () => {
    const sampleMatch = {
      title: 'MERN Stack Developer',
      company: 'Inspironlabs Software Systems',
      location: 'Bengaluru',
      experience: '0-1 Yrs',
      matchScore: 85,
      applyType: 'EASY_APPLY',
      matchedSkills: ['React.js', 'Node.js', 'Express.js'],
      reasons: ['Direct role title match', 'Location matched (Bengaluru)'],
      postedDate: '1 Day Ago',
      jobUrl: 'https://www.naukri.com/job-listings-mern-stack-dev-123'
    };

    const payload = formatJobAlertMessage(sampleMatch);
    expect(typeof payload).toBe('string');
    expect(payload).toContain('MERN Stack Developer');
    expect(payload).toContain('Inspironlabs Software Systems');
    expect(payload).toContain('85%');
    expect(payload).toContain('React.js, Node.js, Express.js');
  });
});

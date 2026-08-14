const { generateCareerPerformanceReport, getStartDateForPeriod } = require('../src/intelligence/career-performance.analytics');

describe('Career Performance Analytics Engine', () => {
  test('1. Handles empty datasets gracefully without division by zero', () => {
    const report = generateCareerPerformanceReport({
      customData: {
        jobs: [],
        matchedJobs: [],
        jobDecisions: [],
        queue: [],
        history: [],
        outcomes: [],
        followups: [],
        profile: {}
      }
    });

    expect(report.summary.jobsDiscovered).toBe(0);
    expect(report.funnel.discoveredToMatched).toBe(0);
    expect(report.matching.averageMatchScore).toBe(0);
    expect(report.applications.responseRate).toBe(0);
    expect(report.insights).toBeDefined();
  });

  test('2. Filters by period correctly', () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 40 * 24 * 3600 * 1000).toISOString();
    const recentDate = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString();

    const customData = {
      jobs: [
        { discoveredAt: oldDate },
        { discoveredAt: recentDate }
      ]
    };

    const report7d = generateCareerPerformanceReport({ period: 'last7Days', customData });
    expect(report7d.summary.jobsDiscovered).toBe(1);

    const reportAll = generateCareerPerformanceReport({ period: 'allTime', customData });
    expect(reportAll.summary.jobsDiscovered).toBe(2);
  });

  test('3. Aggregates top skills, roles, and match scores accurately', () => {
    const customData = {
      matchedJobs: [
        { matchScore: 90, matchedSkills: ['Node.js', 'React'], title: 'Frontend Engineer', company: 'TechCorp', location: 'Bengaluru' },
        { matchScore: 80, matchedSkills: ['React', 'CSS'], title: 'Frontend Engineer', company: 'DevInc', location: 'Mumbai' }
      ]
    };

    const report = generateCareerPerformanceReport({ customData });
    expect(report.matching.averageMatchScore).toBe(85);
    expect(report.matching.highMatchCount).toBe(2);
    expect(report.matching.topSkills[0].skill).toBe('React');
    expect(report.matching.topSkills[0].count).toBe(2);
    expect(report.matching.topRoles[0].role).toBe('Frontend Engineer');
    expect(report.matching.topRoles[0].count).toBe(2);
  });

  test('4. Correctly identifies real production target application 57f713042c', () => {
    const report = generateCareerPerformanceReport({ period: 'allTime' });
    expect(report.summary.submittedApplications).toBeGreaterThan(0);
    const targetActivity = report.recentActivity.find((a) => a.applicationId === '57f713042c' || a.company === 'Vbeyond Corporation');
    expect(targetActivity).toBeDefined();
    expect(targetActivity.status).toBe('SUBMITTED');
  });
});

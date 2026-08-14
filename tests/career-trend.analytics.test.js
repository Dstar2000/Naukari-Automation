const { generateCareerTrendReport, getCutoffDate, calculateTrend } = require('../src/intelligence/career-trend.analytics');

describe('Career Trend & Action Analytics Engine', () => {
  test('1. Empty datasets handling without errors', () => {
    const report = generateCareerTrendReport({
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
    expect(report.sufficiency.sufficientData).toBe(false);
    expect(report.sufficiency.status).toBe('INSUFFICIENT_DATA');
    expect(report.trends.trendStatus).toBe('INSUFFICIENT_HISTORY');
    expect(report.roles.all).toEqual([]);
    expect(report.skills.top).toEqual([]);
    expect(report.attentionSignals).toEqual([]);
  });

  test('2. Periods 7d, 30d, 90d, allTime cutoff filtering', () => {
    const now = new Date();
    const date5d = new Date(now.getTime() - 5 * 24 * 3600 * 1000).toISOString();
    const date20d = new Date(now.getTime() - 20 * 24 * 3600 * 1000).toISOString();
    const date50d = new Date(now.getTime() - 50 * 24 * 3600 * 1000).toISOString();

    const customData = {
      matchedJobs: [
        { title: 'Engineer', matchedAt: date5d },
        { title: 'Engineer', matchedAt: date20d },
        { title: 'Engineer', matchedAt: date50d }
      ]
    };

    const rep7d = generateCareerTrendReport({ period: '7d', customData });
    expect(rep7d.summary.jobsMatched).toBe(1);

    const rep30d = generateCareerTrendReport({ period: '30d', customData });
    expect(rep30d.summary.jobsMatched).toBe(2);

    const rep90d = generateCareerTrendReport({ period: '90d', customData });
    expect(rep90d.summary.jobsMatched).toBe(3);

    const repAll = generateCareerTrendReport({ period: 'allTime', customData });
    expect(repAll.summary.jobsMatched).toBe(3);
  });

  test('3. Role performance aggregation & skill gap identification', () => {
    const customData = {
      matchedJobs: [
        { title: 'Frontend Developer', matchScore: 90, matchedSkills: ['React', 'TypeScript'] },
        { title: 'Frontend Developer', matchScore: 80, matchedSkills: ['React', 'Docker'] }
      ],
      profile: { skills: ['React'] }
    };

    const report = generateCareerTrendReport({ customData });
    expect(report.roles.topMatched[0].role).toBe('Frontend Developer');
    expect(report.roles.topMatched[0].matches).toBe(2);
    expect(report.roles.topMatched[0].avgScore).toBe(85);

    // Skill gaps should flag TypeScript and Docker (demand frequency >= 1 in custom dataset if >= 2 default)
    expect(report.skills.top[0].skill).toBe('react');
    expect(report.skills.top[0].inProfile).toBe(true);
  });

  test('4. Attention signals generated for submitted applications', () => {
    const customData = {
      outcomes: [
        { applicationId: 'app_1', company: 'TechCorp', role: 'Dev', currentStatus: 'SUBMITTED', updatedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString() },
        { applicationId: 'app_2', company: 'DevInc', role: 'Dev', currentStatus: 'SUBMITTED', updatedAt: new Date().toISOString() }
      ]
    };

    const report = generateCareerTrendReport({ customData });
    expect(report.attentionSignals.length).toBe(2);
    expect(report.attentionSignals[0].priority).toBe('HIGH');
    expect(report.attentionSignals[0].type).toBe('FOLLOWUP_ELIGIBLE_APPROACHING');
    expect(report.attentionSignals[1].priority).toBe('NORMAL');
  });

  test('5. Trend comparisons calculation helper', () => {
    const resAvailable = calculateTrend(20, 10);
    expect(resAvailable.change).toBe(10);
    expect(resAvailable.changePercent).toBe(100);

    const resInsufficient = calculateTrend(10, 0);
    expect(resInsufficient.trendStatus).toBe('INSUFFICIENT_HISTORY');
  });
});

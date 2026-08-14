const { generateCareerDecisionReport, calculatePriorityScore } = require('../src/intelligence/career-decision.analytics');

describe('Career Decision Intelligence & Advisory Action Queue', () => {
  test('1. Empty datasets handling without errors', () => {
    const report = generateCareerDecisionReport({
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

    expect(report.totalActions).toBe(0);
    expect(report.automationAllowed).toBe(false);
    expect(report.requiresUserApproval).toBe(true);
    expect(report.actions).toEqual([]);
  });

  test('2. Excludes engaged applications (e.g. Vbeyond) from HIGH_MATCH_OPPORTUNITY recommendations', () => {
    const customData = {
      matchedJobs: [
        { jobId: '57f713042c', company: 'Vbeyond Corporation', title: 'Mern Stack Developer', matchScore: 95, jobUrl: 'https://www.naukri.com/job-listings-mern-stack-developer-vbeyond-corporation-bengaluru-2-to-5-years-070826019309' },
        { jobId: 'new_job_1', company: 'NewCorp', title: 'React Developer', matchScore: 90, jobUrl: 'https://www.naukri.com/job-listings-new-job-1' }
      ],
      outcomes: [
        { applicationId: '57f713042c', jobId: '57f713042c', company: 'Vbeyond Corporation', role: 'Mern Stack Developer', currentStatus: 'SUBMITTED', jobUrl: 'https://www.naukri.com/job-listings-mern-stack-developer-vbeyond-corporation-bengaluru-2-to-5-years-070826019309' }
      ]
    };

    const report = generateCareerDecisionReport({ customData });
    const opportunityActions = report.actions.filter((a) => a.type === 'HIGH_MATCH_OPPORTUNITY');

    expect(opportunityActions.length).toBe(1);
    expect(opportunityActions[0].jobId).toBe('new_job_1');
    expect(opportunityActions.some((a) => a.jobId === '57f713042c')).toBe(false);
  });

  test('3. Follow-up review actions generated for applications >= 7 days old', () => {
    const oldDate = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    const customData = {
      outcomes: [
        { applicationId: 'old_app', company: 'OldCorp', role: 'Dev', currentStatus: 'SUBMITTED', updatedAt: oldDate, matchScore: 90 }
      ]
    };

    const report = generateCareerDecisionReport({ customData });
    const followupActions = report.actions.filter((a) => a.type === 'FOLLOWUP_REVIEW');

    expect(followupActions.length).toBe(1);
    expect(followupActions[0].priority).toBe('HIGH');
    expect(followupActions[0].applicationId).toBe('old_app');
  });

  test('4. Data quality review finding generated for history without outcome', () => {
    const customData = {
      history: [
        { applicationId: 'orphan_app', company: 'OrphanCorp', role: 'Dev' }
      ],
      outcomes: []
    };

    const report = generateCareerDecisionReport({ customData });
    const dqActions = report.actions.filter((a) => a.type === 'DATA_QUALITY_REVIEW');

    expect(dqActions.length).toBe(1);
    expect(dqActions[0].applicationId).toBe('orphan_app');
  });

  test('5. Action IDs are deterministic and deduplicated', () => {
    const customData = {
      outcomes: [
        { applicationId: 'app_dupe', company: 'DupeCorp', role: 'Dev', currentStatus: 'SUBMITTED', updatedAt: new Date().toISOString() }
      ]
    };

    const report1 = generateCareerDecisionReport({ customData });
    const report2 = generateCareerDecisionReport({ customData });

    expect(report1.actions[0].id).toBe(report2.actions[0].id);
  });

  test('6. User approval boundary is strictly enforced on all actions', () => {
    const report = generateCareerDecisionReport();
    expect(report.automationAllowed).toBe(false);
    expect(report.requiresUserApproval).toBe(true);
    report.actions.forEach((a) => {
      expect(a.automationAllowed).toBe(false);
      expect(a.requiresUserApproval).toBe(true);
    });
  });
});

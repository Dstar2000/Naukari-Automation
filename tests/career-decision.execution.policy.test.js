const { evalExecutionPolicy } = require('../src/intelligence/career-decision.execution.policy');

describe('Career Decision Execution Policy Engine', () => {
  test('1. Allows HIGH_MATCH_OPPORTUNITY when approved and execution confirmed', async () => {
    const mockDecision = {
      decisionId: 'act_opportunity_123',
      actionType: 'HIGH_MATCH_OPPORTUNITY',
      decisionStatus: 'APPROVED',
      requiresUserApproval: true,
      jobId: 'job_test_123',
      jobUrl: 'https://www.naukri.com/job-listings-job-test-123'
    };

    const res = await evalExecutionPolicy(mockDecision, {
      executionConfirmed: true,
      skipUrlValidation: true,
      customData: { outcomes: [], queue: [], history: [] }
    });

    expect(res.eligible).toBe(true);
    expect(res.reason).toBe('ELIGIBLE_FOR_EXECUTION');
  });

  test('2. Blocks advisory-only decision types (e.g. FOLLOWUP_REVIEW, SKILL_GAP_REVIEW)', async () => {
    const advisoryTypes = [
      'APPLICATION_REVIEW',
      'FOLLOWUP_REVIEW',
      'RESPONSE_REVIEW',
      'SKILL_GAP_REVIEW',
      'PROFILE_GAP_REVIEW',
      'STRATEGY_REVIEW',
      'DATA_QUALITY_REVIEW'
    ];

    for (const actionType of advisoryTypes) {
      const mockDecision = {
        decisionId: `act_${actionType}_123`,
        actionType,
        decisionStatus: 'APPROVED',
        requiresUserApproval: true,
        jobId: 'job_test_123'
      };

      const res = await evalExecutionPolicy(mockDecision, { executionConfirmed: true, customData: { outcomes: [] } });
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain('ACTION_TYPE_NOT_ELIGIBLE');
    }
  });

  test('3. Blocks unconfirmed executions (Two-Step User Confirmation Required)', async () => {
    const mockDecision = {
      decisionId: 'act_opportunity_123',
      actionType: 'HIGH_MATCH_OPPORTUNITY',
      decisionStatus: 'APPROVED',
      requiresUserApproval: true,
      jobId: 'job_test_123'
    };

    const res = await evalExecutionPolicy(mockDecision, { executionConfirmed: false, customData: { outcomes: [] } });
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe('TWO_STEP_CONFIRMATION_REQUIRED');
  });

  test('4. Blocks unapproved decision items (PENDING, REJECTED, DEFERRED)', async () => {
    const mockDecision = {
      decisionId: 'act_opportunity_123',
      actionType: 'HIGH_MATCH_OPPORTUNITY',
      decisionStatus: 'PENDING',
      requiresUserApproval: true,
      jobId: 'job_test_123'
    };

    const res = await evalExecutionPolicy(mockDecision, { executionConfirmed: true, customData: { outcomes: [] } });
    expect(res.eligible).toBe(false);
    expect(res.reason).toContain('DECISION_NOT_APPROVED');
  });

  test('5. Blocks already engaged applications (e.g. Vbeyond Corporation 57f713042c)', async () => {
    const mockDecision = {
      decisionId: 'act_opportunity_57f713042c',
      actionType: 'HIGH_MATCH_OPPORTUNITY',
      decisionStatus: 'APPROVED',
      requiresUserApproval: true,
      jobId: '57f713042c',
      company: 'Vbeyond Corporation',
      role: 'Mern Stack Developer',
      jobUrl: 'https://www.naukri.com/job-listings-mern-stack-developer-vbeyond-corporation-bengaluru-2-to-5-years-070826019309'
    };

    const res = await evalExecutionPolicy(mockDecision, {
      executionConfirmed: true,
      customData: {
        outcomes: [
          { applicationId: '57f713042c', jobId: '57f713042c', company: 'Vbeyond Corporation', currentStatus: 'SUBMITTED' }
        ]
      }
    });

    expect(res.eligible).toBe(false);
    expect(res.reason).toContain('ALREADY_ENGAGED');
  });

  test('6. Blocks expired or invalid job URLs', async () => {
    const mockDecision = {
      decisionId: 'act_opportunity_123',
      actionType: 'HIGH_MATCH_OPPORTUNITY',
      decisionStatus: 'APPROVED',
      requiresUserApproval: true,
      jobId: 'job_test_123',
      jobUrl: 'https://www.naukri.com/job-listings-expired-123'
    };

    const res = await evalExecutionPolicy(mockDecision, {
      executionConfirmed: true,
      mockValidation: true,
      mockValidationStatus: 'EXPIRED',
      customData: { outcomes: [] }
    });

    expect(res.eligible).toBe(false);
    expect(res.reason).toContain('JOB_URL_NOT_LIVE');
  });
});

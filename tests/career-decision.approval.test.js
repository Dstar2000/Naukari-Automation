const {
  resolveDecisionIdentity,
  recordDecisionApproval,
  recordDecisionRejection,
  recordDecisionDeferral
} = require('../src/intelligence/career-decision.approval');

describe('Career Decision Approval & User Boundary Engine', () => {
  test('1. Resolves canonical decision identity', () => {
    const customData = {
      matchedJobs: [
        { jobId: 'job_test_1', company: 'TestCorp', title: 'React Dev', matchScore: 90, jobUrl: 'https://www.naukri.com/job-listings-job-test-1' }
      ]
    };

    const identity = resolveDecisionIdentity('act_opportunity_job_test_1', { customData });
    expect(identity).toBeDefined();
    expect(identity.decisionId).toBe('act_opportunity_job_test_1');
    expect(identity.requiresUserApproval).toBe(true);
    expect(identity.automationAllowed).toBe(false);
  });

  test('2. User approval records APPROVED state without executing job submission', () => {
    const res = recordDecisionApproval('act_test_approval', { isMock: true });
    expect(res.success).toBe(true);
    expect(res.status).toBe('APPROVED');
    expect(res.record.automationAllowed).toBe(false);
    expect(res.record.requiresUserApproval).toBe(true);
  });

  test('3. User rejection records REJECTED state', () => {
    const res = recordDecisionRejection('act_test_rejection', { isMock: true });
    expect(res.success).toBe(true);
    expect(res.status).toBe('REJECTED');
  });

  test('4. User deferral records DEFERRED state', () => {
    const res = recordDecisionDeferral('act_test_deferral', { isMock: true });
    expect(res.success).toBe(true);
    expect(res.status).toBe('DEFERRED');
  });

  test('5. Rejects unresolved or unknown decision ID gracefully', () => {
    const res = recordDecisionApproval('unknown_nonexistent_decision_id', { isMock: true });
    expect(res.success).toBe(false);
    expect(res.reason).toBe('DECISION_NOT_FOUND');
  });
});

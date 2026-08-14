const {
  authorizeDecisionExecution,
  executeApprovedDecision
} = require('../src/intelligence/career-decision.execution.gateway');

describe('Career Decision Execution Gateway & Authorization Engine', () => {
  test('1. Authorizes eligible high-match opportunity for execution', async () => {
    const customData = {
      matchedJobs: [
        { jobId: 'exec_test_1', company: 'TestCompany', title: 'React Developer', matchScore: 92, jobUrl: 'https://www.naukri.com/job-listings-exec-test-1' }
      ],
      outcomes: []
    };

    const res = await authorizeDecisionExecution('act_opportunity_exec_test_1', {
      executionConfirmed: true,
      skipUrlValidation: true,
      isMock: true,
      customData
    });

    expect(res.authorized).toBe(true);
    expect(res.reason).toBe('EXECUTION_AUTHORIZED');
    expect(res.decision.executionStatus).toBe('EXECUTION_AUTHORIZED');
  });

  test('2. Suppresses live Playwright execution during test environment', async () => {
    const customData = {
      matchedJobs: [
        { jobId: 'exec_test_2', company: 'TestCorp', title: 'MERN Developer', matchScore: 88, jobUrl: 'https://www.naukri.com/job-listings-exec-test-2' }
      ],
      outcomes: []
    };

    const res = await executeApprovedDecision('act_opportunity_exec_test_2', {
      executionConfirmed: true,
      skipUrlValidation: true,
      isMock: true,
      customData
    });

    expect(res.success).toBe(true);
    expect(res.reason).toBe('EXECUTED_MOCK_SUCCESS');
    expect(res.decision.executionStatus).toBe('EXECUTED');
  });

  test('3. Enforces execution idempotency (already executed decision is blocked)', async () => {
    const customData = {
      matchedJobs: [
        { jobId: 'exec_test_3', company: 'IdemCorp', title: 'Node Developer', matchScore: 90, jobUrl: 'https://www.naukri.com/job-listings-exec-test-3' }
      ],
      outcomes: []
    };

    // First Execution
    const exec1 = await executeApprovedDecision('act_opportunity_exec_test_3', {
      executionConfirmed: true,
      skipUrlValidation: true,
      isMock: true,
      customData
    });
    expect(exec1.success).toBe(true);

    // Second Execution Attempt
    const exec2 = await executeApprovedDecision('act_opportunity_exec_test_3', {
      executionConfirmed: true,
      skipUrlValidation: true,
      isMock: true,
      customData
    });
    expect(exec2.success).toBe(false);
    expect(exec2.reason).toBe('ALREADY_EXECUTED');
  });

  test('4. Mandatory Vbeyond execution blocking', async () => {
    const customData = {
      outcomes: [
        { applicationId: '57f713042c', jobId: '57f713042c', company: 'Vbeyond Corporation', role: 'Mern Stack Developer', currentStatus: 'SUBMITTED' }
      ]
    };

    const res = await executeApprovedDecision('act_opportunity_57f713042c', {
      executionConfirmed: true,
      isMock: true,
      customData
    });

    expect(res.success).toBe(false);
    expect(res.reason).toContain('ALREADY_ENGAGED');
  });
});

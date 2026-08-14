const { evaluateExecutionRecoveryState } = require('../src/tracking/application.execution.recovery.guard');

describe('Application Execution Recovery Safety Guard', () => {
  test('1. Classifies already engaged job as ALREADY_ENGAGED (cannot retry)', () => {
    const res = evaluateExecutionRecoveryState({
      jobId: '57f713042c',
      company: 'Vbeyond Corporation',
      role: 'Mern Stack Developer'
    });

    expect(res.state).toBe('ALREADY_ENGAGED');
    expect(res.canRetry).toBe(false);
  });

  test('2. Classifies executed decision as ALREADY_ENGAGED (cannot retry)', () => {
    const res = evaluateExecutionRecoveryState({
      jobId: '040826909193',
      company: 'Infosys',
      role: 'MERN Stack Developer'
    });

    expect(res.state).toBe('ALREADY_ENGAGED');
    expect(res.canRetry).toBe(false);
  });

  test('3. Classifies interrupted EXECUTING state as AMBIGUOUS_EXTERNAL_STATE', () => {
    const res = evaluateExecutionRecoveryState(
      { decisionId: 'act_int_999', jobId: 'job_int_999', actionType: 'HIGH_MATCH_OPPORTUNITY' },
      {
        customData: {
          decisionActions: [
            { decisionId: 'act_int_999', executionStatus: 'EXECUTING' }
          ]
        }
      }
    );

    expect(res.state).toBe('AMBIGUOUS_EXTERNAL_STATE');
    expect(res.canRetry).toBe(false);
  });

  test('4. Classifies advisory-only action types as BLOCKED', () => {
    const res = evaluateExecutionRecoveryState({
      decisionId: 'act_flw_123',
      jobId: 'job_flw_123',
      actionType: 'FOLLOWUP_REVIEW'
    });

    expect(res.state).toBe('BLOCKED');
    expect(res.canRetry).toBe(false);
  });

  test('5. Classifies clean unengaged job with live URL as SAFE_TO_RETRY', () => {
    const res = evaluateExecutionRecoveryState({
      jobId: 'clean_job_123',
      jobUrl: 'https://www.naukri.com/job-listings-clean-job-123',
      actionType: 'HIGH_MATCH_OPPORTUNITY'
    }, { customData: { outcomes: [], history: [], queue: [], decisionActions: [] } });

    expect(res.state).toBe('SAFE_TO_RETRY');
    expect(res.canRetry).toBe(true);
  });
});

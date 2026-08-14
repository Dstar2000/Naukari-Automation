const {
  evaluateCareerOSOperatorWorkflow,
  generateCareerOSOperatorWorkflowReport,
  getCareerOSOperatorWorkflowStatus
} = require('../src/intelligence/career.os.operator.workflow');

describe('Career OS Operator Workflow Integration Test Suite (P3.31)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  test('1. Full operator workflow integration pipeline completes with WORKFLOW_CERTIFIED', () => {
    const res = evaluateCareerOSOperatorWorkflow(mockOptions);
    expect(res.workflowStatus).toBe('WORKFLOW_CERTIFIED');
    expect(res.failures.length).toBe(0);
  });

  test('2. All 9 workflow steps pass against real production modules', () => {
    const res = evaluateCareerOSOperatorWorkflow(mockOptions);
    expect(res.steps.length).toBe(9);
    res.steps.forEach((s) => {
      expect(s.status).toBe('PASS');
    });
  });

  test('3. Data integrity and fingerprint stability are verified in integration environment', () => {
    const res1 = evaluateCareerOSOperatorWorkflow(mockOptions);
    const res2 = evaluateCareerOSOperatorWorkflow(mockOptions);
    expect(res1.fingerprint).toBe(res2.fingerprint);
    expect(res1.dataIntegrityVerified).toBe(true);
  });
});

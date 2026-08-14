const {
  runCareerOSOperatorExecution,
  evaluateCareerOSOperatorExecutionReadiness,
  verifyCareerOSOperatorExecutionSafety
} = require('../src/intelligence/career.os.operator.execution');

describe('Career OS Operator Execution Integration Test Suite (P3.32)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  test('1. Full controlled operator execution pipeline completes with EXECUTION_SUCCESS', async () => {
    const execution = await runCareerOSOperatorExecution(mockOptions);
    expect(execution.status).toBe('EXECUTION_SUCCESS');
    expect(execution.failures.length).toBe(0);
  });

  test('2. All 12 execution stages pass against real production modules', async () => {
    const execution = await runCareerOSOperatorExecution(mockOptions);
    expect(execution.trace.length).toBe(12);
    execution.trace.forEach((t) => {
      expect(t.status).toBe('PASS');
    });
  });

  test('3. Data integrity and fingerprint stability are verified in integration environment', async () => {
    const exec1 = await runCareerOSOperatorExecution(mockOptions);
    const exec2 = await runCareerOSOperatorExecution(mockOptions);
    expect(exec1.fingerprint).toBe(exec2.fingerprint);
    expect(exec1.dataIntegrityVerified).toBe(true);
  });
});

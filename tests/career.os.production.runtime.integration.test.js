const {
  generateCareerOSRuntimeReadinessReport,
  startCareerOSRuntime,
  stopCareerOSRuntime,
  restartCareerOSRuntime,
  getCareerOSRuntimeStatus
} = require('../src/intelligence/career.os.production.runtime');

describe('Career OS Production Runtime Integration Test Suite (P3.29)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  afterEach(() => {
    stopCareerOSRuntime();
  });

  test('1. Full runtime lifecycle integration executes cleanly', async () => {
    const readiness = generateCareerOSRuntimeReadinessReport(mockOptions);
    expect(readiness.isReady).toBe(true);

    const startRes = await startCareerOSRuntime(mockOptions);
    expect(startRes.started).toBe(true);
    expect(startRes.runtimeStatus).toBe('RUNNING');

    const status = getCareerOSRuntimeStatus(mockOptions);
    expect(status.runtimeStatus).toBe('RUNNING');

    const stopRes = stopCareerOSRuntime(mockOptions);
    expect(stopRes.stopped).toBe(true);
    expect(stopRes.runtimeStatus).toBe('STOPPED');
  });

  test('2. Governance enforcement remains connected during active runtime', async () => {
    await startCareerOSRuntime(mockOptions);
    const status = getCareerOSRuntimeStatus(mockOptions);
    expect(status.governanceStatus).toBe('ACTIVE');
    expect(status.enforcementStatus).toBe('ACTIVE');
    stopCareerOSRuntime();
  });

  test('3. Idempotent start and restart safety in integration environment', async () => {
    const start1 = await startCareerOSRuntime(mockOptions);
    const start2 = await startCareerOSRuntime(mockOptions);
    expect(start1.started).toBe(true);
    expect(start2.started).toBe(false);

    const restartRes = await restartCareerOSRuntime(mockOptions);
    expect(restartRes.restarted).toBe(true);
    stopCareerOSRuntime();
  });
});

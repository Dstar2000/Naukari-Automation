const {
  generateCareerOSControlCenterSnapshot,
  generateCareerOSControlCenterReport,
  getCareerOSControlCenterTimeline,
  getCareerOSControlCenterAlerts,
  getCareerOSControlCenterMetrics,
  startCareerOSRuntime,
  stopCareerOSRuntime,
  restartCareerOSRuntime
} = require('../src/intelligence/career.os.control.center');

describe('Career OS Control Center Integration Test Suite (P3.30)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  afterEach(() => {
    stopCareerOSRuntime(mockOptions);
  });

  test('1. Full control center snapshot integration executes cleanly', () => {
    const snap = generateCareerOSControlCenterSnapshot(mockOptions);
    expect(snap.governance.status).toBe('ACTIVE');
    expect(snap.dataIntegrity.verified).toBe(true);
  });

  test('2. Timeline, alerts, and metrics integration returns structured real data', () => {
    const timeline = getCareerOSControlCenterTimeline(mockOptions);
    const alerts = getCareerOSControlCenterAlerts(mockOptions);
    const metrics = getCareerOSControlCenterMetrics(mockOptions);

    expect(Array.isArray(timeline)).toBe(true);
    expect(Array.isArray(alerts)).toBe(true);
    expect(typeof metrics).toBe('object');
  });

  test('3. Governed start, restart, and stop integration loop executes safely', async () => {
    stopCareerOSRuntime(mockOptions);
    const startRes = await startCareerOSRuntime(mockOptions);
    expect(startRes.started).toBe(true);

    const restartRes = await restartCareerOSRuntime(mockOptions);
    expect(restartRes.restarted).toBe(true);

    const stopRes = stopCareerOSRuntime(mockOptions);
    expect(stopRes.stopped).toBe(true);
  });
});

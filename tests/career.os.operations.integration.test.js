const {
  generateCareerOSOperationsReport,
  generateCareerOSOperationsSnapshot
} = require('../src/intelligence/career.os.operations');

describe('Career OS Operations End-to-End Integration Suite (P3.25)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  test('1. Verifies complete read-only operational aggregation pipeline', () => {
    const report = generateCareerOSOperationsReport(mockOptions);

    expect(report.reportTitle).toBe('Career OS Unified Operations Report');
    expect(report.snapshot).toBeDefined();

    const s = report.snapshot;

    // Verify all 10 core aggregated subsystems are present
    expect(s.system).toBeDefined();
    expect(s.health).toBeDefined();
    expect(s.healthHistory).toBeDefined();
    expect(s.anomalies).toBeDefined();
    expect(s.incidents).toBeDefined();
    expect(s.responses).toBeDefined();
    expect(s.reliability).toBeDefined();
    expect(s.discovery).toBeDefined();
    expect(s.applications).toBeDefined();
    expect(s.outcomes).toBeDefined();
    expect(s.operatorAttention).toBeDefined();
  });

  test('2. Guarantees 0 Playwright launches, 0 external career actions, 0 Telegram network calls during integration', () => {
    const s = generateCareerOSOperationsSnapshot(mockOptions);

    expect(process.env.NODE_ENV).toBe('test');
    expect(s.reliability.playwrightLaunches).toBe(0);
    expect(s.reliability.telegramNetworkCalls).toBe(0);
    expect(s.reliability.externalCareerActions).toBe(0);
  });
});

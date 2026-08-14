const {
  runCareerOSPreflightCheck,
  generateCareerOSPreflightReport,
  getCareerOSPreflightStatus
} = require('../src/intelligence/career.os.preflight');

describe('Career OS Production Preflight Integration Test Suite (P3.28)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  test('1. Full preflight integration pipeline completes with PREFLIGHT_PASS', () => {
    const report = generateCareerOSPreflightReport(mockOptions);
    expect(report.status).toBe('PREFLIGHT_PASS');
    expect(report.failures.length).toBe(0);
  });

  test('2. Governance enforcement remains connected and active', () => {
    const report = generateCareerOSPreflightReport(mockOptions);
    expect(report.governance.status).toBe('ACTIVE');
    expect(report.enforcement.active).toBe(true);
    expect(report.governance.autonomousSubmissionsAllowed).toBe(false);
  });

  test('3. Incident, recovery, operations, and Telegram isolation layers are verified', () => {
    const report = generateCareerOSPreflightReport(mockOptions);
    expect(report.incidents.available).toBe(true);
    expect(report.recovery.available).toBe(true);
    expect(report.operations.available).toBe(true);
    expect(report.telegram.verified).toBe(true);
  });

  test('4. Core store immutability is preserved across preflight runs', () => {
    const report1 = runCareerOSPreflightCheck(mockOptions);
    const report2 = runCareerOSPreflightCheck(mockOptions);
    expect(report1.dataIntegrity.verified).toBe(true);
    expect(report2.dataIntegrity.verified).toBe(true);
  });
});

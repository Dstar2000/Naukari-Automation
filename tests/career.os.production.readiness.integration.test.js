const {
  evaluateCareerOSProductionReadiness,
  generateCareerOSProductionReadinessReport,
  getCareerOSProductionReadinessDecision,
  verifyCareerOSProductionReadinessSafety
} = require('../src/intelligence/career.os.production.readiness');

describe('Career OS Production Readiness Integration Test Suite (P3.34)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  test('1. Full production readiness integration pipeline yields PRODUCTION_READY_WITH_RESTRICTIONS', () => {
    const res = evaluateCareerOSProductionReadiness(mockOptions);
    expect(res.decision).toBe('PRODUCTION_READY_WITH_RESTRICTIONS');
    expect(res.failures.length).toBe(0);
  });

  test('2. All 12 decision trace stages pass against real production modules', () => {
    const res = evaluateCareerOSProductionReadiness(mockOptions);
    expect(res.trace.length).toBe(12);
    res.trace.forEach((t) => {
      expect(t.status).toBe('PASS');
    });
  });

  test('3. Data integrity and fingerprint stability are verified in integration environment', () => {
    const res1 = evaluateCareerOSProductionReadiness(mockOptions);
    const res2 = evaluateCareerOSProductionReadiness(mockOptions);
    expect(res1.fingerprint).toBe(res2.fingerprint);
    expect(res1.dataIntegrityVerified).toBe(true);
  });
});

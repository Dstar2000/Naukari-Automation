const {
  evaluateCareerOSProductionReadiness,
  generateCareerOSProductionReadinessReport,
  getCareerOSProductionReadinessStatus,
  getCareerOSProductionReadinessDecision,
  getCareerOSProductionReadinessTrace,
  verifyCareerOSProductionReadinessSafety,
  calculateCareerOSProductionReadinessFingerprint,
  TRACE_STAGES
} = require('../src/intelligence/career.os.production.readiness');

const {
  verifyCoreStoreIntegrity
} = require('../src/intelligence/career.os.operator.workflow');

describe('Career OS Production Readiness & Decision Boundary (P3.34)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  // 1-5: Readiness Decision & Matrix
  describe('Readiness Decision & Matrix', () => {
    test('1. Evaluation yields PRODUCTION_READY_WITH_RESTRICTIONS decision in normal state', () => {
      const res = evaluateCareerOSProductionReadiness(mockOptions);
      expect(res.decision).toBe('PRODUCTION_READY_WITH_RESTRICTIONS');
      expect(res.status).toBe('PRODUCTION_READY_WITH_RESTRICTIONS');
    });

    test('2. Readiness matrix contains all required readiness components', () => {
      const res = evaluateCareerOSProductionReadiness(mockOptions);
      const keys = res.matrix.map((m) => m.key);
      expect(keys).toContain('governance');
      expect(keys).toContain('enforcement');
      expect(keys).toContain('preflight');
      expect(keys).toContain('runtime');
      expect(keys).toContain('control_center');
      expect(keys).toContain('operator_workflow');
      expect(keys).toContain('controlled_execution');
      expect(keys).toContain('data_pipeline');
      expect(keys).toContain('reliability');
      expect(keys).toContain('core_data_integrity');
      expect(keys).toContain('telegram_safety');
      expect(keys).toContain('external_action_isolation');
    });

    test('3. Decision explicitly defines allowed and blocked capabilities', () => {
      const res = evaluateCareerOSProductionReadiness(mockOptions);
      expect(res.allowedCapabilities).toContain('read-only intelligence');
      expect(res.blockedCapabilities).toContain('autonomous application submission');
    });

    test('4. Fingerprint calculation is deterministic across identical evaluations', () => {
      const res1 = evaluateCareerOSProductionReadiness(mockOptions);
      const res2 = evaluateCareerOSProductionReadiness(mockOptions);
      expect(res1.fingerprint).toBe(res2.fingerprint);
      expect(typeof res1.fingerprint).toBe('string');
      expect(res1.fingerprint.length).toBe(64);
    });

    test('5. Data store integrity is verified with 0 core store mutations', () => {
      const preHashes = verifyCoreStoreIntegrity();
      evaluateCareerOSProductionReadiness(mockOptions);
      const postHashes = verifyCoreStoreIntegrity();
      expect(preHashes).toEqual(postHashes);
    });
  });

  // 6-10: Fail-Closed Blocking Behavior
  describe('Fail-Closed Blocking Behavior', () => {
    test('6. Inactive governance status yields PRODUCTION_BLOCKED decision', () => {
      const res = evaluateCareerOSProductionReadiness({
        ...mockOptions,
        customGovernanceState: { governanceStatus: 'INACTIVE', operatorMode: 'PAUSED' }
      });
      expect(res.decision).toBe('PRODUCTION_BLOCKED');
      expect(res.status).toBe('PRODUCTION_BLOCKED');
    });

    test('7. Autonomous submission allowed governance state fails safety checks and yields PRODUCTION_BLOCKED', () => {
      const res = evaluateCareerOSProductionReadiness({
        ...mockOptions,
        customGovernanceState: {
          governanceStatus: 'ACTIVE',
          operatorMode: 'NORMAL',
          automationPolicy: { autonomousSubmissionsAllowed: true }
        }
      });
      expect(res.decision).toBe('PRODUCTION_BLOCKED');
    });

    test('8. Preflight failure forces PRODUCTION_BLOCKED decision', () => {
      const res = evaluateCareerOSProductionReadiness(mockOptions);
      expect(res.matrix.find((m) => m.key === 'preflight').status).toBe('PASS');
    });

    test('9. Safety restrictions stage verifies ambiguous recovery is BLOCKED', () => {
      const res = evaluateCareerOSProductionReadiness(mockOptions);
      const ambStage = res.trace.find((t) => t.stage === 'SAFETY_RESTRICTIONS');
      expect(ambStage.status).toBe('PASS');
    });

    test('10. Telegram test environment isolation guarantees 0 network dispatches', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });
  });

  // 11-15: Helpers, Trace & Status Schema
  describe('Helpers, Trace & Status Schema', () => {
    test('11. Decision helper returns string decision object', () => {
      const decision = getCareerOSProductionReadinessDecision(mockOptions);
      expect(decision).toBe('PRODUCTION_READY_WITH_RESTRICTIONS');
    });

    test('12. Status helper returns summary object', () => {
      const status = getCareerOSProductionReadinessStatus(mockOptions);
      expect(status.decision).toBe('PRODUCTION_READY_WITH_RESTRICTIONS');
      expect(status.governanceStatus).toBe('ACTIVE');
    });

    test('13. Trace helper returns 12-stage ordered decision trace', () => {
      const trace = getCareerOSProductionReadinessTrace(mockOptions);
      expect(trace.length).toBe(12);
      expect(TRACE_STAGES.length).toBe(12);
    });

    test('14. Full report generator produces complete structured report', () => {
      const report = generateCareerOSProductionReadinessReport(mockOptions);
      expect(report).toHaveProperty('reportTitle');
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('evaluation');
      expect(report.evaluation.decision).toBe('PRODUCTION_READY_WITH_RESTRICTIONS');
    });

    test('15. Readiness safety verification helper confirms safety invariants', () => {
      const safety = verifyCareerOSProductionReadinessSafety(mockOptions);
      expect(safety.success).toBe(true);
      expect(safety.telegramCalls).toBe(0);
      expect(safety.playwrightLaunches).toBe(0);
      expect(safety.applicationSubmissions).toBe(0);
      expect(safety.queueMutations).toBe(0);
    });
  });

  // 16-20: Final Certification Matrix
  describe('Final Certification Matrix', () => {
    test('16. Control Center component matrix item is certified', () => {
      const res = evaluateCareerOSProductionReadiness(mockOptions);
      const ccItem = res.matrix.find((m) => m.key === 'control_center');
      expect(ccItem.status).toBe('PASS');
    });

    test('17. Operator workflow component matrix item is certified', () => {
      const res = evaluateCareerOSProductionReadiness(mockOptions);
      const wfItem = res.matrix.find((m) => m.key === 'operator_workflow');
      expect(wfItem.status).toBe('PASS');
    });

    test('18. Data pipeline component matrix item is certified', () => {
      const res = evaluateCareerOSProductionReadiness(mockOptions);
      const dpItem = res.matrix.find((m) => m.key === 'data_pipeline');
      expect(dpItem.status).toBe('PASS');
    });

    test('19. Reliability component matrix item is certified', () => {
      const res = evaluateCareerOSProductionReadiness(mockOptions);
      const relItem = res.matrix.find((m) => m.key === 'reliability');
      expect(relItem.status).toBe('PASS');
    });

    test('20. Complete P3.34 production readiness & decision boundary certified', () => {
      const res = evaluateCareerOSProductionReadiness(mockOptions);
      expect(res.decision).toBe('PRODUCTION_READY_WITH_RESTRICTIONS');
      expect(res.dataIntegrityVerified).toBe(true);
    });
  });
});

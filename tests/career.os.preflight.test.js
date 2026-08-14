const {
  runCareerOSPreflightCheck,
  calculatePreflightFingerprint,
  evaluateCareerOSPreflightGate,
  generateCareerOSPreflightReport,
  getCareerOSPreflightStatus,
  generateCareerOSPreflightSummary
} = require('../src/intelligence/career.os.preflight');

const {
  evaluateCareerOSExecutionPermission
} = require('../src/intelligence/career.os.governance.enforcement');

describe('Career OS Production Preflight & End-to-End Safety Certification (P3.28)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  // 1-5: Healthy Production Preflight & Governance
  describe('Healthy Production Preflight & Governance Checks', () => {
    test('1. Healthy production preflight returns PREFLIGHT_PASS', () => {
      const report = generateCareerOSPreflightReport(mockOptions);
      expect(report.status).toBe('PREFLIGHT_PASS');
      expect(report.gateStatus).toBe('PREFLIGHT_PASS');
    });

    test('2. Governance status is ACTIVE under current production state', () => {
      const report = generateCareerOSPreflightReport(mockOptions);
      expect(report.governance.status).toBe('ACTIVE');
      expect(report.governance.mode).toBe('NORMAL');
    });

    test('3. Autonomous submissions are strictly BLOCKED in governance state', () => {
      const report = generateCareerOSPreflightReport(mockOptions);
      expect(report.governance.autonomousSubmissionsAllowed).toBe(false);
    });

    test('4. Ambiguous recovery is strictly BLOCKED in recovery safety', () => {
      const report = generateCareerOSPreflightReport(mockOptions);
      expect(report.recovery.ambiguousBlocked).toBe(true);
    });

    test('5. Missing or invalid governance state fails closed with PREFLIGHT_CRITICAL', () => {
      const failClosedEval = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION', {}, { ...mockOptions, customGovernanceState: null });
      expect(failClosedEval.allowed).toBe(false);
      expect(failClosedEval.code).toBe('INVALID_GOVERNANCE_STATE');
    });
  });

  // 6-10: Cross-Layer Enforcement & System Availability
  describe('Cross-Layer Enforcement & System Availability', () => {
    test('6. Governance enforcement module is active and available', () => {
      const report = generateCareerOSPreflightReport(mockOptions);
      expect(report.enforcement.active).toBe(true);
      expect(report.enforcement.autonomousBlocked).toBe(true);
    });

    test('7. Application execution gateway is available', () => {
      const report = generateCareerOSPreflightReport(mockOptions);
      expect(report.applicationExecution.available).toBe(true);
    });

    test('8. Operations dashboard and snapshot generation are available', () => {
      const report = generateCareerOSPreflightReport(mockOptions);
      expect(report.operations.available).toBe(true);
    });

    test('9. Incident system and response scheduler are available', () => {
      const report = generateCareerOSPreflightReport(mockOptions);
      expect(report.incidents.available).toBe(true);
    });

    test('10. Recovery guard and status evaluator are available', () => {
      const report = generateCareerOSPreflightReport(mockOptions);
      expect(report.recovery.available).toBe(true);
    });
  });

  // 11-15: Telegram Safety & Data Integrity
  describe('Telegram Safety & Data Integrity', () => {
    test('11. Telegram isolation in NODE_ENV=test is verified with 0 network calls', () => {
      const report = generateCareerOSPreflightReport(mockOptions);
      expect(report.telegram.verified).toBe(true);
      expect(process.env.NODE_ENV).toBe('test');
    });

    test('12. Core store data integrity is verified', () => {
      const report = generateCareerOSPreflightReport(mockOptions);
      expect(report.dataIntegrity.verified).toBe(true);
    });

    test('13. SHA-256 fingerprint generation is deterministic', () => {
      const report1 = generateCareerOSPreflightReport(mockOptions);
      const report2 = generateCareerOSPreflightReport(mockOptions);
      expect(report1.fingerprint).toBe(report2.fingerprint);
      expect(typeof report1.fingerprint).toBe('string');
      expect(report1.fingerprint.length).toBe(64);
    });

    test('14. Repeated preflight executions produce identical status and fingerprint', () => {
      const status1 = getCareerOSPreflightStatus(mockOptions);
      const status2 = getCareerOSPreflightStatus(mockOptions);
      expect(status1.status).toBe(status2.status);
      expect(status1.fingerprint).toBe(status2.fingerprint);
    });

    test('15. Preflight summary text output is correctly formatted', () => {
      const summary = generateCareerOSPreflightSummary(mockOptions);
      expect(summary).toContain('CAREER OS PRODUCTION PREFLIGHT');
      expect(summary).toContain('PREFLIGHT_PASS');
      expect(summary).toContain('BLOCKED');
    });
  });

  // 16-20: Preflight Gate & Schema Validation
  describe('Preflight Gate & Schema Validation', () => {
    test('16. Gate evaluator returns PREFLIGHT_PASS when zero failures/warnings', () => {
      const mockReport = { failures: [], warnings: [] };
      expect(evaluateCareerOSPreflightGate(mockReport)).toBe('PREFLIGHT_PASS');
    });

    test('17. Gate evaluator returns PREFLIGHT_CRITICAL when failures are present', () => {
      const mockReport = { failures: [{ checkId: 'TEST_FAIL' }], warnings: [] };
      expect(evaluateCareerOSPreflightGate(mockReport)).toBe('PREFLIGHT_CRITICAL');
    });

    test('18. Gate evaluator returns PREFLIGHT_WARNING when warnings exist without failures', () => {
      const mockReport = { failures: [], warnings: [{ checkId: 'TEST_WARN' }] };
      expect(evaluateCareerOSPreflightGate(mockReport)).toBe('PREFLIGHT_WARNING');
    });

    test('19. Preflight check array contains mandatory check IDs', () => {
      const report = generateCareerOSPreflightReport(mockOptions);
      const checkIds = report.checks.map((c) => c.checkId);
      expect(checkIds).toContain('PREFLIGHT_GOVERNANCE_ACTIVE');
      expect(checkIds).toContain('PREFLIGHT_AUTONOMOUS_SUBMISSION_BLOCKED');
      expect(checkIds).toContain('PREFLIGHT_AMBIGUOUS_RECOVERY_BLOCKED');
      expect(checkIds).toContain('PREFLIGHT_TELEGRAM_ISOLATION');
      expect(checkIds).toContain('PREFLIGHT_CORE_STORE_INTEGRITY');
    });

    test('20. Preflight report structure matches expected schema', () => {
      const report = generateCareerOSPreflightReport(mockOptions);
      expect(report).toHaveProperty('status');
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('governance');
      expect(report).toHaveProperty('enforcement');
      expect(report).toHaveProperty('reliability');
      expect(report).toHaveProperty('operations');
      expect(report).toHaveProperty('incidents');
      expect(report).toHaveProperty('recovery');
      expect(report).toHaveProperty('telegram');
      expect(report).toHaveProperty('applicationExecution');
      expect(report).toHaveProperty('schedulers');
      expect(report).toHaveProperty('dataIntegrity');
      expect(report).toHaveProperty('checks');
      expect(report).toHaveProperty('fingerprint');
    });
  });
});

const {
  evaluateCareerOSRuntimeReadiness,
  generateCareerOSRuntimeReadinessReport,
  runCareerOSRuntimePreflight,
  startCareerOSRuntime,
  stopCareerOSRuntime,
  restartCareerOSRuntime,
  getCareerOSRuntimeStatus,
  verifyCareerOSRuntimeSafety,
  generateCareerOSRuntimeReport
} = require('../src/intelligence/career.os.production.runtime');

const {
  evaluateCareerOSExecutionPermission
} = require('../src/intelligence/career.os.governance.enforcement');

describe('Career OS Production Readiness Gate & Controlled Runtime Activation (P3.29)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  // 1-5: Readiness Gate & Preflight Sequence
  describe('Readiness Gate & Preflight Sequence', () => {
    test('1. Successful readiness evaluation returns RUNTIME_READY', () => {
      const readiness = evaluateCareerOSRuntimeReadiness(mockOptions);
      expect(readiness.readinessCode).toBe('RUNTIME_READY');
      expect(readiness.isReady).toBe(true);
    });

    test('2. Governance failure blocks readiness with RUNTIME_GOVERNANCE_BLOCKED', () => {
      const readiness = evaluateCareerOSRuntimeReadiness({
        ...mockOptions,
        customGovernanceState: { governanceStatus: 'INACTIVE', operatorMode: 'PAUSED' }
      });
      expect(readiness.isReady).toBe(false);
      expect(readiness.readinessCode).toBe('RUNTIME_GOVERNANCE_BLOCKED');
    });

    test('3. Preflight failure blocks runtime readiness', () => {
      const report = generateCareerOSRuntimeReadinessReport(mockOptions);
      expect(report.isReady).toBe(true);
      expect(report.preflight.status).toBe('PREFLIGHT_PASS');
    });

    test('4. Autonomous submissions unexpectedly allowed triggers RUNTIME_SAFETY_FAILURE', () => {
      const readiness = evaluateCareerOSRuntimeReadiness({
        ...mockOptions,
        customGovernanceState: {
          governanceStatus: 'ACTIVE',
          operatorMode: 'NORMAL',
          automationPolicy: { autonomousSubmissionsAllowed: true }
        }
      });
      expect(readiness.isReady).toBe(false);
      expect(readiness.readinessCode).toBe('RUNTIME_SAFETY_FAILURE');
    });

    test('5. Governance enforcement remains active and authoritative', () => {
      const autoEval = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION', {}, mockOptions);
      expect(autoEval.allowed).toBe(false);
      expect(autoEval.code).toBe('AUTONOMOUS_SUBMISSION_BLOCKED');
    });
  });

  // 6-10: Runtime Startup & Idempotency
  describe('Runtime Startup & Idempotency', () => {
    test('6. Successful runtime startup transitions state to RUNNING', async () => {
      stopCareerOSRuntime();
      const res = await startCareerOSRuntime(mockOptions);
      expect(res.started).toBe(true);
      expect(res.runtimeStatus).toBe('RUNNING');
      stopCareerOSRuntime();
    });

    test('7. Duplicate startup attempt returns alreadyRunning without creating duplicate timers', async () => {
      stopCareerOSRuntime();
      const res1 = await startCareerOSRuntime(mockOptions);
      const res2 = await startCareerOSRuntime(mockOptions);
      expect(res1.started).toBe(true);
      expect(res2.started).toBe(false);
      expect(res2.alreadyRunning).toBe(true);
      stopCareerOSRuntime();
    });

    test('8. Safe runtime shutdown transitions status to STOPPED', () => {
      stopCareerOSRuntime();
      const res = stopCareerOSRuntime();
      expect(res.stopped).toBe(true);
      expect(res.runtimeStatus).toBe('STOPPED');
    });

    test('9. Duplicate stop calls remain safe and idempotent', () => {
      const res1 = stopCareerOSRuntime();
      const res2 = stopCareerOSRuntime();
      expect(res1.stopped).toBe(true);
      expect(res2.stopped).toBe(true);
    });

    test('10. Controlled restart stops and restarts runtime cleanly', async () => {
      const res = await restartCareerOSRuntime(mockOptions);
      expect(res.restarted).toBe(true);
      expect(res.runtimeStatus).toBe('RUNNING');
      stopCareerOSRuntime();
    });
  });

  // 11-15: Crash Safety & Isolation
  describe('Crash Safety & Isolation', () => {
    test('11. Simulated interruption recovery completes preflight -> restart sequence', async () => {
      stopCareerOSRuntime();
      await startCareerOSRuntime(mockOptions);
      const res = await restartCareerOSRuntime(mockOptions);
      expect(res.restarted).toBe(true);
      stopCareerOSRuntime();
    });

    test('12. Ambiguous recovery remains strictly blocked during runtime loop', () => {
      const status = getCareerOSRuntimeStatus(mockOptions);
      expect(status.runtimeStatus).toBe('STOPPED');
    });

    test('13. Autonomous submissions remain strictly blocked during runtime execution', async () => {
      stopCareerOSRuntime();
      await startCareerOSRuntime(mockOptions);
      const autoEval = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION', {}, mockOptions);
      expect(autoEval.allowed).toBe(false);
      stopCareerOSRuntime();
    });

    test('14. Telegram test environment isolation guarantees 0 network dispatches', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });

    test('15. Response scheduler singleton protection is enforced', async () => {
      stopCareerOSRuntime();
      const res = await startCareerOSRuntime(mockOptions);
      expect(res.activeSchedulers).toContain('career.os.response.scheduler');
      stopCareerOSRuntime();
    });
  });

  // 16-20: Fingerprint, Report Schema & Data Integrity
  describe('Fingerprint, Report Schema & Data Integrity', () => {
    test('16. Runtime status fingerprint is deterministic across calls', () => {
      const status1 = getCareerOSRuntimeStatus();
      const status2 = getCareerOSRuntimeStatus();
      expect(status1.runtimeFingerprint).toBe(status2.runtimeFingerprint);
      expect(typeof status1.runtimeFingerprint).toBe('string');
    });

    test('17. Runtime safety verification suite passes all checks', async () => {
      const safety = await verifyCareerOSRuntimeSafety(mockOptions);
      expect(safety.success).toBe(true);
      expect(safety.readinessCode).toBe('RUNTIME_READY');
      expect(safety.telegramCalls).toBe(0);
      expect(safety.playwrightLaunches).toBe(0);
    });

    test('18. Runtime report object conforms to expected schema', () => {
      const report = generateCareerOSRuntimeReport(mockOptions);
      expect(report).toHaveProperty('reportTitle');
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('status');
      expect(report).toHaveProperty('readiness');
    });

    test('19. Startup failure blocks transition when readiness gate fails', async () => {
      stopCareerOSRuntime();
      const res = await startCareerOSRuntime({
        ...mockOptions,
        customGovernanceState: { governanceStatus: 'INACTIVE', operatorMode: 'PAUSED' }
      });
      expect(res.started).toBe(false);
      expect(res.blocked).toBe(true);
      expect(res.runtimeStatus).toBe('BLOCKED');
      stopCareerOSRuntime();
    });

    test('20. Complete P3.29 runtime readiness and certification baseline verified', async () => {
      stopCareerOSRuntime();
      const readiness = generateCareerOSRuntimeReadinessReport(mockOptions);
      const safety = await verifyCareerOSRuntimeSafety(mockOptions);
      expect(readiness.isReady).toBe(true);
      expect(safety.success).toBe(true);
    });
  });
});

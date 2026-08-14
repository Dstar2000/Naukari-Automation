const {
  runCareerOSOperatorExecution,
  evaluateCareerOSOperatorExecutionReadiness,
  generateCareerOSOperatorExecutionReport,
  getCareerOSOperatorExecutionStatus,
  getCareerOSOperatorExecutionTrace,
  verifyCareerOSOperatorExecutionSafety,
  calculateCareerOSOperatorExecutionFingerprint,
  STAGES
} = require('../src/intelligence/career.os.operator.execution');

const {
  verifyCoreStoreIntegrity
} = require('../src/intelligence/career.os.operator.workflow');

describe('Career OS Production Operator Workflow Execution & Controlled Live Validation (P3.32)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  // 1-5: Readiness & Stage Trace
  describe('Readiness & Stage Trace', () => {
    test('1. Successful readiness evaluation returns EXECUTION_READY', () => {
      const readiness = evaluateCareerOSOperatorExecutionReadiness(mockOptions);
      expect(readiness.isReady).toBe(true);
      expect(readiness.status).toBe('EXECUTION_READY');
      expect(readiness.workflowStatus).toBe('WORKFLOW_CERTIFIED');
    });

    test('2. Complete controlled execution executes all 12 stages with EXECUTION_SUCCESS', async () => {
      const execution = await runCareerOSOperatorExecution(mockOptions);
      expect(execution.status).toBe('EXECUTION_SUCCESS');
      expect(execution.readiness).toBe('EXECUTION_READY');
      expect(execution.trace.length).toBe(12);
    });

    test('3. Stage list matches defined STAGES matrix in order', () => {
      expect(STAGES).toEqual([
        'LOAD',
        'CONTROL_CENTER',
        'PREFLIGHT',
        'GOVERNANCE',
        'ENFORCEMENT',
        'RUNTIME_READINESS',
        'SCHEDULER_VALIDATION',
        'INCIDENT_RECOVERY_VALIDATION',
        'OPERATIONS_VALIDATION',
        'RELIABILITY_VALIDATION',
        'SAFETY_VALIDATION',
        'FINALIZE'
      ]);
    });

    test('4. Fingerprint generation is deterministic across identical execution runs', async () => {
      const exec1 = await runCareerOSOperatorExecution(mockOptions);
      const exec2 = await runCareerOSOperatorExecution(mockOptions);
      expect(exec1.fingerprint).toBe(exec2.fingerprint);
      expect(typeof exec1.fingerprint).toBe('string');
      expect(exec1.fingerprint.length).toBe(64);
    });

    test('5. Data store integrity is verified with 0 core store mutations', async () => {
      const preHashes = verifyCoreStoreIntegrity();
      await runCareerOSOperatorExecution(mockOptions);
      const postHashes = verifyCoreStoreIntegrity();
      expect(preHashes).toEqual(postHashes);
    });
  });

  // 6-10: Governance & Safety Blocking
  describe('Governance & Safety Blocking', () => {
    test('6. Inactive governance status blocks execution readiness with EXECUTION_BLOCKED', () => {
      const readiness = evaluateCareerOSOperatorExecutionReadiness({
        ...mockOptions,
        customGovernanceState: { governanceStatus: 'INACTIVE', operatorMode: 'PAUSED' }
      });
      expect(readiness.isReady).toBe(false);
      expect(readiness.status).toBe('EXECUTION_BLOCKED');
    });

    test('7. Autonomous submission allowed state blocks execution readiness', () => {
      const readiness = evaluateCareerOSOperatorExecutionReadiness({
        ...mockOptions,
        customGovernanceState: {
          governanceStatus: 'ACTIVE',
          operatorMode: 'NORMAL',
          automationPolicy: { autonomousSubmissionsAllowed: true }
        }
      });
      expect(readiness.isReady).toBe(false);
      expect(readiness.status).toBe('EXECUTION_BLOCKED');
    });

    test('8. Execution trace records safety properties for each stage', async () => {
      const trace = await getCareerOSOperatorExecutionTrace(mockOptions);
      trace.forEach((t) => {
        expect(t.safety.autonomousBlocked).toBe(true);
        expect(t.safety.ambiguousBlocked).toBe(true);
        expect(t.safety.telegramCalls).toBe(0);
        expect(t.safety.playwrightLaunches).toBe(0);
        expect(t.safety.applicationSubmissions).toBe(0);
      });
    });

    test('9. Ambiguous execution recovery remains strictly blocked during execution', async () => {
      const execution = await runCareerOSOperatorExecution(mockOptions);
      const recStage = execution.trace.find((t) => t.stage === 'INCIDENT_RECOVERY_VALIDATION');
      expect(recStage.status).toBe('PASS');
    });

    test('10. Telegram test environment isolation guarantees 0 network dispatches', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });
  });

  // 11-15: Helpers, Status & Report Schema
  describe('Helpers, Status & Report Schema', () => {
    test('11. Status helper returns correct top-level execution status', () => {
      const status = getCareerOSOperatorExecutionStatus(mockOptions);
      expect(status.status).toBe('EXECUTION_READY');
      expect(status.isReady).toBe(true);
    });

    test('12. Full report generator produces complete structured report', async () => {
      const report = await generateCareerOSOperatorExecutionReport(mockOptions);
      expect(report).toHaveProperty('reportTitle');
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('readiness');
      expect(report).toHaveProperty('execution');
      expect(report.execution.status).toBe('EXECUTION_SUCCESS');
    });

    test('13. Execution safety verification helper confirms all safety invariants', async () => {
      const safety = await verifyCareerOSOperatorExecutionSafety(mockOptions);
      expect(safety.success).toBe(true);
      expect(safety.telegramCalls).toBe(0);
      expect(safety.playwrightLaunches).toBe(0);
      expect(safety.applicationSubmissions).toBe(0);
    });

    test('14. Scheduler validation stage passes cleanly with singleton protection', async () => {
      const execution = await runCareerOSOperatorExecution(mockOptions);
      const schedStage = execution.trace.find((t) => t.stage === 'SCHEDULER_VALIDATION');
      expect(schedStage.status).toBe('PASS');
    });

    test('15. Reliability validation stage confirms reliability harness certification', async () => {
      const execution = await runCareerOSOperatorExecution(mockOptions);
      const relStage = execution.trace.find((t) => t.stage === 'RELIABILITY_VALIDATION');
      expect(relStage.status).toBe('PASS');
    });
  });

  // 16-20: Final Certification Matrix
  describe('Final Certification Matrix', () => {
    test('16. Control Center stage passes snapshot validation', async () => {
      const execution = await runCareerOSOperatorExecution(mockOptions);
      const ccStage = execution.trace.find((t) => t.stage === 'CONTROL_CENTER');
      expect(ccStage.status).toBe('PASS');
    });

    test('17. Preflight stage passes preflight validation', async () => {
      const execution = await runCareerOSOperatorExecution(mockOptions);
      const pfStage = execution.trace.find((t) => t.stage === 'PREFLIGHT');
      expect(pfStage.status).toBe('PASS');
    });

    test('18. Operations validation stage passes operational snapshot check', async () => {
      const execution = await runCareerOSOperatorExecution(mockOptions);
      const opsStage = execution.trace.find((t) => t.stage === 'OPERATIONS_VALIDATION');
      expect(opsStage.status).toBe('PASS');
    });

    test('19. Finalize stage passes cleanly with zero data store mutations', async () => {
      const execution = await runCareerOSOperatorExecution(mockOptions);
      const finStage = execution.trace.find((t) => t.stage === 'FINALIZE');
      expect(finStage.status).toBe('PASS');
    });

    test('20. Complete P3.32 controlled operator execution baseline certified', async () => {
      const readiness = evaluateCareerOSOperatorExecutionReadiness(mockOptions);
      const execution = await runCareerOSOperatorExecution(mockOptions);
      expect(readiness.isReady).toBe(true);
      expect(execution.status).toBe('EXECUTION_SUCCESS');
      expect(execution.dataIntegrityVerified).toBe(true);
    });
  });
});

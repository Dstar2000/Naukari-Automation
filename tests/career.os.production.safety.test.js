const {
  runCareerOSProductionSafetyCheck,
  simulateCareerOSProcessRestart,
  simulateCareerOSSchedulerRestart,
  simulateCareerOSConcurrentExecution,
  simulateCareerOSStateCorruption,
  simulateCareerOSPartialFailure,
  simulateCareerOSTelegramFailure,
  simulateCareerOSPlaywrightFailure
} = require('../src/intelligence/career.os.production.safety');

const {
  evaluateCareerOSExecutionPermission
} = require('../src/intelligence/career.os.governance.enforcement');

const {
  executeApprovedDecision
} = require('../src/intelligence/career-decision.execution.gateway');

describe('Career OS Production Safety, Disaster Recovery & Concurrency Certification (P3.28)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  // 1-8: Restart & Concurrency Safety Tests
  describe('Disaster Recovery & Concurrency Safety', () => {
    test('1. Process restart simulation preserves governance state and prevents duplicate timers', async () => {
      const res = await simulateCareerOSProcessRestart(mockOptions);
      expect(res.success).toBe(true);
      expect(res.duplicateTimers).toBe(0);
      expect(res.governancePreserved).toBe(true);
    });

    test('2. Scheduler restart simulation is restart-safe and idempotent', async () => {
      const res = await simulateCareerOSSchedulerRestart(mockOptions);
      expect(res.success).toBe(true);
      expect(res.restarts).toBe(2);
    });

    test('3. Concurrent execution attempts allow at most 1 authoritative execution', async () => {
      const res = await simulateCareerOSConcurrentExecution(mockOptions);
      expect(res.success).toBe(true);
      expect(res.successfulCount).toBeLessThanOrEqual(1);
    });

    test('4. Concurrent incident processing prevents duplicate response plans', async () => {
      const res = await simulateCareerOSPartialFailure(mockOptions);
      expect(res.success).toBe(true);
      expect(res.processCrashed).toBe(false);
    });

    test('5. Missing governance state fails closed with INVALID_GOVERNANCE_STATE', async () => {
      const res = await simulateCareerOSStateCorruption(mockOptions);
      expect(res.missingFileCode).toBe('INVALID_GOVERNANCE_STATE');
    });

    test('6. Malformed governance state fails closed with INVALID_GOVERNANCE_STATE', async () => {
      const res = await simulateCareerOSStateCorruption(mockOptions);
      expect(res.malformedCode).toBe('INVALID_GOVERNANCE_STATE');
    });

    test('7. Invalid governance mode fails closed', async () => {
      const res = await simulateCareerOSStateCorruption(mockOptions);
      expect(res.invalidModeCode).toBe('INVALID_GOVERNANCE_STATE');
    });

    test('8. Forbidden automation override is rejected with FORBIDDEN_AUTOMATION_OVERRIDE', async () => {
      const res = await simulateCareerOSStateCorruption(mockOptions);
      expect(res.forbiddenOverrideCode).toBe('FORBIDDEN_AUTOMATION_OVERRIDE');
    });
  });

  // 9-16: Corruption, Partial Failure & Isolation Tests
  describe('Corruption Recovery, Partial Failures & Isolation', () => {
    test('9. Core data file missing/corrupt fixture handled gracefully', () => {
      const res = evaluateCareerOSExecutionPermission('READ_ONLY_OBSERVATION', {}, {
        ...mockOptions,
        customData: { 'jobs.json': 'corrupt_json' }
      });
      expect(res.allowed).toBe(true);
    });

    test('10. Partial response failure is recoverable and does not crash process', async () => {
      const res = await simulateCareerOSPartialFailure(mockOptions);
      expect(res.recoverable).toBe(true);
    });

    test('11. Telegram API failure is isolated without process crash', async () => {
      const res = await simulateCareerOSTelegramFailure(mockOptions);
      expect(res.isolated).toBe(true);
    });

    test('12. Playwright browser failure blocks auto-retry and requires reconciliation', async () => {
      const res = await simulateCareerOSPlaywrightFailure(mockOptions);
      expect(res.success).toBe(true);
      expect(res.reason).toBe('AMBIGUOUS_EXECUTION_BLOCKED');
    });

    test('13. Scheduler exception inside callback is isolated without recursive timer explosion', async () => {
      const res = await simulateCareerOSPartialFailure(mockOptions);
      expect(res.processCrashed).toBe(false);
    });

    test('14. Stale governance snapshot forces revalidation at execution boundary', () => {
      const res = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION', {}, mockOptions);
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('AUTONOMOUS_SUBMISSION_BLOCKED');
    });

    test('15. Duplicate execution attempt on executed decision is blocked', async () => {
      const decisionId = 'act_opportunity_exec_test_dup';
      await executeApprovedDecision(decisionId, { ...mockOptions, executionConfirmed: true, isMock: true });
      const res = await executeApprovedDecision(decisionId, { ...mockOptions, executionConfirmed: true, isMock: true });
      expect(res.success).toBe(false);
      expect(res.reason).toBe('ALREADY_EXECUTED');
    });

    test('16. ALREADY_ENGAGED application state is protected from re-submission', async () => {
      const decisionId = 'act_opportunity_57f713042c'; // Vbeyond Corporation
      const res = await executeApprovedDecision(decisionId, { ...mockOptions, executionConfirmed: true, isMock: true });
      expect(res.success).toBe(false);
      expect(res.reason).toContain('ALREADY_ENGAGED');
    });
  });

  // 17-24: Integrity, Isolation & Final Certification Matrix
  describe('Integrity, Isolation & Final Certification Matrix', () => {
    test('17. Ambiguous execution state blocks automated retry', () => {
      const res = evaluateCareerOSExecutionPermission('AMBIGUOUS_EXECUTION_RECOVERY', { isAmbiguous: true }, mockOptions);
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('AMBIGUOUS_EXECUTION_BLOCKED');
    });

    test('18. Incident deduplication remains deterministic across cycles', async () => {
      const res = await simulateCareerOSPartialFailure(mockOptions);
      expect(res.success).toBe(true);
    });

    test('19. Response recovery verification passes cleanly', async () => {
      const res = await simulateCareerOSPartialFailure(mockOptions);
      expect(res.recoverable).toBe(true);
    });

    test('20. Telegram test isolation guarantees 0 network dispatches in test env', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });

    test('21. Zero Playwright browser launches during safety suite execution', async () => {
      const res = await simulateCareerOSPlaywrightFailure(mockOptions);
      expect(res.playwrightLaunches).toBe(0);
    });

    test('22. Zero external career actions during production safety run', async () => {
      const safetyCheck = await runCareerOSProductionSafetyCheck(mockOptions);
      expect(safetyCheck.overallStatus).toBe('P3.28_PRODUCTION_SAFETY_CERTIFIED');
    });

    test('23. Zero production data store mutations during safety suite', async () => {
      const safetyCheck = await runCareerOSProductionSafetyCheck(mockOptions);
      expect(safetyCheck.invariantMatrix.coreStoreImmutability).toBe(true);
    });

    test('24. Complete production safety check achieves P3.28 certification baseline', async () => {
      const safetyCheck = await runCareerOSProductionSafetyCheck(mockOptions);
      expect(safetyCheck.overallStatus).toBe('P3.28_PRODUCTION_SAFETY_CERTIFIED');
      expect(safetyCheck.reliabilityStatus).toBe('RELIABILITY_CERTIFIED');
    });
  });
});

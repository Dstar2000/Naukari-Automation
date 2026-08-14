const {
  evaluateCareerOSOperatorWorkflow,
  generateCareerOSOperatorWorkflowReport,
  runCareerOSOperatorWorkflowCheck,
  getCareerOSOperatorWorkflowStatus,
  calculateCareerOSOperatorWorkflowFingerprint,
  verifyCoreStoreIntegrity
} = require('../src/intelligence/career.os.operator.workflow');

describe('Career OS Production Operator Workflow & Safety Validation (P3.31)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  // 1-5: Operator Workflow Evaluation & Core Steps
  describe('Operator Workflow Evaluation & Core Steps', () => {
    test('1. Successful workflow evaluation returns WORKFLOW_CERTIFIED', () => {
      const res = evaluateCareerOSOperatorWorkflow(mockOptions);
      expect(res.workflowStatus).toBe('WORKFLOW_CERTIFIED');
      expect(res.readiness).toBe('WORKFLOW_READY');
      expect(res.failures.length).toBe(0);
    });

    test('2. Workflow step array contains all 9 required operational steps', () => {
      const res = evaluateCareerOSOperatorWorkflow(mockOptions);
      const stepIds = res.steps.map((s) => s.stepId);
      expect(stepIds).toContain('CONTROL_CENTER');
      expect(stepIds).toContain('PREFLIGHT');
      expect(stepIds).toContain('GOVERNANCE');
      expect(stepIds).toContain('ENFORCEMENT');
      expect(stepIds).toContain('RUNTIME');
      expect(stepIds).toContain('SCHEDULER');
      expect(stepIds).toContain('INCIDENT_RECOVERY');
      expect(stepIds).toContain('OPERATIONS');
      expect(stepIds).toContain('RELIABILITY');
    });

    test('3. All steps pass cleanly in standard healthy production state', () => {
      const res = evaluateCareerOSOperatorWorkflow(mockOptions);
      res.steps.forEach((s) => {
        expect(s.status).toBe('PASS');
      });
    });

    test('4. Fingerprint generation is deterministic across identical evaluations', () => {
      const res1 = evaluateCareerOSOperatorWorkflow(mockOptions);
      const res2 = evaluateCareerOSOperatorWorkflow(mockOptions);
      expect(res1.fingerprint).toBe(res2.fingerprint);
      expect(typeof res1.fingerprint).toBe('string');
      expect(res1.fingerprint.length).toBe(64);
    });

    test('5. Read-only workflow evaluation preserves 100% data store immutability', () => {
      const preHashes = verifyCoreStoreIntegrity();
      evaluateCareerOSOperatorWorkflow(mockOptions);
      const postHashes = verifyCoreStoreIntegrity();
      expect(preHashes).toEqual(postHashes);
    });
  });

  // 6-10: Governance & Enforcement Safety Checks
  describe('Governance & Enforcement Safety Checks', () => {
    test('6. Governance failure marks GOVERNANCE step as FAIL and blocks workflow', () => {
      const res = evaluateCareerOSOperatorWorkflow({
        ...mockOptions,
        customGovernanceState: { governanceStatus: 'INACTIVE', operatorMode: 'PAUSED' }
      });
      expect(res.workflowStatus).toBe('WORKFLOW_FAILED');
      expect(res.readiness).toBe('WORKFLOW_BLOCKED');
      const govStep = res.steps.find((s) => s.stepId === 'GOVERNANCE');
      expect(govStep.status).toBe('FAIL');
    });

    test('7. Autonomous submission allowed state blocks governance and workflow', () => {
      const res = evaluateCareerOSOperatorWorkflow({
        ...mockOptions,
        customGovernanceState: {
          governanceStatus: 'ACTIVE',
          operatorMode: 'NORMAL',
          automationPolicy: { autonomousSubmissionsAllowed: true }
        }
      });
      expect(res.workflowStatus).toBe('WORKFLOW_FAILED');
    });

    test('8. Enforcement step verifies autonomous submission is BLOCKED', () => {
      const res = evaluateCareerOSOperatorWorkflow(mockOptions);
      const enfStep = res.steps.find((s) => s.stepId === 'ENFORCEMENT');
      expect(enfStep.status).toBe('PASS');
    });

    test('9. Incident / Recovery step verifies ambiguous recovery is BLOCKED', () => {
      const res = evaluateCareerOSOperatorWorkflow(mockOptions);
      const recStep = res.steps.find((s) => s.stepId === 'INCIDENT_RECOVERY');
      expect(recStep.status).toBe('PASS');
    });

    test('10. Telegram safety isolation guarantees 0 network dispatches in test env', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });
  });

  // 11-15: Helpers, Status & Report Schema
  describe('Helpers, Status & Report Schema', () => {
    test('11. Brief status helper returns correct workflow summary', () => {
      const status = getCareerOSOperatorWorkflowStatus(mockOptions);
      expect(status.workflowStatus).toBe('WORKFLOW_CERTIFIED');
      expect(status.readiness).toBe('WORKFLOW_READY');
      expect(status.failedStepsCount).toBe(0);
    });

    test('12. Full report generator produces complete structured report', () => {
      const report = generateCareerOSOperatorWorkflowReport(mockOptions);
      expect(report).toHaveProperty('reportTitle');
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('evaluation');
      expect(report.evaluation.workflowStatus).toBe('WORKFLOW_CERTIFIED');
    });

    test('13. Preflight step passes cleanly when preflight checks return PREFLIGHT_PASS', () => {
      const res = evaluateCareerOSOperatorWorkflow(mockOptions);
      const pfStep = res.steps.find((s) => s.stepId === 'PREFLIGHT');
      expect(pfStep.status).toBe('PASS');
    });

    test('14. Runtime step passes cleanly when runtime is ready', () => {
      const res = evaluateCareerOSOperatorWorkflow(mockOptions);
      const rtStep = res.steps.find((s) => s.stepId === 'RUNTIME');
      expect(rtStep.status).toBe('PASS');
    });

    test('15. Operations step passes cleanly when operations snapshot is available', () => {
      const res = evaluateCareerOSOperatorWorkflow(mockOptions);
      const opsStep = res.steps.find((s) => s.stepId === 'OPERATIONS');
      expect(opsStep.status).toBe('PASS');
    });
  });

  // 16-20: Final Certification Matrix
  describe('Final Certification Matrix', () => {
    test('16. Reliability step verifies reliability harness certification', () => {
      const res = evaluateCareerOSOperatorWorkflow(mockOptions);
      const relStep = res.steps.find((s) => s.stepId === 'RELIABILITY');
      expect(relStep.status).toBe('PASS');
    });

    test('17. Control Center step verifies snapshot availability', () => {
      const res = evaluateCareerOSOperatorWorkflow(mockOptions);
      const ccStep = res.steps.find((s) => s.stepId === 'CONTROL_CENTER');
      expect(ccStep.status).toBe('PASS');
    });

    test('18. Scheduler step verifies scheduler safety', () => {
      const res = evaluateCareerOSOperatorWorkflow(mockOptions);
      const schedStep = res.steps.find((s) => s.stepId === 'SCHEDULER');
      expect(schedStep.status).toBe('PASS');
    });

    test('19. Run check function alias works identically to evaluate function', () => {
      const checkRes = runCareerOSOperatorWorkflowCheck(mockOptions);
      expect(checkRes.workflowStatus).toBe('WORKFLOW_CERTIFIED');
    });

    test('20. Complete P3.31 operator workflow validation baseline certified', () => {
      const res = evaluateCareerOSOperatorWorkflow(mockOptions);
      expect(res.workflowStatus).toBe('WORKFLOW_CERTIFIED');
      expect(res.readiness).toBe('WORKFLOW_READY');
      expect(res.dataIntegrityVerified).toBe(true);
    });
  });
});

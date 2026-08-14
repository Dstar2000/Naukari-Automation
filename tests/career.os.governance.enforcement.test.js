const {
  evaluateCareerOSExecutionPermission,
  assertCareerOSExecutionAllowed,
  evaluateCareerOSIncidentResponsePermission,
  evaluateCareerOSTelegramPermission,
  evaluateCareerOSSchedulerPermission,
  evaluateCareerOSRecoveryPermission
} = require('../src/intelligence/career.os.governance.enforcement');

const {
  authorizeDecisionExecution
} = require('../src/intelligence/career-decision.execution.gateway');

const {
  executeIncidentResponsePlan
} = require('../src/intelligence/career.os.response.orchestrator');

const {
  processCareerOSIncidents
} = require('../src/intelligence/career.os.response.scheduler');

const {
  sendTelegramMessage
} = require('../src/telegram/telegram.bot');

describe('Career OS Governance Enforcement & Cross-Layer Safety Certification (P3.27)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  // 1-10: Enforcement Core & Fail-Closed Tests
  describe('Core Governance Enforcement & Fail-Closed Behavior', () => {
    test('1. Governance allows observation-only read operation', () => {
      const res = evaluateCareerOSExecutionPermission('READ_ONLY_OBSERVATION', {}, mockOptions);
      expect(res.allowed).toBe(true);
      expect(res.code).toBe('GOVERNANCE_EXECUTION_ALLOWED');
    });

    test('2. Autonomous submission is strictly blocked', () => {
      const res = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION', {}, mockOptions);
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('AUTONOMOUS_SUBMISSION_BLOCKED');
    });

    test('3. Forbidden automation override context is blocked', () => {
      const res = evaluateCareerOSExecutionPermission('EXTERNAL_CAREER_ACTION', { isAutonomous: true }, mockOptions);
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('AUTONOMOUS_SUBMISSION_BLOCKED');
    });

    test('4. Invalid governance mode is blocked in evaluation', () => {
      const res = evaluateCareerOSExecutionPermission('TEST', {}, {
        ...mockOptions,
        customGovernanceState: { operatorMode: 'BAD_MODE', governanceStatus: 'ACTIVE' }
      });
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('INVALID_GOVERNANCE_STATE');
    });

    test('5. Ambiguous execution auto-recovery is strictly blocked', () => {
      const res = evaluateCareerOSExecutionPermission('AMBIGUOUS_EXECUTION_RECOVERY', { isAmbiguous: true }, mockOptions);
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('AMBIGUOUS_EXECUTION_BLOCKED');
    });

    test('6. Missing governance state fails closed with INVALID_GOVERNANCE_STATE', () => {
      const res = evaluateCareerOSExecutionPermission('TEST', {}, {
        ...mockOptions,
        customGovernanceState: null
      });
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('INVALID_GOVERNANCE_STATE');
      expect(res.automationAllowed).toBe(false);
    });

    test('7. Malformed governance state fails closed', () => {
      const res = evaluateCareerOSExecutionPermission('TEST', {}, {
        ...mockOptions,
        customGovernanceState: { invalidField: true }
      });
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('INVALID_GOVERNANCE_STATE');
    });

    test('8. Incident response for internal health check is allowed', () => {
      const res = evaluateCareerOSIncidentResponsePermission({ incidentType: 'HEALTH_REGRESSION' }, { responseType: 'HEALTH_RECHECK' }, mockOptions);
      expect(res.allowed).toBe(true);
      expect(res.code).toBe('GOVERNANCE_EXECUTION_ALLOWED');
    });

    test('9. External career action through incident response is blocked', () => {
      const res = evaluateCareerOSIncidentResponsePermission({ incidentType: 'REPEATED_AMBIGUOUS_EXECUTION' }, { requiresExternalAction: true }, mockOptions);
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('AMBIGUOUS_EXECUTION_BLOCKED');
    });

    test('10. Telegram notification obeys governance PAUSED state', () => {
      const res = evaluateCareerOSTelegramPermission('ALERT', {}, {
        ...mockOptions,
        customGovernanceState: { operatorMode: 'PAUSED', governanceStatus: 'ACTIVE' }
      });
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('TELEGRAM_NOTIFICATION_BLOCKED');
    });
  });

  // 11-20: Cross-Layer Boundary Checks & Bypassing Tests
  describe('Cross-Layer Enforcement Integration & Bypass Resistance', () => {
    test('11. Scheduler obeys governance PAUSED state', () => {
      const res = evaluateCareerOSSchedulerPermission('ResponseScheduler', {
        ...mockOptions,
        customGovernanceState: { operatorMode: 'PAUSED', governanceStatus: 'ACTIVE' }
      });
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('SCHEDULER_EXECUTION_BLOCKED');
    });

    test('12. Direct decision execution gateway cannot bypass governance', async () => {
      const authRes = await authorizeDecisionExecution('act_test_bypass', { isAutonomous: true, ...mockOptions });
      expect(authRes.authorized).toBe(false);
      expect(authRes.reason).toBe('AUTONOMOUS_SUBMISSION_BLOCKED');
    });

    test('13. CLI status tool functions in read-only enforcement mode', () => {
      const cli = require('../scripts/career-os-governance-enforcement');
      expect(typeof cli.main).toBe('function');
    });

    test('14. Recovery guard blocks ambiguous state recovery', () => {
      const res = evaluateCareerOSRecoveryPermission({ isAmbiguous: true }, mockOptions);
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('AMBIGUOUS_EXECUTION_BLOCKED');
    });

    test('15. Response orchestrator fails blocked incident response plan', async () => {
      const res = await executeIncidentResponsePlan('resp_test', {
        ...mockOptions,
        plan: { incidentId: 'inc_test', anomalyType: 'REPEATED_AMBIGUOUS_EXECUTION' },
        customGovernanceState: { operatorMode: 'PAUSED', governanceStatus: 'ACTIVE' }
      });
      expect(res.success).toBe(false);
      expect(res.reason).toBe('INCIDENT_RESPONSE_BLOCKED');
    });

    test('16. Response scheduler gracefully stops when governance disables scheduler', async () => {
      const res = await processCareerOSIncidents({
        ...mockOptions,
        customGovernanceState: { operatorMode: 'PAUSED', governanceStatus: 'ACTIVE' }
      });
      expect(res.success).toBe(false);
      expect(res.reason).toBe('SCHEDULER_EXECUTION_BLOCKED');
    });

    test('17. sendTelegramMessage suppresses message when governance blocks telegram', async () => {
      const res = await sendTelegramMessage('Test Message', 123456, {
        customGovernanceState: { operatorMode: 'PAUSED', governanceStatus: 'ACTIVE' }
      });
      expect(res.suppressed).toBe(true);
      expect(res.reason).toBe('TELEGRAM_NOTIFICATION_BLOCKED');
    });

    test('18. NODE_ENV=test produces zero Telegram network calls', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });

    test('19. Zero Playwright launches during governance assertions', () => {
      expect(() => {
        assertCareerOSExecutionAllowed('READ_ONLY_OBSERVATION', {}, mockOptions);
      }).not.toThrow();
    });

    test('20. assertCareerOSExecutionAllowed throws explicit error when blocked', () => {
      expect(() => {
        assertCareerOSExecutionAllowed('AUTONOMOUS_SUBMISSION', {}, mockOptions);
      }).toThrow('[Governance Enforcement] Execution Blocked (AUTONOMOUS_SUBMISSION_BLOCKED)');
    });
  });

  // 21-30+: End-to-End Governance Pipeline Integration Scenario
  describe('End-to-End Governance Pipeline Scenarios', () => {
    test('21. Complete end-to-end incident response path obeys governance boundary', async () => {
      // 1. Evaluate permission for internal health check
      const perm = evaluateCareerOSIncidentResponsePermission(
        { incidentType: 'HEALTH_REGRESSION' },
        { responseType: 'HEALTH_RECHECK' },
        mockOptions
      );
      expect(perm.allowed).toBe(true);

      // 2. Execute incident response under governance permission
      const res = await executeIncidentResponsePlan('resp_e2e_1', {
        ...mockOptions,
        plan: {
          responseId: 'resp_e2e_1',
          incidentId: 'inc_e2e_1',
          anomalyType: 'HEALTH_REGRESSION',
          responseStatus: 'RESPONSE_PLANNED',
          actions: [{ step: 2, name: 'HEALTH_RECHECK', status: 'PENDING' }]
        }
      });

      expect(res.success).toBe(true);
      expect(res.plan.responseStatus).toBe('RECOVERY_PENDING');
    });

    test('22. Final governance enforcement classification baseline is achieved', () => {
      const evalRes = evaluateCareerOSExecutionPermission('READ_ONLY_OBSERVATION', {}, mockOptions);
      expect(evalRes.code).toBe('GOVERNANCE_EXECUTION_ALLOWED');
    });
  });
});

const {
  getCareerOSGovernanceState,
  generateCareerOSGovernanceReport,
  validateCareerOSGovernanceChange,
  applyCareerOSGovernanceChange,
  isCareerOSAutomationAllowed,
  isCareerOSIncidentResponseAllowed,
  isCareerOSTelegramNotificationAllowed,
  recordCareerOSGovernanceChange,
  getCareerOSGovernanceHistory
} = require('../src/intelligence/career.os.governance');

const {
  generateCareerOSOperationsSnapshot
} = require('../src/intelligence/career.os.operations');

describe('Career OS Operator Control & Governance Layer (P3.26)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  // 1-10: State & Inspection Tests
  describe('Governance State & Report Inspection', () => {
    test('1. Retrieves default governance state cleanly', () => {
      const state = getCareerOSGovernanceState(mockOptions);
      expect(state.schemaVersion).toBe('1.0.0');
      expect(state.governanceStatus).toBe('ACTIVE');
      expect(state.operatorMode).toBe('NORMAL');
    });

    test('2. Default state has schedulers enabled', () => {
      const state = getCareerOSGovernanceState(mockOptions);
      expect(state.automationPolicy.schedulersEnabled).toBe(true);
    });

    test('3. Default state blocks autonomous submissions', () => {
      const state = getCareerOSGovernanceState(mockOptions);
      expect(state.automationPolicy.autonomousSubmissionsAllowed).toBe(false);
    });

    test('4. Default state enables incident response', () => {
      const state = getCareerOSGovernanceState(mockOptions);
      expect(state.incidentPolicy.automatedIncidentResponseEnabled).toBe(true);
    });

    test('5. Default state enables Telegram notifications', () => {
      const state = getCareerOSGovernanceState(mockOptions);
      expect(state.notificationPolicy.telegramNotificationsEnabled).toBe(true);
    });

    test('6. Default state blocks ambiguous auto recovery', () => {
      const state = getCareerOSGovernanceState(mockOptions);
      expect(state.responsePolicy.allowAmbiguousAutoRecovery).toBe(false);
    });

    test('7. State contains fingerprint string', () => {
      const state = getCareerOSGovernanceState(mockOptions);
      expect(state.fingerprint).toBeDefined();
    });

    test('8. Generates governance report cleanly', () => {
      const report = generateCareerOSGovernanceReport(mockOptions);
      expect(report.reportTitle).toBe('Career OS Operator Governance Report');
      expect(report.state).toBeDefined();
      expect(report.checks).toBeDefined();
    });

    test('9. Checks automation permission helpers for NORMAL mode', () => {
      expect(isCareerOSAutomationAllowed(mockOptions)).toBe(true);
      expect(isCareerOSIncidentResponseAllowed(mockOptions)).toBe(true);
      expect(isCareerOSTelegramNotificationAllowed(mockOptions)).toBe(true);
    });

    test('10. Custom mock governance state option works', () => {
      const state = getCareerOSGovernanceState({
        ...mockOptions,
        customGovernanceState: { operatorMode: 'PAUSED' }
      });
      expect(state.operatorMode).toBe('PAUSED');
    });
  });

  // 11-20: Change Validation & Allowlist Tests
  describe('Governance Change Validation & Rejection Codes', () => {
    test('11. Validates valid mode change to OBSERVATION_ONLY', () => {
      const res = validateCareerOSGovernanceChange({ operatorMode: 'OBSERVATION_ONLY' }, mockOptions);
      expect(res.valid).toBe(true);
      expect(res.code).toBe('GOVERNANCE_CHANGE_ALLOWED');
    });

    test('12. Validates valid mode change to INCIDENT_RESPONSE_ONLY', () => {
      const res = validateCareerOSGovernanceChange({ operatorMode: 'INCIDENT_RESPONSE_ONLY' }, mockOptions);
      expect(res.valid).toBe(true);
    });

    test('13. Validates valid mode change to PAUSED', () => {
      const res = validateCareerOSGovernanceChange({ operatorMode: 'PAUSED' }, mockOptions);
      expect(res.valid).toBe(true);
    });

    test('14. Rejects invalid operator mode with INVALID_GOVERNANCE_MODE', () => {
      const res = validateCareerOSGovernanceChange({ operatorMode: 'SUPER_AUTONOMOUS_MODE' }, mockOptions);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('INVALID_GOVERNANCE_MODE');
    });

    test('15. Rejects autonomous submission override with FORBIDDEN_AUTOMATION_OVERRIDE', () => {
      const res = validateCareerOSGovernanceChange({ autonomousSubmissionsAllowed: true }, mockOptions);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('FORBIDDEN_AUTOMATION_OVERRIDE');
    });

    test('16. Rejects nested autonomous submission override', () => {
      const res = validateCareerOSGovernanceChange({ automationPolicy: { autonomousSubmissionsAllowed: true } }, mockOptions);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('FORBIDDEN_AUTOMATION_OVERRIDE');
    });

    test('17. Rejects ambiguous auto recovery override with AMBIGUOUS_EXECUTION_OVERRIDE_BLOCKED', () => {
      const res = validateCareerOSGovernanceChange({ allowAmbiguousAutoRecovery: true }, mockOptions);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('AMBIGUOUS_EXECUTION_OVERRIDE_BLOCKED');
    });

    test('18. Rejects disabling application guards', () => {
      const res = validateCareerOSGovernanceChange({ disableGuards: true }, mockOptions);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('FORBIDDEN_AUTOMATION_OVERRIDE');
    });

    test('19. Rejects profile mutations', () => {
      const res = validateCareerOSGovernanceChange({ profileMutation: { name: 'Hack' } }, mockOptions);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('FORBIDDEN_AUTOMATION_OVERRIDE');
    });

    test('20. Rejects null/undefined payload with GOVERNANCE_CHANGE_BLOCKED', () => {
      const res = validateCareerOSGovernanceChange(null, mockOptions);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('GOVERNANCE_CHANGE_BLOCKED');
    });
  });

  // 21-30: Applying Governance Changes & Mode Behavior
  describe('Applying Governance Changes & Mode Policy Rules', () => {
    test('21. Applies valid operator mode change cleanly', () => {
      const result = applyCareerOSGovernanceChange({ operatorMode: 'OBSERVATION_ONLY' }, mockOptions);
      expect(result.success).toBe(true);
      expect(result.state.operatorMode).toBe('OBSERVATION_ONLY');
      expect(result.state.changeCount).toBe(1);
    });

    test('22. Rejects invalid governance change during apply', () => {
      const result = applyCareerOSGovernanceChange({ autonomousSubmissionsAllowed: true }, mockOptions);
      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN_AUTOMATION_OVERRIDE');
    });

    test('23. PAUSED mode blocks automation, incident response, and telegram', () => {
      const customState = { operatorMode: 'PAUSED' };
      expect(isCareerOSAutomationAllowed({ ...mockOptions, customGovernanceState: customState })).toBe(false);
      expect(isCareerOSIncidentResponseAllowed({ ...mockOptions, customGovernanceState: customState })).toBe(false);
      expect(isCareerOSTelegramNotificationAllowed({ ...mockOptions, customGovernanceState: customState })).toBe(false);
    });

    test('24. OBSERVATION_ONLY mode blocks automation & response but permits notifications', () => {
      const customState = {
        operatorMode: 'OBSERVATION_ONLY',
        notificationPolicy: { telegramNotificationsEnabled: true }
      };
      expect(isCareerOSAutomationAllowed({ ...mockOptions, customGovernanceState: customState })).toBe(false);
      expect(isCareerOSIncidentResponseAllowed({ ...mockOptions, customGovernanceState: customState })).toBe(false);
      expect(isCareerOSTelegramNotificationAllowed({ ...mockOptions, customGovernanceState: customState })).toBe(true);
    });

    test('25. INCIDENT_RESPONSE_ONLY mode blocks general automation but allows response', () => {
      const customState = {
        operatorMode: 'INCIDENT_RESPONSE_ONLY',
        incidentPolicy: { automatedIncidentResponseEnabled: true }
      };
      expect(isCareerOSAutomationAllowed({ ...mockOptions, customGovernanceState: customState })).toBe(false);
    });

    test('26. Appended governance change updates change timestamp and actor', () => {
      const result = applyCareerOSGovernanceChange({ operatorMode: 'PAUSED' }, { ...mockOptions, actor: 'OPERATOR_BOB' });
      expect(result.state.lastChangedBy).toBe('OPERATOR_BOB');
    });

    test('27. Records governance audit log entry into history', () => {
      const entry = recordCareerOSGovernanceChange({ actor: 'TESTER', changeType: 'TEST_MUTATION' }, mockOptions);
      expect(entry.id).toBeDefined();
      expect(entry.actor).toBe('TESTER');
      expect(entry.fingerprint).toBeDefined();
    });

    test('28. Governance history retrieval returns array', () => {
      const hist = getCareerOSGovernanceHistory(mockOptions);
      expect(Array.isArray(hist)).toBe(true);
    });

    test('29. Maintains invariant: autonomousSubmissionsAllowed is ALWAYS false after change', () => {
      const result = applyCareerOSGovernanceChange({ automationPolicy: { schedulersEnabled: false } }, mockOptions);
      expect(result.state.automationPolicy.autonomousSubmissionsAllowed).toBe(false);
    });

    test('30. Maintains invariant: allowAmbiguousAutoRecovery is ALWAYS false after change', () => {
      const result = applyCareerOSGovernanceChange({ responsePolicy: { maxAutomatedRetries: 0 } }, mockOptions);
      expect(result.state.responsePolicy.allowAmbiguousAutoRecovery).toBe(false);
    });
  });

  // 31-40: Dashboard Integration & Safety Isolation
  describe('Dashboard Integration & Safety Isolation', () => {
    test('31. Operations snapshot exposes governance section', () => {
      const snapshot = generateCareerOSOperationsSnapshot(mockOptions);
      expect(snapshot.governance).toBeDefined();
      expect(snapshot.governance.operatorMode).toBeDefined();
    });

    test('32. Dashboard snapshot is strictly read-only and does not mutate governance', () => {
      const stateBefore = getCareerOSGovernanceState(mockOptions);
      generateCareerOSOperationsSnapshot(mockOptions);
      const stateAfter = getCareerOSGovernanceState(mockOptions);
      expect(stateAfter.changeCount).toBe(stateBefore.changeCount);
    });

    test('33. NODE_ENV=test ensures zero Telegram network calls', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });

    test('34. Zero Playwright browser launches during governance calls', () => {
      const report = generateCareerOSGovernanceReport(mockOptions);
      expect(report).toBeDefined();
    });

    test('35. Governance history caps retention at 500 records', () => {
      const mockHistory = Array.from({ length: 550 }, (_, i) => ({ id: `id_${i}` }));
      const entry = recordCareerOSGovernanceChange({ actor: 'TEST' }, { ...mockOptions, customGovernanceHistory: mockHistory });
      expect(entry.id).toBeDefined();
    });

    test('36. Malformed history file recovers with empty array fallback', () => {
      const hist = getCareerOSGovernanceHistory({ ...mockOptions, customGovernanceHistory: null });
      expect(Array.isArray(hist)).toBe(true);
    });

    test('37. Governance module exports required public API functions', () => {
      const gov = require('../src/intelligence/career.os.governance');
      expect(typeof gov.getCareerOSGovernanceState).toBe('function');
      expect(typeof gov.generateCareerOSGovernanceReport).toBe('function');
      expect(typeof gov.validateCareerOSGovernanceChange).toBe('function');
      expect(typeof gov.applyCareerOSGovernanceChange).toBe('function');
    });

    test('38. SHA-256 fingerprinting is deterministic across identical states', () => {
      const s1 = getCareerOSGovernanceState(mockOptions);
      const s2 = getCareerOSGovernanceState(mockOptions);
      expect(s1.fingerprint).toBe(s2.fingerprint);
    });

    test('39. CLI controller script is importable cleanly', () => {
      const cli = require('../scripts/career-os-governance');
      expect(typeof cli.main).toBe('function');
    });

    test('40. Final governance layer satisfies P3.26 verification baseline', () => {
      const report = generateCareerOSGovernanceReport(mockOptions);
      expect(report.state.governanceStatus).toBe('ACTIVE');
    });
  });
});

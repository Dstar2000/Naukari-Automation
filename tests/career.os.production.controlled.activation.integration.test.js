const {
  runPhaseP338ControlledActivationAudit,
  calculateControlledActivationFingerprint
} = require('../scripts/audit-phase-p3-38-controlled-activation');

const {
  runPhaseP337ProductionHandoverAudit
} = require('../scripts/audit-phase-p3-37-production-handover');

const {
  evaluateCareerOSProductionActivation,
  generateCareerOSProductionActivationReport,
  getCareerOSProductionActivationStatus,
  requestCareerOSProductionActivation,
  approveCareerOSProductionActivation,
  rejectCareerOSProductionActivation,
  revokeCareerOSProductionActivation
} = require('../src/intelligence/career.os.production.activation');

const {
  evaluateCareerOSRuntimeReadiness,
  getCareerOSRuntimeStatus,
  startCareerOSRuntime,
  stopCareerOSRuntime
} = require('../src/intelligence/career.os.production.runtime');

const {
  evaluateCareerOSOperatorExecutionReadiness,
  runCareerOSOperatorExecution,
  getCareerOSOperatorExecutionStatus
} = require('../src/intelligence/career.os.operator.execution');

const {
  generateCareerOSControlCenterSnapshot
} = require('../src/intelligence/career.os.control.center');

const {
  getCareerOSGovernanceState
} = require('../src/intelligence/career.os.governance');

describe('Career OS Controlled Production Activation & Observation Test Suite (P3.38)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  afterEach(() => {
    stopCareerOSRuntime();
  });

  test('1. P3.37 handover prerequisite certification is present and valid', async () => {
    const handoverReport = await runPhaseP337ProductionHandoverAudit({ silent: true });
    expect(handoverReport.classification).toBe('P3.37_PRODUCTION_HANDOVER_READY');
  });

  test('2. Initial activation state is INACTIVE and execution is BLOCKED', () => {
    const actStatus = getCareerOSProductionActivationStatus(mockOptions);
    const execStatus = evaluateCareerOSOperatorExecutionReadiness(mockOptions);

    expect(actStatus.status).toBe('INACTIVE');
    expect(actStatus.activationGate).toBe('BLOCKED');
    expect(execStatus.productionExecutionAllowed).toBe(false);
    expect(execStatus.reason).toBe('PRODUCTION_ACTIVATION_REQUIRED');
  });

  test('3. Invalid operator identities cannot activate production', () => {
    const invalidNames = ['', '   ', 'AUTOMATED_SYSTEM', 'system', 'automation', 'SYSTEM'];

    invalidNames.forEach((name) => {
      const res = approveCareerOSProductionActivation(name, 'Reason', mockOptions);
      expect(res.success).toBe(false);
      expect(res.reason).toBe('INVALID_OPERATOR');
    });
  });

  test('4. Activation request transitions state from INACTIVE to PENDING_APPROVAL', () => {
    const reqRes = requestCareerOSProductionActivation(mockOptions);
    expect(reqRes.success).toBe(true);
    expect(reqRes.status).toBe('PENDING_APPROVAL');
  });

  test('5. Valid explicit operator approval transitions state to ACTIVE', () => {
    const appRes = approveCareerOSProductionActivation('P338_TEST_OPERATOR', 'Controlled test approval', mockOptions);
    expect(appRes.success).toBe(true);
    expect(appRes.status).toBe('ACTIVE');
    expect(appRes.approvedBy).toBe('P338_TEST_OPERATOR');
  });

  test('6. ACTIVE state produces ALLOWED execution permission', () => {
    const approvedMockState = {
      status: 'ACTIVE',
      approvedBy: 'P338_TEST_OPERATOR',
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    };

    const execStatus = evaluateCareerOSOperatorExecutionReadiness({ customActivationState: approvedMockState, ...mockOptions });
    expect(execStatus.productionExecutionAllowed).toBe(true);
    expect(execStatus.reason).toBe('PRODUCTION_ACTIVATION_APPROVED');
  });

  test('7. ACTIVE state does NOT enable autonomous submissions', () => {
    const approvedMockState = {
      status: 'ACTIVE',
      approvedBy: 'P338_TEST_OPERATOR',
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    };

    const govState = getCareerOSGovernanceState({ customActivationState: approvedMockState, ...mockOptions });
    const autoBlocked = govState && govState.automationPolicy ? !govState.automationPolicy.autonomousSubmissionsAllowed : true;
    expect(autoBlocked).toBe(true);
  });

  test('8. Runtime singleton protection remains intact during activation', async () => {
    stopCareerOSRuntime();
    const s1 = await startCareerOSRuntime(mockOptions);
    const s2 = await startCareerOSRuntime(mockOptions);
    stopCareerOSRuntime();

    expect(s1.started).toBe(true);
    expect(s2.alreadyRunning).toBe(true);
  });

  test('9. Unsafe governance overrides ACTIVE state and forces BLOCKED execution', () => {
    const inactiveGovMock = {
      governanceStatus: 'INACTIVE',
      operatorMode: 'PAUSED',
      automationPolicy: { autonomousSubmissionsAllowed: false }
    };
    const approvedMockState = {
      status: 'ACTIVE',
      approvedBy: 'P338_TEST_OPERATOR',
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    };

    const evalRes = evaluateCareerOSProductionActivation({
      customGovernanceState: inactiveGovMock,
      customActivationState: approvedMockState,
      ...mockOptions
    });

    expect(evalRes.status).toBe('BLOCKED');
    expect(evalRes.activationGate).toBe('BLOCKED');
  });

  test('10. Revocation transitions ACTIVE state to REVOKED and BLOCKED', () => {
    const appRes = approveCareerOSProductionActivation('P338_TEST_OPERATOR', 'Reason', mockOptions);
    expect(appRes.status).toBe('ACTIVE');

    const revRes = revokeCareerOSProductionActivation('P338_TEST_OPERATOR', 'Controlled test revocation', mockOptions);
    expect(revRes.success).toBe(true);
    expect(revRes.status).toBe('REVOKED');

    const evalRes = evaluateCareerOSProductionActivation(mockOptions);
    expect(evalRes.activationGate).toBe('BLOCKED');
  });

  test('11. Expired approval token evaluates to EXPIRED and BLOCKED', () => {
    const expiredMockState = {
      status: 'ACTIVE',
      approvedBy: 'P338_TEST_OPERATOR',
      approvedAt: new Date(Date.now() - 7200000).toISOString(),
      expiresAt: new Date(Date.now() - 3600000).toISOString(),
      reason: 'EXPIRED_P338'
    };

    const evalRes = evaluateCareerOSProductionActivation({ customActivationState: expiredMockState, ...mockOptions });
    expect(evalRes.status).toBe('EXPIRED');
    expect(evalRes.activationGate).toBe('BLOCKED');
  });

  test('12. Full P3.38 controlled activation audit passes and reports P3.38_CONTROLLED_PRODUCTION_ACTIVATION_CERTIFIED', async () => {
    const auditReport = await runPhaseP338ControlledActivationAudit({ silent: true });

    expect(auditReport.classification).toBe('P3.38_CONTROLLED_PRODUCTION_ACTIVATION_CERTIFIED');
    expect(auditReport.safetyIsolations.telegramCalls).toBe(0);
    expect(auditReport.safetyIsolations.playwrightLaunches).toBe(0);
    expect(auditReport.safetyIsolations.applicationSubmissions).toBe(0);
    expect(auditReport.safetyIsolations.externalCareerActions).toBe(0);
    expect(auditReport.safetyIsolations.coreStoreMutations).toBe(0);
  });

  test('13. External action counters remain zero throughout observation', async () => {
    const auditReport = await runPhaseP338ControlledActivationAudit({ silent: true });
    expect(auditReport.safetyIsolations.telegramCalls).toBe(0);
    expect(auditReport.safetyIsolations.playwrightLaunches).toBe(0);
    expect(auditReport.safetyIsolations.applicationSubmissions).toBe(0);
    expect(auditReport.safetyIsolations.externalCareerActions).toBe(0);
  });

  test('14. Repeated evaluation produces identical audit fingerprints', async () => {
    const r1 = await runPhaseP338ControlledActivationAudit({ silent: true });
    const r2 = await runPhaseP338ControlledActivationAudit({ silent: true });

    expect(r1.fingerprint).toBe(r2.fingerprint);
    expect(r1.classification).toBe(r2.classification);
  });

  test('15. Audit always finishes safely in REVOKED or INACTIVE state', async () => {
    const auditReport = await runPhaseP338ControlledActivationAudit({ silent: true });

    expect(['REVOKED', 'INACTIVE']).toContain(auditReport.finalActivationStatus);
    expect(auditReport.finalExecutionPermission).toBe('BLOCKED');
  });
});

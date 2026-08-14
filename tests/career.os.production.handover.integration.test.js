const {
  runPhaseP337ProductionHandoverAudit,
  calculateHandoverFingerprint
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
  generateCareerOSPreflightReport
} = require('../src/intelligence/career.os.preflight');

const {
  getCareerOSGovernanceState
} = require('../src/intelligence/career.os.governance');

describe('Career OS Production Handover & Readiness Integration Test Suite (P3.37)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  afterEach(() => {
    stopCareerOSRuntime();
  });

  test('1. System clearly distinguishes READY_FOR_HUMAN_ACTIVATION from PRODUCTION_ACTIVE', () => {
    const actStatus = getCareerOSProductionActivationStatus(mockOptions);
    const execStatus = evaluateCareerOSOperatorExecutionReadiness(mockOptions);

    expect(execStatus.isReady).toBe(true);
    expect(actStatus.status).toBe('INACTIVE');
    expect(execStatus.productionExecutionAllowed).toBe(false);
    expect(execStatus.reason).toBe('PRODUCTION_ACTIVATION_REQUIRED');
  });

  test('2. Runtime readiness does NOT imply production activation or execution permission', async () => {
    stopCareerOSRuntime();
    const startRes = await startCareerOSRuntime(mockOptions);
    expect(startRes.started).toBe(true);

    const runtimeStatus = getCareerOSRuntimeStatus(mockOptions);
    expect(runtimeStatus.runtimeStatus).toBe('RUNNING');
    expect(runtimeStatus.productionExecutionAllowed).toBe(false);

    stopCareerOSRuntime();
  });

  test('3. Governance ACTIVE status does NOT imply production activation or execution permission', () => {
    const govState = getCareerOSGovernanceState(mockOptions);
    expect(govState.governanceStatus).toBe('ACTIVE');

    const actStatus = getCareerOSProductionActivationStatus(mockOptions);
    expect(actStatus.status).toBe('INACTIVE');
    expect(actStatus.activationGate).toBe('BLOCKED');
  });

  test('4. Full handover audit suite executes cleanly and reports P3.37_PRODUCTION_HANDOVER_READY', async () => {
    const auditReport = await runPhaseP337ProductionHandoverAudit({ silent: true });

    expect(auditReport.classification).toBe('P3.37_PRODUCTION_HANDOVER_READY');
    expect(auditReport.handoverState.productionReadiness).toBe('READY');
    expect(auditReport.handoverState.productionExecutionAllowed).toBe(false);
    expect(auditReport.handoverState.operatorApprovalRequired).toBe(true);
    expect(auditReport.safetyIsolations.telegramCalls).toBe(0);
    expect(auditReport.safetyIsolations.playwrightLaunches).toBe(0);
    expect(auditReport.safetyIsolations.applicationSubmissions).toBe(0);
    expect(auditReport.safetyIsolations.externalCareerActions).toBe(0);
    expect(auditReport.safetyIsolations.coreStoreMutations).toBe(0);
  });

  test('5. Explicit human operator approval boundary is strictly enforced', () => {
    const emptyOpRes = approveCareerOSProductionActivation('', 'Reason', mockOptions);
    expect(emptyOpRes.success).toBe(false);
    expect(emptyOpRes.reason).toBe('INVALID_OPERATOR');

    const autoOpRes = approveCareerOSProductionActivation('AUTOMATED_SYSTEM', 'Reason', mockOptions);
    expect(autoOpRes.success).toBe(false);
    expect(autoOpRes.reason).toBe('INVALID_OPERATOR');

    const validOpRes = approveCareerOSProductionActivation('HUMAN_OPERATOR_ALICE', 'Valid handover approval', mockOptions);
    expect(validOpRes.success).toBe(true);
    expect(validOpRes.status).toBe('ACTIVE');
    expect(validOpRes.approvedBy).toBe('HUMAN_OPERATOR_ALICE');
  });

  test('6. Immediate revocation transitions state to REVOKED and gate to BLOCKED', () => {
    const appRes = approveCareerOSProductionActivation('HUMAN_OPERATOR_ALICE', 'Reason', mockOptions);
    expect(appRes.status).toBe('ACTIVE');

    const revRes = revokeCareerOSProductionActivation('HUMAN_OPERATOR_ALICE', 'Handover revocation', mockOptions);
    expect(revRes.success).toBe(true);
    expect(revRes.status).toBe('REVOKED');

    const actStatus = evaluateCareerOSProductionActivation(mockOptions);
    expect(actStatus.activationGate).toBe('BLOCKED');
  });

  test('7. Expired activation token evaluates to EXPIRED and BLOCKED', () => {
    const expiredMockState = {
      status: 'ACTIVE',
      activationId: 'act_exp_p337_unit',
      approvedBy: 'HUMAN_OPERATOR_ALICE',
      approvedAt: new Date(Date.now() - 7200000).toISOString(),
      expiresAt: new Date(Date.now() - 3600000).toISOString(),
      reason: 'EXPIRED_HANDOVER'
    };

    const evalRes = evaluateCareerOSProductionActivation({ customActivationState: expiredMockState, ...mockOptions });
    expect(evalRes.status).toBe('EXPIRED');
    expect(evalRes.activationGate).toBe('BLOCKED');
  });

  test('8. Governance INACTIVE overrides active operator approval and blocks execution', () => {
    const inactiveGovMock = {
      governanceStatus: 'INACTIVE',
      operatorMode: 'PAUSED',
      automationPolicy: { autonomousSubmissionsAllowed: false }
    };
    const approvedMockState = {
      status: 'ACTIVE',
      approvedBy: 'HUMAN_OPERATOR_ALICE',
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    };

    const evalRes = evaluateCareerOSProductionActivation({
      customGovernanceState: inactiveGovMock,
      customActivationState: approvedMockState,
      ...mockOptions
    });

    expect(evalRes.status).toBe('BLOCKED');
    expect(evalRes.activationGate).toBe('BLOCKED');
  });

  test('9. Handover evaluation is strictly deterministic across repeated runs', async () => {
    const report1 = await runPhaseP337ProductionHandoverAudit({ silent: true });
    const report2 = await runPhaseP337ProductionHandoverAudit({ silent: true });

    expect(report1.fingerprint).toBe(report2.fingerprint);
    expect(report1.classification).toBe(report2.classification);
  });
});

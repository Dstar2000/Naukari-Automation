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

describe('Career OS Production Activation Gate Integration Test Suite (P3.36)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  afterEach(() => {
    stopCareerOSRuntime();
  });

  test('1. Runtime infrastructure can be RUNNING while production activation remains INACTIVE', async () => {
    stopCareerOSRuntime();
    const startRes = await startCareerOSRuntime(mockOptions);
    expect(startRes.started).toBe(true);

    const runtimeStatus = getCareerOSRuntimeStatus(mockOptions);
    expect(runtimeStatus.runtimeStatus).toBe('RUNNING');
    expect(runtimeStatus.activationStatus).toBe('INACTIVE');
    expect(runtimeStatus.productionExecutionAllowed).toBe(false);

    stopCareerOSRuntime();
  });

  test('2. Operator execution readiness requires explicit activation approval before reporting allowed', () => {
    const defaultExec = evaluateCareerOSOperatorExecutionReadiness(mockOptions);
    expect(defaultExec.isReady).toBe(true);
    expect(defaultExec.productionExecutionAllowed).toBe(false);
    expect(defaultExec.reason).toBe('PRODUCTION_ACTIVATION_REQUIRED');

    const approvedMockState = {
      status: 'ACTIVE',
      approvedBy: 'UNIT_TEST_OPERATOR',
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      reason: 'UNIT_TEST_APPROVAL'
    };

    const approvedExec = evaluateCareerOSOperatorExecutionReadiness({ customActivationState: approvedMockState, ...mockOptions });
    expect(approvedExec.productionExecutionAllowed).toBe(true);
    expect(approvedExec.reason).toBe('PRODUCTION_ACTIVATION_APPROVED');
    expect(approvedExec.approvedBy).toBe('UNIT_TEST_OPERATOR');
  });

  test('3. Control center snapshot cleanly exposes activation state section', () => {
    const snapshot = generateCareerOSControlCenterSnapshot(mockOptions);
    expect(snapshot.activation).toBeDefined();
    expect(snapshot.activation.status).toBe('INACTIVE');
    expect(snapshot.activation.approvalStatus).toBe('NOT_APPROVED');
    expect(snapshot.activation.executionPermission).toBe('BLOCKED');
  });

  test('4. Preflight report validates activation module and state validity in checks', () => {
    const preflight = generateCareerOSPreflightReport(mockOptions);
    expect(preflight.status).toBe('PREFLIGHT_PASS');
    expect(preflight.activation).toBeDefined();

    const activationCheck = preflight.checks.find((c) => c.checkId === 'PREFLIGHT_ACTIVATION_STATE_VALID');
    expect(activationCheck).toBeDefined();
    expect(activationCheck.status).toBe('PASS');
  });

  test('5. Governance INACTIVE overrides activation approval and forces activation BLOCKED', () => {
    const inactiveGovMock = {
      governanceStatus: 'INACTIVE',
      operatorMode: 'PAUSED',
      automationPolicy: { autonomousSubmissionsAllowed: false }
    };
    const approvedMockState = {
      status: 'ACTIVE',
      approvedBy: 'UNIT_TEST_OPERATOR',
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

  test('6. Approval requires explicit human operator identity', () => {
    const invalidRes = approveCareerOSProductionActivation('', 'Reason', mockOptions);
    expect(invalidRes.success).toBe(false);
    expect(invalidRes.reason).toBe('INVALID_OPERATOR');

    const autoRes = approveCareerOSProductionActivation('AUTOMATED_SYSTEM', 'Reason', mockOptions);
    expect(autoRes.success).toBe(false);
    expect(autoRes.reason).toBe('INVALID_OPERATOR');
  });

  test('7. Governed activation lifecycle: request, approve, revoke, reject, expire', () => {
    const reqRes = requestCareerOSProductionActivation(mockOptions);
    expect(reqRes.success).toBe(true);
    expect(reqRes.status).toBe('PENDING_APPROVAL');

    const appRes = approveCareerOSProductionActivation('UNIT_TEST_OPERATOR', 'Explicit approval', mockOptions);
    expect(appRes.success).toBe(true);
    expect(appRes.status).toBe('ACTIVE');

    const revRes = revokeCareerOSProductionActivation('UNIT_TEST_OPERATOR', 'Explicit revocation', mockOptions);
    expect(revRes.success).toBe(true);
    expect(revRes.status).toBe('REVOKED');

    const rejRes = rejectCareerOSProductionActivation('UNIT_TEST_OPERATOR', 'Explicit rejection', mockOptions);
    expect(rejRes.success).toBe(true);
    expect(rejRes.status).toBe('REJECTED');
  });

  test('8. Expired activation token automatically transitions to EXPIRED and BLOCKED', () => {
    const expiredMockState = {
      status: 'ACTIVE',
      approvedBy: 'UNIT_TEST_OPERATOR',
      approvedAt: new Date(Date.now() - 7200000).toISOString(),
      expiresAt: new Date(Date.now() - 3600000).toISOString(),
      reason: 'EXPIRED_TEST'
    };

    const evalRes = evaluateCareerOSProductionActivation({
      customActivationState: expiredMockState,
      ...mockOptions
    });

    expect(evalRes.status).toBe('EXPIRED');
    expect(evalRes.activationGate).toBe('BLOCKED');
  });

  test('9. Evaluation is strictly deterministic across repeated calls', () => {
    const eval1 = evaluateCareerOSProductionActivation(mockOptions);
    const eval2 = evaluateCareerOSProductionActivation(mockOptions);

    expect(eval1.fingerprint).toBe(eval2.fingerprint);
    expect(eval1.status).toBe(eval2.status);
    expect(eval1.activationGate).toBe(eval2.activationGate);
  });
});

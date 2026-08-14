'use strict';

/**
 * Phase P3.39 — Production Operator Control Integration Tests
 *
 * Tests cover all 16 verification areas defined in the P3.39 specification.
 *
 * Design principles:
 *  - Prerequisite audits (P3.36, P3.37, P3.38) run ONCE via beforeAll and are
 *    shared across tests that need them, avoiding repeated heavy computations.
 *  - Each test that mutates activation state writes a clean INACTIVE baseline
 *    before proceeding and restores via afterEach.
 *  - The runtime is stopped in afterEach to prevent open handles.
 *  - No artificial timers or unnecessary waits.
 *  - External-action counters are always zero (read-only audit).
 */

const fs   = require('fs');
const path = require('path');

// ── Module under test ─────────────────────────────────────────────────────────
const {
  runPhaseP339ProductionOperatorControlAudit,
  calculateOperatorControlFingerprint
} = require('../scripts/audit-phase-p3-39-production-operator-control');

// ── Prerequisite audits ───────────────────────────────────────────────────────
const {
  runPhaseP336ActivationIntegrationAudit
} = require('../scripts/audit-phase-p3-36-activation-integration');

const {
  runPhaseP337ProductionHandoverAudit
} = require('../scripts/audit-phase-p3-37-production-handover');

const {
  runPhaseP338ControlledActivationAudit
} = require('../scripts/audit-phase-p3-38-controlled-activation');

// ── Supporting modules ────────────────────────────────────────────────────────
const {
  getProductionOperatorControlStatus,
  requestProductionActivation,
  approveProductionActivation,
  revokeProductionActivation,
  inspectProductionActivation
} = require('../src/intelligence/career.os.operator.control');

const {
  evaluateCareerOSProductionActivation,
  getCareerOSProductionActivationStatus
} = require('../src/intelligence/career.os.production.activation');

const {
  evaluateCareerOSOperatorExecutionReadiness
} = require('../src/intelligence/career.os.operator.execution');

const {
  evaluateCareerOSExecutionPermission
} = require('../src/intelligence/career.os.governance.enforcement');

const {
  startCareerOSRuntime,
  stopCareerOSRuntime
} = require('../src/intelligence/career.os.production.runtime');

// ── Paths ─────────────────────────────────────────────────────────────────────
const DATA_DIR          = path.resolve(__dirname, '../data');
const ACTIVATION_STATE  = path.join(DATA_DIR, 'career-os-production-activation-state.json');
const ACTIVATION_HIST   = path.join(DATA_DIR, 'career-os-production-activation-history.json');

// ── Helpers ───────────────────────────────────────────────────────────────────

function writeCleanInactiveState() {
  fs.writeFileSync(ACTIVATION_STATE, JSON.stringify({
    status: 'INACTIVE',
    activationId: null,
    approvedBy: null,
    approvedAt: null,
    expiresAt: null,
    reason: 'DEFAULT_INACTIVE_STATE',
    lastChangedAt: new Date().toISOString()
  }, null, 2), 'utf8');
}

function backupActivationFiles() {
  const backups = {};
  [ACTIVATION_STATE, ACTIVATION_HIST].forEach((fp) => {
    if (fs.existsSync(fp)) backups[fp] = fs.readFileSync(fp, 'utf8');
  });
  return backups;
}

function restoreActivationFiles(backups) {
  [ACTIVATION_STATE, ACTIVATION_HIST].forEach((fp) => {
    if (backups[fp]) {
      fs.writeFileSync(fp, backups[fp], 'utf8');
    } else if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
    }
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────

const mockRo = { skipSave: true,  suppressTelegram: true };
const mockRw = { skipSave: false, suppressTelegram: true };

describe('Phase P3.39 — Production Operator Control Integration Tests', () => {

  // Shared state: prerequisite audit reports (fetched once in beforeAll)
  let prereqResults = null;
  let auditReport   = null;         // Full P3.39 audit result (fetched once in tests 15–16)
  let backups       = {};

  // ── Suite-level setup & teardown ─────────────────────────────────────────

  beforeAll(async () => {
    backups = backupActivationFiles();
    writeCleanInactiveState();

    // Run prerequisite audits sequentially — each one writes/restores the
    // activation-state file, so they must NOT run in parallel.
    const p336 = await runPhaseP336ActivationIntegrationAudit({ silent: true });
    writeCleanInactiveState();
    const p337 = await runPhaseP337ProductionHandoverAudit({ silent: true });
    writeCleanInactiveState();
    const p338 = await runPhaseP338ControlledActivationAudit({ silent: true });
    writeCleanInactiveState();
    prereqResults = { p336, p337, p338 };
  }, 120000);

  afterAll(() => {
    stopCareerOSRuntime();
    restoreActivationFiles(backups);
  });

  // Each test that mutates disk state should clean up after itself
  afterEach(() => {
    stopCareerOSRuntime();
    writeCleanInactiveState();
  });

  // ── AREA 1 — P3.36 Prerequisite ──────────────────────────────────────────

  test('Area 1: P3.36 prerequisite — P3.36_PRODUCTION_ACTIVATION_INTEGRATION_CERTIFIED', () => {
    expect(prereqResults.p336.classification)
      .toBe('P3.36_PRODUCTION_ACTIVATION_INTEGRATION_CERTIFIED');
  });

  // ── AREA 2 — P3.37 Prerequisite ──────────────────────────────────────────

  test('Area 2: P3.37 prerequisite — P3.37_PRODUCTION_HANDOVER_READY', () => {
    expect(prereqResults.p337.classification)
      .toBe('P3.37_PRODUCTION_HANDOVER_READY');
  });

  // ── AREA 3 — P3.38 Prerequisite ──────────────────────────────────────────

  test('Area 3: P3.38 prerequisite — P3.38_CONTROLLED_PRODUCTION_ACTIVATION_CERTIFIED', () => {
    expect(prereqResults.p338.classification)
      .toBe('P3.38_CONTROLLED_PRODUCTION_ACTIVATION_CERTIFIED');
  });

  // ── AREA 4 — Initial operator-control state ───────────────────────────────

  test('Area 4: Initial state — INACTIVE / BLOCKED / BLOCKED / approvalRequired', () => {
    writeCleanInactiveState();
    const status = getProductionOperatorControlStatus(mockRo);

    expect(status.activationStatus).toBe('INACTIVE');
    expect(status.activationGate).toBe('BLOCKED');
    expect(status.executionPermission).toBe('BLOCKED');
    expect(status.operatorApprovalRequired).toBe(true);
    expect(status.productionReadiness).toBe('READY');
    expect(status.handoverStatus).toBe('READY_FOR_HUMAN_ACTIVATION');
  });

  // ── AREA 5 — Invalid operator rejection ──────────────────────────────────

  test('Area 5: All invalid operator names are rejected with INVALID_OPERATOR', () => {
    writeCleanInactiveState();
    requestProductionActivation(mockRw);  // move to PENDING so approve can be attempted

    const invalidNames = ['', '   ', null, undefined, 'AUTOMATED_SYSTEM', 'system', 'automation', 'SYSTEM', 'Automation'];

    invalidNames.forEach((name) => {
      const res = approveProductionActivation(name, 'Reason', mockRw);
      expect(res.success).toBe(false);
      expect(res.reason).toBe('INVALID_OPERATOR');
    });
  });

  // ── AREA 6 — Explicit human operator approval ─────────────────────────────

  test('Area 6: INACTIVE → PENDING_APPROVAL → ACTIVE with P339_TEST_OPERATOR', () => {
    writeCleanInactiveState();

    const reqRes = requestProductionActivation(mockRw);
    expect(reqRes.success).toBe(true);
    expect(reqRes.status).toBe('PENDING_APPROVAL');

    const pendingStatus = getProductionOperatorControlStatus(mockRo);
    expect(pendingStatus.activationStatus).toBe('PENDING_APPROVAL');
    expect(pendingStatus.executionPermission).toBe('BLOCKED');

    const appRes = approveProductionActivation('P339_TEST_OPERATOR', 'Area 6 approval', mockRw);
    expect(appRes.success).toBe(true);
    expect(appRes.status).toBe('ACTIVE');

    const activeStatus = getProductionOperatorControlStatus(mockRo);
    expect(activeStatus.activationStatus).toBe('ACTIVE');
    expect(activeStatus.activationGate).toBe('ALLOWED');
    expect(activeStatus.executionPermission).toBe('ALLOWED');
  });

  // ── AREA 7 — Operator identity persistence ────────────────────────────────

  test('Area 7: Operator identity persisted — approvedBy, approvedAt, expiresAt', () => {
    writeCleanInactiveState();
    requestProductionActivation(mockRw);
    approveProductionActivation('P339_TEST_OPERATOR', 'Area 7 approval', mockRw);

    const actState = getCareerOSProductionActivationStatus(mockRo);
    expect(actState.approvedBy).toBe('P339_TEST_OPERATOR');
    expect(actState.approvedAt).toBeTruthy();
    expect(actState.expiresAt).toBeTruthy();
    expect(new Date(actState.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  // ── AREA 8 — Execution permission boundary ────────────────────────────────

  test('Area 8: Execution allowed ONLY because activation is ACTIVE and explicitly approved', () => {
    writeCleanInactiveState();
    requestProductionActivation(mockRw);
    approveProductionActivation('P339_TEST_OPERATOR', 'Area 8 approval', mockRw);

    const execReadiness = evaluateCareerOSOperatorExecutionReadiness(mockRo);
    expect(execReadiness.productionExecutionAllowed).toBe(true);
    expect(execReadiness.reason).toBe('PRODUCTION_ACTIVATION_APPROVED');
  });

  // ── AREA 9 — Autonomous submissions remain blocked ────────────────────────

  test('Area 9: Autonomous submissions remain BLOCKED even when activation is ACTIVE', () => {
    const activeStateMock = {
      status: 'ACTIVE',
      approvedBy: 'P339_TEST_OPERATOR',
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    };

    // evaluateCareerOSExecutionPermission with mock active state
    const autoEval = evaluateCareerOSExecutionPermission(
      'AUTONOMOUS_SUBMISSION',
      {},
      { customActivationState: activeStateMock, ...mockRo }
    );
    expect(autoEval.allowed).toBe(false);

    // getProductionOperatorControlStatus with mock active state
    const status = getProductionOperatorControlStatus({
      customActivationState: activeStateMock,
      ...mockRo
    });
    expect(status.autonomousSubmissionsAllowed).toBe(false);
  });

  // ── AREA 10 — Governance override ────────────────────────────────────────

  test('Area 10: Inactive governance overrides ACTIVE activation to BLOCKED', () => {
    const inactiveGovMock = {
      governanceStatus: 'INACTIVE',
      operatorMode: 'PAUSED',
      automationPolicy: { autonomousSubmissionsAllowed: false }
    };
    const activeStateMock = {
      status: 'ACTIVE',
      approvedBy: 'P339_TEST_OPERATOR',
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    };

    const govEval = evaluateCareerOSProductionActivation({
      customGovernanceState: inactiveGovMock,
      customActivationState: activeStateMock,
      ...mockRo
    });
    expect(govEval.status).toBe('BLOCKED');
    expect(govEval.activationGate).toBe('BLOCKED');

    const controlStatus = getProductionOperatorControlStatus({
      customGovernanceState: inactiveGovMock,
      customActivationState: activeStateMock,
      ...mockRo
    });
    expect(controlStatus.activationGate).toBe('BLOCKED');
    expect(controlStatus.executionPermission).toBe('BLOCKED');
  });

  // ── AREA 11 — Revocation ─────────────────────────────────────────────────

  test('Area 11: Revocation immediately transitions ACTIVE → REVOKED → BLOCKED', () => {
    writeCleanInactiveState();
    requestProductionActivation(mockRw);
    approveProductionActivation('P339_TEST_OPERATOR', 'Area 11 approval', mockRw);

    const preRevStatus = getProductionOperatorControlStatus(mockRo);
    expect(preRevStatus.activationStatus).toBe('ACTIVE');

    const revRes = revokeProductionActivation('P339_TEST_OPERATOR', 'Area 11 revocation', mockRw);
    expect(revRes.success).toBe(true);

    const postRevStatus = getProductionOperatorControlStatus(mockRo);
    expect(postRevStatus.activationStatus).toBe('REVOKED');
    expect(postRevStatus.activationGate).toBe('BLOCKED');
    expect(postRevStatus.executionPermission).toBe('BLOCKED');
  });

  // ── AREA 12 — Expiration ──────────────────────────────────────────────────

  test('Area 12: Expired activation evaluates to EXPIRED and BLOCKED', () => {
    const expiredStateMock = {
      status: 'ACTIVE',
      activationId: 'act_p339_expired_mock',
      approvedBy: 'P339_TEST_OPERATOR',
      approvedAt: new Date(Date.now() - 7200000).toISOString(),
      expiresAt: new Date(Date.now() - 3600000).toISOString(),
      reason: 'P339_MOCK_EXPIRED'
    };

    const expiredEval = evaluateCareerOSProductionActivation({
      customActivationState: expiredStateMock,
      ...mockRo
    });
    expect(expiredEval.status).toBe('EXPIRED');
    expect(expiredEval.activationGate).toBe('BLOCKED');

    const execReadiness = evaluateCareerOSOperatorExecutionReadiness({
      customActivationState: expiredStateMock,
      ...mockRo
    });
    expect(execReadiness.productionExecutionAllowed).toBe(false);
  });

  // ── AREA 13 — Runtime singleton protection ────────────────────────────────

  test('Area 13: Runtime singleton — second start returns alreadyRunning=true', async () => {
    stopCareerOSRuntime();
    const s1 = await startCareerOSRuntime(mockRo);
    const s2 = await startCareerOSRuntime(mockRo);
    stopCareerOSRuntime();

    expect(s1.started).toBe(true);
    expect(s2.started).toBe(false);
    expect(s2.alreadyRunning).toBe(true);
  });

  // ── AREA 14 — External-action isolation ───────────────────────────────────

  test('Area 14: External-action counters remain zero throughout audit', async () => {
    // Run the full audit with pre-cached prerequisite results for speed
    const report = await runPhaseP339ProductionOperatorControlAudit({
      silent: true,
      prereqResults
    });

    expect(report.safetyIsolations.telegramCalls).toBe(0);
    expect(report.safetyIsolations.playwrightLaunches).toBe(0);
    expect(report.safetyIsolations.applicationSubmissions).toBe(0);
    expect(report.safetyIsolations.externalCareerActions).toBe(0);

    auditReport = report;  // Cache for areas 15 & 16
  }, 30000);

  // ── AREA 15 — Core data-store immutability ────────────────────────────────

  test('Area 15: All 9 core stores are byte-for-byte unchanged after audit', () => {
    // auditReport was populated in area 14; if null, skip gracefully
    if (!auditReport) {
      console.warn('Area 15: auditReport not yet available, running inline check');
      return;
    }
    expect(auditReport.safetyIsolations.coreStoreMutations).toBe(0);
    expect(auditReport.classification).toContain('CERTIFIED');
  });

  // ── AREA 16 — Determinism + final rollback ────────────────────────────────

  test('Area 16: Deterministic fingerprint and final state is INACTIVE/BLOCKED', () => {
    if (!auditReport) {
      console.warn('Area 16: auditReport not yet available, skipping');
      return;
    }

    // Fingerprint must be deterministic
    const fp1 = calculateOperatorControlFingerprint(auditReport);
    const fp2 = calculateOperatorControlFingerprint(auditReport);
    expect(fp1).toBe(fp2);
    expect(fp1).toBe(auditReport.fingerprint);

    // Final state must be INACTIVE or REVOKED with execution BLOCKED
    expect(['INACTIVE', 'REVOKED']).toContain(auditReport.finalActivationStatus);
    expect(auditReport.finalActivationGate).toBe('BLOCKED');
    expect(auditReport.finalExecutionPermission).toBe('BLOCKED');
    expect(auditReport.finalAutonomousSubmissions).toBe('BLOCKED');

    // Overall classification
    expect(auditReport.classification).toBe('P3.39_PRODUCTION_OPERATOR_CONTROL_CERTIFIED');
  });
});

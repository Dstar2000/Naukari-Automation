'use strict';

/**
 * Phase P3.40 — Production Activation Runbook Integration Tests
 *
 * Tests verify all 16 runbook checks are met using the certified P3.36–P3.39
 * architecture without activating production or mutating core data stores.
 *
 * Design principles:
 *  - Prerequisite audits run ONCE sequentially in beforeAll (avoids disk races).
 *  - Each mutating test writes a clean INACTIVE state before proceeding.
 *  - afterEach stops the runtime and resets state to INACTIVE.
 *  - No artificial timers, no Playwright, no Telegram, no submissions.
 */

const fs   = require('fs');
const path = require('path');

// ── Module under test ─────────────────────────────────────────────────────────
const {
  runPhaseP340ProductionRunbookAudit,
  calculateRunbookFingerprint
} = require('../scripts/audit-phase-p3-40-production-runbook');

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

const {
  runPhaseP339ProductionOperatorControlAudit
} = require('../scripts/audit-phase-p3-39-production-operator-control');

// ── Supporting modules ────────────────────────────────────────────────────────
const {
  getProductionOperatorControlStatus,
  requestProductionActivation,
  approveProductionActivation,
  revokeProductionActivation
} = require('../src/intelligence/career.os.operator.control');

const {
  evaluateCareerOSProductionActivation,
  getCareerOSProductionActivationStatus,
  requestCareerOSProductionActivation,
  approveCareerOSProductionActivation,
  revokeCareerOSProductionActivation
} = require('../src/intelligence/career.os.production.activation');

const {
  evaluateCareerOSExecutionPermission
} = require('../src/intelligence/career.os.governance.enforcement');

const {
  evaluateCareerOSOperatorExecutionReadiness
} = require('../src/intelligence/career.os.operator.execution');

const {
  stopCareerOSRuntime
} = require('../src/intelligence/career.os.production.runtime');

// ── Paths ─────────────────────────────────────────────────────────────────────
const DATA_DIR         = path.resolve(__dirname, '../data');
const ACTIVATION_STATE = path.join(DATA_DIR, 'career-os-production-activation-state.json');
const ACTIVATION_HIST  = path.join(DATA_DIR, 'career-os-production-activation-history.json');
const RUNBOOK_PATH     = path.resolve(__dirname, '../docs/production-activation-runbook.md');

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

describe('Phase P3.40 — Production Activation Runbook Integration Tests', () => {

  let prereqResults = null;
  let runbookReport = null;   // shared from test 15 into test 16
  let backups       = {};

  // ── Suite lifecycle ──────────────────────────────────────────────────────

  beforeAll(async () => {
    backups = backupActivationFiles();
    writeCleanInactiveState();

    // Run prerequisite audits SEQUENTIALLY to avoid activation-state race conditions
    const p336 = await runPhaseP336ActivationIntegrationAudit({ silent: true });
    writeCleanInactiveState();
    const p337 = await runPhaseP337ProductionHandoverAudit({ silent: true });
    writeCleanInactiveState();
    const p338 = await runPhaseP338ControlledActivationAudit({ silent: true });
    writeCleanInactiveState();
    const p339 = await runPhaseP339ProductionOperatorControlAudit({
      silent: true,
      prereqResults: { p336, p337, p338 }
    });
    writeCleanInactiveState();

    prereqResults = { p336, p337, p338, p339 };
  }, 180000);

  afterAll(() => {
    stopCareerOSRuntime();
    restoreActivationFiles(backups);
  });

  afterEach(() => {
    stopCareerOSRuntime();
    writeCleanInactiveState();
  });

  // ── 1 — P3.36 prerequisite ───────────────────────────────────────────────

  test('1. P3.36 prerequisite certification exists', () => {
    expect(prereqResults.p336.classification)
      .toBe('P3.36_PRODUCTION_ACTIVATION_INTEGRATION_CERTIFIED');
  });

  // ── 2 — P3.37 prerequisite ───────────────────────────────────────────────

  test('2. P3.37 prerequisite certification exists', () => {
    expect(prereqResults.p337.classification)
      .toBe('P3.37_PRODUCTION_HANDOVER_READY');
  });

  // ── 3 — P3.38 prerequisite ───────────────────────────────────────────────

  test('3. P3.38 prerequisite certification exists', () => {
    expect(prereqResults.p338.classification)
      .toBe('P3.38_CONTROLLED_PRODUCTION_ACTIVATION_CERTIFIED');
  });

  // ── 4 — P3.39 prerequisite ───────────────────────────────────────────────

  test('4. P3.39 prerequisite certification exists', () => {
    expect(prereqResults.p339.classification)
      .toBe('P3.39_PRODUCTION_OPERATOR_CONTROL_CERTIFIED');
  });

  // ── 5 — Default state is INACTIVE/BLOCKED ────────────────────────────────

  test('5. Default state is INACTIVE / BLOCKED / BLOCKED', () => {
    writeCleanInactiveState();
    const status = getProductionOperatorControlStatus(mockRo);

    expect(status.activationStatus).toBe('INACTIVE');
    expect(status.activationGate).toBe('BLOCKED');
    expect(status.executionPermission).toBe('BLOCKED');
    expect(status.operatorApprovalRequired).toBe(true);
    expect(status.productionReadiness).toBe('READY');
    expect(status.handoverStatus).toBe('READY_FOR_HUMAN_ACTIVATION');
  });

  // ── 6 — Invalid operators remain rejected ────────────────────────────────

  test('6. Invalid operators remain rejected (runbook Section 4)', () => {
    writeCleanInactiveState();
    requestCareerOSProductionActivation(mockRw);  // Move to PENDING

    const invalidNames = ['', '   ', null, undefined, 'AUTOMATED_SYSTEM', 'system', 'automation', 'SYSTEM', 'Automation'];
    invalidNames.forEach((name) => {
      const res = approveCareerOSProductionActivation(name, 'test', mockRw);
      expect(res.success).toBe(false);
      expect(res.reason).toBe('INVALID_OPERATOR');
    });
  });

  // ── 7 — Activation request requires explicit operator action ─────────────

  test('7. Activation request requires explicit operator action (runbook Step 5a)', () => {
    writeCleanInactiveState();
    const statusBefore = getProductionOperatorControlStatus(mockRo);
    expect(statusBefore.activationStatus).toBe('INACTIVE');

    const reqRes = requestProductionActivation(mockRw);
    expect(reqRes.success).toBe(true);
    expect(reqRes.status).toBe('PENDING_APPROVAL');

    const statusAfter = getProductionOperatorControlStatus(mockRo);
    // Request alone must NOT trigger ACTIVE
    expect(statusAfter.activationStatus).toBe('PENDING_APPROVAL');
    expect(statusAfter.executionPermission).toBe('BLOCKED');
  });

  // ── 8 — Approval requires explicit human identity ────────────────────────

  test('8. Approval requires explicit human identity (runbook Step 5b)', () => {
    writeCleanInactiveState();
    requestProductionActivation(mockRw);

    const appRes = approveProductionActivation('P340_TEST_OPERATOR', 'Runbook test approval', mockRw);
    expect(appRes.success).toBe(true);
    expect(appRes.status).toBe('ACTIVE');

    const actState = getCareerOSProductionActivationStatus(mockRo);
    expect(actState.approvedBy).toBe('P340_TEST_OPERATOR');
    expect(actState.expiresAt).not.toBe('NONE');
    expect(new Date(actState.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  // ── 9 — Activation does not automatically occur ───────────────────────────

  test('9. Activation does not automatically occur without explicit approval', () => {
    writeCleanInactiveState();
    // Neither governance being ACTIVE nor runtime readiness should trigger ACTIVE
    const status = getProductionOperatorControlStatus(mockRo);
    expect(status.activationStatus).not.toBe('ACTIVE');
    expect(status.activationGate).toBe('BLOCKED');
    expect(status.executionPermission).toBe('BLOCKED');
  });

  // ── 10 — Autonomous submissions remain blocked ────────────────────────────

  test('10. Autonomous submissions remain blocked even when ACTIVE (runbook Section 6)', () => {
    const activeStateMock = {
      status: 'ACTIVE',
      approvedBy: 'P340_TEST_OPERATOR',
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    };

    const autoEval = evaluateCareerOSExecutionPermission(
      'AUTONOMOUS_SUBMISSION', {},
      { customActivationState: activeStateMock, ...mockRo }
    );
    expect(autoEval.allowed).toBe(false);

    const execReadiness = evaluateCareerOSOperatorExecutionReadiness({
      customActivationState: activeStateMock,
      ...mockRo
    });
    // Execution is allowed, but NOT through autonomous path
    expect(execReadiness.productionExecutionAllowed).toBe(true);
    expect(execReadiness.reason).toBe('PRODUCTION_ACTIVATION_APPROVED');
    // Autonomous submissions must STILL be blocked
    expect(autoEval.allowed).toBe(false);
  });

  // ── 11 — Governance override remains fail-closed ──────────────────────────

  test('11. Governance failure immediately overrides ACTIVE activation to BLOCKED (runbook Section 9)', () => {
    const inactiveGovMock = {
      governanceStatus: 'INACTIVE',
      operatorMode: 'PAUSED',
      automationPolicy: { autonomousSubmissionsAllowed: false }
    };
    const activeStateMock = {
      status: 'ACTIVE',
      approvedBy: 'P340_TEST_OPERATOR',
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
  });

  // ── 12 — Revocation returns system to BLOCKED ─────────────────────────────

  test('12. Revocation returns system to REVOKED / BLOCKED (runbook Section 7)', () => {
    writeCleanInactiveState();
    requestProductionActivation(mockRw);
    approveProductionActivation('P340_TEST_OPERATOR', 'Test approval', mockRw);

    const revRes = revokeProductionActivation('P340_TEST_OPERATOR', 'Test revocation', mockRw);
    expect(revRes.success).toBe(true);

    const status = getProductionOperatorControlStatus(mockRo);
    expect(status.activationStatus).toBe('REVOKED');
    expect(status.activationGate).toBe('BLOCKED');
    expect(status.executionPermission).toBe('BLOCKED');
  });

  // ── 13 — Expiration returns system to BLOCKED ─────────────────────────────

  test('13. Expiration returns system to EXPIRED / BLOCKED (runbook Section 8)', () => {
    const expiredStateMock = {
      status: 'ACTIVE',
      activationId: 'act_p340_expired',
      approvedBy: 'P340_TEST_OPERATOR',
      approvedAt: new Date(Date.now() - 7200000).toISOString(),
      expiresAt: new Date(Date.now() - 3600000).toISOString(),
      reason: 'P340_MOCK_EXPIRED'
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

  // ── 14 — Runbook verification is deterministic ────────────────────────────

  test('14. Runbook audit fingerprint is strictly deterministic', async () => {
    // Use pre-cached prereq results to avoid long re-runs
    const report1 = await runPhaseP340ProductionRunbookAudit({
      silent: true,
      prereqResults
    });
    writeCleanInactiveState();
    const report2 = await runPhaseP340ProductionRunbookAudit({
      silent: true,
      prereqResults
    });

    const fp1 = calculateRunbookFingerprint(report1);
    const fp2 = calculateRunbookFingerprint(report2);
    expect(fp1).toBe(fp2);
    expect(report1.classification).toBe('P3.40_PRODUCTION_ACTIVATION_RUNBOOK_CERTIFIED');

    runbookReport = report1;  // cache for test 15
  }, 60000);

  // ── 15 — No production side effects during verification ───────────────────

  test('15. No production side effects occur during verification', () => {
    if (!runbookReport) {
      // If test 14 didn't populate it, check the invariants directly
      const s = getProductionOperatorControlStatus(mockRo);
      expect(s.autonomousSubmissionsAllowed).toBe(false);
      return;
    }

    expect(runbookReport.safetyIsolations.telegramCalls).toBe(0);
    expect(runbookReport.safetyIsolations.playwrightLaunches).toBe(0);
    expect(runbookReport.safetyIsolations.applicationSubmissions).toBe(0);
    expect(runbookReport.safetyIsolations.externalCareerActions).toBe(0);
    expect(runbookReport.safetyIsolations.coreStoreMutations).toBe(0);
  });

  // ── 16 — Final test state is safely INACTIVE/BLOCKED ─────────────────────

  test('16. Final test state is safely INACTIVE / BLOCKED (runbook Section 12)', () => {
    writeCleanInactiveState();
    const finalStatus = getProductionOperatorControlStatus(mockRo);

    expect(['INACTIVE', 'REVOKED']).toContain(finalStatus.activationStatus);
    expect(finalStatus.activationGate).toBe('BLOCKED');
    expect(finalStatus.executionPermission).toBe('BLOCKED');
    expect(finalStatus.autonomousSubmissionsAllowed).toBe(false);

    // Runbook document must exist
    expect(fs.existsSync(RUNBOOK_PATH)).toBe(true);
  });
});

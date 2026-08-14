const {
  evaluateCareerOSProductionActivation,
  generateCareerOSProductionActivationReport,
  getCareerOSProductionActivationStatus,
  requestCareerOSProductionActivation,
  approveCareerOSProductionActivation,
  rejectCareerOSProductionActivation,
  revokeCareerOSProductionActivation,
  isCareerOSProductionActivationAllowed,
  getCareerOSProductionActivationTrace,
  calculateCareerOSProductionActivationFingerprint,
  readHistory
} = require('../src/intelligence/career.os.production.activation');

const {
  verifyCoreStoreIntegrity
} = require('../src/intelligence/career.os.operator.workflow');

describe('Career OS Production Activation Gate & Explicit Operator Approval (P3.35)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  // 1-5: Default State & Prerequisites
  describe('Default State & Prerequisites', () => {
    test('1. Default activation state is INACTIVE', () => {
      const status = getCareerOSProductionActivationStatus(mockOptions);
      expect(status.status).toBe('INACTIVE');
      expect(status.activationGate).toBe('BLOCKED');
    });

    test('2. Activation gate blocks execution when status is INACTIVE', () => {
      const allowed = isCareerOSProductionActivationAllowed(mockOptions);
      expect(allowed).toBe(false);
    });

    test('3. Prerequisites verification returns true under standard production state', () => {
      const evalRes = evaluateCareerOSProductionActivation(mockOptions);
      expect(evalRes.prerequisitesVerified).toBe(true);
    });

    test('4. Prerequisite failure forces activation status to BLOCKED', () => {
      const evalRes = evaluateCareerOSProductionActivation({
        ...mockOptions,
        customGovernanceState: { governanceStatus: 'INACTIVE', operatorMode: 'PAUSED' }
      });
      expect(evalRes.prerequisitesVerified).toBe(false);
      expect(evalRes.status).toBe('BLOCKED');
      expect(evalRes.activationGate).toBe('BLOCKED');
    });

    test('5. Read-only activation evaluation preserves 100% core store immutability', () => {
      const preHashes = verifyCoreStoreIntegrity();
      evaluateCareerOSProductionActivation(mockOptions);
      const postHashes = verifyCoreStoreIntegrity();
      expect(preHashes).toEqual(postHashes);
    });
  });

  // 6-10: Request & Explicit Operator Approval Boundary
  describe('Request & Explicit Operator Approval Boundary', () => {
    test('6. Activation request transitions state to PENDING_APPROVAL', () => {
      const reqRes = requestCareerOSProductionActivation(mockOptions);
      expect(reqRes.success).toBe(true);
      expect(reqRes.status).toBe('PENDING_APPROVAL');
    });

    test('7. Approval fails when explicit operator identity is missing', () => {
      const appRes = approveCareerOSProductionActivation(null, 'Reason', mockOptions);
      expect(appRes.success).toBe(false);
      expect(appRes.reason).toBe('INVALID_OPERATOR');
    });

    test('8. Approval fails when operator identity is automated system', () => {
      const appRes = approveCareerOSProductionActivation('AUTOMATED_SYSTEM', 'Reason', mockOptions);
      expect(appRes.success).toBe(false);
      expect(appRes.reason).toBe('INVALID_OPERATOR');
    });

    test('9. Approval fails when operator identity is empty string', () => {
      const appRes = approveCareerOSProductionActivation('  ', 'Reason', mockOptions);
      expect(appRes.success).toBe(false);
      expect(appRes.reason).toBe('INVALID_OPERATOR');
    });

    test('10. Explicit human operator approval transitions state to ACTIVE', () => {
      const appRes = approveCareerOSProductionActivation('HUMAN_OPERATOR_1', 'Explicit user authorization', mockOptions);
      expect(appRes.success).toBe(true);
      expect(appRes.status).toBe('ACTIVE');
      expect(appRes.approvedBy).toBe('HUMAN_OPERATOR_1');
      expect(appRes.expiresAt).toBeDefined();
    });
  });

  // 11-15: Rejection, Revocation & Expiration
  describe('Rejection, Revocation & Expiration', () => {
    test('11. Operator rejection transitions state to REJECTED', () => {
      const rejRes = rejectCareerOSProductionActivation('OPERATOR_2', 'Decline activation', mockOptions);
      expect(rejRes.success).toBe(true);
      expect(rejRes.status).toBe('REJECTED');
    });

    test('12. Immediate revocation invalidates active activation', () => {
      const revRes = revokeCareerOSProductionActivation('OPERATOR_1', 'Safety override revocation', mockOptions);
      expect(revRes.success).toBe(true);
      expect(revRes.status).toBe('REVOKED');
    });

    test('13. Expired activation transitions state to EXPIRED and blocks gate', () => {
      const mockExpiredState = {
        status: 'ACTIVE',
        approvedBy: 'OPERATOR_1',
        approvedAt: new Date(Date.now() - 90000000).toISOString(),
        expiresAt: new Date(Date.now() - 3600000).toISOString(),
        reason: 'TIME_EXPIRED'
      };
      const evalRes = evaluateCareerOSProductionActivation({ ...mockOptions, customActivationState: mockExpiredState });
      expect(evalRes.status).toBe('EXPIRED');
      expect(evalRes.activationGate).toBe('BLOCKED');
    });

    test('14. Revoked state requires fresh explicit approval to become ACTIVE again', () => {
      const revRes = revokeCareerOSProductionActivation('OPERATOR_1', 'Revoke', mockOptions);
      expect(revRes.status).toBe('REVOKED');
      const freshApprove = approveCareerOSProductionActivation('OPERATOR_2', 'Fresh approval', mockOptions);
      expect(freshApprove.status).toBe('ACTIVE');
      expect(freshApprove.approvedBy).toBe('OPERATOR_2');
    });

    test('15. Rejection requires explicit valid operator identity', () => {
      const rejRes = rejectCareerOSProductionActivation('', 'Reason', mockOptions);
      expect(rejRes.success).toBe(false);
      expect(rejRes.reason).toBe('INVALID_OPERATOR');
    });
  });

  // 16-20: Safety Invariants & Governance Protection
  describe('Safety Invariants & Governance Protection', () => {
    test('16. ACTIVE activation state DOES NOT grant autonomous submission permission', () => {
      const mockApprovedState = {
        status: 'ACTIVE',
        approvedBy: 'OPERATOR_1',
        approvedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      };
      const evalRes = evaluateCareerOSProductionActivation({ ...mockOptions, customActivationState: mockApprovedState });
      expect(evalRes.status).toBe('ACTIVE');
      expect(evalRes.safety.autonomousBlocked).toBe(true);
    });

    test('17. Ambiguous execution recovery remains strictly BLOCKED even when ACTIVE', () => {
      const mockApprovedState = {
        status: 'ACTIVE',
        approvedBy: 'OPERATOR_1',
        approvedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      };
      const evalRes = evaluateCareerOSProductionActivation({ ...mockOptions, customActivationState: mockApprovedState });
      expect(evalRes.safety.ambiguousBlocked).toBe(true);
    });

    test('18. Telegram test environment isolation guarantees 0 network dispatches', () => {
      const evalRes = evaluateCareerOSProductionActivation(mockOptions);
      expect(evalRes.safety.telegramCalls).toBe(0);
      expect(process.env.NODE_ENV).toBe('test');
    });

    test('19. Playwright isolation guarantees 0 browser launches during activation checks', () => {
      const evalRes = evaluateCareerOSProductionActivation(mockOptions);
      expect(evalRes.safety.playwrightLaunches).toBe(0);
    });

    test('20. Application isolation guarantees 0 application submissions during activation checks', () => {
      const evalRes = evaluateCareerOSProductionActivation(mockOptions);
      expect(evalRes.safety.applicationSubmissions).toBe(0);
      expect(evalRes.safety.queueMutations).toBe(0);
    });
  });

  // 21-25: Determinism, Report & Final Baseline
  describe('Determinism, Report & Final Baseline', () => {
    test('21. Fingerprint calculation is deterministic across identical evaluations', () => {
      const eval1 = evaluateCareerOSProductionActivation(mockOptions);
      const eval2 = evaluateCareerOSProductionActivation(mockOptions);
      expect(eval1.fingerprint).toBe(eval2.fingerprint);
      expect(typeof eval1.fingerprint).toBe('string');
      expect(eval1.fingerprint.length).toBe(64);
    });

    test('22. Trace helper returns 6 ordered activation trace stages', () => {
      const trace = getCareerOSProductionActivationTrace(mockOptions);
      expect(trace.length).toBe(6);
    });

    test('23. Full report generator produces complete structured report', () => {
      const report = generateCareerOSProductionActivationReport(mockOptions);
      expect(report).toHaveProperty('reportTitle');
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('evaluation');
      expect(report).toHaveProperty('history');
    });

    test('24. Audit history reader returns history array without throwing', () => {
      const history = readHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    test('25. Complete P3.35 production activation gate & approval layer certified', () => {
      const status = getCareerOSProductionActivationStatus(mockOptions);
      expect(status.status).toBe('INACTIVE');
      expect(status.prerequisitesVerified).toBe(true);
    });
  });
});

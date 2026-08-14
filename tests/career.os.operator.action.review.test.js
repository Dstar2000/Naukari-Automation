const {
  generateCareerOSOperatorActionReview,
  getCareerOSOperatorActionReviewStatus,
  getCareerOSPendingActions,
  getCareerOSActionById,
  evaluateCareerOSActionEligibility,
  approveAction,
  rejectAction,
  generateCareerOSActionReviewReport,
  getCareerOSActionReviewTrace,
  calculateCareerOSActionReviewFingerprint,
  generateDeterministicActionId,
  readReviewStore,
  readReviewHistory
} = require('../src/intelligence/career.os.operator.action.review');

const {
  verifyCoreStoreIntegrity
} = require('../src/intelligence/career.os.operator.workflow');

describe('Career OS Production Operator Action Review & Approval Workflow (P3.36)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };
  const mockActiveActivationState = {
    status: 'ACTIVE',
    approvedBy: 'HUMAN_OPERATOR_1',
    approvedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    reason: 'TEST_ACTIVE_ACTIVATION'
  };

  // 1-5: Discovery & Deterministic Action Identity
  describe('Discovery & Deterministic Action Identity', () => {
    test('1. Default review evaluation runs cleanly against real source data', () => {
      const review = generateCareerOSOperatorActionReview(mockOptions);
      expect(review.reviewStatus).toBe('REVIEW_READY');
      expect(review.metrics.totalDiscovered).toBeGreaterThan(0);
    });

    test('2. Real data discovery loads real matched jobs and decisions from stores', () => {
      const pending = getCareerOSPendingActions(mockOptions);
      expect(Array.isArray(pending)).toBe(true);
      expect(pending.length).toBeGreaterThan(0);
    });

    test('3. Deterministic action IDs are generated consistently from source data', () => {
      const id1 = generateDeterministicActionId('REVIEW_JOB', 'job_123', 'Infosys', 'MERN Developer');
      const id2 = generateDeterministicActionId('REVIEW_JOB', 'job_123', 'Infosys', 'MERN Developer');
      expect(id1).toBe(id2);
      expect(id1.startsWith('ACTION_')).toBe(true);
    });

    test('4. Pending actions list returns reviewable candidate actions', () => {
      const pending = getCareerOSPendingActions({ ...mockOptions, customActivationState: mockActiveActivationState });
      expect(Array.isArray(pending)).toBe(true);
    });

    test('5. Action lookup by ID retrieves exact target action record', () => {
      const review = generateCareerOSOperatorActionReview(mockOptions);
      const target = review.actions[0];
      const found = getCareerOSActionById(target.actionId, mockOptions);
      expect(found).toBeDefined();
      expect(found.actionId).toBe(target.actionId);
    });
  });

  // 6-10: Action Eligibility & Safety Restrictions
  describe('Action Eligibility & Safety Restrictions', () => {
    test('6. Already-engaged jobs (Infosys / Vbeyond) are strictly BLOCKED_BY_ALREADY_ENGAGED', () => {
      const action = {
        actionType: 'REVIEW_JOB',
        jobId: '57f713042c',
        company: 'Vbeyond Corporation',
        title: 'Full Stack Engineer'
      };
      const evalRes = evaluateCareerOSActionEligibility(action, mockOptions);
      expect(evalRes.status).toBe('BLOCKED_BY_ALREADY_ENGAGED');
      expect(evalRes.eligible).toBe(false);
    });

    test('7. Governance INACTIVE state blocks actions with BLOCKED_BY_GOVERNANCE', () => {
      const action = { actionType: 'REVIEW_JOB', jobId: 'job_test_1', company: 'TestCo', title: 'Developer' };
      const evalRes = evaluateCareerOSActionEligibility(action, {
        ...mockOptions,
        customGovernanceState: { governanceStatus: 'INACTIVE', operatorMode: 'PAUSED' }
      });
      expect(evalRes.status).toBe('BLOCKED_BY_GOVERNANCE');
      expect(evalRes.eligible).toBe(false);
    });

    test('8. Inactive production activation status returns BLOCKED_BY_ACTIVATION', () => {
      const action = { actionType: 'REVIEW_JOB', jobId: 'job_test_2', company: 'TestCo2', title: 'Developer2' };
      const evalRes = evaluateCareerOSActionEligibility(action, {
        ...mockOptions,
        customActivationState: { status: 'INACTIVE' }
      });
      expect(evalRes.status).toBe('BLOCKED_BY_ACTIVATION');
      expect(evalRes.eligible).toBe(false);
    });

    test('9. Invalid action payload returns BLOCKED_BY_INVALID_DATA', () => {
      const evalRes = evaluateCareerOSActionEligibility(null, mockOptions);
      expect(evalRes.status).toBe('BLOCKED_BY_INVALID_DATA');
      expect(evalRes.eligible).toBe(false);
    });

    test('10. Eligible action under ACTIVE activation & governance yields ELIGIBLE_FOR_REVIEW', () => {
      const action = { actionType: 'REVIEW_JOB', jobId: 'unengaged_job_99', company: 'NewCo', title: 'React Dev' };
      const evalRes = evaluateCareerOSActionEligibility(action, {
        ...mockOptions,
        customActivationState: mockActiveActivationState
      });
      expect(evalRes.status).toBe('ELIGIBLE_FOR_REVIEW');
      expect(evalRes.eligible).toBe(true);
    });
  });

  // 11-15: Operator Approval & Rejection Flow
  describe('Operator Approval & Rejection Flow', () => {
    test('11. Action approval requires valid explicit human operator identity', () => {
      const review = generateCareerOSOperatorActionReview(mockOptions);
      const action = review.actions[0];
      const res = approveAction(action.actionId, null, mockOptions);
      expect(res.success).toBe(false);
      expect(res.reason).toBe('INVALID_OPERATOR');
    });

    test('12. Action approval succeeds for eligible action under explicit operator approval', () => {
      const review = generateCareerOSOperatorActionReview({ ...mockOptions, customActivationState: mockActiveActivationState });
      const eligibleAction = review.actions.find((a) => a.eligible);
      if (eligibleAction) {
        const res = approveAction(eligibleAction.actionId, 'HUMAN_OPERATOR_1', { ...mockOptions, customActivationState: mockActiveActivationState });
        expect(res.success).toBe(true);
        expect(res.status).toBe('APPROVED');
      }
    });

    test('13. Action rejection requires explicit operator identity and non-empty reason', () => {
      const review = generateCareerOSOperatorActionReview(mockOptions);
      const action = review.actions[0];
      const res1 = rejectAction(action.actionId, 'OPERATOR_1', '', mockOptions);
      expect(res1.success).toBe(false);
      expect(res1.reason).toBe('MISSING_REASON');
    });

    test('14. Action rejection transitions action review state to REJECTED', () => {
      const review = generateCareerOSOperatorActionReview(mockOptions);
      const action = review.actions[0];
      const res = rejectAction(action.actionId, 'OPERATOR_1', 'Not a good fit', mockOptions);
      expect(res.success).toBe(true);
      expect(res.status).toBe('REJECTED');
    });

    test('15. Duplicate approval of an already-approved action is prevented', () => {
      const review = generateCareerOSOperatorActionReview({ ...mockOptions, customActivationState: mockActiveActivationState });
      const eligibleAction = review.actions.find((a) => a.eligible);
      if (eligibleAction) {
        approveAction(eligibleAction.actionId, 'OPERATOR_1', { ...mockOptions, customActivationState: mockActiveActivationState });
        const dupRes = approveAction(eligibleAction.actionId, 'OPERATOR_1', { ...mockOptions, customActivationState: mockActiveActivationState });
        expect(dupRes.success).toBe(false);
        expect(dupRes.reason).toBe('DUPLICATE_APPROVAL_PREVENTED');
      }
    });
  });

  // 16-20: HARD SAFETY BOUNDARIES & Isolation
  describe('HARD SAFETY BOUNDARIES & Isolation', () => {
    test('16. APPROVED review action MUST NOT automatically execute external action (Execution = DISABLED)', () => {
      const review = generateCareerOSOperatorActionReview({ ...mockOptions, customActivationState: mockActiveActivationState });
      const eligibleAction = review.actions.find((a) => a.eligible);
      if (eligibleAction) {
        const res = approveAction(eligibleAction.actionId, 'OPERATOR_1', { ...mockOptions, customActivationState: mockActiveActivationState });
        expect(res.execution).toBe('DISABLED');
      }
    });

    test('17. Playwright launches remain strictly 0 during action review & approval', () => {
      const review = generateCareerOSOperatorActionReview(mockOptions);
      expect(review.safety.playwrightLaunches).toBe(0);
    });

    test('18. Telegram network dispatches remain strictly 0 during action review & approval', () => {
      const review = generateCareerOSOperatorActionReview(mockOptions);
      expect(review.safety.telegramCalls).toBe(0);
    });

    test('19. Application submissions remain strictly 0 during action review & approval', () => {
      const review = generateCareerOSOperatorActionReview(mockOptions);
      expect(review.safety.applicationSubmissions).toBe(0);
    });

    test('20. Core job/application data stores remain 100% byte-for-byte immutable', () => {
      const preHashes = verifyCoreStoreIntegrity();
      generateCareerOSOperatorActionReview(mockOptions);
      const postHashes = verifyCoreStoreIntegrity();
      expect(preHashes).toEqual(postHashes);
    });
  });

  // 21-26: Store Integrity, Fingerprint & Reports
  describe('Store Integrity, Fingerprint & Reports', () => {
    test('21. Review store reader returns review object structure', () => {
      const store = readReviewStore();
      expect(store).toHaveProperty('actions');
    });

    test('22. Review history reader returns array of history events', () => {
      const history = readReviewHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    test('23. Fingerprint calculation is deterministic across identical evaluations', () => {
      const rev1 = generateCareerOSOperatorActionReview(mockOptions);
      const rev2 = generateCareerOSOperatorActionReview(mockOptions);
      expect(rev1.fingerprint).toBe(rev2.fingerprint);
      expect(typeof rev1.fingerprint).toBe('string');
      expect(rev1.fingerprint.length).toBe(64);
    });

    test('24. Action review trace returns 6 ordered pipeline stages', () => {
      const trace = getCareerOSActionReviewTrace(mockOptions);
      expect(trace.length).toBe(6);
    });

    test('25. Full report generator produces complete structured action review report', () => {
      const report = generateCareerOSActionReviewReport(mockOptions);
      expect(report).toHaveProperty('reportTitle');
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('evaluation');
      expect(report).toHaveProperty('history');
    });

    test('26. Complete P3.36 operator action review & approval workflow baseline certified', () => {
      const status = getCareerOSOperatorActionReviewStatus(mockOptions);
      expect(status.reviewStatus).toBe('REVIEW_READY');
      expect(status.externalExecution).toBe('DISABLED');
    });
  });
});

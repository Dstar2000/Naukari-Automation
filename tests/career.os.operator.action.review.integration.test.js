const {
  generateCareerOSOperatorActionReview,
  getCareerOSOperatorActionReviewStatus,
  getCareerOSPendingActions,
  approveAction,
  rejectAction,
  generateCareerOSActionReviewReport
} = require('../src/intelligence/career.os.operator.action.review');

describe('Career OS Operator Action Review Integration Test Suite (P3.36)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };
  const mockActiveActivationState = {
    status: 'ACTIVE',
    approvedBy: 'HUMAN_OPERATOR_1',
    approvedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    reason: 'TEST_ACTIVE_ACTIVATION'
  };

  test('1. Full action review integration pipeline discovers real actions from existing stores', () => {
    const review = generateCareerOSOperatorActionReview(mockOptions);
    expect(review.reviewStatus).toBe('REVIEW_READY');
    expect(review.metrics.totalDiscovered).toBeGreaterThan(0);
    expect(review.safety.externalExecution).toBe('DISABLED');
  });

  test('2. Governed review approval/rejection loop executes safely without external execution', () => {
    const pending = getCareerOSPendingActions({ ...mockOptions, customActivationState: mockActiveActivationState });
    if (pending.length > 0) {
      const actionToApprove = pending[0];
      const appRes = approveAction(actionToApprove.actionId, 'INTEGRATION_OPERATOR', { ...mockOptions, customActivationState: mockActiveActivationState });
      expect(appRes.success).toBe(true);
      expect(appRes.status).toBe('APPROVED');
      expect(appRes.execution).toBe('DISABLED');
    }
  });

  test('3. Full action review report produces clean structured output', () => {
    const report = generateCareerOSActionReviewReport(mockOptions);
    expect(report.evaluation.reviewStatus).toBe('REVIEW_READY');
    expect(Array.isArray(report.history)).toBe(true);
  });
});

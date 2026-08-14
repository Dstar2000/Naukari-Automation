const { isApplicationAlreadyEngaged } = require('./application.duplicate.guard');
const { validateJobUrl } = require('../naukri/job.url.validator');
const { readDecisionActions } = require('../intelligence/career-decision.approval');

/**
 * Classifies an application's recovery state following restarts, interruptions, or failures.
 * Evaluates whether an application can be safely retried or must be blocked.
 *
 * Classifications:
 * - ALREADY_ENGAGED: Present in outcomes, history, queue, or decision actions as submitted/executed.
 * - AMBIGUOUS_EXTERNAL_STATE: Stuck in EXECUTING state or lock present without definitive outcome.
 * - BLOCKED: Ineligible action type, invalid/missing URL, or explicit guard block.
 * - SAFE_TO_RETRY: Unengaged, live URL, clean state.
 *
 * @param {Object|string} jobOrUrl Job object, decision action, or job URL
 * @param {Object} [options] Options { customData }
 * @returns {{ state: string, reason: string, canRetry: boolean }} Recovery classification
 */
function evaluateExecutionRecoveryState(jobOrUrl, options = {}) {
  if (!jobOrUrl) {
    return { state: 'BLOCKED', reason: 'MISSING_JOB_OR_DECISION_INPUT', canRetry: false };
  }

  const jobObj = typeof jobOrUrl === 'string' ? { jobUrl: jobOrUrl } : jobOrUrl;
  const appId = jobObj.executionApplicationId || jobObj.applicationId || jobObj.jobId;
  const url = jobObj.jobUrl || (jobObj.evidence ? jobObj.evidence.jobUrl : null);

  // 1. Check Duplicate Engagement
  const duplicateCheck = isApplicationAlreadyEngaged(jobObj, { customData: options.customData });
  if (duplicateCheck.engaged) {
    return {
      state: 'ALREADY_ENGAGED',
      reason: duplicateCheck.reason || 'APPLICATION_ALREADY_ENGAGED',
      canRetry: false
    };
  }

  // 2. Check Interrupted / Ambiguous Execution States (EXECUTING without completion)
  const actions = options.customData ? (options.customData.decisionActions || []) : readDecisionActions();
  const currentAction = actions.find((a) => a.decisionId === jobObj.decisionId || (appId && (a.applicationId === appId || a.jobId === appId)));

  if (currentAction && currentAction.executionStatus === 'EXECUTING') {
    return {
      state: 'AMBIGUOUS_EXTERNAL_STATE',
      reason: 'INTERRUPTED_EXECUTION_STATE (Action stuck in EXECUTING state)',
      canRetry: false
    };
  }

  // 3. Check Live Job URL Validity
  if (url) {
    const urlCheck = validateJobUrl(url);
    if (!urlCheck.valid) {
      return {
        state: 'BLOCKED',
        reason: `INVALID_OR_NON_LIVE_URL (${urlCheck.reason || 'INVALID'})`,
        canRetry: false
      };
    }
  }

  // 4. Action Type Eligibility Check
  if (jobObj.actionType && jobObj.actionType !== 'HIGH_MATCH_OPPORTUNITY') {
    return {
      state: 'BLOCKED',
      reason: `INELIGIBLE_ACTION_TYPE (${jobObj.actionType} is advisory only)`,
      canRetry: false
    };
  }

  return {
    state: 'SAFE_TO_RETRY',
    reason: 'CLEAN_UNENGAGED_STATE_SAFE_FOR_CONTROLLED_RETRY',
    canRetry: true
  };
}

module.exports = {
  evaluateExecutionRecoveryState
};

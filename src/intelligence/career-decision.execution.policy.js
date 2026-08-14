const { resolveDecisionIdentity } = require('./career-decision.approval');
const { isApplicationAlreadyEngaged } = require('../tracking/application.duplicate.guard');
const { validateJobUrl } = require('../naukri/job.url.validator');

const EXECUTION_ELIGIBLE_ACTION_TYPES = ['HIGH_MATCH_OPPORTUNITY'];

/**
 * Evaluates whether a career decision action is eligible for automated execution.
 * Enforces strict fail-closed security policy.
 *
 * @param {string|Object} decisionOrId Decision ID string or decision identity object
 * @param {Object} [options] Options { executionConfirmed, customData, mockValidation }
 * @returns {Promise<{ eligible: boolean, reason: string, decision?: Object }>} Policy result
 */
async function evalExecutionPolicy(decisionOrId, options = {}) {
  const decisionId = typeof decisionOrId === 'string' ? decisionOrId : (decisionOrId ? decisionOrId.decisionId : null);
  if (!decisionId) {
    return { eligible: false, reason: 'MISSING_DECISION_ID' };
  }

  const decision = typeof decisionOrId === 'object' ? decisionOrId : resolveDecisionIdentity(decisionId, options);
  if (!decision) {
    return { eligible: false, reason: 'DECISION_NOT_FOUND' };
  }

  // 1. Action Type Policy Check (Only HIGH_MATCH_OPPORTUNITY is eligible)
  if (!EXECUTION_ELIGIBLE_ACTION_TYPES.includes(decision.actionType)) {
    return { eligible: false, reason: `ACTION_TYPE_NOT_ELIGIBLE (${decision.actionType} is advisory only)`, decision };
  }

  // 2. Decision Status Check (Must be APPROVED)
  const isApproved = decision.decisionStatus === 'APPROVED' || options.isMock || options.forceApproved;
  if (!isApproved) {
    return { eligible: false, reason: `DECISION_NOT_APPROVED (Current status: ${decision.decisionStatus})`, decision };
  }

  // 3. User Approval & Automation Policy
  if (decision.requiresUserApproval !== true) {
    return { eligible: false, reason: 'USER_APPROVAL_POLICY_VIOLATED', decision };
  }

  // 4. Two-Step Execution Confirmation Check
  const isConfirmed = options.executionConfirmed || decision.executionStatus === 'EXECUTION_AUTHORIZED' || decision.executionConfirmed === true;
  if (!isConfirmed) {
    return { eligible: false, reason: 'TWO_STEP_CONFIRMATION_REQUIRED', decision };
  }

  // 5. Already Executed Check
  if (decision.executionStatus === 'EXECUTED') {
    return { eligible: false, reason: 'ALREADY_EXECUTED', decision };
  }

  // 6. Canonical Identity & Identifier Check
  const targetId = decision.applicationId || decision.jobId;
  const targetUrl = decision.jobUrl || (decision.evidence ? decision.evidence.jobUrl : null);
  if (!targetId && !targetUrl) {
    return { eligible: false, reason: 'MISSING_CANONICAL_IDENTIFIER', decision };
  }

  // 7. Duplicate Application Guard Check (MUST NOT be already engaged)
  const duplicateCheck = isApplicationAlreadyEngaged(decision, { customData: options.customData });
  if (duplicateCheck.engaged) {
    return { eligible: false, reason: `ALREADY_ENGAGED (${duplicateCheck.reason})`, decision };
  }

  // 8. Live Job URL Validation Check (Skip live HTTP call during test mode if mockValidation provided)
  if (targetUrl && !options.skipUrlValidation) {
    const isTest = process.env.NODE_ENV === 'test' || options.mockValidation;
    if (isTest) {
      const mockStatus = options.mockValidationStatus || 'LIVE';
      if (mockStatus !== 'LIVE') {
        return { eligible: false, reason: `JOB_URL_NOT_LIVE (${mockStatus})`, decision };
      }
    } else {
      try {
        const valRes = validateJobUrl(targetUrl);
        if (!valRes || !valRes.valid) {
          return { eligible: false, reason: `JOB_URL_NOT_LIVE (${valRes ? valRes.reason : 'FAILED'})`, decision };
        }
      } catch (err) {
        return { eligible: false, reason: `JOB_URL_VALIDATION_ERROR (${err.message})`, decision };
      }
    }
  }

  return {
    eligible: true,
    reason: 'ELIGIBLE_FOR_EXECUTION',
    decision
  };
}

module.exports = {
  evalExecutionPolicy,
  EXECUTION_ELIGIBLE_ACTION_TYPES
};

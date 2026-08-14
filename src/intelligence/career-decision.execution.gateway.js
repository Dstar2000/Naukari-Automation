const { evalExecutionPolicy } = require('./career-decision.execution.policy');
const { updateDecisionStatus, resolveDecisionIdentity, readDecisionActions, writeDecisionActions } = require('./career-decision.approval');
const { submitApplication } = require('../naukri/application.executor');
const { evaluateCareerOSExecutionPermission } = require('./career.os.governance.enforcement');

const executedDecisionsMap = new Set();

/**
 * Authorizes a career decision for controlled execution.
 *
 * @param {string} decisionId Decision ID
 * @param {Object} [options] Options { customData, mockValidation }
 * @returns {Promise<{ authorized: boolean, reason: string, decision?: Object }>}
 */
async function authorizeDecisionExecution(decisionId, options = {}) {
  if (executedDecisionsMap.has(decisionId)) {
    return { authorized: false, reason: 'ALREADY_EXECUTED' };
  }

  const isAutonomous = options.isAutonomous === true;
  const govEval = evaluateCareerOSExecutionPermission(
    isAutonomous ? 'AUTONOMOUS_SUBMISSION' : 'USER_APPROVED_EXECUTION',
    { decisionId, isAutonomous, isUserApproved: !isAutonomous },
    options
  );
  if (!govEval.allowed) {
    return { authorized: false, reason: govEval.code || 'GOVERNANCE_EXECUTION_BLOCKED' };
  }

  const policyRes = await evalExecutionPolicy(decisionId, options);
  if (!policyRes.eligible) {
    return { authorized: false, reason: policyRes.reason, decision: policyRes.decision };
  }

  const decision = policyRes.decision;
  decision.executionStatus = 'EXECUTION_AUTHORIZED';
  decision.executionConfirmedAt = new Date().toISOString();

  if (!options.isMock && !options.customData) {
    const actions = readDecisionActions();
    const idx = actions.findIndex((a) => a.decisionId === decisionId);
    if (idx >= 0) {
      actions[idx] = { ...actions[idx], ...decision };
      writeDecisionActions(actions);
    }
  }

  return {
    authorized: true,
    reason: 'EXECUTION_AUTHORIZED',
    decision
  };
}

/**
 * Executes an authorized career decision via the existing application executor.
 * Strictly fail-closed and idempotent.
 *
 * @param {string} decisionId Decision ID
 * @param {Object} [options] Options { isMock, mockSuccess, customData }
 * @returns {Promise<{ success: boolean, reason: string, result?: Object }>}
 */
async function executeApprovedDecision(decisionId, options = {}) {
  if (executedDecisionsMap.has(decisionId)) {
    return { success: false, reason: 'ALREADY_EXECUTED' };
  }

  const isTest = process.env.NODE_ENV === 'test' || options.isMock || options.suppressExecution;

  // 1. Authorize Decision Execution
  const authRes = await authorizeDecisionExecution(decisionId, options);
  if (!authRes.authorized) {
    console.warn(`⚠️ [Execution Gateway] Authorization failed for ${decisionId}: ${authRes.reason}`);
    return { success: false, reason: authRes.reason };
  }

  const decision = authRes.decision;

  // 2. Double-check Idempotency
  if (decision.executionStatus === 'EXECUTED') {
    executedDecisionsMap.add(decisionId);
    return { success: false, reason: 'ALREADY_EXECUTED' };
  }

  // 3. Mark EXECUTING State
  decision.executionStatus = 'EXECUTING';
  decision.executionStartedAt = new Date().toISOString();

  // 4. Test Mode Execution Guard (Mock execution during Jest tests / dry-run)
  if (isTest) {
    console.log(`[Execution Gateway] Test mode active. Suppressing live Playwright execution for ${decisionId}.`);
    decision.executionStatus = 'EXECUTED';
    decision.executionCompletedAt = new Date().toISOString();
    decision.executionApplicationId = decision.applicationId || decision.jobId || 'mock_app_123';
    executedDecisionsMap.add(decisionId);

    return {
      success: true,
      reason: 'EXECUTED_MOCK_SUCCESS',
      decision
    };
  }

  // 5. Delegate Execution to Existing application.executor.js
  try {
    const jobIdentity = {
      applicationId: decision.applicationId || decision.jobId,
      jobId: decision.jobId,
      company: decision.company || (decision.evidence ? decision.evidence.company : 'Company'),
      role: decision.role || decision.title || (decision.evidence ? decision.evidence.role : 'Role'),
      jobUrl: decision.jobUrl || (decision.evidence ? decision.evidence.jobUrl : '')
    };

    const execRes = await submitApplication(jobIdentity);

    if (execRes && (execRes.success || execRes.status === 'SUBMITTED')) {
      decision.executionStatus = 'EXECUTED';
      decision.executionCompletedAt = new Date().toISOString();
      decision.executionApplicationId = execRes.applicationId || jobIdentity.applicationId;

      if (!options.customData) {
        const actions = readDecisionActions();
        const idx = actions.findIndex((a) => a.decisionId === decisionId);
        if (idx >= 0) {
          actions[idx] = { ...actions[idx], ...decision };
          writeDecisionActions(actions);
        }
      }

      console.log(`✓ [Execution Gateway] Decision "${decisionId}" executed successfully via existing executor.`);
      return {
        success: true,
        reason: 'EXECUTED_SUCCESSFULLY',
        decision,
        execResult: execRes
      };
    }

    decision.executionStatus = 'EXECUTION_FAILED';
    decision.executionError = execRes ? execRes.reason : 'EXECUTOR_FAILED';
    return {
      success: false,
      reason: decision.executionError
    };
  } catch (err) {
    console.error(`❌ [Execution Gateway] Execution error for ${decisionId}:`, err.message);
    decision.executionStatus = 'EXECUTION_FAILED';
    decision.executionError = err.message;
    return {
      success: false,
      reason: 'EXECUTION_EXCEPTION',
      error: err.message
    };
  }
}

module.exports = {
  authorizeDecisionExecution,
  executeApprovedDecision
};

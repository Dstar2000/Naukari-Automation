const {
  getCareerOSGovernanceState,
  isCareerOSAutomationAllowed,
  isCareerOSIncidentResponseAllowed,
  isCareerOSTelegramNotificationAllowed
} = require('./career.os.governance');

const VALID_MODES = ['NORMAL', 'OBSERVATION_ONLY', 'INCIDENT_RESPONSE_ONLY', 'PAUSED'];

/**
 * Validates governance state integrity. Fails closed if missing, malformed, or inconsistent.
 */
function validateStateIntegrity(state) {
  if (!state || typeof state !== 'object') {
    return { valid: false, code: 'INVALID_GOVERNANCE_STATE', reason: 'Governance state missing or unreadable' };
  }
  if (!state.operatorMode || !VALID_MODES.includes(state.operatorMode)) {
    return { valid: false, code: 'INVALID_GOVERNANCE_STATE', reason: `Invalid operator mode: ${state.operatorMode}` };
  }
  if (state.governanceStatus !== 'ACTIVE') {
    return { valid: false, code: 'GOVERNANCE_EXECUTION_BLOCKED', reason: `Governance status is ${state.governanceStatus}` };
  }
  return { valid: true };
}

/**
 * Evaluates general execution permission for any Career OS action.
 */
function evaluateCareerOSExecutionPermission(actionType, context = {}, options = {}) {
  const state = getCareerOSGovernanceState(options);
  const integrity = validateStateIntegrity(state);

  if (!integrity.valid) {
    return {
      allowed: false,
      code: integrity.code,
      reason: integrity.reason,
      governanceStatus: state ? state.governanceStatus : 'INVALID',
      operatorMode: state ? state.operatorMode : 'UNKNOWN',
      actionType: actionType || 'UNKNOWN',
      automationAllowed: false
    };
  }

  const mode = state.operatorMode;

  // PAUSED mode blocks all execution
  if (mode === 'PAUSED') {
    return {
      allowed: false,
      code: 'GOVERNANCE_EXECUTION_BLOCKED',
      reason: 'Governance operator mode is PAUSED',
      governanceStatus: state.governanceStatus,
      operatorMode: mode,
      actionType: actionType || 'UNKNOWN',
      automationAllowed: false
    };
  }

  // Autonomous application submission is ALWAYS strictly blocked across all modes UNLESS explicitly user-approved
  if (
    (actionType === 'AUTONOMOUS_SUBMISSION' || actionType === 'EXTERNAL_CAREER_ACTION' || context.isAutonomous === true) &&
    !context.isUserApproved
  ) {
    return {
      allowed: false,
      code: 'AUTONOMOUS_SUBMISSION_BLOCKED',
      reason: 'Autonomous application submissions and external career actions are strictly blocked by governance policy',
      governanceStatus: state.governanceStatus,
      operatorMode: mode,
      actionType: actionType || 'AUTONOMOUS_SUBMISSION',
      automationAllowed: false
    };
  }

  // Ambiguous execution auto-recovery is ALWAYS strictly blocked
  if (actionType === 'AMBIGUOUS_EXECUTION_RECOVERY' || context.isAmbiguous === true) {
    return {
      allowed: false,
      code: 'AMBIGUOUS_EXECUTION_BLOCKED',
      reason: 'Automated recovery of ambiguous external execution states is strictly prohibited',
      governanceStatus: state.governanceStatus,
      operatorMode: mode,
      actionType: actionType || 'AMBIGUOUS_EXECUTION_RECOVERY',
      automationAllowed: false
    };
  }

  // OBSERVATION_ONLY mode blocks all active mutations
  if (mode === 'OBSERVATION_ONLY' && actionType !== 'READ_ONLY_OBSERVATION' && actionType !== 'TELEGRAM_NOTIFICATION') {
    return {
      allowed: false,
      code: 'GOVERNANCE_EXECUTION_BLOCKED',
      reason: 'Governance operator mode OBSERVATION_ONLY permits read-only observation operations only',
      governanceStatus: state.governanceStatus,
      operatorMode: mode,
      actionType: actionType || 'MUTATION',
      automationAllowed: false
    };
  }

  return {
    allowed: true,
    code: 'GOVERNANCE_EXECUTION_ALLOWED',
    reason: 'Execution permitted by governance policy',
    governanceStatus: state.governanceStatus,
    operatorMode: mode,
    actionType: actionType || 'GENERAL',
    automationAllowed: true
  };
}

/**
 * Asserts execution allowed, throws an error if blocked.
 */
function assertCareerOSExecutionAllowed(actionType, context = {}, options = {}) {
  const evalRes = evaluateCareerOSExecutionPermission(actionType, context, options);
  if (!evalRes.allowed) {
    const err = new Error(`[Governance Enforcement] Execution Blocked (${evalRes.code}): ${evalRes.reason}`);
    err.code = evalRes.code;
    err.evaluation = evalRes;
    throw err;
  }
  return evalRes;
}

/**
 * Evaluates incident response execution permission.
 */
function evaluateCareerOSIncidentResponsePermission(incident = {}, plan = {}, options = {}) {
  const state = getCareerOSGovernanceState(options);
  const integrity = validateStateIntegrity(state);

  if (!integrity.valid) {
    return { allowed: false, code: integrity.code, reason: integrity.reason, automationAllowed: false };
  }

  if (state.operatorMode === 'PAUSED' || state.operatorMode === 'OBSERVATION_ONLY') {
    return {
      allowed: false,
      code: 'INCIDENT_RESPONSE_BLOCKED',
      reason: `Incident response blocked under operator mode ${state.operatorMode}`,
      automationAllowed: false
    };
  }

  if (!isCareerOSIncidentResponseAllowed(options)) {
    return {
      allowed: false,
      code: 'INCIDENT_RESPONSE_BLOCKED',
      reason: 'Automated incident response is disabled in governance policy',
      automationAllowed: false
    };
  }

  // External career action requiresExternalAction MUST be blocked
  if (plan.requiresExternalAction || (incident && incident.requiresExternalAction)) {
    return {
      allowed: false,
      code: 'AMBIGUOUS_EXECUTION_BLOCKED',
      reason: 'Automated response for external career actions is strictly prohibited',
      automationAllowed: false
    };
  }

  return {
    allowed: true,
    code: 'GOVERNANCE_EXECUTION_ALLOWED',
    reason: 'Internal recovery response permitted by governance policy',
    automationAllowed: true
  };
}

/**
 * Evaluates Telegram notification permission.
 */
function evaluateCareerOSTelegramPermission(notificationType, payload = {}, options = {}) {
  const state = getCareerOSGovernanceState(options);
  const integrity = validateStateIntegrity(state);

  if (!integrity.valid) {
    return { allowed: false, code: integrity.code, reason: integrity.reason, automationAllowed: false };
  }

  if (state.operatorMode === 'PAUSED') {
    return {
      allowed: false,
      code: 'TELEGRAM_NOTIFICATION_BLOCKED',
      reason: 'Telegram notifications blocked in PAUSED operator mode',
      automationAllowed: false
    };
  }

  if (!isCareerOSTelegramNotificationAllowed(options)) {
    return {
      allowed: false,
      code: 'TELEGRAM_NOTIFICATION_BLOCKED',
      reason: 'Telegram notifications are disabled in governance policy',
      automationAllowed: false
    };
  }

  return {
    allowed: true,
    code: 'GOVERNANCE_EXECUTION_ALLOWED',
    reason: 'Telegram notification permitted by governance policy',
    automationAllowed: true
  };
}

/**
 * Evaluates scheduler execution permission.
 */
function evaluateCareerOSSchedulerPermission(schedulerName, options = {}) {
  const state = getCareerOSGovernanceState(options);
  const integrity = validateStateIntegrity(state);

  if (!integrity.valid) {
    return { allowed: false, code: integrity.code, reason: integrity.reason, automationAllowed: false };
  }

  if (state.operatorMode === 'PAUSED' || state.operatorMode === 'OBSERVATION_ONLY') {
    return {
      allowed: false,
      code: 'SCHEDULER_EXECUTION_BLOCKED',
      reason: `Scheduler execution blocked under operator mode ${state.operatorMode}`,
      automationAllowed: false
    };
  }

  if (!isCareerOSAutomationAllowed(options)) {
    return {
      allowed: false,
      code: 'SCHEDULER_EXECUTION_BLOCKED',
      reason: 'Automation schedulers disabled in governance policy',
      automationAllowed: false
    };
  }

  return {
    allowed: true,
    code: 'GOVERNANCE_EXECUTION_ALLOWED',
    reason: 'Scheduler execution permitted by governance policy',
    automationAllowed: true
  };
}

/**
 * Evaluates recovery permission for application recovery guards.
 */
function evaluateCareerOSRecoveryPermission(recoveryContext = {}, options = {}) {
  if (recoveryContext.isAmbiguous || recoveryContext.executionStatus === 'AMBIGUOUS_EXTERNAL_STATE') {
    return {
      allowed: false,
      code: 'AMBIGUOUS_EXECUTION_BLOCKED',
      reason: 'Recovery of ambiguous external state requires human intervention',
      automationAllowed: false
    };
  }

  return {
    allowed: true,
    code: 'GOVERNANCE_EXECUTION_ALLOWED',
    reason: 'Safe internal recovery permitted',
    automationAllowed: true
  };
}

module.exports = {
  evaluateCareerOSExecutionPermission,
  assertCareerOSExecutionAllowed,
  evaluateCareerOSIncidentResponsePermission,
  evaluateCareerOSTelegramPermission,
  evaluateCareerOSSchedulerPermission,
  evaluateCareerOSRecoveryPermission
};

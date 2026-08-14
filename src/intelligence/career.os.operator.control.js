const {
  evaluateCareerOSProductionActivation,
  generateCareerOSProductionActivationReport,
  getCareerOSProductionActivationStatus,
  requestCareerOSProductionActivation,
  approveCareerOSProductionActivation,
  revokeCareerOSProductionActivation
} = require('./career.os.production.activation');

const {
  evaluateCareerOSOperatorExecutionReadiness
} = require('./career.os.operator.execution');

const {
  generateCareerOSControlCenterSnapshot
} = require('./career.os.control.center');

const {
  getCareerOSGovernanceState
} = require('./career.os.governance');

const {
  evaluateCareerOSExecutionPermission
} = require('./career.os.governance.enforcement');

/**
 * Gets high-level, read-only operator control status.
 * Never leaks secrets or sensitive auth data.
 */
function getProductionOperatorControlStatus(options = {}) {
  const actStatus = getCareerOSProductionActivationStatus(options);
  const execStatus = evaluateCareerOSOperatorExecutionReadiness(options);
  const govState = getCareerOSGovernanceState(options);

  const autoEval = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION', {}, options);

  const isGovActive = govState && govState.governanceStatus === 'ACTIVE';

  return {
    productionReadiness: isGovActive ? 'READY' : 'NOT_READY',
    handoverStatus: 'READY_FOR_HUMAN_ACTIVATION',
    activationStatus: actStatus.status,
    activationGate: actStatus.activationGate,
    executionPermission: execStatus.productionExecutionAllowed ? 'ALLOWED' : 'BLOCKED',
    executionReason: execStatus.reason,
    operatorApprovalRequired: true,
    governanceStatus: isGovActive ? 'ACTIVE' : (govState ? govState.governanceStatus : 'INACTIVE'),
    enforcementStatus: isGovActive ? 'ACTIVE' : 'INACTIVE',
    autonomousSubmissionsAllowed: autoEval.allowed // ALWAYS false
  };
}

/**
 * Requests production activation. Delegates to activation module.
 */
function requestProductionActivation(options = {}) {
  return requestCareerOSProductionActivation(options);
}

/**
 * Approves production activation with explicit human operator identity.
 */
function approveProductionActivation(operator, reason, options = {}) {
  return approveCareerOSProductionActivation(operator, reason, options);
}

/**
 * Revokes active production activation immediately.
 */
function revokeProductionActivation(operator, reason, options = {}) {
  return revokeCareerOSProductionActivation(operator, reason, options);
}

/**
 * Inspects production activation state and returns diagnostic snapshot.
 */
function inspectProductionActivation(options = {}) {
  const controlStatus = getProductionOperatorControlStatus(options);
  const activationEval = evaluateCareerOSProductionActivation(options);
  const snapshot = generateCareerOSControlCenterSnapshot(options);

  return {
    controlStatus,
    activationEval,
    snapshot
  };
}

module.exports = {
  getProductionOperatorControlStatus,
  requestProductionActivation,
  approveProductionActivation,
  revokeProductionActivation,
  inspectProductionActivation
};

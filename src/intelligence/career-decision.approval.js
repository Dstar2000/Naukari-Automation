const fs = require('fs');
const path = require('path');
const { generateCareerDecisionReport } = require('./career-decision.analytics');

const ACTIONS_PATH = path.resolve(__dirname, '../../data/career-decision-actions.json');

function readDecisionActions() {
  if (!fs.existsSync(ACTIONS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(ACTIONS_PATH, 'utf-8')) || [];
  } catch (_) {
    return [];
  }
}

function writeDecisionActions(data) {
  const dir = path.dirname(ACTIONS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ACTIONS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Resolves canonical decision action object by decisionId.
 * Checks stored decisions first, then active decision report.
 *
 * @param {string} decisionId Target decision ID
 * @param {Object} [options] Custom data override
 * @returns {Object|null} Decision action object or null
 */
function resolveDecisionIdentity(decisionId, options = {}) {
  if (!decisionId) return null;
  if (!options.customData) {
    const stored = readDecisionActions().find((a) => a.decisionId === decisionId);
    if (stored) return stored;
  }

  const report = generateCareerDecisionReport(options);
  const activeAction = report.actions.find((a) => a.id === decisionId);
  if (activeAction) {
    return {
      decisionId: activeAction.id,
      actionType: activeAction.type,
      priority: activeAction.priority,
      score: activeAction.score,
      title: activeAction.title,
      reason: activeAction.reason,
      suggestedAction: activeAction.suggestedAction,
      applicationId: activeAction.applicationId,
      jobId: activeAction.jobId,
      decisionStatus: 'PENDING',
      requiresUserApproval: true,
      automationAllowed: false,
      decidedAt: null
    };
  }

  if ((options.isMock && typeof decisionId === 'string' && decisionId.startsWith('act_')) || options.createIfMissing) {
    const isOpp = typeof decisionId === 'string' && decisionId.startsWith('act_opportunity_');
    return {
      decisionId,
      actionType: isOpp ? 'HIGH_MATCH_OPPORTUNITY' : 'ADVISORY_ACTION',
      priority: 'MEDIUM',
      score: 85,
      title: `Advisory Action (${decisionId})`,
      reason: 'Advisory action generated for user review.',
      suggestedAction: 'Review decision.',
      applicationId: null,
      jobId: isOpp ? decisionId.replace('act_opportunity_', '') : null,
      decisionStatus: options.decisionStatus || 'APPROVED',
      requiresUserApproval: true,
      automationAllowed: false,
      decidedAt: null
    };
  }

  return null;
}

/**
 * Records user decision state in data/career-decision-actions.json.
 * IMPORTANT: APPROVED records user decision only and MUST NOT execute any external job action.
 *
 * @param {string} decisionId Target decision ID
 * @param {string} decisionStatus PENDING | APPROVED | REJECTED | DEFERRED
 * @param {Object} [options] Additional metadata
 * @returns {Object} Resolution result
 */
function updateDecisionStatus(decisionId, decisionStatus, options = {}) {
  const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'DEFERRED'];
  if (!validStatuses.includes(decisionStatus)) {
    return { success: false, reason: 'INVALID_DECISION_STATUS' };
  }

  const identity = resolveDecisionIdentity(decisionId, options);
  if (!identity) {
    return { success: false, reason: 'DECISION_NOT_FOUND' };
  }

  const actions = readDecisionActions();
  const existingIdx = actions.findIndex((a) => a.decisionId === decisionId);

  const updatedRecord = {
    ...identity,
    decisionId,
    decisionStatus,
    requiresUserApproval: true,
    automationAllowed: false,
    decidedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    actions[existingIdx] = updatedRecord;
  } else {
    actions.push(updatedRecord);
  }

  if (!options.isMock) {
    writeDecisionActions(actions);
  }

  console.log(`✓ Decision "${decisionId}" updated to status: ${decisionStatus} (User Approval Boundary Active - Execution Blocked)`);
  return {
    success: true,
    decisionId,
    status: decisionStatus,
    record: updatedRecord
  };
}

function recordDecisionApproval(decisionId, options = {}) {
  return updateDecisionStatus(decisionId, 'APPROVED', options);
}

function recordDecisionRejection(decisionId, options = {}) {
  return updateDecisionStatus(decisionId, 'REJECTED', options);
}

function recordDecisionDeferral(decisionId, options = {}) {
  return updateDecisionStatus(decisionId, 'DEFERRED', options);
}

module.exports = {
  resolveDecisionIdentity,
  updateDecisionStatus,
  recordDecisionApproval,
  recordDecisionRejection,
  recordDecisionDeferral,
  readDecisionActions,
  writeDecisionActions,
  ACTIONS_PATH
};

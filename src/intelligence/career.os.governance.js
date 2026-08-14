const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GOVERNANCE_FILE_PATH = path.resolve(__dirname, '../../data/career-os-operator-governance.json');
const HISTORY_FILE_PATH = path.resolve(__dirname, '../../data/career-os-governance-history.json');

const VALID_MODES = ['NORMAL', 'OBSERVATION_ONLY', 'INCIDENT_RESPONSE_ONLY', 'PAUSED'];

const DEFAULT_GOVERNANCE_STATE = {
  schemaVersion: '1.0.0',
  governanceStatus: 'ACTIVE',
  operatorMode: 'NORMAL',
  automationPolicy: {
    schedulersEnabled: true,
    autonomousSubmissionsAllowed: false
  },
  incidentPolicy: {
    automatedIncidentResponseEnabled: true,
    incidentCooldownMinutes: 15
  },
  notificationPolicy: {
    telegramNotificationsEnabled: true,
    dailyDigestEnabled: true
  },
  responsePolicy: {
    maxAutomatedRetries: 0,
    allowAmbiguousAutoRecovery: false
  },
  lastChangedAt: new Date().toISOString(),
  lastChangedBy: 'SYSTEM_INITIALIZER',
  changeCount: 0,
  fingerprint: ''
};

function computeFingerprint(state) {
  const clone = { ...state };
  delete clone.fingerprint;
  return crypto.createHash('sha256').update(JSON.stringify(clone)).digest('hex');
}

/**
 * Reads governance state with atomic & recovery fallback.
 */
function getCareerOSGovernanceState(options = {}) {
  if (options.customGovernanceState !== undefined) {
    return options.customGovernanceState;
  }
  if (!fs.existsSync(GOVERNANCE_FILE_PATH)) {
    const initialState = { ...DEFAULT_GOVERNANCE_STATE };
    initialState.fingerprint = computeFingerprint(initialState);
    return initialState;
  }
  try {
    const raw = fs.readFileSync(GOVERNANCE_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.operatorMode || !VALID_MODES.includes(parsed.operatorMode)) {
      parsed.operatorMode = 'NORMAL';
    }
    return parsed;
  } catch (_) {
    const fallbackState = { ...DEFAULT_GOVERNANCE_STATE };
    fallbackState.fingerprint = computeFingerprint(fallbackState);
    return fallbackState;
  }
}

/**
 * Persists governance state atomically.
 */
function saveCareerOSGovernanceState(state, options = {}) {
  if (options.skipSave || options.customGovernanceState) return;
  state.fingerprint = computeFingerprint(state);
  const dir = path.dirname(GOVERNANCE_FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(GOVERNANCE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Reads governance audit history (max 500 records).
 */
function getCareerOSGovernanceHistory(options = {}) {
  if (options.customGovernanceHistory) {
    return options.customGovernanceHistory;
  }
  if (!fs.existsSync(HISTORY_FILE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE_PATH, 'utf-8')) || [];
  } catch (_) {
    return [];
  }
}

/**
 * Records governance audit entry into history store.
 */
function recordCareerOSGovernanceChange(record, options = {}) {
  const history = getCareerOSGovernanceHistory(options);
  const entry = {
    id: `gov_hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    actor: record.actor || 'OPERATOR',
    changeType: record.changeType || 'CONFIG_UPDATE',
    beforeState: record.beforeState || null,
    afterState: record.afterState || null,
    status: record.status || 'SUCCESS',
    rejectionReason: record.rejectionReason || null,
    fingerprint: crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex')
  };

  history.push(entry);
  if (history.length > 500) {
    history.splice(0, history.length - 500);
  }

  if (!options.skipSave && !options.customGovernanceHistory) {
    const dir = path.dirname(HISTORY_FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(history, null, 2), 'utf-8');
  }

  return entry;
}

/**
 * Validates requested governance change against explicit allowlist & safety rules.
 *
 * @param {Object} change Requested change object
 * @param {Object} [options] Options
 * @returns {{ valid: boolean, code: string, reason: string }} Validation result
 */
function validateCareerOSGovernanceChange(change, options = {}) {
  if (!change || typeof change !== 'object') {
    return { valid: false, code: 'GOVERNANCE_CHANGE_BLOCKED', reason: 'Invalid change payload' };
  }

  // Check operatorMode validity
  if (change.operatorMode !== undefined) {
    if (!VALID_MODES.includes(change.operatorMode)) {
      return {
        valid: false,
        code: 'INVALID_GOVERNANCE_MODE',
        reason: `Operator mode '${change.operatorMode}' is invalid. Must be one of: ${VALID_MODES.join(', ')}`
      };
    }
  }

  // Forbidden overrides check
  if (change.autonomousSubmissionsAllowed === true || (change.automationPolicy && change.automationPolicy.autonomousSubmissionsAllowed === true)) {
    return {
      valid: false,
      code: 'FORBIDDEN_AUTOMATION_OVERRIDE',
      reason: 'Autonomous job submission overrides are strictly forbidden by career safety policy'
    };
  }

  if (change.allowAmbiguousAutoRecovery === true || (change.responsePolicy && change.responsePolicy.allowAmbiguousAutoRecovery === true)) {
    return {
      valid: false,
      code: 'AMBIGUOUS_EXECUTION_OVERRIDE_BLOCKED',
      reason: 'Automatic recovery of ambiguous execution states is strictly forbidden'
    };
  }

  if (change.disableGuards || change.disableDuplicateGuards || change.profileMutation || change.naukriCredentials) {
    return {
      valid: false,
      code: 'FORBIDDEN_AUTOMATION_OVERRIDE',
      reason: 'Disabling application guards or profile mutations is strictly forbidden'
    };
  }

  return { valid: true, code: 'GOVERNANCE_CHANGE_ALLOWED', reason: 'Change validated successfully' };
}

/**
 * Applies validated governance change.
 *
 * @param {Object} change Change payload
 * @param {Object} [options] Options { actor, skipSave }
 * @returns {Object} Result { success, code, state, historyEntry }
 */
function applyCareerOSGovernanceChange(change, options = {}) {
  const validation = validateCareerOSGovernanceChange(change, options);
  const beforeState = getCareerOSGovernanceState(options);

  if (!validation.valid) {
    const failedRecord = recordCareerOSGovernanceChange(
      {
        actor: options.actor || 'OPERATOR',
        changeType: change.changeType || 'CONFIG_MUTATION_REJECTED',
        beforeState,
        afterState: beforeState,
        status: 'REJECTED',
        rejectionReason: validation.reason
      },
      options
    );
    return { success: false, code: validation.code, reason: validation.reason, historyEntry: failedRecord };
  }

  const newState = JSON.parse(JSON.stringify(beforeState));

  if (change.operatorMode) {
    newState.operatorMode = change.operatorMode;
  }

  if (change.automationPolicy) {
    newState.automationPolicy = { ...newState.automationPolicy, ...change.automationPolicy };
  }

  if (change.incidentPolicy) {
    newState.incidentPolicy = { ...newState.incidentPolicy, ...change.incidentPolicy };
  }

  if (change.notificationPolicy) {
    newState.notificationPolicy = { ...newState.notificationPolicy, ...change.notificationPolicy };
  }

  if (change.responsePolicy) {
    newState.responsePolicy = { ...newState.responsePolicy, ...change.responsePolicy };
  }

  // Ensure invariants
  newState.automationPolicy.autonomousSubmissionsAllowed = false;
  newState.responsePolicy.allowAmbiguousAutoRecovery = false;

  newState.lastChangedAt = new Date().toISOString();
  newState.lastChangedBy = options.actor || 'OPERATOR';
  newState.changeCount = (beforeState.changeCount || 0) + 1;

  saveCareerOSGovernanceState(newState, options);

  const historyEntry = recordCareerOSGovernanceChange(
    {
      actor: options.actor || 'OPERATOR',
      changeType: change.changeType || 'CONFIG_MUTATION_SUCCESS',
      beforeState,
      afterState: newState,
      status: 'SUCCESS'
    },
    options
  );

  return { success: true, code: 'GOVERNANCE_CHANGE_ALLOWED', state: newState, historyEntry };
}

/**
 * Checks if general automation / schedulers are permitted by governance.
 */
function isCareerOSAutomationAllowed(options = {}) {
  const state = getCareerOSGovernanceState(options);
  if (state.operatorMode === 'PAUSED') return false;
  if (state.operatorMode === 'OBSERVATION_ONLY') return false;
  if (state.operatorMode === 'INCIDENT_RESPONSE_ONLY') return false;
  return state.automationPolicy ? state.automationPolicy.schedulersEnabled : true;
}

/**
 * Checks if incident response orchestrator execution is permitted by governance.
 */
function isCareerOSIncidentResponseAllowed(options = {}) {
  const state = getCareerOSGovernanceState(options);
  if (state.operatorMode === 'PAUSED') return false;
  if (state.operatorMode === 'OBSERVATION_ONLY') return false;
  return state.incidentPolicy ? state.incidentPolicy.automatedIncidentResponseEnabled : true;
}

/**
 * Checks if Telegram notifications are permitted by governance.
 */
function isCareerOSTelegramNotificationAllowed(options = {}) {
  const state = getCareerOSGovernanceState(options);
  if (state.operatorMode === 'PAUSED') return false;
  return state.notificationPolicy ? state.notificationPolicy.telegramNotificationsEnabled : true;
}

/**
 * Generates full governance report object.
 */
function generateCareerOSGovernanceReport(options = {}) {
  const state = getCareerOSGovernanceState(options);
  const history = getCareerOSGovernanceHistory(options);

  return {
    reportTitle: 'Career OS Operator Governance Report',
    generatedAt: new Date().toISOString(),
    state,
    historyCount: history.length,
    history: history.slice(-10),
    checks: {
      automationAllowed: isCareerOSAutomationAllowed(options),
      incidentResponseAllowed: isCareerOSIncidentResponseAllowed(options),
      telegramNotificationAllowed: isCareerOSTelegramNotificationAllowed(options)
    }
  };
}

module.exports = {
  getCareerOSGovernanceState,
  generateCareerOSGovernanceReport,
  validateCareerOSGovernanceChange,
  applyCareerOSGovernanceChange,
  isCareerOSAutomationAllowed,
  isCareerOSIncidentResponseAllowed,
  isCareerOSTelegramNotificationAllowed,
  recordCareerOSGovernanceChange,
  getCareerOSGovernanceHistory,
  GOVERNANCE_FILE_PATH,
  HISTORY_FILE_PATH
};

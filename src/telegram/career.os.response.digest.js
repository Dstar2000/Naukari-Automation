/**
 * Pure formatting functions for Telegram incident response messages.
 * NO external HTTP network calls or side effects.
 */

/**
 * Formats an incident response plan message.
 *
 * @param {Object} plan Response plan object
 * @returns {{ text: string, reply_markup: Object }}
 */
function buildIncidentResponsePlanMessage(plan) {
  if (!plan) throw new Error('Response plan object is required for buildIncidentResponsePlanMessage');

  const id = plan.responseId;
  const type = plan.responseType;
  const anomaly = plan.anomalyType;
  const severity = plan.incidentSeverity;
  const status = plan.responseStatus;

  const text = [
    `*Career OS Incident Response Plan* 🛠️`,
    '',
    `*Response ID:* \`${id}\``,
    `*Incident ID:* \`${plan.incidentId}\``,
    `*Anomaly:* \`${anomaly}\``,
    `*Severity:* \`${severity}\``,
    '',
    `*Planned Operation:* \`${type}\``,
    `*Status:* \`${status}\``,
    `*Automation Allowed:* \`${plan.automationAllowed}\``,
    `*Requires User Approval:* \`${plan.requiresUserApproval}\``,
    '',
    `*Safety Boundary:* Safe infrastructure re-check only. No career-side effects will occur.`
  ].join('\n');

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '🔍 Review Plan', callback_data: `incident_response_review_${id}` },
        { text: '⚡ Confirm Execution', callback_data: `incident_response_confirm_${id}` }
      ],
      [
        { text: '🔍 Verify Recovery', callback_data: `incident_response_verify_${id}` },
        { text: '❌ Cancel Response', callback_data: `incident_response_cancel_${id}` }
      ]
    ]
  };

  return { text, reply_markup };
}

/**
 * Formats a recovery verification status message.
 *
 * @param {Object} plan 
 * @returns {{ text: string }}
 */
function buildIncidentRecoveryMessage(plan) {
  if (!plan) throw new Error('Response plan object is required for buildIncidentRecoveryMessage');

  const text = [
    `*Career OS Recovery Verification* 🔍`,
    '',
    `*Response ID:* \`${plan.responseId}\``,
    `*Incident ID:* \`${plan.incidentId}\``,
    `*Response Type:* \`${plan.responseType}\``,
    `*Verification Status:* \`${plan.recoveryVerificationStatus}\``,
    `*Completed At:* \`${plan.completedAt || new Date().toISOString()}\``
  ].join('\n');

  return { text };
}

/**
 * Formats a resolution message when an incident response is finalized.
 *
 * @param {Object} plan 
 * @returns {{ text: string }}
 */
function buildIncidentResolutionMessage(plan) {
  if (!plan) throw new Error('Response plan object is required for buildIncidentResolutionMessage');

  const text = [
    `*Career OS Incident Resolved via Response Plan* ✅`,
    '',
    `*Response ID:* \`${plan.responseId}\``,
    `*Incident ID:* \`${plan.incidentId}\``,
    `*Anomaly:* \`${plan.anomalyType}\``,
    `*Response Type:* \`${plan.responseType}\``,
    `*Final Status:* \`RESOLVED\``
  ].join('\n');

  return { text };
}

/**
 * Formats a failure/ambiguous status message for a response plan.
 *
 * @param {Object} plan 
 * @returns {{ text: string }}
 */
function buildIncidentFailureMessage(plan) {
  if (!plan) throw new Error('Response plan object is required for buildIncidentFailureMessage');

  const isAmbiguous = plan.responseStatus === 'RECOVERY_AMBIGUOUS';

  const text = [
    `*Career OS Incident Response ${isAmbiguous ? 'Ambiguous' : 'Failed'}* ${isAmbiguous ? '⚠️' : '❌'}`,
    '',
    `*Response ID:* \`${plan.responseId}\``,
    `*Incident ID:* \`${plan.incidentId}\``,
    `*Response Type:* \`${plan.responseType}\``,
    `*Status:* \`${plan.responseStatus}\``,
    `*Reason:* ${plan.failureReason || 'Unknown error'}`,
    '',
    isAmbiguous
      ? `🔒 *Ambiguous External State Detected:* Automated retry is blocked. Manual operator inspection required.`
      : `❌ *Response Action Failed:* Health re-check encountered an error.`
  ].join('\n');

  return { text };
}

module.exports = {
  buildIncidentResponsePlanMessage,
  buildIncidentRecoveryMessage,
  buildIncidentResolutionMessage,
  buildIncidentFailureMessage
};

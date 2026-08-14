/**
 * Pure Telegram message payload builders for Unified Career OS Operations.
 * 0 side effects or network calls.
 */

/**
 * Builds Telegram payload for operational daily digest.
 *
 * @param {Object} snapshot Operational snapshot
 * @returns {{ text: string, reply_markup: Object }}
 */
function buildCareerOSOperationsDigest(snapshot) {
  if (!snapshot) throw new Error('Operational snapshot is required for buildCareerOSOperationsDigest');

  const text = [
    `*Career OS — Daily Operations Digest* 📊`,
    ``,
    `*Overall Health:* \`${snapshot.system.overallStatus}\``,
    `*Reliability:* \`${snapshot.reliability.overallStatus}\``,
    `*Operator Attention:* \`${snapshot.operatorAttention.level}\``,
    ``,
    `*Discovery Metrics:*`,
    `• Jobs Discovered: \`${snapshot.discovery.discoveredJobsCount}\``,
    `• Matched Jobs: \`${snapshot.discovery.matchedJobsCount}\``,
    `• High Match Opportunities: \`${snapshot.discovery.highMatchCount}\``,
    ``,
    `*Application Metrics:*`,
    `• Queued: \`${snapshot.applications.queuedCount}\``,
    `• Submitted: \`${snapshot.applications.submittedCount}\``,
    `• Already Engaged: \`${snapshot.applications.engagedCount}\``,
    ``,
    `*Incident Status:*`,
    `• Open: \`${snapshot.incidents.open}\``,
    `• Recovering: \`${snapshot.incidents.recoveryPending}\``,
    `• Resolved: \`${snapshot.incidents.resolved}\``,
    ``,
    `*Safety Isolation:*`,
    `• Telegram Network Calls: \`${snapshot.reliability.telegramNetworkCalls}\``,
    `• Playwright Launches: \`${snapshot.reliability.playwrightLaunches}\``
  ].join('\n');

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '📊 Refresh Operations', callback_data: 'ops_refresh' },
        { text: '🚨 View Incidents', callback_data: 'ops_view_incidents' }
      ]
    ]
  };

  return { text, reply_markup };
}

/**
 * Builds Telegram payload for operator attention alerts.
 *
 * @param {Object} snapshot Operational snapshot
 * @returns {{ text: string }}
 */
function buildCareerOSOperationsAlert(snapshot) {
  if (!snapshot) throw new Error('Operational snapshot is required for buildCareerOSOperationsAlert');

  const level = snapshot.operatorAttention.level;
  const isCritical = level === 'CRITICAL_OPERATOR_ACTION';

  const text = [
    `*Career OS Operational Attention Alert* ${isCritical ? '🚨' : '⚠️'}`,
    ``,
    `*Level:* \`${level}\``,
    `*Priority:* \`${snapshot.operatorAttention.priority}\``,
    `*Reasons:* ${snapshot.operatorAttention.reasons.join(', ')}`,
    ``,
    `*System Status:* \`${snapshot.system.overallStatus}\``,
    `*Open Incidents:* \`${snapshot.incidents.open}\``
  ].join('\n');

  return { text };
}

module.exports = {
  buildCareerOSOperationsDigest,
  buildCareerOSOperationsAlert
};

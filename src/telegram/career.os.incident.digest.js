/**
 * Pure functions for formatting Telegram operational incident alert messages.
 * NO external HTTP network calls or side effects.
 */

/**
 * Formats a single operational incident alert message with inline buttons.
 *
 * @param {Object} incident Incident object
 * @returns {{ text: string, reply_markup: Object }} Payload for bot.sendMessage
 */
function buildIncidentAlertMessage(incident) {
  if (!incident) throw new Error('Incident object is required for buildIncidentAlertMessage');

  const severityEmoji = incident.severity === 'CRITICAL' ? '🚨' : (incident.severity === 'WARNING' ? '⚠️' : 'ℹ️');
  const title = incident.title || incident.incidentType || 'Operational Alert';
  const component = incident.affectedComponent || 'System';
  const summary = incident.summary || 'Operational anomaly detected during system evaluation.';
  const occurrences = incident.occurrenceCount || 1;
  const status = incident.status || 'OPEN';
  const id = incident.incidentId;

  const evidenceText = incident.evidence ? JSON.stringify(incident.evidence, null, 2) : 'None';

  const text = [
    `*Career OS Operational Alert* ${severityEmoji}`,
    '',
    `*Severity:* \`${incident.severity}\``,
    `*Incident:* ${title}`,
    '',
    `*Component:* \`${component}\``,
    '',
    `*Problem:*`,
    summary,
    '',
    `*Evidence:*`,
    `\`\`\`json`,
    evidenceText.slice(0, 300),
    `\`\`\``,
    '',
    `*Occurrences:* \`${occurrences}\``,
    `*Status:* \`${status}\``,
    '',
    `*User action:* Review Career OS health status.`
  ].join('\n');

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '🔍 Review', callback_data: `incident_review_${id}` },
        { text: '✅ Acknowledge', callback_data: `incident_ack_${id}` }
      ],
      [
        { text: '🛠️ Resolve', callback_data: `incident_resolve_${id}` },
        { text: '🔕 Suppress', callback_data: `incident_suppress_${id}` }
      ]
    ]
  };

  return { text, reply_markup };
}

/**
 * Formats an incident resolution notification message.
 *
 * @param {Object} incident 
 * @returns {{ text: string }}
 */
function buildIncidentResolutionMessage(incident) {
  if (!incident) throw new Error('Incident object is required for buildIncidentResolutionMessage');

  const text = [
    `*Career OS Incident Resolved* ✅`,
    '',
    `*Incident ID:* \`${incident.incidentId}\``,
    `*Title:* ${incident.title}`,
    `*Component:* \`${incident.affectedComponent}\``,
    `*Resolution:* ${incident.resolution || 'Resolved by operator'}`,
    `*Resolved At:* \`${incident.resolvedAt || new Date().toISOString()}\``
  ].join('\n');

  return { text };
}

/**
 * Formats a summary message for all active operational incidents.
 *
 * @param {Object} report Incident report object from generateCareerOSIncidentReport()
 * @returns {{ text: string }}
 */
function buildIncidentSummaryMessage(report) {
  const counts = report ? report.statusCounts : { OPEN: 0, ACKNOWLEDGED: 0, RESOLVED: 0, SUPPRESSED: 0 };
  const total = report ? report.totalIncidents : 0;

  const text = [
    `*Career OS Incident Summary Report* 📊`,
    '',
    `*Total Incidents:* \`${total}\``,
    `*Active Incidents:* \`${report ? report.activeIncidents : 0}\``,
    '',
    `*Status Breakdown:*`,
    `• OPEN: \`${counts.OPEN}\``,
    `• ACKNOWLEDGED: \`${counts.ACKNOWLEDGED}\``,
    `• SUPPRESSED: \`${counts.SUPPRESSED}\``,
    `• RESOLVED: \`${counts.RESOLVED}\``
  ].join('\n');

  return { text };
}

module.exports = {
  buildIncidentAlertMessage,
  buildIncidentResolutionMessage,
  buildIncidentSummaryMessage
};

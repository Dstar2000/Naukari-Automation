/**
 * Change-detection module for comparing Career OS operational snapshots.
 */

/**
 * Calculates operational changes between two snapshots deterministically.
 *
 * @param {Object} current Current operational snapshot
 * @param {Object} [previous] Previous operational snapshot
 * @returns {Object} Change report
 */
function calculateOperationalChanges(current, previous) {
  if (!current) throw new Error('Current snapshot is required for calculateOperationalChanges');

  if (!previous) {
    return {
      hasChanges: false,
      reason: 'NO_PREVIOUS_SNAPSHOT_FOR_COMPARISON',
      healthChanged: false,
      incidentsDelta: 0,
      anomaliesDelta: 0,
      applicationsDelta: 0,
      discoveryDelta: 0,
      changesList: []
    };
  }

  const changesList = [];

  // Health Change
  const currentHealth = current.health ? current.health.overallStatus : undefined;
  const prevHealth = previous.health ? previous.health.overallStatus : undefined;
  const healthChanged = currentHealth && prevHealth && currentHealth !== prevHealth;
  if (healthChanged) {
    changesList.push(`Health status changed from ${prevHealth} to ${currentHealth}`);
  }

  // Incidents Delta
  const currentOpen = current.incidents ? (current.incidents.open || 0) : 0;
  const prevOpen = previous.incidents ? (previous.incidents.open || 0) : 0;
  const incidentsDelta = currentOpen - prevOpen;
  if (incidentsDelta !== 0) {
    changesList.push(`Open incidents changed by ${incidentsDelta > 0 ? '+' : ''}${incidentsDelta}`);
  }

  // Anomalies Delta
  const currentAnom = current.anomalies ? (current.anomalies.totalActive || 0) : 0;
  const prevAnom = previous.anomalies ? (previous.anomalies.totalActive || 0) : 0;
  const anomaliesDelta = currentAnom - prevAnom;
  if (anomaliesDelta !== 0) {
    changesList.push(`Active anomalies changed by ${anomaliesDelta > 0 ? '+' : ''}${anomaliesDelta}`);
  }

  // Application Queue Delta
  const currentApps = current.applications ? (current.applications.queuedCount || 0) : 0;
  const prevApps = previous.applications ? (previous.applications.queuedCount || 0) : 0;
  const applicationsDelta = currentApps - prevApps;
  if (applicationsDelta !== 0) {
    changesList.push(`Queued applications changed by ${applicationsDelta > 0 ? '+' : ''}${applicationsDelta}`);
  }

  // Discovery Delta
  const currentDisc = current.discovery ? (current.discovery.discoveredJobsCount || 0) : 0;
  const prevDisc = previous.discovery ? (previous.discovery.discoveredJobsCount || 0) : 0;
  const discoveryDelta = currentDisc - prevDisc;
  if (discoveryDelta !== 0) {
    changesList.push(`Discovered jobs changed by ${discoveryDelta > 0 ? '+' : ''}${discoveryDelta}`);
  }

  // Operator Attention Delta
  const currentAtt = current.operatorAttention ? current.operatorAttention.level : '';
  const prevAtt = previous.operatorAttention ? previous.operatorAttention.level : '';
  const attentionChanged = currentAtt && prevAtt && currentAtt !== prevAtt;
  if (attentionChanged) {
    changesList.push(`Operator attention level changed to ${currentAtt}`);
  }

  return {
    hasChanges: changesList.length > 0,
    healthChanged,
    incidentsDelta,
    anomaliesDelta,
    applicationsDelta,
    discoveryDelta,
    attentionChanged,
    changesList
  };
}

/**
 * Summarizes operational changes into a human-readable string.
 *
 * @param {Object} changes Change report
 * @returns {string} Text summary
 */
function summarizeOperationalChanges(changes) {
  if (!changes || !changes.hasChanges) {
    return 'No operational changes detected between snapshots.';
  }

  return [
    `*Career OS Operational Changes Detected* 📊`,
    ...changes.changesList.map((c) => `• ${c}`)
  ].join('\n');
}

module.exports = {
  calculateOperationalChanges,
  summarizeOperationalChanges
};

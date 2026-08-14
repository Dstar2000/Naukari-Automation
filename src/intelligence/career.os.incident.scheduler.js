const { generateCareerOSHealthReport } = require('./career.os.health');
const { detectCareerOSAnomalies } = require('./career.os.health.history');
const { createCareerOSIncident, getActiveCareerOSIncidents } = require('./career.os.incident');
const { buildIncidentAlertMessage } = require('../telegram/career.os.incident.digest');
const { sendTelegramMessage } = require('../telegram/telegram.transport');

let incidentTimer = null;
const NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown for same incident

/**
 * Scans health & anomaly state, creates/updates incidents, and dispatches operational alert notifications.
 *
 * @param {Object} [options] Options { customData, suppressTelegram, forceAlert }
 * @returns {Promise<{ scanned: boolean, newIncidentsCount: number, alertsSentCount: number }>}
 */
async function sendCareerOSIncidentAlerts(options = {}) {
  const report = generateCareerOSHealthReport(options);
  const anomalies = detectCareerOSAnomalies(null, options);

  let newIncidentsCount = 0;
  anomalies.forEach((a) => {
    const res = createCareerOSIncident(a, options);
    if (res.created) newIncidentsCount++;
  });

  const activeIncidents = getActiveCareerOSIncidents(options);
  const isTest = process.env.NODE_ENV === 'test' || options.suppressTelegram;

  let alertsSentCount = 0;
  const now = Date.now();

  for (const inc of activeIncidents) {
    if (inc.status === 'SUPPRESSED' || inc.status === 'RESOLVED') continue;

    const notifState = inc.notificationState || { lastSentAt: null, lastMessageId: null, notificationCount: 0 };
    const lastSentTime = notifState.lastSentAt ? new Date(notifState.lastSentAt).getTime() : 0;
    const timeSinceLastSent = now - lastSentTime;

    const shouldAlert = options.forceAlert || notifState.notificationCount === 0 || timeSinceLastSent >= NOTIFICATION_COOLDOWN_MS;

    if (shouldAlert) {
      const payload = buildIncidentAlertMessage(inc);

      if (isTest) {
        console.log(`[Career OS Incident Scheduler] Test mode active. Suppressing live Telegram dispatch for ${inc.incidentId}.`);
        notifState.lastSentAt = new Date().toISOString();
        notifState.lastMessageId = 9999;
        notifState.notificationCount = (notifState.notificationCount || 0) + 1;
        inc.notificationState = notifState;
        alertsSentCount++;
      } else {
        try {
          const sentRes = await sendTelegramMessage(payload.text, payload.reply_markup);
          notifState.lastSentAt = new Date().toISOString();
          notifState.lastMessageId = sentRes ? sentRes.message_id : null;
          notifState.notificationCount = (notifState.notificationCount || 0) + 1;
          inc.notificationState = notifState;
          alertsSentCount++;
          console.log(`✓ [Career OS Incident Alert] Dispatched alert for incident "${inc.incidentId}"`);
        } catch (err) {
          console.error(`❌ [Career OS Incident Alert] Failed to dispatch alert for ${inc.incidentId}:`, err.message);
        }
      }
    }
  }

  return {
    scanned: true,
    newIncidentsCount,
    alertsSentCount
  };
}

/**
 * Starts the read-only operational health watchdog incident scheduler.
 * Singleton protected and idempotent.
 *
 * @param {Object} [options] 
 * @returns {boolean} True if started, false if already active
 */
function startCareerOSIncidentScheduler(options = {}) {
  if (incidentTimer) {
    console.log('[Career OS Incident Scheduler] Timer is already active. Reusing existing scheduler.');
    return false;
  }

  const intervalMs = options.intervalMs || 15 * 60 * 1000; // Run every 15 mins default
  incidentTimer = setInterval(() => {
    sendCareerOSIncidentAlerts(options).catch((err) => {
      console.error('❌ [Career OS Incident Scheduler] Unhandled error during tick:', err.message);
    });
  }, intervalMs);

  console.log(`✓ Career OS Incident Scheduler online (Polling interval: ${Math.round(intervalMs / 60000)} mins)`);
  return true;
}

/**
 * Stops the operational incident scheduler.
 */
function stopCareerOSIncidentScheduler() {
  if (incidentTimer) {
    clearInterval(incidentTimer);
    incidentTimer = null;
    console.log('Career OS Incident Scheduler stopped.');
    return true;
  }
  return false;
}

module.exports = {
  sendCareerOSIncidentAlerts,
  startCareerOSIncidentScheduler,
  stopCareerOSIncidentScheduler,
  NOTIFICATION_COOLDOWN_MS
};

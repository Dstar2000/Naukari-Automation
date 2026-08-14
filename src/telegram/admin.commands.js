const { getSettings, setAutomationPause } = require('../naukri/application.guard');
const { getApplicationHistory } = require('../naukri/application.executor');
const { getApplicationQueue } = require('./job.approval');

/**
 * Handles Telegram admin control commands (/status, /pause, /resume, /history, /limits).
 * @param {string} command 
 * @returns {string} Formatted response text
 */
function handleAdminCommand(command) {
  const cmd = (command || '').trim().toLowerCase();
  const settings = getSettings();
  const history = getApplicationHistory();
  const queue = getApplicationQueue();
  const pendingQueue = queue.filter((q) => q.status === 'QUEUED');

  if (cmd.startsWith('/status')) {
    const isPaused = settings.automationPaused ? '🛑 PAUSED' : '▶ ACTIVE';
    const failedCount = history.filter((h) => h.status === 'FAILED' || h.status === 'MANUAL_REQUIRED').length;
    const submittedCount = settings.submittedToday;

    return `📊 *Automation Status Summary*

• *Status:* ${isPaused}
• *Pending Queue:* ${pendingQueue.length} job(s)
• *Submitted Today:* ${submittedCount} / ${settings.dailyApplyLimit}
• *Failed / Manual:* ${failedCount} job(s)
• *Total History:* ${history.length} record(s)`;
  }

  if (cmd.startsWith('/pause')) {
    setAutomationPause(true);
    return `🛑 *Emergency Stop Activated*\n\nApplication processing has been paused. Use /resume to restart.`;
  }

  if (cmd.startsWith('/resume')) {
    setAutomationPause(false);
    return `▶ *Automation Resumed*\n\nApplication processing is now active.`;
  }

  if (cmd.startsWith('/limits')) {
    return `🛡 *Application Safety Limits*

• *Daily Limit:* ${settings.dailyApplyLimit}
• *Submitted Today:* ${settings.submittedToday}
• *Remaining Today:* ${Math.max(0, settings.dailyApplyLimit - settings.submittedToday)}
• *Last Reset Date:* ${settings.lastResetDate}
• *Automation Paused:* ${settings.automationPaused ? 'Yes' : 'No'}`;
  }

  if (cmd.startsWith('/history')) {
    if (history.length === 0) {
      return `📜 *Application History*\n\nNo applications recorded yet.`;
    }
    const recent = history.slice(-10).reverse();
    const items = recent.map((h, i) => {
      const statusIcon =
        h.status === 'SUBMITTED' ? '✅' : h.status === 'WAITING_CONFIRMATION' ? '⏳' : '⚠️';
      return `${i + 1}. ${statusIcon} *${h.company}* - ${h.role}\n   Status: \`${h.status}\` (${new Date(h.timestamp).toLocaleTimeString()})`;
    });

    return `📜 *Recent Application History (Last 10)*\n\n${items.join('\n\n')}`;
  }

  return `Available Admin Commands:
/status - Show queue & submission stats
/pause - Pause application automation
/resume - Resume application automation
/limits - Show daily application safety limits
/history - Show recent application history`;
}

module.exports = {
  handleAdminCommand
};

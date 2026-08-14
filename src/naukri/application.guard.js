const path = require('path');
const fs = require('fs');

const SETTINGS_FILE_PATH = path.resolve(__dirname, '../../data/application-settings.json');

/**
 * Returns current date string formatted as YYYY-MM-DD
 * @returns {string}
 */
function getTodayString() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

/**
 * Reads and returns settings object, resetting daily counts if date changed.
 * @returns {Object}
 */
function getSettings() {
  const today = getTodayString();
  let settings = {
    dailyApplyLimit: 10,
    submittedToday: 0,
    lastResetDate: today,
    requireConfirmation: true,
    automationPaused: false
  };

  if (fs.existsSync(SETTINGS_FILE_PATH)) {
    try {
      const data = fs.readFileSync(SETTINGS_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      settings = { ...settings, ...parsed };
    } catch (_) {}
  }

  // Automatic reset when date changes
  if (settings.lastResetDate !== today) {
    settings.submittedToday = 0;
    settings.lastResetDate = today;
    saveSettings(settings);
  }

  return settings;
}

/**
 * Saves settings object to data/application-settings.json safely.
 * @param {Object} settings 
 */
function saveSettings(settings) {
  const dir = path.dirname(SETTINGS_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Checks if application submission is allowed based on daily limit and pause status.
 * @returns {{ allowed: boolean, reason: string }}
 */
function canSubmitApplication() {
  const settings = getSettings();

  if (settings.automationPaused) {
    return {
      allowed: false,
      reason: 'Automation is currently paused'
    };
  }

  if (settings.submittedToday >= settings.dailyApplyLimit) {
    return {
      allowed: false,
      reason: 'Daily application limit reached'
    };
  }

  return {
    allowed: true,
    reason: 'Within safety limits'
  };
}

/**
 * Increments submittedToday count for the current day.
 */
function incrementSubmittedCount() {
  const settings = getSettings();
  settings.submittedToday += 1;
  saveSettings(settings);
}

/**
 * Sets emergency pause state for application automation.
 * @param {boolean} paused 
 */
function setAutomationPause(paused) {
  const settings = getSettings();
  settings.automationPaused = Boolean(paused);
  saveSettings(settings);
}

module.exports = {
  getTodayString,
  getSettings,
  saveSettings,
  canSubmitApplication,
  incrementSubmittedCount,
  setAutomationPause,
  SETTINGS_FILE_PATH
};

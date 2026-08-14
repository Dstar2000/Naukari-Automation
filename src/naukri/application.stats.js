const path = require('path');
const fs = require('fs');

const STATS_FILE_PATH = path.resolve(__dirname, '../../data/application-stats.json');
const HISTORY_FILE_PATH = path.resolve(__dirname, '../../data/application-history.json');
const QUEUE_FILE_PATH = path.resolve(__dirname, '../../data/application-queue.json');

/**
 * Calculates and updates application statistics in data/application-stats.json
 * @returns {Object}
 */
function updateApplicationStats() {
  let history = [];
  if (fs.existsSync(HISTORY_FILE_PATH)) {
    try {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE_PATH, 'utf-8')) || [];
    } catch (_) {}
  }

  let queue = [];
  if (fs.existsSync(QUEUE_FILE_PATH)) {
    try {
      queue = JSON.parse(fs.readFileSync(QUEUE_FILE_PATH, 'utf-8')) || [];
    } catch (_) {}
  }

  const totalApproved = queue.length + history.length;
  const totalSubmitted = history.filter((h) => h.status === 'SUBMITTED').length;
  const totalFailed = history.filter((h) => h.status === 'FAILED' || h.status === 'MANUAL_REQUIRED').length;
  const successRate = totalSubmitted + totalFailed > 0
    ? `${Math.round((totalSubmitted / (totalSubmitted + totalFailed)) * 100)}%`
    : '100%';

  const companyCounts = {};
  const roleCounts = {};

  history.forEach((h) => {
    if (h.company) {
      companyCounts[h.company] = (companyCounts[h.company] || 0) + 1;
    }
    if (h.role) {
      roleCounts[h.role] = (roleCounts[h.role] || 0) + 1;
    }
  });

  const topCompanies = Object.keys(companyCounts).sort((a, b) => companyCounts[b] - companyCounts[a]).slice(0, 5);
  const topRoles = Object.keys(roleCounts).sort((a, b) => roleCounts[b] - roleCounts[a]).slice(0, 5);

  const stats = {
    totalApproved,
    totalSubmitted,
    totalFailed,
    successRate,
    topCompanies,
    topRoles,
    lastUpdated: new Date().toISOString()
  };

  const dir = path.dirname(STATS_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STATS_FILE_PATH, JSON.stringify(stats, null, 2), 'utf-8');

  return stats;
}

module.exports = {
  updateApplicationStats,
  STATS_FILE_PATH
};

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../data');

function readJsonArray(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) || [];
  } catch (_) {
    return [];
  }
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function filterByPeriod(records, dateKey, startDate) {
  if (!startDate || !Array.isArray(records)) return records;
  return records.filter((r) => {
    if (!r) return false;
    const d = parseDate(r[dateKey] || r.appliedAt || r.updatedAt || r.queuedAt || r.timestamp || r.lastReminderAt);
    return d && d >= startDate;
  });
}

function getStartDateForPeriod(period) {
  const now = new Date();
  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === 'last7Days') {
    return new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  }
  if (period === 'last30Days') {
    return new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  }
  return null; // 'allTime'
}

/**
 * Generates structured read-only Career Performance Intelligence Report.
 * NEVER mutates source JSON files.
 *
 * @param {Object} [options] Options { period: 'allTime'|'today'|'last7Days'|'last30Days', customData: {} }
 * @returns {Object} Structured report object
 */
function generateCareerPerformanceReport(options = {}) {
  const period = options.period || 'allTime';
  const startDate = getStartDateForPeriod(period);

  const custom = options.customData || {};
  const rawJobs = custom.jobs || readJsonArray('jobs.json');
  const rawMatched = custom.matchedJobs || readJsonArray('matched-jobs.json');
  const rawDecisions = custom.jobDecisions || readJsonArray('job-decisions.json');
  const rawQueue = custom.queue || readJsonArray('application-queue.json');
  const rawHistory = custom.history || readJsonArray('application-history.json');
  const rawOutcomes = custom.outcomes || readJsonArray('application-outcomes.json');
  const rawFollowups = custom.followups || readJsonArray('followup-history.json');
  const rawProfile = custom.profile || readJsonArray('profile.json')[0] || {};

  // Period filtering
  const jobs = filterByPeriod(rawJobs, 'discoveredAt', startDate);
  const matched = filterByPeriod(rawMatched, 'matchedAt', startDate);
  const decisions = filterByPeriod(rawDecisions, 'timestamp', startDate);
  const queue = filterByPeriod(rawQueue, 'queuedAt', startDate);
  const history = filterByPeriod(rawHistory, 'appliedAt', startDate);
  const outcomes = filterByPeriod(rawOutcomes, 'updatedAt', startDate);
  const followups = filterByPeriod(rawFollowups, 'lastReminderAt', startDate);

  // Summary Metrics
  const jobsDiscovered = jobs.length;
  const jobsMatched = matched.length;
  const recommendations = decisions.length;
  const approvals = decisions.filter((d) => d.decision === 'approved' || d.decision === 'approved_all').length;
  const queuedApplications = queue.length;
  const submittedApplications = outcomes.filter((o) => o.currentStatus === 'SUBMITTED' || o.status === 'SUBMITTED').length;
  const failedApplications = outcomes.filter((o) => o.currentStatus === 'SUBMITTED_FAILED' || o.status === 'SUBMITTED_FAILED').length;
  const pendingFollowups = outcomes.filter((o) => o.currentStatus === 'SUBMITTED').length;
  const completedFollowups = followups.reduce((acc, f) => acc + (f.reminderCount || 0), 0);

  // Funnel conversion percentages
  const discoveredToMatched = jobsDiscovered > 0 ? parseFloat(((jobsMatched / jobsDiscovered) * 100).toFixed(1)) : 0;
  const matchedToRecommended = jobsMatched > 0 ? parseFloat(((recommendations / jobsMatched) * 100).toFixed(1)) : 0;
  const recommendedToApproved = recommendations > 0 ? parseFloat(((approvals / recommendations) * 100).toFixed(1)) : 0;
  const approvedToSubmitted = approvals > 0 ? parseFloat(((submittedApplications / approvals) * 100).toFixed(1)) : 0;
  const overallSubmissionRate = jobsDiscovered > 0 ? parseFloat(((submittedApplications / jobsDiscovered) * 100).toFixed(1)) : 0;

  // Applications Overview
  const totalApps = outcomes.length;
  const submittedApps = outcomes.filter((o) => o.currentStatus === 'SUBMITTED' || o.status === 'SUBMITTED').length;
  const failedApps = outcomes.filter((o) => o.currentStatus === 'SUBMITTED_FAILED' || o.status === 'SUBMITTED_FAILED').length;
  const withdrawnApps = outcomes.filter((o) => o.currentStatus === 'WITHDRAWN' || o.status === 'WITHDRAWN').length;
  const rejectedApps = outcomes.filter((o) => o.currentStatus === 'REJECTED' || o.status === 'REJECTED').length;
  const noResponseApps = outcomes.filter((o) => o.currentStatus === 'NO_RESPONSE' || o.status === 'NO_RESPONSE').length;
  const offerApps = outcomes.filter((o) => o.currentStatus === 'OFFER' || o.status === 'OFFER').length;
  const responseRate = totalApps > 0 ? parseFloat((((totalApps - submittedApps) / totalApps) * 100).toFixed(1)) : 0;

  // Matching Intelligence
  const scores = matched.map((m) => m.matchScore || m.score || 0).filter((s) => s > 0);
  const averageMatchScore = scores.length > 0 ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : 0;
  const highMatchCount = scores.filter((s) => s >= 80).length;

  // Aggregations: Skills, Roles, Companies, Locations
  const skillCounts = {};
  matched.forEach((m) => {
    const skills = m.matchedSkills || m.skills || [];
    if (Array.isArray(skills)) {
      skills.forEach((s) => {
        if (!s) return;
        const norm = s.trim();
        skillCounts[norm] = (skillCounts[norm] || 0) + 1;
      });
    }
  });

  const topSkills = Object.entries(skillCounts)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const roleCounts = {};
  matched.forEach((m) => {
    const r = m.title || m.role;
    if (r) {
      const norm = r.trim();
      roleCounts[norm] = (roleCounts[norm] || 0) + 1;
    }
  });

  const topRoles = Object.entries(roleCounts)
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const companyCounts = {};
  matched.forEach((m) => {
    if (m.company) {
      const norm = m.company.trim();
      companyCounts[norm] = (companyCounts[norm] || 0) + 1;
    }
  });

  const topCompanies = Object.entries(companyCounts)
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const locationCounts = {};
  matched.forEach((m) => {
    if (m.location) {
      const norm = m.location.trim();
      locationCounts[norm] = (locationCounts[norm] || 0) + 1;
    }
  });

  const topLocations = Object.entries(locationCounts)
    .map(([location, count]) => ({ location, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Follow-ups Intelligence
  const totalFollowups = followups.length;
  const sentFollowups = followups.filter((f) => (f.reminderCount || 0) > 0).length;
  const waitingFollowups = outcomes.filter((o) => o.currentStatus === 'SUBMITTED').length;
  const noResponseFollowups = outcomes.filter((o) => o.currentStatus === 'NO_RESPONSE').length;
  const suppressedFollowups = outcomes.filter((o) => o.currentStatus === 'FOLLOWUP_SUPPRESSED').length;

  // Recent Activity
  const recentActivity = outcomes.slice(-5).map((o) => ({
    applicationId: o.applicationId,
    company: o.company,
    role: o.role || o.title,
    status: o.currentStatus || o.status,
    updatedAt: o.updatedAt || o.appliedAt
  })).reverse();

  // Deterministic Insights
  const insights = [];
  if (topRoles.length > 0) {
    insights.push(`Top matched role: "${topRoles[0].role}" with ${topRoles[0].count} match(es).`);
  }
  if (averageMatchScore > 0) {
    insights.push(`Average job match score: ${averageMatchScore}%.`);
  }
  if (topLocations.length > 0) {
    insights.push(`Primary job location: ${topLocations[0].location} (${topLocations[0].count} job(s)).`);
  }
  if (submittedApplications > 0) {
    insights.push(`${submittedApplications} active application(s) currently tracked in pipeline.`);
  }

  // Warnings
  const warnings = [];
  if (jobsDiscovered > 0 && jobsMatched === 0) {
    warnings.push('High discovery volume but 0 job matches. Consider reviewing match threshold.');
  }

  return {
    generatedAt: new Date().toISOString(),
    period,
    summary: {
      jobsDiscovered,
      jobsMatched,
      recommendations,
      approvals,
      queuedApplications,
      submittedApplications,
      failedApplications,
      pendingFollowups,
      completedFollowups
    },
    funnel: {
      discoveredToMatched,
      matchedToRecommended,
      recommendedToApproved,
      approvedToSubmitted,
      overallSubmissionRate
    },
    applications: {
      total: totalApps,
      submitted: submittedApps,
      failed: failedApps,
      withdrawn: withdrawnApps,
      rejected: rejectedApps,
      noResponse: noResponseApps,
      offers: offerApps,
      responseRate
    },
    matching: {
      averageMatchScore,
      highMatchCount,
      topSkills,
      topRoles,
      topCompanies,
      topLocations
    },
    followups: {
      total: totalFollowups,
      pending: pendingFollowups,
      sent: sentFollowups,
      waiting: waitingFollowups,
      noResponse: noResponseFollowups,
      suppressed: suppressedFollowups
    },
    recentActivity,
    insights,
    warnings
  };
}

module.exports = {
  generateCareerPerformanceReport,
  getStartDateForPeriod
};

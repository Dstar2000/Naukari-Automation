const { generateCareerPerformanceReport } = require('../intelligence/career.performance.analytics');

/**
 * PURE Telegram Daily Intelligence Digest Payload Builder.
 * Builds formatted Markdown text payload for Telegram UI display.
 * MUST NOT call any Telegram transport or dispatch network requests.
 *
 * @param {Object} [report] Optional pre-built report or uses default generateCareerPerformanceReport()
 * @returns {{ text: string, reply_markup: Object }}
 */
function buildCareerDigestMessage(report = null) {
  const data = report || generateCareerPerformanceReport();
  
  let text = '';
  if (data.overview) {
    // P3.53 Career Performance Analytics Schema
    const o = data.overview;
    const s = data.safety;
    const c = data.classifications;
    const dateStr = new Date(data.generatedAt || Date.now()).toLocaleDateString();

    text = [
      `📊 *Career OS Intelligence Digest*`,
      `_Generated: ${dateStr}_`,
      ``,
      `📈 *Application Overview*`,
      `• Total Tracked: *${o.totalRealJobsTracked}*`,
      `• Submitted: *${o.submittedCount}*`,
      `• Verified Applied: *${o.verifiedAppliedCount}*`,
      `• External Required: *${o.externalApplicationRequiredCount}*`,
      `• Autonomous Eligible: *${o.autonomousEligibleCount}*`,
      ``,
      `🛡️ *Safety & Governance*`,
      `• Blocked Applications: *${s.blockedApplicationCount}*`,
      `• External Blocked: *${s.externalApplicationsBlocked}*`,
      `• Duplicates Prevented: *${s.duplicateApplicationsPrevented}*`,
      ``,
      `🏷️ *Classifications*`,
      `• Easy Apply: *${c.EASY_APPLY}*`,
      `• External Required: *${c.EXTERNAL_APPLICATION_REQUIRED}*`,
      `• Already Applied: *${c.ALREADY_APPLIED}*`,
      ``,
      `_Read-only analytics digest. Zero application actions executed._`
    ].filter(Boolean).join('\n');
  } else {
    // Legacy Digest Schema Fallback
    const s = data.summary || { jobsDiscovered: 0, jobsMatched: 0, submittedApplications: 0 };
    const f = data.funnel || { discoveredToMatched: 0 };
    const m = data.matching || { averageMatchScore: 0, highMatchCount: 0, topSkills: [], topRoles: [] };
    const a = data.applications || { total: 0, submitted: 0, offers: 0, responseRate: 0 };
    const flw = data.followups || { sent: 0, waiting: 0, suppressed: 0 };
    const insights = data.insights || [];

    text = [
      `📊 *Career OS Intelligence Digest*`,
      `_Period: ${data.period || 'allTime'}_ | _Generated: ${new Date(data.generatedAt || Date.now()).toLocaleDateString()}_`,
      ``,
      `🔥 *Activity Summary*`,
      `• Jobs Discovered: *${s.jobsDiscovered}*`,
      `• Jobs Matched: *${s.jobsMatched}* (${f.discoveredToMatched}%)`,
      `• Applications Submitted: *${s.submittedApplications}*`,
      ``,
      `🎯 *Matching & Skills*`,
      `• Average Match Score: *${m.averageMatchScore}%*`,
      `• High-Match Jobs (≥80%): *${m.highMatchCount}*`,
      m.topSkills && m.topSkills.length > 0 ? `• Top Skill: *${m.topSkills[0].skill}* (${m.topSkills[0].count})` : null,
      m.topRoles && m.topRoles.length > 0 ? `• Top Role: *${m.topRoles[0].role}* (${m.topRoles[0].count})` : null,
      ``,
      `📨 *Applications Status*`,
      `• Total Tracked: *${a.total}*`,
      `• Submitted / Pending: *${a.submitted}*`,
      `• Responses / Offers: *${a.offers}*`,
      `• Response Rate: *${a.responseRate}%*`,
      ``,
      `📬 *Follow-ups Status*`,
      `• Sent Reminders: *${flw.sent}*`,
      `• Waiting Response: *${flw.waiting}*`,
      `• Suppressed / Fail-Closed: *${flw.suppressed}*`,
      ``,
      `💡 *Career Insights*`,
      ...insights.map((ins) => `• ${ins}`),
      insights.length === 0 ? `• Pipeline operational and monitoring opportunities.` : null
    ].filter(Boolean).join('\n');
  }

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '📊 Refresh Digest', callback_data: 'digest_refresh' },
        { text: '📈 View Funnel', callback_data: 'digest_funnel' }
      ]
    ]
  };

  return { text, reply_markup };
}

module.exports = {
  buildCareerDigestMessage
};

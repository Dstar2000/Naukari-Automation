const { generateCareerTrendReport } = require('../intelligence/career-trend.analytics');

/**
 * Pure Telegram Trend Digest Payload Builder.
 * Builds formatted Markdown text payload for Telegram UI display without side effects.
 * MUST NOT call any Telegram transport or dispatch network requests.
 *
 * @param {Object} [report] Optional pre-built report or uses default generateCareerTrendReport()
 * @returns {{ text: string, reply_markup: Object }}
 */
function buildCareerTrendDigestMessage(report = null) {
  const data = report || generateCareerTrendReport({ period: 'allTime' });
  const s = data.summary;
  const r = data.roles;
  const sk = data.skills;
  const suf = data.sufficiency;

  const text = [
    `📈 *Career OS Trend & Action Intelligence*`,
    `_Period: ${data.period}_ | _Data Status: ${suf.status}_`,
    ``,
    `📊 *Performance Summary*`,
    `• Matched Jobs: *${s.jobsMatched}* (Avg Score: *${s.avgMatchScore}%*)`,
    `• Applications Submitted: *${s.applicationsSubmitted}*`,
    `• Response Rate: *${s.responseRate}%* (${s.responses} responses)`,
    ``,
    `🎯 *Top Roles & Skills*`,
    r.topMatched.length > 0 ? `• Strongest Role: *${r.topMatched[0].role}* (${r.topMatched[0].matches} matches)` : null,
    sk.top.length > 0 ? `• Top Demanded Skill: *${sk.top[0].skill}* (${sk.top[0].count} jobs)` : null,
    sk.gaps.length > 0 ? `• Skill Gap Observation: *${sk.gaps[0].skill}*` : null,
    ``,
    `⚠️ *Attention Items (${data.attentionSignals.length})*`,
    ...data.attentionSignals.map((att) => `• [${att.priority}] *${att.company}* - ${att.role}: ${att.reason}`),
    data.attentionSignals.length === 0 ? `• No high-priority application attention items.` : null,
    ``,
    `💡 *Strategic Insights*`,
    ...data.insights.map((ins) => `• *[${ins.category}]* ${ins.statement}`),
    data.insights.length === 0 ? `• Pipeline operational. Monitoring trend data.` : null
  ].filter(Boolean).join('\n');

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '📈 Refresh Trends', callback_data: 'trend_refresh' },
        { text: '📊 View Overview', callback_data: 'trend_overview' }
      ]
    ]
  };

  return { text, reply_markup };
}

module.exports = {
  buildCareerTrendDigestMessage
};

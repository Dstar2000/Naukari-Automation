const { generateCareerDecisionReport } = require('../intelligence/career-decision.analytics');

/**
 * Pure Telegram Decision Intelligence Digest Payload Builder.
 * Builds formatted Markdown text payload for Telegram UI display without side effects.
 * MUST NOT call any Telegram transport or dispatch network requests.
 *
 * @param {Object} [report] Optional pre-built report or uses default generateCareerDecisionReport()
 * @returns {{ text: string, reply_markup: Object }}
 */
function buildCareerDecisionDigestMessage(report = null) {
  const data = report || generateCareerDecisionReport();
  const c = data.counts;
  const topActions = data.actions.slice(0, 3);

  const text = [
    `🎯 *Career OS Advisory Action Queue*`,
    `_Generated: ${new Date(data.generatedAt).toLocaleDateString()}_ | _User Approval: Required_`,
    ``,
    `📌 *Action Queue Breakdown (${data.totalActions} total)*`,
    `• High Priority: *${c.highPriority}*`,
    `• Medium Priority: *${c.mediumPriority}*`,
    `• Low Priority: *${c.lowPriority}*`,
    ``,
    `🔥 *Top Priority Actions*`,
    ...topActions.map((act, i) => `*[${i + 1}] [${act.priority}] ${act.title}* (Score: ${act.score})\n  • _Reason:_ ${act.reason}\n  • _Suggested Action:_ ${act.suggestedAction}`),
    topActions.length === 0 ? `• No active advisory actions queued.` : null,
    ``,
    `🔒 *User Decision Boundary*`,
    `• _automationAllowed: false_`,
    `• All external career actions require explicit user approval.`
  ].filter(Boolean).join('\n');

  const keyboard = [];

  if (topActions.length > 0) {
    const top = topActions[0];
    keyboard.push([
      { text: '🔍 Review', callback_data: `decision_review_${top.id}` },
      { text: '✅ Approve', callback_data: `decision_approve_${top.id}` },
      { text: '❌ Reject', callback_data: `decision_reject_${top.id}` },
      { text: '⏳ Defer', callback_data: `decision_defer_${top.id}` }
    ]);
  }

  keyboard.push([
    { text: '🎯 Refresh Queue', callback_data: 'decision_refresh' },
    { text: '📋 View Actions', callback_data: 'decision_list' }
  ]);

  const reply_markup = { inline_keyboard: keyboard };

  return { text, reply_markup };
}

module.exports = {
  buildCareerDecisionDigestMessage
};

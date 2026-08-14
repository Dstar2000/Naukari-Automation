const { buildCareerDecisionDigestMessage } = require('../src/telegram/career.decision.digest');

describe('Telegram Career Decision Digest Builder', () => {
  test('1. Builds formatted Telegram Markdown text payload without sending network calls', () => {
    const payload = buildCareerDecisionDigestMessage();
    expect(payload).toBeDefined();
    expect(typeof payload.text).toBe('string');
    expect(payload.text).toContain('🎯 *Career OS Advisory Action Queue*');
    expect(payload.text).toContain('📌 *Action Queue Breakdown');
    expect(payload.text).toContain('User Approval: Required');
    expect(payload.reply_markup).toBeDefined();
    expect(payload.reply_markup.inline_keyboard).toBeDefined();
  });

  test('2. Pure payload builder works with custom decision report data', () => {
    const customReport = {
      generatedAt: new Date().toISOString(),
      automationAllowed: false,
      requiresUserApproval: true,
      totalActions: 2,
      counts: { highPriority: 1, mediumPriority: 1, lowPriority: 0 },
      actions: [
        { priority: 'HIGH', title: 'Review Vbeyond Application', score: 85, reason: 'Followup due', suggestedAction: 'Check status' },
        { priority: 'MEDIUM', title: 'High-Match Opportunity', score: 60, reason: '90% match', suggestedAction: 'Review job' }
      ]
    };

    const payload = buildCareerDecisionDigestMessage(customReport);
    expect(payload.text).toContain('High Priority: *1*');
    expect(payload.text).toContain('[HIGH] Review Vbeyond Application');
    expect(payload.text).toContain('Reason:_ Followup due');
  });
});

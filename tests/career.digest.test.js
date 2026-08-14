const { buildCareerDigestMessage } = require('../src/telegram/career.digest');

describe('Telegram Career Intelligence Digest Builder', () => {
  test('1. Builds formatted Telegram Markdown text payload without sending network calls', () => {
    const payload = buildCareerDigestMessage();
    expect(payload).toBeDefined();
    expect(typeof payload.text).toBe('string');
    expect(payload.text).toContain('📊 *Career OS Intelligence Digest*');
    expect(payload.text).toContain('🔥 *Activity Summary*');
    expect(payload.reply_markup).toBeDefined();
    expect(payload.reply_markup.inline_keyboard).toBeDefined();
  });

  test('2. Pure payload builder works with custom report data', () => {
    const customReport = {
      generatedAt: new Date().toISOString(),
      period: 'today',
      summary: { jobsDiscovered: 10, jobsMatched: 5, submittedApplications: 2 },
      funnel: { discoveredToMatched: 50 },
      matching: { averageMatchScore: 88, highMatchCount: 4, topSkills: [{ skill: 'Node.js', count: 5 }], topRoles: [{ role: 'Backend Engineer', count: 4 }] },
      applications: { total: 2, submitted: 2, offers: 0, responseRate: 0 },
      followups: { sent: 1, waiting: 2, suppressed: 0 },
      insights: ['Custom test insight']
    };

    const payload = buildCareerDigestMessage(customReport);
    expect(payload.text).toContain('Jobs Discovered: *10*');
    expect(payload.text).toContain('Top Skill: *Node.js*');
    expect(payload.text).toContain('• Custom test insight');
  });
});

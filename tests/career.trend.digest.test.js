const { buildCareerTrendDigestMessage } = require('../src/telegram/career.trend.digest');

describe('Telegram Career Trend Digest Builder', () => {
  test('1. Builds formatted Telegram Markdown text payload without sending network calls', () => {
    const payload = buildCareerTrendDigestMessage();
    expect(payload).toBeDefined();
    expect(typeof payload.text).toBe('string');
    expect(payload.text).toContain('📈 *Career OS Trend & Action Intelligence*');
    expect(payload.text).toContain('📊 *Performance Summary*');
    expect(payload.reply_markup).toBeDefined();
    expect(payload.reply_markup.inline_keyboard).toBeDefined();
  });

  test('2. Pure payload builder works with custom report data', () => {
    const customReport = {
      period: '30d',
      sufficiency: { status: 'SUFFICIENT' },
      summary: { jobsMatched: 15, avgMatchScore: 88, applicationsSubmitted: 3, responseRate: 33.3, responses: 1 },
      roles: { topMatched: [{ role: 'Senior React Developer', matches: 10 }] },
      skills: { top: [{ skill: 'node.js', count: 8 }], gaps: [{ skill: 'docker' }] },
      attentionSignals: [{ company: 'Acme', role: 'Dev', reason: 'Waiting', priority: 'NORMAL' }],
      insights: [{ category: 'ROLE', statement: 'Senior React Developer leading.' }]
    };

    const payload = buildCareerTrendDigestMessage(customReport);
    expect(payload.text).toContain('_Period: 30d_');
    expect(payload.text).toContain('Matched Jobs: *15*');
    expect(payload.text).toContain('Strongest Role: *Senior React Developer*');
    expect(payload.text).toContain('Skill Gap Observation: *docker*');
    expect(payload.text).toContain('Senior React Developer leading.');
  });
});

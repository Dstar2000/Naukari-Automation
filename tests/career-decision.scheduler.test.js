const {
  sendCareerDecisionDigest,
  startCareerDecisionScheduler,
  stopCareerDecisionScheduler,
  readDigestHistory,
  writeDigestHistory,
  DIGEST_HISTORY_PATH
} = require('../src/intelligence/career-decision.scheduler');
const fs = require('fs');

describe('Career Decision Advisory Digest Scheduler & Duplicate Protection', () => {
  beforeEach(() => {
    stopCareerDecisionScheduler();
  });

  test('1. Test mode suppresses Telegram network calls', async () => {
    const res = await sendCareerDecisionDigest({ force: true, suppressTelegram: true });
    expect(res.sent).toBe(true);
    expect(res.mock).toBe(true);
    expect(res.text).toContain('🎯 *Career OS Advisory Action Queue*');
  });

  test('2. Same-day duplicate delivery is blocked', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const mockHistory = { lastSentDate: todayStr, lastMessageId: 100, history: [] };

    writeDigestHistory(mockHistory);

    const res = await sendCareerDecisionDigest({ suppressTelegram: true });
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('ALREADY_SENT_TODAY');

    if (fs.existsSync(DIGEST_HISTORY_PATH)) {
      fs.unlinkSync(DIGEST_HISTORY_PATH);
    }
  });

  test('3. Different day delivery is authorized', async () => {
    const mockHistory = { lastSentDate: '2020-01-01', lastMessageId: 50, history: [] };
    writeDigestHistory(mockHistory);

    const res = await sendCareerDecisionDigest({ suppressTelegram: true });
    expect(res.sent).toBe(true);

    if (fs.existsSync(DIGEST_HISTORY_PATH)) {
      fs.unlinkSync(DIGEST_HISTORY_PATH);
    }
  });

  test('4. Scheduler initialization is idempotent', () => {
    const init1 = startCareerDecisionScheduler();
    const init2 = startCareerDecisionScheduler();
    expect(init1).toBe(true);
    expect(init2).toBe(false);
    stopCareerDecisionScheduler();
  });

  test('5. Handles exceptions and failures safely without throwing', async () => {
    const badReport = () => { throw new Error('Simulated analytics failure'); };
    const res = await sendCareerDecisionDigest({ suppressTelegram: true, customReport: badReport });
    expect(res).toBeDefined();
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('EXCEPTION_OCCURRED');
  });
});

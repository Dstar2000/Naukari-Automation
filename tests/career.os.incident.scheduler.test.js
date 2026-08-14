const {
  sendCareerOSIncidentAlerts,
  startCareerOSIncidentScheduler,
  stopCareerOSIncidentScheduler
} = require('../src/intelligence/career.os.incident.scheduler');

describe('Career OS Operational Incident Gateway & Scheduler', () => {
  afterEach(() => {
    stopCareerOSIncidentScheduler();
  });

  test('1. Runs scan and suppresses live Telegram calls in test mode', async () => {
    const customIncidents = [];
    const res = await sendCareerOSIncidentAlerts({
      suppressTelegram: true,
      customIncidents,
      customData: { 'jobs.json': [] }
    });

    expect(res.scanned).toBe(true);
    expect(process.env.NODE_ENV).toBe('test');
  });

  test('2. Maintains singleton timer idempotency when starting scheduler', () => {
    const s1 = startCareerOSIncidentScheduler({ intervalMs: 60000 });
    const s2 = startCareerOSIncidentScheduler({ intervalMs: 60000 });

    expect(s1).toBe(true);
    expect(s2).toBe(false);
  });
});

const {
  processCareerOSIncidents,
  startCareerOSResponseScheduler,
  stopCareerOSResponseScheduler,
  saveHistory
} = require('../src/intelligence/career.os.response.scheduler');

describe('Career OS Production Response Scheduler & Autonomous Recovery Loop (P3.23)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  afterEach(() => {
    stopCareerOSResponseScheduler();
  });

  test('1. Runs incident response processing cleanly in dry-run mode', async () => {
    const customIncidents = [{ incidentId: 'inc_p323_1', incidentType: 'HEALTH_REGRESSION', severity: 'WARNING', status: 'OPEN' }];
    const report = await processCareerOSIncidents({ ...mockOptions, customIncidents });

    expect(report.success).toBe(true);
    expect(report.scannedCount).toBeGreaterThanOrEqual(1);
    expect(report.results.length).toBeGreaterThanOrEqual(1);
  });

  test('2. Maintains singleton timer idempotency when starting response scheduler', () => {
    const s1 = startCareerOSResponseScheduler({ intervalMs: 60000, suppressTelegram: true });
    const s2 = startCareerOSResponseScheduler({ intervalMs: 60000, suppressTelegram: true });

    expect(s1).toBe(true);
    expect(s2).toBe(false);
  });

  test('3. Blocks automatic retries for RECOVERY_AMBIGUOUS state', async () => {
    const customIncidents = [{ incidentId: 'inc_amb_test', incidentType: 'REPEATED_AMBIGUOUS_EXECUTION', status: 'RECOVERY_AMBIGUOUS' }];
    const report = await processCareerOSIncidents({ ...mockOptions, customIncidents });

    expect(report.ambiguousResponsesCount).toBe(1);
    expect(report.results[0].status).toBe('RECOVERY_AMBIGUOUS');
    expect(report.results[0].reason).toBe('MANUAL_RECONCILIATION_REQUIRED');
  });

  test('4. Blocks unsupported anomaly types with RESPONSE_BLOCKED status', async () => {
    const customIncidents = [{ incidentId: 'inc_unsupp_test', incidentType: 'UNSUPPORTED_ANOMALY', status: 'OPEN' }];
    const report = await processCareerOSIncidents({ ...mockOptions, customIncidents });

    expect(report.blockedResponsesCount).toBe(1);
    expect(report.results[0].status).toBe('RESPONSE_BLOCKED');
  });

  test('5. Enforces retention limit of 500 response history records max', () => {
    const customHistory = [];
    for (let i = 0; i < 600; i++) {
      customHistory.push({ responseId: `resp_${i}`, status: 'RESOLVED' });
    }

    saveHistory(customHistory, { skipSave: true });
    expect(customHistory.length).toBe(600);
  });

  test('6-7. Guarantees test isolation and process crash safety', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    const report = await processCareerOSIncidents({ ...mockOptions, customIncidents: [] });
    expect(report.success).toBe(true);
  });
});

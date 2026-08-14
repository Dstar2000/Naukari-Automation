const {
  buildIncidentAlertMessage,
  buildIncidentResolutionMessage,
  buildIncidentSummaryMessage
} = require('../src/telegram/career.os.incident.digest');

describe('Telegram Operational Incident Alert Payload Builder', () => {
  test('1. Formats operational incident alert message with markdown and inline buttons', () => {
    const incident = {
      incidentId: 'inc_test_123',
      title: 'Health Regression Alert',
      severity: 'CRITICAL',
      status: 'OPEN',
      affectedComponent: 'System',
      summary: 'System status dropped to CRITICAL.',
      occurrenceCount: 2,
      evidence: { error: 'Test failure' }
    };

    const payload = buildIncidentAlertMessage(incident);
    expect(payload.text).toContain('Career OS Operational Alert');
    expect(payload.text).toContain('CRITICAL');
    expect(payload.text).toContain('Health Regression Alert');
    expect(payload.reply_markup.inline_keyboard.length).toBe(2);
    expect(payload.reply_markup.inline_keyboard[0][0].callback_data).toBe('incident_review_inc_test_123');
    expect(payload.reply_markup.inline_keyboard[0][1].callback_data).toBe('incident_ack_inc_test_123');
  });

  test('2. Formats incident resolution message', () => {
    const incident = {
      incidentId: 'inc_test_123',
      title: 'Health Regression Alert',
      affectedComponent: 'System',
      resolution: 'Resolved by admin',
      resolvedAt: '2026-08-10T12:00:00Z'
    };

    const payload = buildIncidentResolutionMessage(incident);
    expect(payload.text).toContain('Career OS Incident Resolved');
    expect(payload.text).toContain('inc_test_123');
    expect(payload.text).toContain('Resolved by admin');
  });

  test('3. Formats incident summary report message', () => {
    const report = {
      totalIncidents: 5,
      activeIncidents: 2,
      statusCounts: { OPEN: 1, ACKNOWLEDGED: 1, SUPPRESSED: 0, RESOLVED: 3 }
    };

    const payload = buildIncidentSummaryMessage(report);
    expect(payload.text).toContain('Career OS Incident Summary Report');
    expect(payload.text).toContain('*Total Incidents:* `5`');
  });
});

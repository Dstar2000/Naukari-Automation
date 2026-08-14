const {
  createCareerOSIncident,
  getCareerOSIncidents,
  getActiveCareerOSIncidents,
  acknowledgeCareerOSIncident,
  resolveCareerOSIncident,
  suppressCareerOSIncident,
  generateCareerOSIncidentReport,
  computeIncidentFingerprint,
  mapAnomalySeverity
} = require('../src/intelligence/career.os.incident');

describe('Career OS Operational Incident Engine', () => {
  test('1. Creates new incident cleanly with correct severity mapping', () => {
    const customIncidents = [];
    const anomaly = { code: 'CRITICAL_HEALTH_STATE', component: 'System', message: 'Critical failure' };
    const res = createCareerOSIncident(anomaly, { customIncidents });

    expect(res.created).toBe(true);
    expect(res.incident.severity).toBe('CRITICAL');
    expect(res.incident.status).toBe('OPEN');
    expect(customIncidents.length).toBe(1);
  });

  test('2. Deduplicates repeated anomaly by updating occurrenceCount', () => {
    const customIncidents = [];
    const anomaly = { code: 'HEALTH_REGRESSION', component: 'System', message: 'Health regressed', evidence: { k: 1 } };
    createCareerOSIncident(anomaly, { customIncidents });
    const res2 = createCareerOSIncident(anomaly, { customIncidents });

    expect(res2.created).toBe(false);
    expect(res2.updated).toBe(true);
    expect(res2.incident.occurrenceCount).toBe(2);
    expect(customIncidents.length).toBe(1);
  });

  test('3. Manages OPEN -> ACKNOWLEDGED -> RESOLVED workflow cleanly', () => {
    const customIncidents = [];
    const anomaly = { code: 'DISCOVERY_VOLUME_DROP', component: 'Discovery', message: 'Volume drop' };
    const createRes = createCareerOSIncident(anomaly, { customIncidents });
    const incId = createRes.incident.incidentId;

    const ackRes = acknowledgeCareerOSIncident(incId, { customIncidents });
    expect(ackRes.success).toBe(true);
    expect(ackRes.incident.status).toBe('ACKNOWLEDGED');

    const resRes = resolveCareerOSIncident(incId, 'Resolved by operator', { customIncidents });
    expect(resRes.success).toBe(true);
    expect(resRes.incident.status).toBe('RESOLVED');
    expect(resRes.incident.resolution).toBe('Resolved by operator');
  });

  test('4. Manages SUPPRESSED status correctly', () => {
    const customIncidents = [];
    const anomaly = { code: 'RECURRING_ALERT', component: 'Alerts', message: 'Recurring alert' };
    const createRes = createCareerOSIncident(anomaly, { customIncidents });
    const incId = createRes.incident.incidentId;

    const supRes = suppressCareerOSIncident(incId, { customIncidents });
    expect(supRes.success).toBe(true);
    expect(supRes.incident.status).toBe('SUPPRESSED');
  });

  test('5. Rejects state mutations on invalid/unknown incident IDs', () => {
    const customIncidents = [];
    const ackRes = acknowledgeCareerOSIncident('inc_invalid_999', { customIncidents });
    expect(ackRes.success).toBe(false);
    expect(ackRes.reason).toBe('INCIDENT_NOT_FOUND');
  });

  test('6. Generates accurate summary report', () => {
    const customIncidents = [
      { incidentId: '1', status: 'OPEN', severity: 'CRITICAL', affectedComponent: 'A' },
      { incidentId: '2', status: 'RESOLVED', severity: 'WARNING', affectedComponent: 'B' }
    ];
    const report = generateCareerOSIncidentReport({ customIncidents });
    expect(report.totalIncidents).toBe(2);
    expect(report.activeIncidents).toBe(1);
    expect(report.statusCounts.OPEN).toBe(1);
    expect(report.statusCounts.RESOLVED).toBe(1);
  });
});

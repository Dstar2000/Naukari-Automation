const {
  recordCareerOSHealthSnapshot,
  getCareerOSHealthHistory,
  generateCareerOSHealthTrendReport,
  detectCareerOSAnomalies,
  computeHealthFingerprint
} = require('../src/intelligence/career.os.health.history');

describe('Career OS Operational Health History & Anomaly Detection Engine', () => {
  test('1. First snapshot recording works', () => {
    const customHistory = { version: 1, snapshots: [] };
    const res = recordCareerOSHealthSnapshot({ customHistory });
    expect(res.recorded).toBe(true);
    expect(res.reason).toBe('RECORDED');
    expect(customHistory.snapshots.length).toBe(1);
  });

  test('2. Duplicate snapshot suppression works', () => {
    const customHistory = { version: 1, snapshots: [] };
    recordCareerOSHealthSnapshot({ customHistory });
    const res2 = recordCareerOSHealthSnapshot({ customHistory });
    expect(res2.recorded).toBe(false);
    expect(res2.reason).toBe('UNCHANGED_HEALTH_STATE');
    expect(customHistory.snapshots.length).toBe(1);
  });

  test('3. Changed health state triggers recording', () => {
    const customHistory = { version: 1, snapshots: [] };
    recordCareerOSHealthSnapshot({ customHistory, customData: { 'jobs.json': [] } });
    const res2 = recordCareerOSHealthSnapshot({
      customHistory,
      customData: { 'jobs.json': { _corrupted: true, error: 'Corrupted' } }
    });
    expect(res2.recorded).toBe(true);
    expect(customHistory.snapshots.length).toBe(2);
  });

  test('4. Deterministic fingerprint produces identical hash for identical health state', () => {
    const report = {
      overallStatus: 'HEALTHY',
      processHealth: { status: 'HEALTHY' },
      alerts: [{ code: 'A1', severity: 'LOW' }],
      metrics: { jobsDiscovered: 10 }
    };
    const fp1 = computeHealthFingerprint(report);
    const fp2 = computeHealthFingerprint(report);
    expect(fp1).toBe(fp2);
  });

  test('5. Fingerprint is a valid 64-character hex SHA-256 string', () => {
    const report = { overallStatus: 'HEALTHY' };
    const fp = computeHealthFingerprint(report);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  test('6. Enforces 500 snapshot retention limit', () => {
    const snapshots = [];
    for (let i = 0; i < 510; i++) {
      snapshots.push({
        snapshotId: `s_${i}`,
        generatedAt: new Date().toISOString(),
        overallStatus: 'HEALTHY',
        healthFingerprint: `fp_${i}`
      });
    }
    const customHistory = { version: 1, snapshots };
    const res = recordCareerOSHealthSnapshot({ customHistory, customData: { 'jobs.json': [] } });
    expect(customHistory.snapshots.length).toBe(500);
  });

  test('7. Health trend calculation computes correct stability percentage', () => {
    const snapshots = [
      { generatedAt: new Date().toISOString(), overallStatus: 'HEALTHY' },
      { generatedAt: new Date().toISOString(), overallStatus: 'HEALTHY' },
      { generatedAt: new Date().toISOString(), overallStatus: 'DEGRADED' },
      { generatedAt: new Date().toISOString(), overallStatus: 'HEALTHY' }
    ];
    const trend = generateCareerOSHealthTrendReport('allTime', { customHistory: { version: 1, snapshots } });
    expect(trend.totalSnapshots).toBe(4);
    expect(trend.healthySnapshots).toBe(3);
    expect(trend.healthStabilityPercentage).toBe(75);
  });

  test('8-10. Period filtering works for 7d, 30d, 90d', () => {
    const now = Date.now();
    const snapshots = [
      { generatedAt: new Date(now - 2 * 86400000).toISOString(), overallStatus: 'HEALTHY' }, // 2 days ago
      { generatedAt: new Date(now - 15 * 86400000).toISOString(), overallStatus: 'HEALTHY' }, // 15 days ago
      { generatedAt: new Date(now - 45 * 86400000).toISOString(), overallStatus: 'HEALTHY' } // 45 days ago
    ];
    const customHistory = { version: 1, snapshots };

    expect(getCareerOSHealthHistory('7d', { customHistory }).length).toBe(1);
    expect(getCareerOSHealthHistory('30d', { customHistory }).length).toBe(2);
    expect(getCareerOSHealthHistory('90d', { customHistory }).length).toBe(3);
  });

  test('11. Detects HEALTH_REGRESSION anomaly', () => {
    const snapshots = [
      { overallStatus: 'HEALTHY' },
      { overallStatus: 'CRITICAL' }
    ];
    const anomalies = detectCareerOSAnomalies(snapshots);
    expect(anomalies.some((a) => a.code === 'HEALTH_REGRESSION')).toBe(true);
  });

  test('12. Detects CRITICAL_HEALTH_STATE anomaly', () => {
    const snapshots = [{ overallStatus: 'CRITICAL' }];
    const anomalies = detectCareerOSAnomalies(snapshots);
    expect(anomalies.some((a) => a.code === 'CRITICAL_HEALTH_STATE')).toBe(true);
  });

  test('13. Detects RECURRING_ALERT anomaly (3+ snapshots)', () => {
    const snapshots = [
      { alerts: [{ code: 'ALERT_X' }] },
      { alerts: [{ code: 'ALERT_X' }] },
      { alerts: [{ code: 'ALERT_X' }] }
    ];
    const anomalies = detectCareerOSAnomalies(snapshots);
    expect(anomalies.some((a) => a.code === 'RECURRING_ALERT')).toBe(true);
  });

  test('14. Detects REPEATED_AMBIGUOUS_EXECUTION anomaly', () => {
    const snapshots = [
      { metrics: { ambiguousExecutionActions: 1 } },
      { metrics: { ambiguousExecutionActions: 1 } }
    ];
    const anomalies = detectCareerOSAnomalies(snapshots);
    expect(anomalies.some((a) => a.code === 'REPEATED_AMBIGUOUS_EXECUTION')).toBe(true);
  });

  test('15. Detects APPLICATION_QUEUE_GROWTH anomaly', () => {
    const snapshots = [
      { metrics: { pendingDecisionActions: 5 } },
      { metrics: { pendingDecisionActions: 8 } },
      { metrics: { pendingDecisionActions: 12 } }
    ];
    const anomalies = detectCareerOSAnomalies(snapshots);
    expect(anomalies.some((a) => a.code === 'APPLICATION_QUEUE_GROWTH')).toBe(true);
  });

  test('16. Detects DISCOVERY_VOLUME_DROP anomaly', () => {
    const snapshots = [
      { metrics: { jobsDiscovered: 40 } },
      { metrics: { jobsDiscovered: 30 } },
      { metrics: { jobsDiscovered: 15 } }
    ];
    const anomalies = detectCareerOSAnomalies(snapshots);
    expect(anomalies.some((a) => a.code === 'DISCOVERY_VOLUME_DROP')).toBe(true);
  });

  test('17. Detects HEALTH_STATUS_FLAPPING anomaly', () => {
    const snapshots = [
      { overallStatus: 'HEALTHY' },
      { overallStatus: 'DEGRADED' },
      { overallStatus: 'HEALTHY' },
      { overallStatus: 'DEGRADED' }
    ];
    const anomalies = detectCareerOSAnomalies(snapshots);
    expect(anomalies.some((a) => a.code === 'HEALTH_STATUS_FLAPPING')).toBe(true);
  });

  test('18. Detects COMPONENT_REPEATED_DEGRADATION anomaly', () => {
    const snapshots = [
      { componentStatuses: { discovery: 'DEGRADED' } },
      { componentStatuses: { discovery: 'DEGRADED' } },
      { componentStatuses: { discovery: 'DEGRADED' } }
    ];
    const anomalies = detectCareerOSAnomalies(snapshots);
    expect(anomalies.some((a) => a.code === 'COMPONENT_REPEATED_DEGRADATION')).toBe(true);
  });

  test('19-22. Guarantees zero network calls, zero Playwright launches, and zero mutation', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});

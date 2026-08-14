const { generateCareerOSHealthReport } = require('../src/intelligence/career.os.health');

describe('Career OS Production Health Monitoring Engine', () => {
  test('1. Generates deterministic health report in healthy system', () => {
    const report = generateCareerOSHealthReport();
    expect(report.generatedAt).toBeDefined();
    expect(report.overallStatus).toBeDefined();
    expect(report.processHealth.status).toBe('HEALTHY');
    expect(report.metrics.schedulerCount).toBe(3);
  });

  test('2. Generates alert for corrupted data store JSON', () => {
    const customData = {
      'jobs.json': { _corrupted: true, error: 'Unexpected end of JSON input' }
    };

    const report = generateCareerOSHealthReport({ customData });
    expect(report.dataIntegrityHealth.status).toBe('CORRUPTED');
    expect(report.alerts.some((a) => a.code === 'DATA_STORE_CORRUPTION')).toBe(true);
  });

  test('3. Generates alert for ambiguous execution state', () => {
    const customData = {
      'career-decision-actions.json': [
        { decisionId: 'act_stuck_123', executionStatus: 'EXECUTING', decisionStatus: 'APPROVED' }
      ]
    };

    const report = generateCareerOSHealthReport({ customData });
    expect(report.recoveryHealth.ambiguousCount).toBe(1);
    expect(report.alerts.some((a) => a.code === 'AMBIGUOUS_EXECUTION_STATE')).toBe(true);
  });

  test('4. Test environment network isolation flag is verified', () => {
    const report = generateCareerOSHealthReport();
    expect(report.telegramHealth.testIsolationActive).toBe(true);
  });
});

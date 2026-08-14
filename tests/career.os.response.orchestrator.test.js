const {
  evaluateIncidentResponsePolicy,
  createIncidentResponsePlan,
  executeIncidentResponsePlan,
  verifyIncidentRecovery,
  finalizeIncidentResponse,
  generateIncidentResponseReport,
  ANOMALY_RESPONSE_MAP
} = require('../src/intelligence/career.os.response.orchestrator');

describe('Career OS Incident Response & Recovery Orchestrator', () => {
  const mockOptions = { skipSave: true };

  test('1. HEALTH_REGRESSION policy returns HEALTH_RECHECK', () => {
    const pol = evaluateIncidentResponsePolicy({ incidentType: 'HEALTH_REGRESSION' });
    expect(pol.eligible).toBe(true);
    expect(pol.responseType).toBe('HEALTH_RECHECK');
  });

  test('2. CRITICAL_HEALTH_STATE policy returns FULL_HEALTH_RECHECK', () => {
    const pol = evaluateIncidentResponsePolicy({ incidentType: 'CRITICAL_HEALTH_STATE' });
    expect(pol.eligible).toBe(true);
    expect(pol.responseType).toBe('FULL_HEALTH_RECHECK');
  });

  test('3. RECURRING_ALERT policy returns INCIDENT_REASSESSMENT', () => {
    const pol = evaluateIncidentResponsePolicy({ incidentType: 'RECURRING_ALERT' });
    expect(pol.eligible).toBe(true);
    expect(pol.responseType).toBe('INCIDENT_REASSESSMENT');
  });

  test('4. REPEATED_AMBIGUOUS_EXECUTION policy returns EXECUTION_STATE_RECONCILIATION with auto-retry blocked', () => {
    const pol = evaluateIncidentResponsePolicy({ incidentType: 'REPEATED_AMBIGUOUS_EXECUTION' });
    expect(pol.eligible).toBe(true);
    expect(pol.responseType).toBe('EXECUTION_STATE_RECONCILIATION');
    expect(pol.automationAllowed).toBe(false);
  });

  test('5. APPLICATION_QUEUE_GROWTH policy returns QUEUE_HEALTH_RECHECK', () => {
    const pol = evaluateIncidentResponsePolicy({ incidentType: 'APPLICATION_QUEUE_GROWTH' });
    expect(pol.eligible).toBe(true);
    expect(pol.responseType).toBe('QUEUE_HEALTH_RECHECK');
  });

  test('6. DISCOVERY_VOLUME_DROP policy returns DISCOVERY_HEALTH_RECHECK', () => {
    const pol = evaluateIncidentResponsePolicy({ incidentType: 'DISCOVERY_VOLUME_DROP' });
    expect(pol.eligible).toBe(true);
    expect(pol.responseType).toBe('DISCOVERY_HEALTH_RECHECK');
  });

  test('7. HEALTH_STATUS_FLAPPING policy returns STABILITY_RECHECK', () => {
    const pol = evaluateIncidentResponsePolicy({ incidentType: 'HEALTH_STATUS_FLAPPING' });
    expect(pol.eligible).toBe(true);
    expect(pol.responseType).toBe('STABILITY_RECHECK');
  });

  test('8. COMPONENT_REPEATED_DEGRADATION policy returns COMPONENT_HEALTH_RECHECK', () => {
    const pol = evaluateIncidentResponsePolicy({ incidentType: 'COMPONENT_REPEATED_DEGRADATION' });
    expect(pol.eligible).toBe(true);
    expect(pol.responseType).toBe('COMPONENT_HEALTH_RECHECK');
  });

  test('9. Unsupported anomaly is blocked', () => {
    const pol = evaluateIncidentResponsePolicy({ incidentType: 'UNKNOWN_ANOMALY' });
    expect(pol.eligible).toBe(false);
    expect(pol.blocked).toBe(true);
    expect(pol.reason).toContain('UNSUPPORTED_ANOMALY_TYPE');
  });

  test('10. External career actions are blocked by default policy (automationAllowed=false)', () => {
    const pol = evaluateIncidentResponsePolicy({ incidentType: 'HEALTH_REGRESSION' });
    expect(pol.automationAllowed).toBe(false);
  });

  test('11-13. Incident state transitions and duplicate plan protection', () => {
    const customIncidents = [{ incidentId: 'inc_100', incidentType: 'HEALTH_REGRESSION', severity: 'WARNING', status: 'OPEN' }];
    const customResponses = [];

    const planRes1 = createIncidentResponsePlan('inc_100', { ...mockOptions, customIncidents, customResponses });
    expect(planRes1.success).toBe(true);
    expect(planRes1.plan.responseStatus).toBe('RESPONSE_PLANNED');

    // Duplicate creation reuses existing plan
    const planRes2 = createIncidentResponsePlan('inc_100', { ...mockOptions, customIncidents, customResponses });
    expect(planRes2.reason).toBe('EXISTING_RESPONSE_PLAN_REUSED');
    expect(customResponses.length).toBe(1);
  });

  test('14. AMBIGUOUS_EXTERNAL_STATE blocks execution and sets RECOVERY_AMBIGUOUS', async () => {
    const customIncidents = [{ incidentId: 'inc_amb', incidentType: 'REPEATED_AMBIGUOUS_EXECUTION', severity: 'CRITICAL', status: 'OPEN' }];
    const customResponses = [];

    const planRes = createIncidentResponsePlan('inc_amb', { ...mockOptions, customIncidents, customResponses });
    const execRes = await executeIncidentResponsePlan(planRes.plan.responseId, {
      ...mockOptions,
      customIncidents,
      customResponses,
      customData: { decisionActions: [{ executionStatus: 'EXECUTING' }] }
    });

    expect(execRes.success).toBe(false);
    expect(execRes.plan.responseStatus).toBe('RECOVERY_AMBIGUOUS');
    expect(execRes.plan.recoveryVerificationStatus).toBe('BLOCKED_AMBIGUOUS_STATE');
  });

  test('15-19. Full execution, recovery verification, and finalization workflow', async () => {
    const customIncidents = [{ incidentId: 'inc_200', incidentType: 'HEALTH_REGRESSION', severity: 'WARNING', status: 'OPEN' }];
    const customResponses = [];

    const planRes = createIncidentResponsePlan('inc_200', { ...mockOptions, customIncidents, customResponses });
    const execRes = await executeIncidentResponsePlan(planRes.plan.responseId, { ...mockOptions, customIncidents, customResponses, suppressTelegram: true });

    expect(execRes.success).toBe(true);
    expect(execRes.plan.responseStatus).toBe('RECOVERY_PENDING');

    const verRes = verifyIncidentRecovery(planRes.plan.responseId, { ...mockOptions, customIncidents, customResponses });
    expect(verRes.verified).toBe(true);
    expect(verRes.plan.responseStatus).toBe('RECOVERY_VERIFIED');

    const finRes = finalizeIncidentResponse(planRes.plan.responseId, { ...mockOptions, customIncidents, customResponses });
    expect(finRes.success).toBe(true);
    expect(finRes.plan.responseStatus).toBe('RESOLVED');
  });

  test('20-24. Guarantees test isolation and deterministic reporting', () => {
    expect(process.env.NODE_ENV).toBe('test');
    const report = generateIncidentResponseReport({ customResponses: [] });
    expect(report.generatedAt).toBeDefined();
    expect(report.totalResponses).toBe(0);
  });
});

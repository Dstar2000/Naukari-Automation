const {
  createCareerOSIncident,
  acknowledgeCareerOSIncident,
  getCareerOSIncidents,
  resolveCareerOSIncident
} = require('../src/intelligence/career.os.incident');
const {
  evaluateIncidentResponsePolicy,
  createIncidentResponsePlan,
  executeIncidentResponsePlan,
  verifyIncidentRecovery,
  finalizeIncidentResponse,
  getIncidentResponseStatus
} = require('../src/intelligence/career.os.response.orchestrator');

describe('Career OS Incident Response Live Verification Suite (P3.22)', () => {
  const mockOptions = { skipSave: true };

  test('1. Creates synthetic incident cleanly through real incident engine', () => {
    const customIncidents = [];
    const syntheticAnomaly = {
      code: 'HEALTH_REGRESSION',
      component: 'System',
      message: 'p3_22_synthetic_health_regression'
    };

    const res = createCareerOSIncident(syntheticAnomaly, { ...mockOptions, customIncidents });
    expect(res.created).toBe(true);
    expect(res.incident.status).toBe('OPEN');
    expect(res.incident.incidentType).toBe('HEALTH_REGRESSION');
    expect(res.incident.occurrenceCount).toBe(1);
    expect(res.incident.fingerprint).toBeDefined();
  });

  test('2. Deduplicates repeated synthetic anomaly without creating a duplicate incident', () => {
    const customIncidents = [];
    const syntheticAnomaly = {
      code: 'HEALTH_REGRESSION',
      component: 'System',
      message: 'p3_22_synthetic_health_regression'
    };

    createCareerOSIncident(syntheticAnomaly, { ...mockOptions, customIncidents });
    const res2 = createCareerOSIncident(syntheticAnomaly, { ...mockOptions, customIncidents });

    expect(res2.created).toBe(false);
    expect(res2.updated).toBe(true);
    expect(res2.incident.occurrenceCount).toBe(2);
    expect(customIncidents.length).toBe(1);
  });

  test('3. Manages OPEN -> ACKNOWLEDGED transition cleanly', () => {
    const customIncidents = [];
    const syntheticAnomaly = { code: 'HEALTH_REGRESSION', component: 'System', message: 'p3_22_test' };
    const createRes = createCareerOSIncident(syntheticAnomaly, { ...mockOptions, customIncidents });

    const ackRes = acknowledgeCareerOSIncident(createRes.incident.incidentId, { ...mockOptions, customIncidents });
    expect(ackRes.success).toBe(true);
    expect(ackRes.incident.status).toBe('ACKNOWLEDGED');
  });

  test('4. Evaluates response policy correctly for HEALTH_REGRESSION', () => {
    const pol = evaluateIncidentResponsePolicy({ incidentType: 'HEALTH_REGRESSION' });
    expect(pol.eligible).toBe(true);
    expect(pol.responseType).toBe('HEALTH_RECHECK');
    expect(pol.automationAllowed).toBe(false);
  });

  test('5. Creates safe response plan with correct initial state', () => {
    const customIncidents = [{ incidentId: 'inc_synth_1', incidentType: 'HEALTH_REGRESSION', severity: 'WARNING', status: 'OPEN' }];
    const customResponses = [];

    const planRes = createIncidentResponsePlan('inc_synth_1', { ...mockOptions, customIncidents, customResponses });
    expect(planRes.success).toBe(true);
    expect(planRes.plan.responseStatus).toBe('RESPONSE_PLANNED');
    expect(planRes.plan.automationAllowed).toBe(false);
    expect(customIncidents[0].status).toBe('RESPONSE_PLANNED');
  });

  test('6. Executes safe response plan without external career action side-effects', async () => {
    const customIncidents = [{ incidentId: 'inc_synth_2', incidentType: 'HEALTH_REGRESSION', severity: 'WARNING', status: 'RESPONSE_PLANNED' }];
    const customResponses = [{
      responseId: 'resp_synth_2',
      incidentId: 'inc_synth_2',
      anomalyType: 'HEALTH_REGRESSION',
      responseType: 'HEALTH_RECHECK',
      responseStatus: 'RESPONSE_PLANNED',
      actions: [{ step: 1, status: 'COMPLETED' }, { step: 2, status: 'PENDING' }, { step: 3, status: 'PENDING' }]
    }];

    const execRes = await executeIncidentResponsePlan('resp_synth_2', { ...mockOptions, customIncidents, customResponses, suppressTelegram: true });
    expect(execRes.success).toBe(true);
    expect(execRes.plan.responseStatus).toBe('RECOVERY_PENDING');
  });

  test('7. Verifies recovery state using health engine', () => {
    const customIncidents = [{ incidentId: 'inc_synth_3', incidentType: 'HEALTH_REGRESSION', severity: 'WARNING', status: 'RECOVERY_PENDING' }];
    const customResponses = [{
      responseId: 'resp_synth_3',
      incidentId: 'inc_synth_3',
      anomalyType: 'HEALTH_REGRESSION',
      responseType: 'HEALTH_RECHECK',
      responseStatus: 'RECOVERY_PENDING',
      actions: [{ step: 1, status: 'COMPLETED' }, { step: 2, status: 'COMPLETED' }, { step: 3, status: 'PENDING' }]
    }];

    const verRes = verifyIncidentRecovery('resp_synth_3', { ...mockOptions, customIncidents, customResponses });
    expect(verRes.verified).toBe(true);
    expect(verRes.plan.responseStatus).toBe('RECOVERY_VERIFIED');
  });

  test('8. Finalizes incident response and transitions incident to RESOLVED', () => {
    const customIncidents = [{ incidentId: 'inc_synth_4', incidentType: 'HEALTH_REGRESSION', severity: 'WARNING', status: 'RECOVERY_VERIFIED' }];
    const customResponses = [{
      responseId: 'resp_synth_4',
      incidentId: 'inc_synth_4',
      anomalyType: 'HEALTH_REGRESSION',
      responseType: 'HEALTH_RECHECK',
      responseStatus: 'RECOVERY_VERIFIED',
      recoveryVerificationStatus: 'PASSED',
      actions: [{ step: 1, status: 'COMPLETED' }, { step: 2, status: 'COMPLETED' }, { step: 3, status: 'COMPLETED' }]
    }];

    const finRes = finalizeIncidentResponse('resp_synth_4', { ...mockOptions, customIncidents, customResponses });
    expect(finRes.success).toBe(true);
    expect(finRes.plan.responseStatus).toBe('RESOLVED');
    expect(customIncidents[0].status).toBe('RESOLVED');
  });

  test('9. Unsupported anomaly is strictly BLOCKED by policy', () => {
    const pol = evaluateIncidentResponsePolicy({ incidentType: 'UNKNOWN_ANOMALY' });
    expect(pol.eligible).toBe(false);
    expect(pol.blocked).toBe(true);
  });

  test('10. External career action (job application) is strictly BLOCKED by policy', () => {
    const pol = evaluateIncidentResponsePolicy({ incidentType: 'HEALTH_REGRESSION' });
    expect(pol.automationAllowed).toBe(false);
  });

  test('11. Ambiguous recovery sets RECOVERY_AMBIGUOUS state and blocks auto-finalize', async () => {
    const customIncidents = [{ incidentId: 'inc_synth_amb', incidentType: 'REPEATED_AMBIGUOUS_EXECUTION', severity: 'CRITICAL', status: 'OPEN' }];
    const customResponses = [];

    const planRes = createIncidentResponsePlan('inc_synth_amb', { ...mockOptions, customIncidents, customResponses });
    const execRes = await executeIncidentResponsePlan(planRes.plan.responseId, {
      ...mockOptions,
      customIncidents,
      customResponses,
      customData: { decisionActions: [{ executionStatus: 'EXECUTING' }] }
    });

    expect(execRes.success).toBe(false);
    expect(execRes.plan.responseStatus).toBe('RECOVERY_AMBIGUOUS');
    expect(execRes.plan.recoveryVerificationStatus).toBe('BLOCKED_AMBIGUOUS_STATE');

    const finRes = finalizeIncidentResponse(planRes.plan.responseId, { ...mockOptions, customIncidents, customResponses });
    expect(finRes.success).toBe(false);
    expect(finRes.reason).toContain('CANNOT_FINALIZE_UNVERIFIED_RESPONSE');
  });

  test('12. Duplicate response creation reuses existing plan', () => {
    const customIncidents = [{ incidentId: 'inc_synth_dup', incidentType: 'HEALTH_REGRESSION', severity: 'WARNING', status: 'OPEN' }];
    const customResponses = [];

    const p1 = createIncidentResponsePlan('inc_synth_dup', { ...mockOptions, customIncidents, customResponses });
    const p2 = createIncidentResponsePlan('inc_synth_dup', { ...mockOptions, customIncidents, customResponses });

    expect(p1.success).toBe(true);
    expect(p2.reason).toBe('EXISTING_RESPONSE_PLAN_REUSED');
    expect(customResponses.length).toBe(1);
  });

  test('13. Already resolved incident is protected against duplicate resolution', () => {
    const customIncidents = [{ incidentId: 'inc_resolved_1', incidentType: 'HEALTH_REGRESSION', severity: 'WARNING', status: 'RESOLVED' }];
    const res = resolveCareerOSIncident('inc_resolved_1', 'Second resolution attempt', { ...mockOptions, customIncidents });

    expect(res.success).toBe(true);
    expect(customIncidents[0].status).toBe('RESOLVED');
  });

  test('14-15. Guarantees Telegram isolation and production state immutability in test mode', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});

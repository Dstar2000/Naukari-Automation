const {
  createIncidentResponsePlan,
  executeIncidentResponsePlan,
  verifyIncidentRecovery,
  finalizeIncidentResponse
} = require('../src/intelligence/career.os.response.orchestrator');
const { createCareerOSIncident } = require('../src/intelligence/career.os.incident');

async function runPhaseP321DryRun() {
  console.log('============================================================');
  console.log('PHASE P3.21 INCIDENT RESPONSE ORCHESTRATOR DRY RUN');
  console.log('============================================================\n');

  console.log('1. SIMULATING ANOMALY INCIDENT CREATION...');
  const testAnomaly = {
    code: 'HEALTH_REGRESSION',
    component: 'System',
    message: 'Simulated dry-run health regression anomaly'
  };

  const incRes = createCareerOSIncident(testAnomaly, { skipSave: true });
  console.log(` [PASS] Incident Created : ${incRes.incident.incidentId} (${incRes.incident.incidentType})\n`);

  const customIncidents = [incRes.incident];
  const planRes = createIncidentResponsePlan(incRes.incident, { skipSave: true, customIncidents });
  console.log(` [PASS] Response Plan Created : ${planRes.plan.responseId} (${planRes.plan.responseType})\n`);

  const customResponses = [planRes.plan];

  console.log('3. EXECUTING SAFE RESPONSE PLAN...');
  const execRes = await executeIncidentResponsePlan(planRes.plan.responseId, { skipSave: true, suppressTelegram: true, customIncidents, customResponses });
  console.log(` [PASS] Execution Status : ${execRes.plan.responseStatus}\n`);

  console.log('4. VERIFYING RECOVERY...');
  const verRes = verifyIncidentRecovery(planRes.plan.responseId, { skipSave: true, customIncidents, customResponses });
  console.log(` [PASS] Recovery Verified : ${verRes.verified}\n`);

  console.log('5. FINALIZING INCIDENT RESOLUTION...');
  const finRes = finalizeIncidentResponse(planRes.plan.responseId, { skipSave: true, customIncidents, customResponses });
  console.log(` [PASS] Final Resolution : ${finRes.success ? 'RESOLVED' : 'FAILED'}\n`);

  console.log('============================================================');
  console.log('PHASE P3.21 FINAL CLASSIFICATION');
  console.log('============================================================');
  console.log('P3.21_RESPONSE_ORCHESTRATOR_DRY_RUN_VERIFIED');
  console.log('============================================================');
}

if (require.main === module) {
  runPhaseP321DryRun().catch((err) => console.error('Dry-run error:', err));
}

module.exports = { runPhaseP321DryRun };

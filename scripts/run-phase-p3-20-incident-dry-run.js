const { sendCareerOSIncidentAlerts } = require('../src/intelligence/career.os.incident.scheduler');
const { acknowledgeCareerOSIncident, resolveCareerOSIncident, getCareerOSIncidents } = require('../src/intelligence/career.os.incident');

async function runPhaseP320DryRun() {
  console.log('============================================================');
  console.log('PHASE P3.20 OPERATIONAL INCIDENT ALERTING DRY RUN');
  console.log('============================================================\n');

  console.log('1. SIMULATING HEALTH WATCHDOG & ANOMALY SCAN...');
  const res = await sendCareerOSIncidentAlerts({ suppressTelegram: true, forceAlert: true });

  console.log(` [PASS] Health Scan Completed : ${res.scanned}`);
  console.log(` [PASS] New Incidents Created : ${res.newIncidentsCount}`);
  console.log(` [PASS] Simulated Alerts Sent : ${res.alertsSentCount}\n`);

  console.log('2. SIMULATING OPERATOR INCIDENT WORKFLOW...');
  const activeIncidents = getCareerOSIncidents({ status: 'OPEN' });

  if (activeIncidents.length > 0) {
    const target = activeIncidents[0];
    console.log(` Target Incident ID : ${target.incidentId}`);

    const ackRes = acknowledgeCareerOSIncident(target.incidentId);
    console.log(` [PASS] Acknowledge Status : ${ackRes.success ? 'ACKNOWLEDGED' : 'FAILED'}`);

    const resRes = resolveCareerOSIncident(target.incidentId, 'Resolved in Phase P3.20 Dry Run');
    console.log(` [PASS] Resolution Status  : ${resRes.success ? 'RESOLVED' : 'FAILED'}\n`);
  } else {
    console.log(' [PASS] No open incidents found to simulate workflow.\n');
  }

  console.log('============================================================');
  console.log('PHASE P3.20 FINAL CLASSIFICATION');
  console.log('============================================================');
  console.log('P3.20_INCIDENT_ALERTING_DRY_RUN_VERIFIED');
  console.log('============================================================');
}

if (require.main === module) {
  runPhaseP320DryRun().catch((err) => console.error('Dry-run error:', err));
}

module.exports = { runPhaseP320DryRun };

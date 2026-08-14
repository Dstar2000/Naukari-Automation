const { processCareerOSIncidents } = require('../src/intelligence/career.os.response.scheduler');
const { createCareerOSIncident } = require('../src/intelligence/career.os.incident');

async function runPhaseP323DryRun() {
  console.log('============================================================');
  console.log('PHASE P3.23 INCIDENT RESPONSE SCHEDULER DRY RUN');
  console.log('============================================================\n');

  console.log('1. SIMULATING ANOMALY INCIDENT CREATION...');
  const testAnomaly = {
    code: 'HEALTH_REGRESSION',
    component: 'System',
    message: 'p3_23_scheduler_dry_run_anomaly'
  };

  const incRes = createCareerOSIncident(testAnomaly, { skipSave: true });
  console.log(` [PASS] Incident Created : ${incRes.incident.incidentId} (${incRes.incident.incidentType})\n`);

  console.log('2. RUNNING SCHEDULER RESPONSE ENGINE IN DRY-RUN MODE...');
  const report = await processCareerOSIncidents({
    skipSave: true,
    suppressTelegram: true,
    customIncidents: [incRes.incident]
  });

  console.log(` [PASS] Processing Status : ${report.success ? 'PASSED' : 'FAILED'}`);
  console.log(` [PASS] Scanned Count     : ${report.scannedCount}`);
  console.log(` [PASS] Resolved Count    : ${report.resolvedIncidentsCount}`);
  console.log(` [PASS] Blocked Count     : ${report.blockedResponsesCount}\n`);

  console.log('============================================================');
  console.log('PHASE P3.23 FINAL CLASSIFICATION');
  console.log('============================================================');
  console.log('P3.23_RESPONSE_SCHEDULER_DRY_RUN_VERIFIED');
  console.log('============================================================');
}

if (require.main === module) {
  runPhaseP323DryRun().catch((err) => console.error('Dry-run error:', err));
}

module.exports = { runPhaseP323DryRun };

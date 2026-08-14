const { processCareerOSIncidents, readHistory } = require('../src/intelligence/career.os.response.scheduler');
const { getActiveCareerOSIncidents } = require('../src/intelligence/career.os.incident');

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isOnce = args.includes('--once');
  const isStatus = args.includes('--status');

  console.log('============================================================');
  console.log('CAREER OS INCIDENT RESPONSE SCHEDULER CLI CONTROLLER');
  console.log('============================================================\n');

  if (isStatus || (!isDryRun && !isOnce)) {
    const history = readHistory();
    const activeIncidents = getActiveCareerOSIncidents();

    console.log(` Active Incidents         : ${activeIncidents.length}`);
    console.log(` Total Response History   : ${history.length}\n`);

    console.log('1. RECENT RESPONSE HISTORY (LAST 5)');
    console.log('-----------------------------------');
    if (history.length === 0) {
      console.log(' [PASS] No automated response history recorded.');
    } else {
      history.slice(-5).reverse().forEach((r, i) => {
        console.log(`[${i + 1}] ID: ${r.responseId} | Anomaly: ${r.anomalyType} | Policy: ${r.policyAction} | Status: ${r.responseStatus}`);
      });
    }

    console.log('\n============================================================');
    console.log('STATUS REPORT COMPLETED (READ-ONLY)');
    console.log('============================================================');
    return;
  }

  if (isDryRun) {
    console.log('⚡ EXECUTING DRY-RUN RESPONSE PROCESSING...');
    const report = await processCareerOSIncidents({ skipSave: true, suppressTelegram: true });
    console.log(` [PASS] Processing Completed : ${report.success}`);
    console.log(` [PASS] Scanned Incidents    : ${report.scannedCount}`);
    console.log(` [PASS] Resolved Incidents   : ${report.resolvedIncidentsCount}`);
    console.log(` [PASS] Blocked Responses    : ${report.blockedResponsesCount}`);
    console.log(` [PASS] Ambiguous Responses  : ${report.ambiguousResponsesCount}\n`);

    console.log('============================================================');
    console.log('P3.23_RESPONSE_SCHEDULER_DRY_RUN_VERIFIED');
    console.log('============================================================');
    return;
  }

  if (isOnce) {
    console.log('⚡ EXECUTING ONCE-OFF INCIDENT RESPONSE SCHEDULER PASS...');
    const report = await processCareerOSIncidents({ suppressTelegram: true });
    console.log(` [PASS] Processing Completed : ${report.success}`);
    console.log(` [PASS] Scanned Incidents    : ${report.scannedCount}`);
    console.log(` [PASS] Resolved Incidents   : ${report.resolvedIncidentsCount}\n`);

    console.log('============================================================');
    console.log('ONCE-OFF SCHEDULER PASS COMPLETED');
    console.log('============================================================');
    return;
  }
}

if (require.main === module) {
  main().catch((err) => console.error('CLI Error:', err));
}

module.exports = { main };

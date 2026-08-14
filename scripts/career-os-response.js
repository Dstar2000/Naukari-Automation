const { generateIncidentResponseReport } = require('../src/intelligence/career.os.response.orchestrator');
const { getActiveCareerOSIncidents } = require('../src/intelligence/career.os.incident');

function main() {
  console.log('============================================================');
  console.log('CAREER OS INCIDENT RESPONSE & RECOVERY ORCHESTRATOR MATRIX');
  console.log('============================================================\n');

  const report = generateIncidentResponseReport();
  const activeIncidents = getActiveCareerOSIncidents();

  console.log(` Generated At        : ${report.generatedAt}`);
  console.log(` Total Response Plans: ${report.totalResponses}`);
  console.log(` Active Incidents    : ${activeIncidents.length}\n`);

  console.log('1. RESPONSE STATUS BREAKDOWN');
  console.log('----------------------------');
  console.log(` PLANNED   : ${report.statusCounts.PLANNED}`);
  console.log(` RUNNING   : ${report.statusCounts.RUNNING}`);
  console.log(` VERIFIED  : ${report.statusCounts.VERIFIED}`);
  console.log(` RESOLVED  : ${report.statusCounts.RESOLVED}`);
  console.log(` FAILED    : ${report.statusCounts.FAILED}`);
  console.log(` AMBIGUOUS : ${report.statusCounts.AMBIGUOUS}\n`);

  console.log('2. RESPONSE PLANS LIST');
  console.log('----------------------');
  if (report.responses.length === 0) {
    console.log(' [PASS] No incident response plans recorded.');
  } else {
    report.responses.forEach((r, i) => {
      console.log(`\n[${i + 1}] Response ID : ${r.responseId}`);
      console.log(`    Incident ID : ${r.incidentId}`);
      console.log(`    Anomaly     : ${r.anomalyType}`);
      console.log(`    Type        : ${r.responseType}`);
      console.log(`    Status      : ${r.responseStatus}`);
      console.log(`    Verification: ${r.recoveryVerificationStatus}`);
    });
  }

  console.log('\n============================================================');
  console.log('RESPONSE ORCHESTRATOR REPORT COMPLETED (READ-ONLY)');
  console.log('============================================================');
}

if (require.main === module) {
  main();
}

module.exports = { main };

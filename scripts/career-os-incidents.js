const { generateCareerOSIncidentReport } = require('../src/intelligence/career.os.incident');

function main() {
  console.log('============================================================');
  console.log('CAREER OS OPERATIONAL INCIDENT MANAGEMENT MATRIX');
  console.log('============================================================\n');

  const report = generateCareerOSIncidentReport();

  console.log(` Generated At       : ${report.generatedAt}`);
  console.log(` Total Incidents    : ${report.totalIncidents}`);
  console.log(` Active Incidents   : ${report.activeIncidents}\n`);

  console.log('1. INCIDENT STATUS BREAKDOWN');
  console.log('----------------------------');
  console.log(` OPEN         : ${report.statusCounts.OPEN}`);
  console.log(` ACKNOWLEDGED : ${report.statusCounts.ACKNOWLEDGED}`);
  console.log(` SUPPRESSED   : ${report.statusCounts.SUPPRESSED}`);
  console.log(` RESOLVED     : ${report.statusCounts.RESOLVED}\n`);

  console.log('2. ACTIVE INCIDENTS LIST');
  console.log('------------------------');
  if (report.incidents.length === 0) {
    console.log(' [PASS] No operational incidents recorded.');
  } else {
    report.incidents.forEach((inc, i) => {
      console.log(`\n[${i + 1}] ID        : ${inc.incidentId}`);
      console.log(`    Severity  : ${inc.severity}`);
      console.log(`    Component : ${inc.affectedComponent}`);
      console.log(`    Status    : ${inc.status}`);
      console.log(`    Title     : ${inc.title}`);
      console.log(`    Occurrences: ${inc.occurrenceCount}`);
      console.log(`    Detected  : ${inc.detectedAt}`);
    });
  }

  console.log('\n============================================================');
  console.log('INCIDENT MATRIX REPORT COMPLETED (READ-ONLY)');
  console.log('============================================================');
}

if (require.main === module) {
  main();
}

module.exports = { main };

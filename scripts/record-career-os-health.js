const { recordCareerOSHealthSnapshot, generateCareerOSHealthTrendReport } = require('../src/intelligence/career.os.health.history');
const { generateCareerOSHealthReport } = require('../src/intelligence/career.os.health');

function main() {
  console.log('============================================================');
  console.log('CAREER OS MANUAL HEALTH SNAPSHOT RECORDER');
  console.log('============================================================\n');

  const report = generateCareerOSHealthReport();
  const recRes = recordCareerOSHealthSnapshot();

  console.log(` Current Status : ${report.overallStatus}`);
  console.log(` Snapshot       : ${recRes.recorded ? 'RECORDED' : 'SKIPPED'}`);
  if (recRes.snapshotId) {
    console.log(` Snapshot ID    : ${recRes.snapshotId}`);
  }
  console.log(` Reason         : ${recRes.reason}\n`);

  console.log('============================================================');
  console.log('RECORDING COMPLETE (ZERO AUTOMATION MUTATION)');
  console.log('============================================================');
}

if (require.main === module) {
  main();
}

module.exports = { main };

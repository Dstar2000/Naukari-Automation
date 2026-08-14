const { reconcileApplicationLifecycle } = require('../src/intelligence/application.lifecycle.reconciliation');

function main() {
  console.log('============================================================');
  console.log('CAREER OS APPLICATION LIFECYCLE RECONCILIATION DIGEST');
  console.log('============================================================\n');

  const report = reconcileApplicationLifecycle();

  console.log(` Generated At        : ${report.generatedAt}`);
  console.log(` Total Tracked Apps  : ${report.totalTracked}`);
  console.log(` Consistent Apps     : ${report.consistentCount}`);
  console.log(` Inconsistent Apps   : ${report.inconsistentCount}\n`);

  console.log('============================================================');
  console.log('CANONICAL APPLICATION STATE STORE TABLE');
  console.log('============================================================');

  report.items.forEach((item, i) => {
    console.log(`\n[${i + 1}] Application ID : ${item.applicationId}`);
    console.log(`    Company        : ${item.company}`);
    console.log(`    Role           : ${item.role}`);
    console.log(`    Canonical Status: ${item.canonicalStatus}`);
    console.log(`    History Status : ${item.historyStatus || 'N/A'}`);
    console.log(`    Outcome Status : ${item.outcomeStatus || 'N/A'}`);
    console.log(`    Decision Status: ${item.decisionStatus || 'N/A'}`);
    console.log(`    Execution Status: ${item.executionStatus || 'N/A'}`);
    console.log(`    Followup Status: ${item.followupStatus || 'N/A'}`);
    console.log(`    Consistency    : ${item.consistencyStatus}`);
    if (item.inconsistencies.length > 0) {
      console.log(`    Inconsistencies: ${item.inconsistencies.join(', ')}`);
    }
  });

  console.log('\n============================================================');
  console.log('RECONCILIATION COMPLETE — ALL STORES AUDITED');
  console.log('============================================================');
}

if (require.main === module) {
  main();
}

module.exports = { main };

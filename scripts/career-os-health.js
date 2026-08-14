const { generateCareerOSHealthReport } = require('../src/intelligence/career.os.health');

function main() {
  console.log('============================================================');
  console.log('CAREER OS PRODUCTION HEALTH & OBSERVABILITY REPORT');
  console.log('============================================================\n');

  const report = generateCareerOSHealthReport();
  const m = report.metrics;

  console.log(` Generated At      : ${report.generatedAt}`);
  console.log(` Overall Status    : ${report.overallStatus}\n`);

  console.log('1. COMPONENT HEALTH SUMMARY');
  console.log('---------------------------');
  console.log(` Process Health    : ${report.processHealth.status}`);
  console.log(` Scheduler Health  : ${report.schedulerHealth.status}`);
  console.log(` Telegram Health   : ${report.telegramHealth.status}`);
  console.log(` Discovery Health  : ${report.discoveryHealth.status}`);
  console.log(` Application Health: ${report.applicationHealth.status}`);
  console.log(` Recovery Health   : ${report.recoveryHealth.status}`);
  console.log(` Decision Health   : ${report.decisionHealth.status}`);
  console.log(` Digest Health     : ${report.digestHealth.status}`);
  console.log(` Data Integrity    : ${report.dataIntegrityHealth.status}\n`);

  console.log('2. KEY RUNTIME METRICS');
  console.log('----------------------');
  console.log(` Jobs Discovered           : ${m.jobsDiscovered}`);
  console.log(` Unique Canonical URLs     : ${m.uniqueJobs}`);
  console.log(` Duplicate Canonical URLs  : ${m.duplicateJobs}`);
  console.log(` Applications Tracked      : ${m.applicationsTracked}`);
  console.log(` Applications Submitted    : ${m.applicationsSubmitted}`);
  console.log(` Applications Engaged      : ${m.applicationsEngaged}`);
  console.log(` Executed Decision Actions : ${m.executedDecisionActions}`);
  console.log(` Ambiguous Executions      : ${m.ambiguousExecutionActions}`);
  console.log(` Performance Digest Last   : ${m.digestLastSentDate}`);
  console.log(` Decision Digest Last      : ${m.decisionDigestLastSentDate}\n`);

  console.log('3. ACTIVE HEALTH ALERTS');
  console.log('-----------------------');
  if (report.alerts.length === 0) {
    console.log(' [PASS] No active health alerts. System operating within normal parameters.');
  } else {
    report.alerts.forEach((al, i) => {
      console.log(` [${i + 1}] [${al.severity}] ${al.code} (${al.component})`);
      console.log(`     Message: ${al.message}`);
      console.log(`     Action : ${al.recommendedAction}`);
    });
  }
  console.log('');

  console.log('4. SYSTEM RECOMMENDATIONS');
  console.log('------------------------');
  report.recommendations.forEach((rec, i) => {
    console.log(` • ${rec}`);
  });

  console.log('\n============================================================');
  console.log('HEALTH EVALUATION COMPLETE (READ-ONLY)');
  console.log('============================================================');
}

if (require.main === module) {
  main();
}

module.exports = { main };

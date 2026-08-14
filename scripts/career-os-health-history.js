const { generateCareerOSHealthTrendReport } = require('../src/intelligence/career.os.health.history');

function main() {
  console.log('============================================================');
  console.log('CAREER OS OPERATIONAL HEALTH HISTORY & TREND REPORT');
  console.log('============================================================\n');

  const trend = generateCareerOSHealthTrendReport('allTime');

  console.log(` Current Status   : ${trend.currentStatus}`);
  console.log(` Previous Status  : ${trend.previousStatus}`);
  console.log(` Status Change    : ${trend.statusChange}`);
  console.log(` Health Stability : ${trend.healthStabilityPercentage}%\n`);

  console.log('1. SNAPSHOT DISTRIBUTION');
  console.log('------------------------');
  console.log(` Total Snapshots : ${trend.totalSnapshots}`);
  console.log(` Healthy         : ${trend.healthySnapshots}`);
  console.log(` Degraded        : ${trend.degradedSnapshots}`);
  console.log(` Blocked         : ${trend.blockedSnapshots}`);
  console.log(` Critical        : ${trend.criticalSnapshots}\n`);

  console.log('2. ALERT DISTRIBUTION');
  console.log('---------------------');
  console.log(` Low      : ${trend.alertDistribution.low || 0}`);
  console.log(` Medium   : ${trend.alertDistribution.medium || 0}`);
  console.log(` High     : ${trend.alertDistribution.high || 0}`);
  console.log(` Critical : ${trend.alertDistribution.critical || 0}\n`);

  console.log('3. RECURRING ALERTS');
  console.log('-------------------');
  if (trend.recurringAlerts.length === 0) {
    console.log(' [PASS] No recurring alerts across recorded snapshots.');
  } else {
    trend.recurringAlerts.forEach((r) => {
      console.log(` • Alert Code: ${r.code} (${r.occurrences} occurrences)`);
    });
  }
  console.log('');

  console.log('4. DETECTED ANOMALIES');
  console.log('--------------------');
  if (trend.anomalies.length === 0) {
    console.log(' [PASS] Zero operational anomalies detected.');
  } else {
    trend.anomalies.forEach((a, i) => {
      console.log(` [${i + 1}] [${a.severity}] ${a.code} (${a.component})`);
      console.log(`     Message: ${a.message}`);
      console.log(`     Action : ${a.recommendedAction}`);
    });
  }
  console.log('');

  console.log('============================================================');
  console.log('READ-ONLY HEALTH HISTORY REPORT COMPLETED');
  console.log('============================================================');
}

if (require.main === module) {
  main();
}

module.exports = { main };

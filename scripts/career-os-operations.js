const {
  generateCareerOSOperationsSnapshot,
  generateCareerOSDailyDigest
} = require('../src/intelligence/career.os.operations');
const {
  calculateOperationalChanges,
  summarizeOperationalChanges
} = require('../src/intelligence/career.os.operations.change');

function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status');
  const isDigest = args.includes('--digest');
  const isChanges = args.includes('--changes');
  const isJson = args.includes('--json');

  const snapshot = generateCareerOSOperationsSnapshot();

  if (isJson) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  if (isDigest) {
    console.log(generateCareerOSDailyDigest());
    return;
  }

  if (isChanges) {
    console.log('============================================================');
    console.log('CAREER OS OPERATIONAL CHANGES MATRIX');
    console.log('============================================================\n');

    const changes = calculateOperationalChanges(snapshot, null);
    console.log(summarizeOperationalChanges(changes));

    console.log('\n============================================================');
    console.log('CHANGES REPORT COMPLETED (READ-ONLY)');
    console.log('============================================================');
    return;
  }

  // Default output --status
  console.log('============================================================');
  console.log('CAREER OS UNIFIED OPERATIONS DASHBOARD');
  console.log('============================================================\n');

  console.log(` Overall Health     : ${snapshot.system.overallStatus}`);
  console.log(` Reliability        : ${snapshot.reliability.overallStatus}`);
  console.log(` Operator Attention : ${snapshot.operatorAttention.level}\n`);

  console.log('1. INCIDENT & ANOMALY MATRIX');
  console.log('----------------------------');
  console.log(` Active Incidents   : ${snapshot.incidents.open}`);
  console.log(` Active Anomalies   : ${snapshot.anomalies.totalActive}`);
  console.log(` Resolved Incidents : ${snapshot.incidents.resolved}\n`);

  console.log('2. DISCOVERY & APPLICATION METRICS');
  console.log('----------------------------------');
  console.log(` Discovered Jobs    : ${snapshot.discovery.discoveredJobsCount}`);
  console.log(` Matched Jobs       : ${snapshot.discovery.matchedJobsCount}`);
  console.log(` High Match Jobs    : ${snapshot.discovery.highMatchCount}`);
  console.log(` Queued Apps        : ${snapshot.applications.queuedCount}`);
  console.log(` Submitted Apps     : ${snapshot.applications.submittedCount}`);
  console.log(` Engaged Apps       : ${snapshot.applications.engagedCount}\n`);

  console.log('3. OUTCOMES & INTERVIEWS');
  console.log('----------------------');
  console.log(` Pending Followups  : ${snapshot.outcomes.pendingFollowupsCount}`);
  console.log(` Interviews         : ${snapshot.outcomes.interviewsCount}`);
  console.log(` Offers             : ${snapshot.outcomes.offersCount}\n`);

  console.log('4. RECOVERY & SAFETY ISOLATION');
  console.log('------------------------------');
  console.log(` Scheduler Status   : ${snapshot.system.schedulerStatus}`);
  console.log(` Telegram Calls     : ${snapshot.reliability.telegramNetworkCalls}`);
  console.log(` Playwright Launches: ${snapshot.reliability.playwrightLaunches}\n`);

  console.log('============================================================');
  console.log('OPERATIONS DASHBOARD COMPLETED (READ-ONLY)');
  console.log('============================================================');
}

if (require.main === module) {
  main();
}

module.exports = { main };

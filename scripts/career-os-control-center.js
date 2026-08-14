const {
  generateCareerOSControlCenterSnapshot,
  generateCareerOSControlCenterReport,
  getCareerOSControlCenterStatus,
  getCareerOSControlCenterTimeline,
  getCareerOSControlCenterAlerts,
  getCareerOSControlCenterMetrics,
  getCareerOSControlCenterIntelligence,
  startCareerOSRuntime,
  stopCareerOSRuntime,
  restartCareerOSRuntime
} = require('../src/intelligence/career.os.control.center');

async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status') || args.length === 0;
  const isCheck = args.includes('--check');
  const isTimeline = args.includes('--timeline');
  const isAlerts = args.includes('--alerts');
  const isMetrics = args.includes('--metrics');
  const isIntelligence = args.includes('--intelligence');
  const isJson = args.includes('--json');
  const isAudit = args.includes('--audit');
  const isStart = args.includes('--start');
  const isStop = args.includes('--stop');
  const isRestart = args.includes('--restart');

  const opts = { skipSave: true, suppressTelegram: true };

  if (isIntelligence) {
    const intel = getCareerOSControlCenterIntelligence(opts);
    console.log(intel.renderedText);
    return;
  }

  if (isJson) {
    const report = generateCareerOSControlCenterReport(opts);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (isAudit) {
    const { runPhaseP330ControlCenterAudit } = require('./audit-phase-p3-30-control-center');
    await runPhaseP330ControlCenterAudit();
    return;
  }

  if (isStart) {
    const startRes = await startCareerOSRuntime(opts);
    console.log('============================================================');
    console.log('CONTROL CENTER: RUNTIME START');
    console.log('============================================================\n');
    console.log(` Status       : ${startRes.runtimeStatus}`);
    console.log(` Readiness    : ${startRes.readinessCode || 'RUNTIME_READY'}`);
    console.log('============================================================');
    return;
  }

  if (isStop) {
    const stopRes = stopCareerOSRuntime(opts);
    console.log('============================================================');
    console.log('CONTROL CENTER: RUNTIME STOP');
    console.log('============================================================\n');
    console.log(` Status       : ${stopRes.runtimeStatus}`);
    console.log('============================================================');
    return;
  }

  if (isRestart) {
    const restartRes = await restartCareerOSRuntime(opts);
    console.log('============================================================');
    console.log('CONTROL CENTER: RUNTIME RESTART');
    console.log('============================================================\n');
    console.log(` Status       : ${restartRes.runtimeStatus}`);
    console.log('============================================================');
    return;
  }

  if (isTimeline) {
    const timeline = getCareerOSControlCenterTimeline(opts);
    console.log('============================================================');
    console.log('CAREER OS CONTROL CENTER TIMELINE');
    console.log('============================================================\n');
    if (timeline.length === 0) {
      console.log(' No operational events recorded.');
    } else {
      timeline.forEach((t) => {
        console.log(` [${t.timestamp}] ${t.type.padEnd(20)}: ${t.details}`);
      });
    }
    console.log('\n============================================================');
    return;
  }

  if (isAlerts) {
    const alerts = getCareerOSControlCenterAlerts(opts);
    console.log('============================================================');
    console.log('CAREER OS CONTROL CENTER ALERTS');
    console.log('============================================================\n');
    if (alerts.length === 0) {
      console.log(' [PASS] No active operational alerts.');
    } else {
      alerts.forEach((a) => {
        console.log(` [${a.severity}] ${a.alertId}: ${a.message}`);
      });
    }
    console.log('\n============================================================');
    return;
  }

  if (isMetrics) {
    const metrics = getCareerOSControlCenterMetrics(opts);
    console.log('============================================================');
    console.log('CAREER OS CONTROL CENTER METRICS');
    console.log('============================================================\n');
    Object.entries(metrics).forEach(([k, v]) => {
      console.log(` ${k.padEnd(30)} : ${v !== null ? v : 'null'}`);
    });
    console.log('\n============================================================');
    return;
  }

  if (isStatus || isCheck) {
    const snapshot = generateCareerOSControlCenterSnapshot(opts);

    console.log('============================================================');
    console.log('CAREER OS OPERATOR CONTROL CENTER');
    console.log('============================================================\n');

    console.log('Runtime');
    console.log('-------');
    console.log(`Status                : ${snapshot.runtime.status}`);
    console.log(`Readiness             : ${snapshot.runtime.readiness}`);
    console.log(`Started At            : ${snapshot.runtime.startedAt || 'NONE'}`);
    console.log(`Stopped At            : ${snapshot.runtime.stoppedAt || 'NONE'}\n`);

    console.log('Governance');
    console.log('----------');
    console.log(`Status                : ${snapshot.governance.status}`);
    console.log(`Operator Mode          : ${snapshot.governance.mode}`);
    console.log(`Autonomous Submit     : ${snapshot.governance.autonomousSubmissionsAllowed ? 'ALLOWED' : 'BLOCKED'}`);
    console.log(`Ambiguous Recovery    : BLOCKED`);
    console.log(`Enforcement            : ${snapshot.enforcement.active ? 'ACTIVE' : 'INACTIVE'}\n`);

    console.log('Health');
    console.log('------');
    console.log(`Overall               : ${snapshot.health.overall}`);
    console.log(`Active Alerts         : ${snapshot.health.activeAlerts}`);
    console.log(`Active Anomalies      : ${snapshot.health.activeAnomalies}\n`);

    console.log('Operations');
    console.log('----------');
    console.log(`Jobs Discovered       : ${snapshot.operations.discoveredJobs}`);
    console.log(`Matched Jobs          : ${snapshot.operations.matchedJobs}`);
    console.log(`High Match Jobs       : ${snapshot.operations.highMatchJobs}`);
    console.log(`Queued Applications   : ${snapshot.operations.queuedApplications}`);
    console.log(`Submitted Applications: ${snapshot.operations.submittedApplications}`);
    console.log(`Engaged Applications  : ${snapshot.operations.engagedApplications}\n`);

    console.log('Incidents');
    console.log('---------');
    console.log(`Open                  : ${snapshot.incidents.open}`);
    console.log(`Acknowledged          : ${snapshot.incidents.acknowledged}`);
    console.log(`Recovering            : ${snapshot.incidents.recovering}`);
    console.log(`Resolved              : ${snapshot.incidents.resolved}\n`);

    console.log('Recovery');
    console.log('--------');
    console.log(`Retryable             : ${snapshot.recovery.retryable ? 'YES' : 'NO'}`);
    console.log(`Already Engaged       : BLOCKED`);
    console.log(`Ambiguous             : BLOCKED\n`);

    console.log('Schedulers');
    console.log('----------');
    console.log(`Runtime Scheduler     : ${snapshot.schedulers.runtimeScheduler}`);
    console.log(`Response Scheduler    : ${snapshot.schedulers.responseScheduler}`);
    console.log(`Incident Scheduler    : ${snapshot.schedulers.incidentScheduler}`);
    console.log(`Decision Scheduler    : ${snapshot.schedulers.decisionScheduler}\n`);

    console.log('Telegram');
    console.log('--------');
    console.log(`Governed              : ${snapshot.telegram.governed ? 'YES' : 'NO'}`);
    console.log(`Network Calls         : ${snapshot.telegram.networkCalls}`);
    console.log(`Test Isolation        : ${snapshot.telegram.testIsolation}\n`);

    console.log('Data Integrity');
    console.log('--------------');
    console.log(`Core Stores           : ${snapshot.dataIntegrity.verified ? 'VERIFIED' : 'FAILED'}`);
    console.log(`Fingerprint           : ${snapshot.fingerprint.slice(0, 16)}...\n`);

    console.log('Operator Attention');
    console.log('------------------');
    console.log(`Level                 : ${snapshot.operatorAttention.level}`);
    console.log(`Reason                : ${snapshot.operatorAttention.reasons.join(', ') || 'NONE'}\n`);

    console.log('============================================================');
    console.log('CONTROL CENTER COMPLETED');
    console.log('============================================================');
    return;
  }
}

if (require.main === module) {
  main().catch((err) => console.error('CLI error:', err));
}

module.exports = { main };

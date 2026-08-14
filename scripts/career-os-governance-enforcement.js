const {
  getCareerOSGovernanceState
} = require('../src/intelligence/career.os.governance');
const {
  evaluateCareerOSExecutionPermission,
  evaluateCareerOSIncidentResponsePermission,
  evaluateCareerOSTelegramPermission,
  evaluateCareerOSSchedulerPermission,
  evaluateCareerOSRecoveryPermission
} = require('../src/intelligence/career.os.governance.enforcement');

function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status');
  const isAudit = args.includes('--audit');
  const isJson = args.includes('--json');

  const state = getCareerOSGovernanceState();
  const appEval = evaluateCareerOSExecutionPermission('AUTONOMOUS_SUBMISSION');
  const incidentEval = evaluateCareerOSIncidentResponsePermission({ incidentType: 'HEALTH_REGRESSION' }, {});
  const telegramEval = evaluateCareerOSTelegramPermission('ALERT');
  const schedulerEval = evaluateCareerOSSchedulerPermission('ResponseScheduler');
  const recoveryEval = evaluateCareerOSRecoveryPermission({ isAmbiguous: true });
  const failClosedEval = evaluateCareerOSExecutionPermission('TEST', {}, { customGovernanceState: null });

  const summary = {
    governanceStatus: state.governanceStatus || 'ACTIVE',
    operatorMode: state.operatorMode || 'NORMAL',
    applicationExecution: appEval.code,
    incidentResponse: incidentEval.code,
    telegramNotifications: telegramEval.code,
    schedulers: schedulerEval.code,
    ambiguousRecovery: recoveryEval.code,
    failClosedState: failClosedEval.code,
    enforcementStatus: 'ENFORCEMENT_ACTIVE'
  };

  if (isJson) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (isAudit) {
    const { runPhaseP327Audit } = require('./audit-phase-p3-27-governance-enforcement');
    runPhaseP327Audit().catch((err) => console.error('Audit error:', err));
    return;
  }

  // Default output --status
  console.log('============================================================');
  console.log('CAREER OS GOVERNANCE ENFORCEMENT MATRIX');
  console.log('============================================================\n');

  console.log(` Governance Status       : ${summary.governanceStatus}`);
  console.log(` Operator Mode           : ${summary.operatorMode}`);
  console.log(` Application Execution   : ${summary.applicationExecution}`);
  console.log(` Incident Response       : ${summary.incidentResponse}`);
  console.log(` Telegram Notifications : ${summary.telegramNotifications}`);
  console.log(` Schedulers              : ${summary.schedulers}`);
  console.log(` Ambiguous Recovery      : ${summary.ambiguousRecovery}`);
  console.log(` Fail-Closed State       : ${summary.failClosedState}`);
  console.log(` Enforcement Status      : ${summary.enforcementStatus}\n`);

  console.log('============================================================');
  console.log('ENFORCEMENT MATRIX COMPLETED (READ-ONLY)');
  console.log('============================================================');
}

if (require.main === module) {
  main();
}

module.exports = { main };

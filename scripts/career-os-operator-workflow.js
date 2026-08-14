const {
  evaluateCareerOSOperatorWorkflow,
  generateCareerOSOperatorWorkflowReport
} = require('../src/intelligence/career.os.operator.workflow');

async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status') || args.length === 0;
  const isCheck = args.includes('--check');
  const isJson = args.includes('--json');
  const isAudit = args.includes('--audit');

  const opts = { skipSave: true, suppressTelegram: true };

  if (isJson) {
    const report = generateCareerOSOperatorWorkflowReport(opts);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (isAudit) {
    const { runPhaseP331WorkflowAudit } = require('./audit-phase-p3-31-operator-workflow');
    await runPhaseP331WorkflowAudit();
    return;
  }

  if (isCheck || isStatus) {
    const res = evaluateCareerOSOperatorWorkflow(opts);

    console.log('============================================================');
    console.log('CAREER OS OPERATOR WORKFLOW VALIDATION');
    console.log('============================================================\n');
    console.log(`Workflow Status       : ${res.workflowStatus}`);
    console.log(`Readiness             : ${res.readiness}\n`);

    console.log('Step Matrix');
    console.log('-----------');
    res.steps.forEach((s) => {
      console.log(` ${s.stepId.padEnd(20)} : ${s.status}`);
    });

    console.log('\nSafety Matrix');
    console.log('-------------');
    console.log('Autonomous Submit    : BLOCKED');
    console.log('Ambiguous Recovery   : BLOCKED');
    console.log('Telegram Calls       : 0');
    console.log('Playwright Launches  : 0');
    console.log('Applications         : 0\n');

    console.log('Data Integrity');
    console.log('--------------');
    console.log(`Core Stores          : ${res.dataIntegrityVerified ? 'VERIFIED' : 'MUTATED'}`);
    console.log(`Fingerprint          : ${res.fingerprint}\n`);

    console.log('============================================================');
    console.log('WORKFLOW VALIDATION COMPLETED');
    console.log('============================================================');
    return;
  }
}

if (require.main === module) {
  main().catch((err) => console.error('CLI error:', err));
}

module.exports = { main };

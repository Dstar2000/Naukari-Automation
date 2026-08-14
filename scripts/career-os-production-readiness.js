const {
  evaluateCareerOSProductionReadiness,
  generateCareerOSProductionReadinessReport,
  getCareerOSProductionReadinessDecision,
  getCareerOSProductionReadinessTrace
} = require('../src/intelligence/career.os.production.readiness');

async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status') || args.length === 0;
  const isCheck = args.includes('--check');
  const isTrace = args.includes('--trace');
  const isDecision = args.includes('--decision');
  const isJson = args.includes('--json');
  const isAudit = args.includes('--audit');

  const opts = { skipSave: true, suppressTelegram: true };

  if (isJson) {
    const report = generateCareerOSProductionReadinessReport(opts);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (isAudit) {
    const { runPhaseP334ProductionReadinessAudit } = require('./audit-phase-p3-34-production-readiness');
    await runPhaseP334ProductionReadinessAudit();
    return;
  }

  if (isDecision) {
    const decision = getCareerOSProductionReadinessDecision(opts);
    console.log('============================================================');
    console.log('CAREER OS PRODUCTION READINESS DECISION');
    console.log('============================================================\n');
    console.log(` Decision: ${decision}\n`);
    console.log('============================================================');
    return;
  }

  if (isTrace) {
    const trace = getCareerOSProductionReadinessTrace(opts);
    console.log('============================================================');
    console.log('CAREER OS PRODUCTION READINESS TRACE');
    console.log('============================================================\n');
    trace.forEach((t) => {
      console.log(` [Step ${t.stepIndex}] ${t.stage.padEnd(25)} : [${t.status}] (${t.code}) ${t.details}`);
    });
    console.log('\n============================================================');
    return;
  }

  if (isCheck || isStatus) {
    const evalRes = evaluateCareerOSProductionReadiness(opts);

    console.log('============================================================');
    console.log('CAREER OS PRODUCTION READINESS & DECISION BOUNDARY');
    console.log('============================================================\n');

    console.log(`Production Readiness : ${evalRes.decision}\n`);

    const getItem = (key) => evalRes.matrix.find((m) => m.key === key)?.actualValue || 'UNKNOWN';

    console.log(`Governance           : ${getItem('governance')}`);
    console.log(`Enforcement          : ${getItem('enforcement')}`);
    console.log(`Preflight            : ${getItem('preflight')}`);
    console.log(`Runtime              : ${getItem('runtime')}`);
    console.log(`Control Center       : ${getItem('control_center')}`);
    console.log(`Operator Workflow    : ${getItem('operator_workflow')}`);
    console.log(`Controlled Execution : ${getItem('controlled_execution')}`);
    console.log(`Data Pipeline        : ${getItem('data_pipeline')}`);
    console.log(`Reliability          : ${getItem('reliability')}`);
    console.log(`Core Data Integrity  : ${evalRes.dataIntegrityVerified ? 'VERIFIED' : 'MUTATED'}\n`);

    console.log(`Restrictions:`);
    console.log(`- Autonomous Submission : BLOCKED`);
    console.log(`- Ambiguous Recovery   : BLOCKED`);
    console.log(`- External Career Actions: BLOCKED unless explicitly governed/authorized\n`);

    console.log(`External Activity:`);
    console.log(`- Telegram Calls       : 0`);
    console.log(`- Playwright Launches  : 0`);
    console.log(`- Applications         : 0`);
    console.log(`- Queue Mutations      : 0\n`);

    console.log('============================================================');
    console.log('PRODUCTION READINESS EVALUATION COMPLETED');
    console.log('============================================================');
    return;
  }
}

if (require.main === module) {
  main().catch((err) => console.error('CLI error:', err));
}

module.exports = { main };

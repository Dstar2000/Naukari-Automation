const {
  runCareerOSProductionSafetyCheck,
  generateCareerOSProductionSafetyReport
} = require('../src/intelligence/career.os.production.safety');

async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status');
  const isSimulate = args.includes('--simulate');
  const isAudit = args.includes('--audit');
  const isJson = args.includes('--json');

  if (isJson) {
    const report = await generateCareerOSProductionSafetyReport();
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (isAudit) {
    const { runPhaseP328Audit } = require('./audit-phase-p3-28-production-safety');
    await runPhaseP328Audit();
    return;
  }

  if (isSimulate || isStatus) {
    console.log('============================================================');
    console.log('CAREER OS PRODUCTION SAFETY & DISASTER RECOVERY MATRIX');
    console.log('============================================================\n');

    const report = await runCareerOSProductionSafetyCheck({ skipSave: true, suppressTelegram: true });
    const r = report;

    console.log(` Overall Safety Status  : ${r.overallStatus}`);
    console.log(` Reliability Harness    : ${r.reliabilityStatus}\n`);

    console.log('1. DISASTER RECOVERY & RESTART MATRIX');
    console.log('------------------------------------');
    console.log(` Process Restart        : ${r.restart.status}`);
    console.log(` Scheduler Restarts     : ${r.schedRestart.restarts} cycles (SAFE)`);
    console.log(` Governance Preserved   : ${r.restart.governancePreserved ? 'YES' : 'NO'}`);
    console.log(` Recovery State Preserved: ${r.restart.recoveryStatePreserved ? 'YES' : 'NO'}\n`);

    console.log('2. CONCURRENCY & ISOLATION MATRIX');
    console.log('--------------------------------');
    console.log(` Concurrent Execution  : ${r.concurrent.success ? 'SAFE' : 'FAILED'} (${r.concurrent.rejectedCount}/${r.concurrent.totalAttempts} rejected)`);
    console.log(` Governance Fail-Closed : ${r.corruption.failClosed ? 'PASSED' : 'FAILED'}`);
    console.log(` Partial Failure Recovery: ${r.partialFail.success ? 'SAFE' : 'FAILED'}`);
    console.log(` Telegram Failure       : ${r.tgFail.isolated ? 'ISOLATED' : 'FAILED'}`);
    console.log(` Playwright Failure     : ${r.pwFail.success ? 'ISOLATED' : 'FAILED'}\n`);

    console.log('3. CROSS-LAYER INVARIANT MATRIX');
    console.log('-------------------------------');
    Object.entries(r.invariantMatrix).forEach(([key, val]) => {
      console.log(` ${key.padEnd(25)} : ${val ? 'TRUE' : 'FALSE'}`);
    });

    console.log('\n============================================================');
    console.log('PRODUCTION SAFETY MATRIX COMPLETED (READ-ONLY)');
    console.log('============================================================');
    return;
  }

  // Default behavior
  console.log('Usage: node scripts/career-os-production-safety.js [--status|--simulate|--audit|--json]');
}

if (require.main === module) {
  main().catch((err) => console.error('CLI error:', err));
}

module.exports = { main };

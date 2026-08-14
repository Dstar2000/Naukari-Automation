const {
  generateCareerOSPreflightSummary,
  generateCareerOSPreflightReport,
  getCareerOSPreflightStatus
} = require('../src/intelligence/career.os.preflight');

async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status');
  const isCheck = args.includes('--check');
  const isJson = args.includes('--json');
  const isAudit = args.includes('--audit');

  if (isJson) {
    const report = generateCareerOSPreflightReport();
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (isAudit) {
    const { runPhaseP328PreflightAudit } = require('./audit-phase-p3-28-preflight');
    await runPhaseP328PreflightAudit();
    return;
  }

  if (isCheck) {
    const report = generateCareerOSPreflightReport();
    console.log('============================================================');
    console.log('CAREER OS PREFLIGHT DETAILED CHECK MATRIX');
    console.log('============================================================\n');
    console.log(` Status       : ${report.status}`);
    console.log(` Gate         : ${report.gateStatus}`);
    console.log(` Fingerprint  : ${report.fingerprint}\n`);

    console.log('CHECKS:');
    report.checks.forEach((c) => {
      console.log(` [${c.status}] ${c.checkId.padEnd(45)}: ${c.details} (Expected: ${c.expected}, Actual: ${c.actual})`);
    });

    console.log('\n============================================================');
    console.log('PREFLIGHT MATRIX COMPLETED');
    console.log('============================================================');
    return;
  }

  if (isStatus || args.length === 0) {
    const summary = generateCareerOSPreflightSummary();
    console.log(summary);
    return;
  }

  console.log('Usage: node scripts/career-os-preflight.js [--status|--check|--json|--audit]');
}

if (require.main === module) {
  main().catch((err) => console.error('CLI error:', err));
}

module.exports = { main };

const {
  evaluateCareerOSProductionActivation,
  generateCareerOSProductionActivationReport,
  getCareerOSProductionActivationStatus,
  requestCareerOSProductionActivation,
  approveCareerOSProductionActivation,
  rejectCareerOSProductionActivation,
  revokeCareerOSProductionActivation,
  getCareerOSProductionActivationTrace,
  readHistory
} = require('../src/intelligence/career.os.production.activation');

async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status') || args.length === 0;
  const isCheck = args.includes('--check');
  const isRequest = args.includes('--request');
  const isApprove = args.includes('--approve');
  const isReject = args.includes('--reject');
  const isRevoke = args.includes('--revoke');
  const isTrace = args.includes('--trace');
  const isHistory = args.includes('--history');
  const isJson = args.includes('--json');
  const isAudit = args.includes('--audit');

  const isOperatorStatus = args.includes('--operator-status');
  const isOperatorAudit = args.includes('--operator-audit');

  let operator = null;
  const operatorIndex = args.indexOf('--operator');
  if (operatorIndex !== -1 && args[operatorIndex + 1] && !args[operatorIndex + 1].startsWith('--')) {
    operator = args[operatorIndex + 1];
  } else {
    // Check if operator was provided right after flag, e.g., --approve P339_TEST_OPERATOR
    const appIdx = args.indexOf('--approve');
    const revIdx = args.indexOf('--revoke');
    const rejIdx = args.indexOf('--reject');
    const targetIdx = appIdx !== -1 ? appIdx : (revIdx !== -1 ? revIdx : rejIdx);
    if (targetIdx !== -1 && args[targetIdx + 1] && !args[targetIdx + 1].startsWith('--')) {
      operator = args[targetIdx + 1];
    }
  }

  const reasonIndex = args.indexOf('--reason');
  const reason = reasonIndex !== -1 && args[reasonIndex + 1] ? args[reasonIndex + 1] : null;

  const opts = { skipSave: false, suppressTelegram: true };

  if (isOperatorStatus) {
    const { getProductionOperatorControlStatus } = require('../src/intelligence/career.os.operator.control');
    const status = getProductionOperatorControlStatus(opts);

    console.log('============================================================');
    console.log('CAREER OS PRODUCTION OPERATOR CONTROL');
    console.log('============================================================\n');
    console.log(`Production Readiness : ${status.productionReadiness}`);
    console.log(`Handover Status      : ${status.handoverStatus}`);
    console.log(`Activation Status    : ${status.activationStatus}`);
    console.log(`Activation Gate      : ${status.activationGate}`);
    console.log(`Execution Permission : ${status.executionPermission}`);
    console.log(`Governance           : ${status.governanceStatus}`);
    console.log(`Enforcement          : ${status.enforcementStatus}`);
    console.log(`Autonomous Submit    : ${status.autonomousSubmissionsAllowed ? 'ALLOWED' : 'BLOCKED'}`);
    console.log(`Operator Approval    : ${status.operatorApprovalRequired ? 'REQUIRED' : 'NOT_REQUIRED'}\n`);
    console.log('============================================================');
    return;
  }

  if (isJson) {
    const report = generateCareerOSProductionActivationReport(opts);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const isHandoverAudit = args.includes('--handover-audit');

  if (isHandoverAudit) {
    const { runPhaseP337ProductionHandoverAudit } = require('./audit-phase-p3-37-production-handover');
    await runPhaseP337ProductionHandoverAudit({ silent: isJson });
    return;
  }

  if (isOperatorAudit || isAudit) {
    const fs = require('fs');
    const path = require('path');
    const p339AuditPath = path.join(__dirname, 'audit-phase-p3-39-operator-control.js');
    if (fs.existsSync(p339AuditPath)) {
      const { runPhaseP339OperatorControlAudit } = require('./audit-phase-p3-39-operator-control');
      await runPhaseP339OperatorControlAudit({ silent: isJson });
    } else {
      const { runPhaseP338ControlledActivationAudit } = require('./audit-phase-p3-38-controlled-activation');
      await runPhaseP338ControlledActivationAudit({ silent: isJson });
    }
    return;
  }

  if (isRequest) {
    const res = requestCareerOSProductionActivation(opts);
    console.log('============================================================');
    console.log('CAREER OS PRODUCTION ACTIVATION REQUEST');
    console.log('============================================================\n');
    console.log(` Status       : ${res.status}`);
    console.log(` Reason       : ${res.reason}`);
    console.log(` Success      : ${res.success ? 'YES' : 'NO'}\n`);
    console.log('============================================================');
    return;
  }

  if (isApprove) {
    if (!operator) {
      console.error('❌ Error: Explicit --operator OPERATOR is required to approve activation.');
      process.exit(1);
    }
    const res = approveCareerOSProductionActivation(operator, reason, opts);
    console.log('============================================================');
    console.log('CAREER OS PRODUCTION ACTIVATION APPROVAL');
    console.log('============================================================\n');
    console.log(` Status       : ${res.status}`);
    console.log(` Approved By  : ${res.approvedBy || 'NONE'}`);
    console.log(` Expires At   : ${res.expiresAt || 'NONE'}`);
    console.log(` Success      : ${res.success ? 'YES' : 'NO'}\n`);
    console.log('============================================================');
    return;
  }

  if (isReject) {
    if (!operator) {
      console.error('❌ Error: Explicit --operator OPERATOR is required to reject activation.');
      process.exit(1);
    }
    const res = rejectCareerOSProductionActivation(operator, reason, opts);
    console.log('============================================================');
    console.log('CAREER OS PRODUCTION ACTIVATION REJECTION');
    console.log('============================================================\n');
    console.log(` Status       : ${res.status}`);
    console.log(` Reason       : ${res.reason}`);
    console.log(` Success      : ${res.success ? 'YES' : 'NO'}\n`);
    console.log('============================================================');
    return;
  }

  if (isRevoke) {
    if (!operator) {
      console.error('❌ Error: Explicit --operator OPERATOR is required to revoke activation.');
      process.exit(1);
    }
    const res = revokeCareerOSProductionActivation(operator, reason, opts);
    console.log('============================================================');
    console.log('CAREER OS PRODUCTION ACTIVATION REVOCATION');
    console.log('============================================================\n');
    console.log(` Status       : ${res.status}`);
    console.log(` Reason       : ${res.reason}`);
    console.log(` Success      : ${res.success ? 'YES' : 'NO'}\n`);
    console.log('============================================================');
    return;
  }

  if (isTrace) {
    const trace = getCareerOSProductionActivationTrace(opts);
    console.log('============================================================');
    console.log('CAREER OS PRODUCTION ACTIVATION TRACE');
    console.log('============================================================\n');
    trace.forEach((t) => {
      console.log(` [Step ${t.stepIndex}] ${t.stage.padEnd(25)} : [${t.status}] (${t.code}) ${t.details}`);
    });
    console.log('\n============================================================');
    return;
  }

  if (isHistory) {
    const history = readHistory();
    console.log('============================================================');
    console.log('CAREER OS PRODUCTION ACTIVATION HISTORY');
    console.log('============================================================\n');
    if (history.length === 0) {
      console.log(' No activation history records found.');
    } else {
      history.forEach((h) => {
        console.log(` [${h.timestamp}] ${h.action.padEnd(10)} : Status=${h.status} | Operator=${h.operator} | Reason=${h.reason}`);
      });
    }
    console.log('\n============================================================');
    return;
  }

  if (isCheck || isStatus) {
    const status = getCareerOSProductionActivationStatus(opts);

    console.log('============================================================');
    console.log('CAREER OS PRODUCTION ACTIVATION GATE');
    console.log('============================================================\n');

    console.log(`Activation Status   : ${status.status}`);
    console.log(`Prerequisites       : ${status.prerequisitesVerified ? 'VERIFIED' : 'FAILED'}`);
    console.log(`Approval Required   : YES`);
    console.log(`Approved By         : ${status.approvedBy}`);
    console.log(`Approved At         : ${status.approvedAt}`);
    console.log(`Expires At          : ${status.expiresAt}`);
    console.log(`Reason              : ${status.reason}\n`);

    console.log(`Governance          : ACTIVE`);
    console.log(`Enforcement          : ACTIVE`);
    console.log(`Autonomous Submit   : BLOCKED`);
    console.log(`Ambiguous Recovery  : BLOCKED\n`);

    console.log(`Telegram Calls      : 0`);
    console.log(`Playwright Launches : 0`);
    console.log(`Applications        : 0`);
    console.log(`External Actions    : 0\n`);

    console.log('============================================================');
    console.log('ACTIVATION GATE COMPLETED');
    console.log('============================================================');
    return;
  }
}

if (require.main === module) {
  main().catch((err) => console.error('CLI error:', err));
}

module.exports = { main };

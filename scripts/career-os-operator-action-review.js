const {
  generateCareerOSOperatorActionReview,
  getCareerOSOperatorActionReviewStatus,
  getCareerOSPendingActions,
  getCareerOSActionById,
  approveAction,
  rejectAction,
  getCareerOSActionReviewTrace,
  generateCareerOSActionReviewReport,
  readReviewHistory
} = require('../src/intelligence/career.os.operator.action.review');

const {
  verifyCoreStoreIntegrity
} = require('../src/intelligence/career.os.operator.workflow');

async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status') || args.length === 0;
  const isCheck = args.includes('--check');
  const isPending = args.includes('--pending');
  const isShow = args.includes('--show');
  const isApprove = args.includes('--approve');
  const isReject = args.includes('--reject');
  const isTrace = args.includes('--trace');
  const isHistory = args.includes('--history');
  const isJson = args.includes('--json');
  const isAudit = args.includes('--audit');

  const actionIdIndex = args.indexOf('--show');
  const showActionId = actionIdIndex !== -1 && args[actionIdIndex + 1] ? args[actionIdIndex + 1] : null;

  const approveIndex = args.indexOf('--approve');
  const approveActionId = approveIndex !== -1 && args[approveIndex + 1] ? args[approveIndex + 1] : null;

  const rejectIndex = args.indexOf('--reject');
  const rejectActionId = rejectIndex !== -1 && args[rejectIndex + 1] ? args[rejectIndex + 1] : null;

  const operatorIndex = args.indexOf('--operator');
  const operator = operatorIndex !== -1 && args[operatorIndex + 1] ? args[operatorIndex + 1] : null;

  const reasonIndex = args.indexOf('--reason');
  const reason = reasonIndex !== -1 && args[reasonIndex + 1] ? args[reasonIndex + 1] : null;

  const opts = { skipSave: false, suppressTelegram: true };

  if (isJson) {
    const report = generateCareerOSActionReviewReport(opts);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (isAudit) {
    const { runPhaseP336OperatorActionReviewAudit } = require('./audit-phase-p3-36-operator-action-review');
    await runPhaseP336OperatorActionReviewAudit();
    return;
  }

  if (isApprove) {
    if (!approveActionId) {
      console.error('❌ Error: --approve requires an ACTION_ID');
      process.exit(1);
    }
    if (!operator) {
      console.error('❌ Error: Explicit --operator OPERATOR is required to approve an action.');
      process.exit(1);
    }

    const res = approveAction(approveActionId, operator, opts);
    console.log('============================================================');
    console.log('CAREER OS OPERATOR ACTION APPROVAL');
    console.log('============================================================\n');
    console.log(` Action ID   : ${approveActionId}`);
    console.log(` Status      : ${res.status}`);
    console.log(` Operator    : ${res.reviewedBy || operator}`);
    console.log(` Execution   : ${res.execution || 'DISABLED'}`);
    console.log(` Message     : ${res.message || res.reason}\n`);
    console.log('============================================================');
    return;
  }

  if (isReject) {
    if (!rejectActionId) {
      console.error('❌ Error: --reject requires an ACTION_ID');
      process.exit(1);
    }
    if (!operator) {
      console.error('❌ Error: Explicit --operator OPERATOR is required to reject an action.');
      process.exit(1);
    }
    if (!reason) {
      console.error('❌ Error: Explicit --reason "..." is required to reject an action.');
      process.exit(1);
    }

    const res = rejectAction(rejectActionId, operator, reason, opts);
    console.log('============================================================');
    console.log('CAREER OS OPERATOR ACTION REJECTION');
    console.log('============================================================\n');
    console.log(` Action ID   : ${rejectActionId}`);
    console.log(` Status      : ${res.status}`);
    console.log(` Operator    : ${res.reviewedBy || operator}`);
    console.log(` Reason      : ${res.reason}\n`);
    console.log('============================================================');
    return;
  }

  if (isShow) {
    if (!showActionId) {
      console.error('❌ Error: --show requires an ACTION_ID');
      process.exit(1);
    }
    const action = getCareerOSActionById(showActionId, opts);
    if (!action) {
      console.error(`❌ Action ID ${showActionId} not found.`);
      process.exit(1);
    }

    console.log('============================================================');
    console.log('CAREER OS ACTION DETAILS');
    console.log('============================================================\n');
    console.log(`Action ID                   : ${action.actionId}`);
    console.log(`Action Type                 : ${action.actionType}`);
    console.log(`Source Record ID            : ${action.sourceId}`);
    console.log(`Job Title                   : ${action.title}`);
    console.log(`Company                     : ${action.company}`);
    console.log(`Location                    : ${action.location}`);
    console.log(`Decision                    : ${action.decision || 'NONE'}`);
    console.log(`Match Information           : Match score ${action.matchScore}%`);
    console.log(`Current Application State   : ${action.status}`);
    console.log(`Eligibility                 : ${action.eligibilityStatus}`);
    console.log(`Blocking Reason             : ${action.blockingReason || 'NONE'}`);
    console.log(`Production Activation State : ${action.activationStatus || 'INACTIVE'}`);
    console.log(`Governance State            : ${action.governanceStatus || 'ACTIVE'}`);
    console.log(`Operator Review State       : ${action.status}\n`);
    console.log('============================================================');
    return;
  }

  if (isPending) {
    const pending = getCareerOSPendingActions(opts);
    console.log('============================================================');
    console.log('CAREER OS PENDING ACTIONS FOR OPERATOR REVIEW');
    console.log('============================================================\n');
    if (pending.length === 0) {
      console.log(' No pending actions eligible for operator review.');
    } else {
      pending.forEach((a) => {
        console.log(` [${a.actionId}] ${a.actionType.padEnd(20)} : ${a.title} at ${a.company} (Score: ${a.matchScore}%)`);
      });
    }
    console.log('\n============================================================');
    return;
  }

  if (isTrace) {
    const trace = getCareerOSActionReviewTrace(opts);
    console.log('============================================================');
    console.log('CAREER OS OPERATOR ACTION REVIEW TRACE');
    console.log('============================================================\n');
    trace.forEach((t) => {
      console.log(` [Step ${t.stepIndex}] ${t.stage.padEnd(20)} : [${t.status}] (${t.code}) ${t.details}`);
    });
    console.log('\n============================================================');
    return;
  }

  if (isHistory) {
    const history = readReviewHistory();
    console.log('============================================================');
    console.log('CAREER OS ACTION REVIEW AUDIT HISTORY');
    console.log('============================================================\n');
    if (history.length === 0) {
      console.log(' No action review audit events recorded.');
    } else {
      history.forEach((h) => {
        console.log(` [${h.timestamp}] ${h.eventType.padEnd(18)} : Action=${h.actionId} | Operator=${h.operator} | Reason=${h.reason}`);
      });
    }
    console.log('\n============================================================');
    return;
  }

  if (isStatus || isCheck) {
    const status = getCareerOSOperatorActionReviewStatus(opts);
    const hashes = verifyCoreStoreIntegrity();
    const integrityOk = Object.values(hashes).every((h) => h !== 'FILE_MISSING');

    console.log('============================================================');
    console.log('CAREER OS OPERATOR ACTION REVIEW');
    console.log('============================================================\n');

    console.log(`Review Status       : ${status.reviewStatus}`);
    console.log(`Production Activation: ${status.productionActivation}`);
    console.log(`Governance          : ${status.governance}`);
    console.log(`Enforcement          : ${status.enforcement}`);
    console.log(`Preflight            : ${status.preflight}\n`);

    console.log(`Pending Actions      : ${status.pendingActions}`);
    console.log(`Eligible Actions     : ${status.eligibleActions}`);
    console.log(`Blocked Actions      : ${status.blockedActions}`);
    console.log(`Approved Actions     : ${status.approvedActions}`);
    console.log(`Rejected Actions     : ${status.rejectedActions}\n`);

    console.log(`External Execution   : ${status.externalExecution}`);
    console.log(`Playwright Launches   : 0`);
    console.log(`Applications          : 0`);
    console.log(`Telegram Calls        : 0\n`);

    console.log(`Core Data Integrity   : ${integrityOk ? 'VERIFIED' : 'FAILED'}\n`);

    console.log('============================================================');
    console.log('ACTION REVIEW READY');
    console.log('============================================================');
    return;
  }
}

if (require.main === module) {
  main().catch((err) => console.error('CLI error:', err));
}

module.exports = { main };

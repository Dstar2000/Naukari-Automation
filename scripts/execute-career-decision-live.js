const { resolveDecisionIdentity } = require('../src/intelligence/career-decision.approval');
const { evalExecutionPolicy } = require('../src/intelligence/career-decision.execution.policy');
const { executeApprovedDecision } = require('../src/intelligence/career-decision.execution.gateway');

async function main() {
  console.log('============================================================');
  console.log('PHASE P3.14 CAREER DECISION LIVE EXECUTION CONTROL');
  console.log('============================================================\n');

  const args = process.argv.slice(2);
  const decisionIdIdx = args.indexOf('--decision-id');
  const decisionId = decisionIdIdx >= 0 ? args[decisionIdIdx + 1] : null;
  const isConfirmed = args.includes('--confirm');

  if (!decisionId || !isConfirmed) {
    console.log('LIVE_EXECUTION_BLOCKED');
    console.log('To execute a controlled approved decision, run with:');
    console.log('  node scripts/execute-career-decision-live.js --decision-id <ID> --confirm');
    console.log('============================================================');
    return;
  }

  const identity = resolveDecisionIdentity(decisionId);
  if (!identity) {
    console.log(`❌ ERROR: Could not resolve decision identity for ID "${decisionId}". Execution aborted.`);
    console.log('============================================================');
    return;
  }

  console.log('DECISION TARGET EVALUATION');
  console.log('--------------------------');
  console.log(` Decision ID      : ${identity.decisionId}`);
  console.log(` Action Type      : ${identity.actionType}`);
  console.log(` Title            : ${identity.title}`);
  console.log(` Priority         : ${identity.priority} (Score: ${identity.score})`);
  console.log(` Approval Status  : ${identity.decisionStatus}`);

  const policyRes = await evalExecutionPolicy(identity, { executionConfirmed: true });
  console.log(` Eligibility Check : ${policyRes.eligible ? 'ELIGIBLE' : 'BLOCKED'}`);
  console.log(` Policy Reason    : ${policyRes.reason}\n`);

  if (!policyRes.eligible) {
    console.log('❌ EXECUTION BLOCKED BY POLICY GATEWAY.');
    console.log('============================================================');
    return;
  }

  console.log('Executing controlled application submission via existing executor...');
  const execRes = await executeApprovedDecision(decisionId, { executionConfirmed: true });

  console.log('\n============================================================');
  console.log('EXECUTION RESULT');
  console.log('============================================================');
  console.log(` Success     : ${execRes.success}`);
  console.log(` Reason      : ${execRes.reason}`);
  console.log(` App ID      : ${execRes.decision ? execRes.decision.executionApplicationId : 'N/A'}`);
  console.log('============================================================');
}

if (require.main === module) {
  main().catch((err) => console.error('Execution error:', err));
}

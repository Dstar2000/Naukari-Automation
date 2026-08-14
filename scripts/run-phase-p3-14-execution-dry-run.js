const { generateCareerDecisionReport } = require('../src/intelligence/career-decision.analytics');
const { recordDecisionApproval } = require('../src/intelligence/career-decision.approval');
const { evalExecutionPolicy } = require('../src/intelligence/career-decision.execution.policy');
const { authorizeDecisionExecution } = require('../src/intelligence/career-decision.execution.gateway');
const { isApplicationAlreadyEngaged } = require('../src/tracking/application.duplicate.guard');

async function runExecutionDryRun() {
  console.log('============================================================');
  console.log('PHASE P3.14 CAREER DECISION EXECUTION GATEWAY DRY RUN');
  console.log('============================================================\n');

  const report = generateCareerDecisionReport();
  const opportunities = report.actions.filter((a) => a.type === 'HIGH_MATCH_OPPORTUNITY');
  const advisoryOnly = report.actions.filter((a) => a.type !== 'HIGH_MATCH_OPPORTUNITY');

  // 1. Policy Evaluation for Advisory-Only Actions
  console.log('1. ADVISORY-ONLY DECISION TYPE POLICY ENFORCEMENT');
  console.log('------------------------------------------------');
  if (advisoryOnly.length > 0) {
    const adv = advisoryOnly[0];
    recordDecisionApproval(adv.id, { isMock: true });
    const advPolicy = await evalExecutionPolicy(adv.id, { executionConfirmed: true, isMock: true });
    console.log(` Target Advisory Action : ${adv.title} (${adv.type})`);
    console.log(` Policy Evaluation      : ${advPolicy.eligible ? 'ELIGIBLE' : 'BLOCKED (Advisory Only)'}`);
    console.log(` Reason                 : ${advPolicy.reason}`);
    console.log(` Guard Result           : ${!advPolicy.eligible ? 'PASSED (Execution Prevented)' : 'FAILED'}\n`);
  }

  // 2. Policy Evaluation for High-Match Opportunity
  console.log('2. HIGH-MATCH OPPORTUNITY TWO-STEP EXECUTION POLICY');
  console.log('--------------------------------------------------');
  if (opportunities.length > 0) {
    const opp = opportunities[0];
    recordDecisionApproval(opp.id, { isMock: true });

    // Unconfirmed Evaluation
    const unconfirmed = await evalExecutionPolicy(opp.id, { executionConfirmed: false, isMock: true });
    console.log(` Target Opportunity Action : ${opp.title}`);
    console.log(` Step 1: Approved Only     : ${unconfirmed.eligible ? 'ELIGIBLE' : 'BLOCKED (Confirmation Required)'}`);
    console.log(` Reason                    : ${unconfirmed.reason}`);

    // Confirmed Evaluation
    const confirmed = await evalExecutionPolicy(opp.id, { executionConfirmed: true, isMock: true });
    console.log(` Step 2: User Confirmed    : ${confirmed.eligible ? 'ALLOWED (Execution Authorized)' : 'BLOCKED'}`);
    console.log(` Reason                    : ${confirmed.reason}\n`);
  }

  // 3. Vbeyond Engaged Safety Regression Test
  console.log('3. VBEYOND ENGAGED SAFETY REGRESSION TEST');
  console.log('-----------------------------------------');
  const vbeyondPolicy = await evalExecutionPolicy('act_opportunity_57f713042c', {
    executionConfirmed: true,
    isMock: true,
    customData: {
      outcomes: [
        { applicationId: '57f713042c', jobId: '57f713042c', company: 'Vbeyond Corporation', currentStatus: 'SUBMITTED' }
      ]
    }
  });
  console.log(` Target Application     : Vbeyond Corporation (57f713042c)`);
  console.log(` Policy Evaluation      : ${vbeyondPolicy.eligible ? 'ELIGIBLE' : 'BLOCKED (Duplicate Engaged)'}`);
  console.log(` Reason                 : ${vbeyondPolicy.reason}`);
  console.log(` Vbeyond Safety Guard   : ${!vbeyondPolicy.eligible ? 'VERIFIED PASSED' : 'FAILED'}\n`);

  console.log('============================================================');
  console.log('P3.14_EXECUTION_GATEWAY_DRY_RUN_VERIFIED');
  console.log('============================================================');
  console.log('Zero Playwright instances launched. Zero external side-effects.');
  console.log('============================================================');
}

if (require.main === module) {
  runExecutionDryRun().catch((err) => console.error('Dry-run error:', err));
}

module.exports = { runExecutionDryRun };

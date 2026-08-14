const { generateCareerDecisionReport } = require('../src/intelligence/career-decision.analytics');

function runCLIDecisionReport() {
  const report = generateCareerDecisionReport();

  console.log('============================================================');
  console.log('CAREER DECISION INTELLIGENCE REPORT & ADVISORY ACTION QUEUE');
  console.log('============================================================');
  console.log(`Generated            : ${report.generatedAt}`);
  console.log(`Total Actions        : ${report.totalActions}`);
  console.log(`High Priority        : ${report.counts.highPriority}`);
  console.log(`Medium Priority      : ${report.counts.mediumPriority}`);
  console.log(`Low Priority         : ${report.counts.lowPriority}`);
  console.log(`Automation Allowed   : ${report.automationAllowed}`);
  console.log(`Requires Approval    : ${report.requiresUserApproval}`);
  console.log('------------------------------------------------------------\n');

  console.log('1. HIGH PRIORITY ACTIONS');
  console.log('------------------------');
  if (report.actionGroups.highPriority.length === 0) console.log(' (None)\n');
  report.actionGroups.highPriority.forEach((a, i) => {
    console.log(` [${i + 1}] ${a.title} (Priority Score: ${a.score})`);
    console.log(`     Type: ${a.type} | ID: ${a.id}`);
    console.log(`     Reason: ${a.reason}`);
    console.log(`     Suggested Action: ${a.suggestedAction}\n`);
  });

  console.log('2. MEDIUM PRIORITY ACTIONS');
  console.log('--------------------------');
  if (report.actionGroups.mediumPriority.length === 0) console.log(' (None)\n');
  report.actionGroups.mediumPriority.forEach((a, i) => {
    console.log(` [${i + 1}] ${a.title} (Priority Score: ${a.score})`);
    console.log(`     Type: ${a.type} | ID: ${a.id}`);
    console.log(`     Reason: ${a.reason}`);
    console.log(`     Suggested Action: ${a.suggestedAction}\n`);
  });

  console.log('3. LOW PRIORITY ACTIONS');
  console.log('-----------------------');
  if (report.actionGroups.lowPriority.length === 0) console.log(' (None)\n');
  report.actionGroups.lowPriority.forEach((a, i) => {
    console.log(` [${i + 1}] ${a.title} (Priority Score: ${a.score})`);
    console.log(`     Type: ${a.type} | ID: ${a.id}`);
    console.log(`     Reason: ${a.reason}`);
    console.log(`     Suggested Action: ${a.suggestedAction}\n`);
  });

  console.log('============================================================');
  console.log('USER APPROVAL BOUNDARY: All external actions require user approval.');
  console.log('============================================================');
}

if (require.main === module) {
  runCLIDecisionReport();
}

module.exports = { runCLIDecisionReport };

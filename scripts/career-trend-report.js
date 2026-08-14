const { generateCareerTrendReport } = require('../src/intelligence/career-trend.analytics');

function runCLITrendReport() {
  const period = process.argv[2] || 'allTime';
  const report = generateCareerTrendReport({ period });

  console.log('============================================================');
  console.log('CAREER INTELLIGENCE TREND & ACTION REPORT');
  console.log('============================================================');
  console.log(`Period          : ${report.period}`);
  console.log(`Generated       : ${report.generatedAt}`);
  console.log(`Data Sufficiency: ${report.sufficiency.status} (Sample Size: ${report.sufficiency.sampleSize})`);
  console.log('------------------------------------------------------------\n');

  console.log('1. PERFORMANCE SUMMARY');
  console.log('----------------------');
  console.log(` Jobs Discovered     : ${report.summary.jobsDiscovered}`);
  console.log(` Jobs Matched        : ${report.summary.jobsMatched}`);
  console.log(` Applications        : ${report.summary.applicationsSubmitted}`);
  console.log(` Responses           : ${report.summary.responses}`);
  console.log(` Interviews / Rounds : ${report.summary.interviews}`);
  console.log(` Offers              : ${report.summary.offers}`);
  console.log(` Average Match Score : ${report.summary.avgMatchScore}%`);
  console.log(` Response Rate       : ${report.summary.responseRate}%\n`);

  console.log('2. ROLE PERFORMANCE');
  console.log('-------------------');
  report.roles.topMatched.forEach((r) => {
    console.log(` • ${r.role}: ${r.matches} matches, Avg Score: ${r.avgScore}%, Apps: ${r.applications}, Response Rate: ${r.responseRate}%`);
  });
  console.log('');

  console.log('3. SKILL INTELLIGENCE');
  console.log('--------------------');
  console.log(' Top Demanded Skills:');
  report.skills.top.slice(0, 5).forEach((s) => {
    console.log(`   - ${s.skill}: ${s.count} jobs (In Profile: ${s.inProfile})`);
  });
  if (report.skills.gaps.length > 0) {
    console.log(' Skill Gap Observations:');
    report.skills.gaps.forEach((g) => console.log(`   ! ${g.observation}`));
  }
  console.log('');

  console.log('4. APPLICATION ATTENTION SIGNALS');
  console.log('--------------------------------');
  report.attentionSignals.forEach((a) => {
    console.log(` [${a.priority}] ${a.company} (${a.role}) - ${a.reason} -> ${a.action}`);
  });
  if (report.attentionSignals.length === 0) console.log(' • No active attention items.');
  console.log('');

  console.log('5. STRATEGY INSIGHTS');
  console.log('-------------------');
  report.insights.forEach((ins) => {
    console.log(` • [${ins.category}] ${ins.statement} (Confidence: ${ins.confidence})`);
  });
  console.log('');

  console.log('============================================================');
  console.log('TREND REPORT GENERATED SUCCESSFULLY (READ-ONLY)');
  console.log('============================================================');
}

if (require.main === module) {
  runCLITrendReport();
}

module.exports = { runCLITrendReport };

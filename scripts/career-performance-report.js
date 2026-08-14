'use strict';

/**
 * P3.53 — Read-Only Career Performance Analytics Report CLI
 */

const { generateCareerPerformanceReport } = require('../src/intelligence/career.performance.analytics');

function runReport() {
  const report = generateCareerPerformanceReport();

  console.log('============================================================');
  console.log('CAREER OS PERFORMANCE REPORT');
  console.log('============================================================\n');

  console.log('APPLICATION OVERVIEW');
  console.log(`- Total Real Jobs Tracked             : ${report.overview.totalRealJobsTracked}`);
  console.log(`- Submitted Count                      : ${report.overview.submittedCount}`);
  console.log(`- Verified Applied Count               : ${report.overview.verifiedAppliedCount}`);
  console.log(`- External Application Required Count  : ${report.overview.externalApplicationRequiredCount}`);
  console.log(`- Already Applied Count                : ${report.overview.alreadyAppliedCount}`);
  console.log(`- Pending / Manual Count               : ${report.overview.pendingManualCount}`);
  console.log(`- Autonomous Eligible Count            : ${report.overview.autonomousEligibleCount}\n`);

  console.log('SAFETY METRICS');
  console.log(`- Blocked Applications                 : ${report.safety.blockedApplicationCount}`);
  console.log(`- External Applications Blocked        : ${report.safety.externalApplicationsBlocked}`);
  console.log(`- Duplicate Applications Prevented     : ${report.safety.duplicateApplicationsPrevented}`);
  console.log(`- Verification Failures                : ${report.safety.verificationFailures}`);
  console.log(`- Reconciliation Events                : ${report.safety.reconciliationEvents}\n`);

  console.log('APPLICATION CLASSIFICATION');
  console.log(`- Easy Apply                           : ${report.classifications.EASY_APPLY}`);
  console.log(`- External Application Required        : ${report.classifications.EXTERNAL_APPLICATION_REQUIRED}`);
  console.log(`- Already Applied                      : ${report.classifications.ALREADY_APPLIED}\n`);

  console.log('TOP COMPANIES');
  report.companies.forEach(c => {
    console.log(`- ${c.company.padEnd(36)}: ${c.total} (External: ${c.external}, Submitted: ${c.submitted})`);
  });
  console.log('');

  console.log('TOP ROLES');
  report.roles.forEach(r => {
    console.log(`- ${r.role.padEnd(36)}: ${r.total} (External: ${r.external}, Submitted: ${r.submitted})`);
  });
  console.log('');

  console.log('============================================================');
  console.log('READ-ONLY REPORT');
  console.log('NO APPLICATION ACTIONS EXECUTED');
  console.log('============================================================\n');
}

if (require.main === module) {
  runReport();
}

module.exports = { runReport };

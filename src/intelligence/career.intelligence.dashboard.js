'use strict';

/**
 * Career OS — Career Intelligence Dashboard
 * READ-ONLY visualization module consuming generateCareerPerformanceReport()
 *
 * STRICT SAFETY RULES:
 * - Read-only analytics dashboard only.
 * - MUST NOT launch Playwright.
 * - MUST NOT make Naukri network requests.
 * - MUST NOT invoke application executor.
 * - MUST NOT mutate production JSON data stores.
 * - MUST NOT send real Telegram messages.
 */

const { generateCareerPerformanceReport } = require('./career.performance.analytics');

/**
 * Builds the read-only Career Intelligence Dashboard object from authoritative analytics.
 *
 * @param {Object} [options] Options passed to generateCareerPerformanceReport
 * @returns {Object} Structured Dashboard Data Object
 */
function generateCareerIntelligenceDashboard(options = {}) {
  const report = generateCareerPerformanceReport(options);

  const overview = report.overview || {};
  const safety = report.safety || {};
  const classifications = report.classifications || {};
  const companies = report.companies || [];
  const roles = report.roles || [];

  // Read-only Funnel Mapping derived directly from report metrics
  const tracked = overview.totalRealJobsTracked || 0;
  const classified = (classifications.EASY_APPLY || 0) + (classifications.EXTERNAL_APPLICATION_REQUIRED || 0) + (classifications.ALREADY_APPLIED || 0);
  const submittedOrExternal = (overview.submittedCount || 0) + (overview.externalApplicationRequiredCount || 0);
  const verifiedApplied = overview.verifiedAppliedCount || 0;

  const funnel = {
    tracked,
    classified,
    submittedOrExternal,
    verifiedApplied,
    conversionRate: tracked > 0 ? Number(((verifiedApplied / tracked) * 100).toFixed(1)) : 0
  };

  // Formatted Text / Console Visualization
  const renderedLines = [
    `============================================================`,
    `📊 CAREER INTELLIGENCE DASHBOARD`,
    `============================================================`,
    `Generated At: ${new Date(report.generatedAt || Date.now()).toISOString()}`,
    ``,
    `1. APPLICATION OVERVIEW`,
    `- Total Real Jobs Tracked            : ${overview.totalRealJobsTracked}`,
    `- Submitted Count                     : ${overview.submittedCount}`,
    `- Verified Applied Count              : ${overview.verifiedAppliedCount}`,
    `- External Application Required Count : ${overview.externalApplicationRequiredCount}`,
    `- Already Applied Count               : ${overview.alreadyAppliedCount}`,
    `- Pending / Manual Count              : ${overview.pendingManualCount}`,
    `- Autonomous Eligible Count           : ${overview.autonomousEligibleCount}`,
    ``,
    `2. SAFETY & GOVERNANCE`,
    `- Blocked Applications                : ${safety.blockedApplicationCount}`,
    `- External Applications Blocked       : ${safety.externalApplicationsBlocked}`,
    `- Duplicate Applications Prevented    : ${safety.duplicateApplicationsPrevented}`,
    `- Verification Failures               : ${safety.verificationFailures}`,
    `- Reconciliation Events               : ${safety.reconciliationEvents}`,
    ``,
    `3. APPLICATION CLASSIFICATION`,
    `- Easy Apply                          : ${classifications.EASY_APPLY}`,
    `- External Application Required       : ${classifications.EXTERNAL_APPLICATION_REQUIRED}`,
    `- Already Applied                     : ${classifications.ALREADY_APPLIED}`,
    ``,
    `4. COMPANY PERFORMANCE`,
    ...companies.map(c => `- ${c.company.padEnd(30)}: Total: ${c.total}, External: ${c.external}, Submitted: ${c.submitted}`),
    ``,
    `5. ROLE PERFORMANCE`,
    ...roles.map(r => `- ${r.role.padEnd(35)}: Total: ${r.total}, External: ${r.external}, Submitted: ${r.submitted}`),
    ``,
    `6. READ-ONLY FUNNEL VISUALIZATION`,
    `  Tracked (${funnel.tracked})`,
    `     ↓`,
    `  Classified (${funnel.classified})`,
    `     ↓`,
    `  Submitted / External Required (${funnel.submittedOrExternal})`,
    `     ↓`,
    `  Verified Applied (${funnel.verifiedApplied}) [Conversion: ${funnel.conversionRate}%]`,
    `============================================================`,
    `READ-ONLY DASHBOARD • ZERO APPLICATION ACTIONS EXECUTED`,
    `============================================================`
  ];

  const renderedText = renderedLines.join('\n');

  return {
    generatedAt: report.generatedAt,
    overview,
    safety,
    classifications,
    companies,
    roles,
    funnel,
    renderedText,
    report
  };
}

/**
 * Refreshes the dashboard by re-reading authoritative JSON stores.
 * Strictly read-only operation.
 *
 * @param {Object} [options]
 * @returns {Object} Updated Dashboard Object
 */
function refreshCareerIntelligenceDashboard(options = {}) {
  return generateCareerIntelligenceDashboard({ ...options, forceRefresh: true });
}

module.exports = {
  generateCareerIntelligenceDashboard,
  refreshCareerIntelligenceDashboard
};

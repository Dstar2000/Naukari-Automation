'use strict';

/**
 * P3.61 — Career Intelligence Control Center Integration Unit Tests
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  getCareerOSControlCenterIntelligence,
  refreshCareerOSControlCenterIntelligence,
  generateCareerOSControlCenterSnapshot,
  generateCareerOSControlCenterReport,
  getCareerOSControlCenterStatus
} = require('../src/intelligence/career.os.control.center');

const DATA_FILES = [
  path.resolve(__dirname, '../data/application-queue.json'),
  path.resolve(__dirname, '../data/application-outcomes.json'),
  path.resolve(__dirname, '../data/job-decisions.json'),
  path.resolve(__dirname, '../data/application-history.json')
];

function getHashes() {
  return DATA_FILES.map(f => fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : 'MISSING');
}

describe('P3.61 — Career Intelligence Control Center Integration Tests', () => {

  test('1. Control center exposes getCareerOSControlCenterIntelligence API', () => {
    expect(typeof getCareerOSControlCenterIntelligence).toBe('function');
  });

  test('2. Career Intelligence loads successfully via control center', () => {
    const intel = getCareerOSControlCenterIntelligence({ suppressTelegram: true });
    expect(intel).toBeDefined();
    expect(intel.overview).toBeDefined();
    expect(intel.report).toBeDefined();
  });

  test('3. Overview values originate from generateCareerPerformanceReport', () => {
    const intel = getCareerOSControlCenterIntelligence({ suppressTelegram: true });
    expect(intel.overview.totalRealJobsTracked).toBe(7);
    expect(intel.overview.submittedCount).toBe(1);
    expect(intel.overview.verifiedAppliedCount).toBe(1);
    expect(intel.overview.externalApplicationRequiredCount).toBe(6);
    expect(intel.overview.autonomousEligibleCount).toBe(0);
  });

  test('4. Safety values originate from generateCareerPerformanceReport', () => {
    const intel = getCareerOSControlCenterIntelligence({ suppressTelegram: true });
    expect(intel.safety.blockedApplicationCount).toBe(7);
    expect(intel.safety.externalApplicationsBlocked).toBe(6);
    expect(intel.safety.duplicateApplicationsPrevented).toBe(1);
    expect(intel.safety.verificationFailures).toBe(0);
    expect(intel.safety.reconciliationEvents).toBe(6);
  });

  test('5. Classification values originate from generateCareerPerformanceReport', () => {
    const intel = getCareerOSControlCenterIntelligence({ suppressTelegram: true });
    expect(intel.classifications.EASY_APPLY).toBe(0);
    expect(intel.classifications.EXTERNAL_APPLICATION_REQUIRED).toBe(6);
    expect(intel.classifications.ALREADY_APPLIED).toBe(1);
  });

  test('6. Company metrics are exposed through control center intelligence', () => {
    const intel = getCareerOSControlCenterIntelligence({ suppressTelegram: true });
    expect(Array.isArray(intel.companies)).toBe(true);
    expect(intel.companies.length).toBeGreaterThan(0);
    const infosys = intel.companies.find(c => c.company === 'Infosys');
    expect(infosys).toBeDefined();
    expect(infosys.total).toBe(2);
  });

  test('7. Role metrics are exposed through control center intelligence', () => {
    const intel = getCareerOSControlCenterIntelligence({ suppressTelegram: true });
    expect(Array.isArray(intel.roles)).toBe(true);
    expect(intel.roles.length).toBeGreaterThan(0);
    const mernRole = intel.roles.find(r => r.role === 'Mern Stack Developer');
    expect(mernRole).toBeDefined();
    expect(mernRole.total).toBe(2);
  });

  test('8. Funnel is read-only and mapped from analytics values', () => {
    const intel = getCareerOSControlCenterIntelligence({ suppressTelegram: true });
    expect(intel.funnel).toBeDefined();
    expect(intel.funnel.tracked).toBe(7);
    expect(intel.funnel.classified).toBe(7);
    expect(intel.funnel.submittedOrExternal).toBe(7);
    expect(intel.funnel.verifiedApplied).toBe(1);
  });

  test('9. Refresh reloads analytics report through control center API', () => {
    const refreshed = refreshCareerOSControlCenterIntelligence({ suppressTelegram: true });
    expect(refreshed).toBeDefined();
    expect(refreshed.overview.totalRealJobsTracked).toBe(7);
  });

  test('10. Control center snapshot includes intelligence section', () => {
    const snapshot = generateCareerOSControlCenterSnapshot({ suppressTelegram: true });
    expect(snapshot.intelligence).toBeDefined();
    expect(snapshot.intelligence.overview.totalRealJobsTracked).toBe(7);
  });

  test('11. Control center report includes intelligence section', () => {
    const report = generateCareerOSControlCenterReport({ suppressTelegram: true });
    expect(report.intelligence).toBeDefined();
    expect(report.intelligence.overview.totalRealJobsTracked).toBe(7);
  });

  test('12. Zero production JSON data store mutation occurs during control center intelligence access', () => {
    const beforeHashes = getHashes();
    getCareerOSControlCenterIntelligence({ suppressTelegram: true });
    refreshCareerOSControlCenterIntelligence({ suppressTelegram: true });
    generateCareerOSControlCenterSnapshot({ suppressTelegram: true });
    const afterHashes = getHashes();

    expect(beforeHashes).toEqual(afterHashes);
  });

  test('13. Telegram dispatch is NOT automatically triggered by control center intelligence operations', () => {
    const intel = getCareerOSControlCenterIntelligence({ suppressTelegram: true });
    expect(intel.telegramDispatched).toBeUndefined();
  });

  test('14. Existing control center status API remains operational and unchanged', () => {
    const status = getCareerOSControlCenterStatus({ suppressTelegram: true });
    expect(status).toBeDefined();
    expect(status.runtimeStatus).toBeDefined();
    expect(status.fingerprint).toBeDefined();
  });
});

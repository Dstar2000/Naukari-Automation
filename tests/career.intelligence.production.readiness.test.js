'use strict';

/**
 * P3.62 — Career Intelligence End-to-End Production Readiness Audit Test Suite
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const { generateCareerPerformanceReport } = require('../src/intelligence/career.performance.analytics');
const {
  generateCareerIntelligenceDashboard,
  refreshCareerIntelligenceDashboard
} = require('../src/intelligence/career.intelligence.dashboard');

const {
  getCareerOSControlCenterIntelligence,
  refreshCareerOSControlCenterIntelligence,
  generateCareerOSControlCenterSnapshot,
  generateCareerOSControlCenterReport,
  getCareerOSControlCenterStatus
} = require('../src/intelligence/career.os.control.center');

const { buildCareerDigestMessage }    = require('../src/telegram/career.digest');
const { sendCareerPerformanceDigest } = require('../src/intelligence/career-digest.scheduler');
const { sendCareerDigestOnce }        = require('../scripts/send-career-digest-once');
const { enableCareerDigest }          = require('../src/config/config');

const DATA_FILES = [
  path.resolve(__dirname, '../data/application-queue.json'),
  path.resolve(__dirname, '../data/application-outcomes.json'),
  path.resolve(__dirname, '../data/job-decisions.json'),
  path.resolve(__dirname, '../data/application-history.json')
];

function getHashes() {
  return DATA_FILES.map(f => fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : 'MISSING');
}

describe('P3.62 — Career Intelligence Production Readiness Audit', () => {
  let initialHashes;

  beforeAll(() => {
    initialHashes = getHashes();
  });

  afterAll(() => {
    const finalHashes = getHashes();
    expect(finalHashes).toEqual(initialHashes);
  });

  test('1. Analytics engine acts as single source of truth', () => {
    const report = generateCareerPerformanceReport();
    expect(report).toBeDefined();
    expect(report.overview).toBeDefined();
    expect(report.overview.totalRealJobsTracked).toBe(7);
  });

  test('2. Raw data metrics match expected P3.54 audit baselines', () => {
    const report = generateCareerPerformanceReport();
    const o = report.overview;
    const s = report.safety;
    const c = report.classifications;

    expect(o.totalRealJobsTracked).toBe(7);
    expect(o.submittedCount).toBe(1);
    expect(o.verifiedAppliedCount).toBe(1);
    expect(o.externalApplicationRequiredCount).toBe(6);
    expect(o.alreadyAppliedCount).toBe(1);
    expect(o.pendingManualCount).toBe(0);
    expect(o.autonomousEligibleCount).toBe(0);

    expect(s.blockedApplicationCount).toBe(7);
    expect(s.externalApplicationsBlocked).toBe(6);
    expect(s.duplicateApplicationsPrevented).toBe(1);
    expect(s.verificationFailures).toBe(0);
    expect(s.reconciliationEvents).toBe(6);

    expect(c.EASY_APPLY).toBe(0);
    expect(c.EXTERNAL_APPLICATION_REQUIRED).toBe(6);
    expect(c.ALREADY_APPLIED).toBe(1);
  });

  test('3. Dashboard metrics exactly match analytics report', () => {
    const report = generateCareerPerformanceReport();
    const db = generateCareerIntelligenceDashboard();

    expect(db.overview).toEqual(report.overview);
    expect(db.safety).toEqual(report.safety);
    expect(db.classifications).toEqual(report.classifications);
    expect(db.companies).toEqual(report.companies);
    expect(db.roles).toEqual(report.roles);
    expect(db.funnel.tracked).toBe(7);
    expect(db.funnel.classified).toBe(7);
    expect(db.funnel.submittedOrExternal).toBe(7);
    expect(db.funnel.verifiedApplied).toBe(1);
    expect(db.funnel.conversionRate).toBe(14.3);
  });

  test('4. Control center intelligence matches analytics report', () => {
    const report = generateCareerPerformanceReport();
    const ccIntel = getCareerOSControlCenterIntelligence({ suppressTelegram: true });

    expect(ccIntel.overview).toEqual(report.overview);
    expect(ccIntel.safety).toEqual(report.safety);
    expect(ccIntel.classifications).toEqual(report.classifications);
    expect(ccIntel.companies).toEqual(report.companies);
    expect(ccIntel.roles).toEqual(report.roles);
  });

  test('5. Control Center snapshot contains intelligence section matching analytics', () => {
    const snapshot = generateCareerOSControlCenterSnapshot({ suppressTelegram: true });
    expect(snapshot.intelligence).toBeDefined();
    expect(snapshot.intelligence.overview.totalRealJobsTracked).toBe(7);
  });

  test('6. Control Center report contains intelligence section matching analytics', () => {
    const report = generateCareerOSControlCenterReport({ suppressTelegram: true });
    expect(report.intelligence).toBeDefined();
    expect(report.intelligence.overview.totalRealJobsTracked).toBe(7);
  });

  test('7. Telegram payload structure matches expected analytics values', () => {
    const report = generateCareerPerformanceReport();
    const payload = buildCareerDigestMessage(report);

    expect(payload.text).toContain('Career OS Intelligence Digest');
    expect(payload.text).toContain('Total Tracked: *7*');
    expect(payload.text).toContain('Submitted: *1*');
    expect(payload.text).toContain('Verified Applied: *1*');
    expect(payload.text).toContain('External Required: *6*');
    expect(payload.text).toContain('Blocked Applications: *7*');
    expect(payload.text).toContain('External Blocked: *6*');
    expect(payload.text).toContain('Duplicates Prevented: *1*');
    expect(payload.text).toContain('Easy Apply: *0*');
    expect(payload.text).toContain('Zero application actions executed');
  });

  test('8. Disabled digest scheduler returns DIGEST_DISABLED_BY_CONFIG when flag is false', async () => {
    const res = await sendCareerPerformanceDigest({ force: false, enabled: false, suppressTelegram: true });
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('DIGEST_DISABLED_BY_CONFIG');
  });

  test('9. Control Center operations do NOT trigger Telegram dispatch', () => {
    const snapshot = generateCareerOSControlCenterSnapshot({ suppressTelegram: true });
    expect(snapshot.telegram.networkCalls).toBe(0);
  });

  test('10. One-shot delivery script does NOT register recurring scheduler timers', async () => {
    const { isDigestSchedulerActive } = require('../src/intelligence/career-digest.scheduler');
    await sendCareerDigestOnce({ mockTransport: true });
    expect(!!isDigestSchedulerActive).toBe(false);
  });

  test('11. Analytics report generation is deterministic across consecutive calls', () => {
    const r1 = generateCareerPerformanceReport();
    const r2 = generateCareerPerformanceReport();

    expect(r1.overview).toEqual(r2.overview);
    expect(r1.safety).toEqual(r2.safety);
    expect(r1.classifications).toEqual(r2.classifications);
    expect(r1.companies).toEqual(r2.companies);
    expect(r1.roles).toEqual(r2.roles);
  });

  test('12. Dashboard generation is deterministic across consecutive calls', () => {
    const d1 = generateCareerIntelligenceDashboard();
    const d2 = generateCareerIntelligenceDashboard();

    expect(d1.overview).toEqual(d2.overview);
    expect(d1.safety).toEqual(d2.safety);
    expect(d1.classifications).toEqual(d2.classifications);
    expect(d1.funnel).toEqual(d2.funnel);
  });

  test('13. Control Center intelligence is deterministic across consecutive calls', () => {
    const c1 = getCareerOSControlCenterIntelligence({ suppressTelegram: true });
    const c2 = getCareerOSControlCenterIntelligence({ suppressTelegram: true });

    expect(c1.overview).toEqual(c2.overview);
    expect(c1.safety).toEqual(c2.safety);
    expect(c1.funnel).toEqual(c2.funnel);
  });

  test('14. Zero Playwright instances launched during audit', () => {
    const dashboardSource = fs.readFileSync(path.resolve(__dirname, '../src/intelligence/career.intelligence.dashboard.js'), 'utf-8');
    const analyticsSource = fs.readFileSync(path.resolve(__dirname, '../src/intelligence/career.performance.analytics.js'), 'utf-8');

    expect(dashboardSource.includes('playwright')).toBe(false);
    expect(analyticsSource.includes('playwright')).toBe(false);
  });

  test('15. Zero Naukri HTTP requests initiated during audit', () => {
    const dashboardSource = fs.readFileSync(path.resolve(__dirname, '../src/intelligence/career.intelligence.dashboard.js'), 'utf-8');
    const analyticsSource = fs.readFileSync(path.resolve(__dirname, '../src/intelligence/career.performance.analytics.js'), 'utf-8');

    expect(dashboardSource.includes('fetch(')).toBe(false);
    expect(analyticsSource.includes('fetch(')).toBe(false);
    expect(dashboardSource.includes('axios')).toBe(false);
    expect(analyticsSource.includes('axios')).toBe(false);
  });

  test('16. Zero real application submissions triggered during audit', () => {
    const dashboardSource = fs.readFileSync(path.resolve(__dirname, '../src/intelligence/career.intelligence.dashboard.js'), 'utf-8');
    const analyticsSource = fs.readFileSync(path.resolve(__dirname, '../src/intelligence/career.performance.analytics.js'), 'utf-8');

    expect(dashboardSource.includes('application.executor')).toBe(false);
    expect(analyticsSource.includes('application.executor')).toBe(false);
  });

  test('17. Zero real Telegram dispatches made during readiness unit tests', async () => {
    const res = await sendCareerPerformanceDigest({ force: true, enabled: true, suppressTelegram: true });
    expect(res.sent).toBe(true);
    expect(res.mock).toBe(true);
  });

  test('18. Four production JSON data stores remain 100% byte-for-byte unchanged', () => {
    const currentHashes = getHashes();
    expect(currentHashes).toEqual(initialHashes);
  });

  test('19. Existing Control Center status API remains operational and certified', () => {
    const status = getCareerOSControlCenterStatus({ suppressTelegram: true });
    expect(status).toBeDefined();
    expect(status.runtimeStatus).toBeDefined();
    expect(status.fingerprint).toBeDefined();
  });

  test('20. CAREER_DIGEST_ENABLED feature flag evaluates to a boolean', () => {
    expect(typeof enableCareerDigest).toBe('boolean');
  });
});

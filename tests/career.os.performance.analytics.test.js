'use strict';

/**
 * P3.53 — Read-Only Career Intelligence & Performance Analytics Tests
 */

const fs   = require('fs');
const path = require('path');

const {
  isSyntheticTestRecord,
  calculateApplicationOverview,
  calculateSafetyMetrics,
  calculateOutcomeMetrics,
  calculateClassificationMetrics,
  calculateVerificationMetrics,
  calculateCompanyMetrics,
  calculateRoleMetrics,
  generateCareerPerformanceReport
} = require('../src/intelligence/career.performance.analytics');

const { formatCareerPerformanceDigest } = require('../src/telegram/job.notifier');

const TEST_DIR = path.resolve(__dirname, 'tmp_analytics_test_data');

function setupTestDir() {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('P3.53 — Career Intelligence Performance Analytics Tests', () => {
  beforeEach(() => {
    setupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  test('Test 1: Empty data stores produce valid empty overview and zero metrics', () => {
    const emptyQueue = path.join(TEST_DIR, 'queue.json');
    fs.writeFileSync(emptyQueue, '[]', 'utf-8');

    const report = generateCareerPerformanceReport({ queuePath: emptyQueue });

    expect(report.overview.totalRealJobsTracked).toBe(0);
    expect(report.overview.submittedCount).toBe(0);
    expect(report.overview.verifiedAppliedCount).toBe(0);
    expect(report.overview.externalApplicationRequiredCount).toBe(0);
    expect(report.overview.autonomousEligibleCount).toBe(0);
    expect(report.companies).toEqual([]);
    expect(report.roles).toEqual([]);
  });

  test('Test 2: Synthetic / test records are correctly excluded from analytics', () => {
    const queue = [
      { jobId: 'test123', company: 'Test Co', jobUrl: 'https://www.naukri.com/job-listings-test-123' },
      { jobId: 'fake-id', company: 'Fake Co', jobUrl: 'http://fake.com/job' },
      { jobId: 'real01', company: 'Real Co', jobUrl: 'https://www.naukri.com/job-listings-real01', status: 'EXTERNAL_APPLICATION_REQUIRED' }
    ];

    const overview = calculateApplicationOverview(queue);
    expect(overview.totalRealJobsTracked).toBe(1);
    expect(overview.externalApplicationRequiredCount).toBe(1);
  });

  test('Test 3: EXTERNAL_APPLICATION_REQUIRED counting and safety metrics', () => {
    const queue = [
      { jobId: 'ext01', company: 'Ext Corp 1', jobUrl: 'https://www.naukri.com/job-listings-ext01', status: 'EXTERNAL_APPLICATION_REQUIRED' },
      { jobId: 'ext02', company: 'Ext Corp 2', jobUrl: 'https://www.naukri.com/job-listings-ext02', status: 'EXTERNAL_APPLICATION_REQUIRED' }
    ];

    const overview = calculateApplicationOverview(queue);
    const safety = calculateSafetyMetrics(queue);

    expect(overview.externalApplicationRequiredCount).toBe(2);
    expect(safety.externalApplicationsBlocked).toBe(2);
  });

  test('Test 4: SUBMITTED and VERIFIED_APPLIED counting', () => {
    const queue = [
      { jobId: 'sub01', company: 'Sub Corp', jobUrl: 'https://www.naukri.com/job-listings-sub01', status: 'SUBMITTED', verificationStatus: 'VERIFIED_APPLIED' }
    ];

    const overview = calculateApplicationOverview(queue);
    expect(overview.submittedCount).toBe(1);
    expect(overview.verifiedAppliedCount).toBe(1);
    expect(overview.alreadyAppliedCount).toBe(1);
  });

  test('Test 5: Company and Role aggregations', () => {
    const queue = [
      { jobId: 'c1', company: 'Acme', title: 'React Dev', jobUrl: 'https://www.naukri.com/job-listings-c1', status: 'EXTERNAL_APPLICATION_REQUIRED' },
      { jobId: 'c2', company: 'Acme', title: 'React Dev', jobUrl: 'https://www.naukri.com/job-listings-c2', status: 'SUBMITTED' },
      { jobId: 'c3', company: 'Beta', title: 'Node Dev', jobUrl: 'https://www.naukri.com/job-listings-c3', status: 'EXTERNAL_APPLICATION_REQUIRED' }
    ];

    const companies = calculateCompanyMetrics(queue);
    const roles = calculateRoleMetrics(queue);

    expect(companies.length).toBe(2);
    expect(companies[0].company).toBe('Acme');
    expect(companies[0].total).toBe(2);

    expect(roles.length).toBe(2);
    expect(roles[0].role).toBe('React Dev');
    expect(roles[0].total).toBe(2);
  });

  test('Test 6: Report generation is 100% read-only and does not mutate source files', () => {
    const qFile = path.join(TEST_DIR, 'q.json');
    const data = [{ jobId: 'r1', company: 'Real Co', jobUrl: 'https://www.naukri.com/job-listings-r1', status: 'EXTERNAL_APPLICATION_REQUIRED' }];
    fs.writeFileSync(qFile, JSON.stringify(data, null, 2), 'utf-8');

    const beforeStat = fs.statSync(qFile);
    const report = generateCareerPerformanceReport({ queuePath: qFile });
    const afterStat = fs.statSync(qFile);

    expect(beforeStat.mtimeMs).toBe(afterStat.mtimeMs);
    expect(report.overview.totalRealJobsTracked).toBe(1);
  });

  test('Test 7: Report generation is deterministic for identical input data', () => {
    const r1 = generateCareerPerformanceReport();
    const r2 = generateCareerPerformanceReport();

    expect(r1.overview).toEqual(r2.overview);
    expect(r1.safety).toEqual(r2.safety);
    expect(r1.classifications).toEqual(r2.classifications);
  });

  test('Test 8: Telegram Performance Digest format function is truthful and read-only', () => {
    const report = generateCareerPerformanceReport();
    const digestText = formatCareerPerformanceDigest(report);

    expect(digestText).toContain('Career OS Performance Digest');
    expect(digestText).toContain(`Total Tracked: *${report.overview.totalRealJobsTracked}*`);
    expect(digestText).toContain('Zero application actions executed');
  });

  test('Test 9: Missing optional data store files handled gracefully', () => {
    const nonExistentPath = path.join(TEST_DIR, 'does_not_exist.json');
    const report = generateCareerPerformanceReport({
      queuePath: nonExistentPath,
      outcomesPath: nonExistentPath
    });

    expect(report.overview.totalRealJobsTracked).toBe(0);
    expect(report.safety.blockedApplicationCount).toBe(0);
  });
});

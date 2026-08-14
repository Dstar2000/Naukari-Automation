'use strict';

/**
 * P3.60 — Career Intelligence Dashboard Unit Tests
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  generateCareerIntelligenceDashboard,
  refreshCareerIntelligenceDashboard
} = require('../src/intelligence/career.intelligence.dashboard');

const DATA_FILES = [
  path.resolve(__dirname, '../data/application-queue.json'),
  path.resolve(__dirname, '../data/application-outcomes.json'),
  path.resolve(__dirname, '../data/job-decisions.json'),
  path.resolve(__dirname, '../data/application-history.json')
];

function getHashes() {
  return DATA_FILES.map(f => fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : 'MISSING');
}

describe('P3.60 — Career Intelligence Dashboard Unit Tests', () => {

  test('1. Dashboard loads analytics report successfully', () => {
    const db = generateCareerIntelligenceDashboard();
    expect(db).toBeDefined();
    expect(db.overview).toBeDefined();
    expect(db.report).toBeDefined();
  });

  test('2. Dashboard displays total tracked jobs (7)', () => {
    const db = generateCareerIntelligenceDashboard();
    expect(db.overview.totalRealJobsTracked).toBe(7);
  });

  test('3. Dashboard displays submitted count (1)', () => {
    const db = generateCareerIntelligenceDashboard();
    expect(db.overview.submittedCount).toBe(1);
  });

  test('4. Dashboard displays verified applied count (1)', () => {
    const db = generateCareerIntelligenceDashboard();
    expect(db.overview.verifiedAppliedCount).toBe(1);
  });

  test('5. Dashboard displays external-required count (6)', () => {
    const db = generateCareerIntelligenceDashboard();
    expect(db.overview.externalApplicationRequiredCount).toBe(6);
  });

  test('6. Dashboard displays safety metrics correctly', () => {
    const db = generateCareerIntelligenceDashboard();
    expect(db.safety.blockedApplicationCount).toBe(7);
    expect(db.safety.externalApplicationsBlocked).toBe(6);
    expect(db.safety.duplicateApplicationsPrevented).toBe(1);
    expect(db.safety.verificationFailures).toBe(0);
    expect(db.safety.reconciliationEvents).toBe(6);
  });

  test('7. Company aggregation is rendered from analytics output', () => {
    const db = generateCareerIntelligenceDashboard();
    expect(Array.isArray(db.companies)).toBe(true);
    expect(db.companies.length).toBeGreaterThan(0);
    const infosys = db.companies.find(c => c.company === 'Infosys');
    expect(infosys).toBeDefined();
    expect(infosys.total).toBe(2);
  });

  test('8. Role aggregation is rendered from analytics output', () => {
    const db = generateCareerIntelligenceDashboard();
    expect(Array.isArray(db.roles)).toBe(true);
    expect(db.roles.length).toBeGreaterThan(0);
    const mernRole = db.roles.find(r => r.role === 'Mern Stack Developer');
    expect(mernRole).toBeDefined();
    expect(mernRole.total).toBe(2);
  });

  test('9. Refresh reloads the analytics report without side effects', () => {
    const db = refreshCareerIntelligenceDashboard();
    expect(db).toBeDefined();
    expect(db.overview.totalRealJobsTracked).toBe(7);
  });

  test('10. Dashboard does not invoke application executor or Playwright or Naukri network', () => {
    const dbContent = fs.readFileSync(path.resolve(__dirname, '../src/intelligence/career.intelligence.dashboard.js'), 'utf-8');
    expect(dbContent.includes('application.executor')).toBe(false);
    expect(dbContent.includes('playwright')).toBe(false);
    expect(dbContent.includes('naukri.com')).toBe(false);
  });

  test('11. Zero production JSON data store mutation occurs during dashboard rendering', () => {
    const hashesBefore = getHashes();
    generateCareerIntelligenceDashboard();
    refreshCareerIntelligenceDashboard();
    const hashesAfter = getHashes();

    expect(hashesBefore).toEqual(hashesAfter);
  });

  test('12. Telegram dispatch is NOT automatically triggered by dashboard generation', () => {
    const db = generateCareerIntelligenceDashboard();
    expect(db.telegramDispatched).toBeUndefined();
  });
});

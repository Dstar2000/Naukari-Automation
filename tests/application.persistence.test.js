const fs = require('fs');
const path = require('path');
const {
  persistSubmittedApplication,
  saveApplicationHistory,
  saveApplicationOutcome,
  normalizeApplicationRecord,
  HISTORY_FILE_PATH,
  OUTCOMES_FILE_PATH
} = require('../src/tracking/application.persistence');

const QUEUE_FILE_PATH = path.resolve(__dirname, '../data/application-queue.json');
const DECISIONS_FILE_PATH = path.resolve(__dirname, '../data/job-decisions.json');
const FOLLOWUP_FILE_PATH = path.resolve(__dirname, '../data/followup-history.json');

describe('Phase 8.1.9: Application Persistence Invariant Tests', () => {
  const fileSnapshots = new Map();
  const testFiles = [HISTORY_FILE_PATH, OUTCOMES_FILE_PATH, QUEUE_FILE_PATH, DECISIONS_FILE_PATH, FOLLOWUP_FILE_PATH];

  const backupDataFiles = () => {
    fileSnapshots.clear();
    testFiles.forEach((file) => {
      if (fs.existsSync(file)) {
        fileSnapshots.set(file, fs.readFileSync(file, 'utf-8'));
      } else {
        fileSnapshots.set(file, null);
      }
    });
  };

  const restoreDataFiles = () => {
    testFiles.forEach((file) => {
      const snap = fileSnapshots.get(file);
      if (snap === null || snap === undefined) {
        if (fs.existsSync(file)) {
          try { fs.unlinkSync(file); } catch (_) {}
        }
      } else {
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, snap, 'utf-8');
      }
    });
  };

  beforeEach(() => {
    backupDataFiles();
  });

  afterEach(() => {
    restoreDataFiles();
  });

  test('1. Normalization preserves exact jobUrl, applicationId, jobId, company, role', () => {
    const record = {
      title: 'Full Stack Engineer',
      company: 'Acme Corp',
      jobUrl: 'https://www.naukri.com/job-listings-full-stack-acme-123456',
      status: 'SUBMITTED'
    };

    const norm = normalizeApplicationRecord(record);
    expect(norm).toBeDefined();
    expect(norm.company).toBe('Acme Corp');
    expect(norm.role).toBe('Full Stack Engineer');
    expect(norm.jobUrl).toBe('https://www.naukri.com/job-listings-full-stack-acme-123456');
    expect(norm.applicationId).toBeDefined();
    expect(norm.jobId).toBeDefined();
  });

  test('2. Atomic persistence writes to BOTH application-history.json and application-outcomes.json', () => {
    const record = {
      applicationId: 'app_test_999',
      jobId: 'job_test_999',
      company: 'Test Company',
      role: 'Backend Developer',
      jobUrl: 'https://www.naukri.com/job-listings-test-company-999',
      status: 'SUBMITTED',
      reason: 'User approved'
    };

    const res = persistSubmittedApplication(record);
    expect(res.success).toBe(true);
    expect(res.historyPersisted).toBe(true);
    expect(res.outcomePersisted).toBe(true);

    // Read files directly from disk to verify
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE_PATH, 'utf-8'));
    const outcomes = JSON.parse(fs.readFileSync(OUTCOMES_FILE_PATH, 'utf-8'));

    expect(history.some((h) => h.jobUrl === record.jobUrl)).toBe(true);
    expect(outcomes.some((o) => o.jobUrl === record.jobUrl)).toBe(true);
  });

  test('3. Invalid job record returns failure without crashing', () => {
    const invalidRecord = { company: 'No URL Corp' };
    const res = persistSubmittedApplication(invalidRecord);
    expect(res.success).toBe(false);
    expect(res.reason).toBe('INVALID_APPLICATION_RECORD');
  });

  test('4. Read-only application audit script presence', () => {
    const auditScript = path.resolve(__dirname, '../scripts/audit-application-pipeline.js');
    expect(fs.existsSync(auditScript)).toBe(true);
  });
});

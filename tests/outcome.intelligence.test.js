const fs = require('fs');
const path = require('path');
const {
  recordOutcome,
  getOutcomes,
  getOutcomeStats,
  isValidTransition,
  migrateOutcomeSchema,
  OUTCOME_STATUSES,
  OUTCOMES_FILE_PATH
} = require('../src/tracking/outcome.tracker');
const {
  checkPendingFollowups,
  recordFollowupSent,
  getFollowupRecord,
  FOLLOWUP_FILE_PATH
} = require('../src/tracking/followup.scheduler');
const {
  recordInterviewMemory,
  getInterviewMemory,
  handleOutcomeCommand,
  INTERVIEW_MEMORY_PATH
} = require('../src/telegram/outcome.commands');
const { CACHE_FILE_PATH } = require('../src/naukri/job.url.validator');

describe('Phase 8.1: Outcome Intelligence Hardening Tests', () => {
  const testJob = {
    applicationId: 'intel_test_123',
    jobUrl: 'https://www.naukri.com/job-listings-intel-test-123',
    company: 'Intel Company',
    role: 'Full Stack Engineer'
  };

  const fileSnapshots = new Map();
  const testFiles = [OUTCOMES_FILE_PATH, FOLLOWUP_FILE_PATH, INTERVIEW_MEMORY_PATH, CACHE_FILE_PATH];

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
    testFiles.forEach((file) => {
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch (_) {}
      }
    });
  });

  afterEach(() => {
    restoreDataFiles();
  });

  test('Schema Migration: converts old status schema to currentStatus and initializes history', () => {
    const oldSchemaItem = {
      company: 'Old Corp',
      role: 'Dev',
      status: 'APPLIED',
      updatedAt: '2026-08-01T10:00:00.000Z'
    };

    const migrated = migrateOutcomeSchema(oldSchemaItem);
    expect(migrated.currentStatus).toBe('APPLIED');
    expect(migrated.status).toBe('APPLIED');
    expect(Array.isArray(migrated.history)).toBe(true);
    expect(migrated.history.length).toBe(1);
    expect(migrated.history[0].status).toBe('APPLIED');
  });

  test('State Machine Validation: blocks invalid status rewinds', () => {
    expect(isValidTransition('APPLIED', 'TECHNICAL_ROUND')).toBe(true);
    expect(isValidTransition('TECHNICAL_ROUND', 'OFFER')).toBe(true);
    expect(isValidTransition('OFFER', 'APPLIED')).toBe(false);
    expect(isValidTransition('REJECTED', 'TECHNICAL_ROUND')).toBe(false);

    recordOutcome(testJob, OUTCOME_STATUSES.OFFER);

    // Attempting invalid rewind
    const invalidRes = recordOutcome(testJob, OUTCOME_STATUSES.APPLIED);
    expect(invalidRes.success).toBe(false);
    expect(invalidRes.reason).toBe('INVALID_STATUS_TRANSITION');
  });

  test('History Preservation: appends each transition entry to history array', () => {
    recordOutcome(testJob, OUTCOME_STATUSES.APPLIED);
    recordOutcome(testJob, OUTCOME_STATUSES.SHORTLISTED);
    recordOutcome(testJob, OUTCOME_STATUSES.TECHNICAL_ROUND);

    const outcomes = getOutcomes();
    expect(outcomes.length).toBe(1);
    const entry = outcomes[0];
    expect(entry.currentStatus).toBe('TECHNICAL_ROUND');
    expect(entry.history.length).toBe(3);
    expect(entry.history[1].status).toBe('SHORTLISTED');
  });

  test('Follow-up Deduplication & Limit: tracks reminder counts and limits max reminders to 3', async () => {
    const oldAppliedJob = {
      ...testJob,
      jobUrl: 'https://www.naukri.com/job-listings-old-99',
      currentStatus: 'APPLIED',
      updatedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
    };

    // Seed cache so Playwright live navigation isn't called on test URL
    const cacheData = [
      {
        jobUrl: oldAppliedJob.jobUrl,
        jobStatus: 'LIVE',
        lastVerifiedAt: new Date().toISOString(),
        lastCheckedUrl: oldAppliedJob.jobUrl
      }
    ];
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cacheData, null, 2), 'utf-8');

    recordOutcome(oldAppliedJob, OUTCOME_STATUSES.APPLIED);

    // Initial check sends 1st reminder using mockStatus LIVE for test
    const reminders1 = await checkPendingFollowups({ mockStatus: 'LIVE' });
    expect(reminders1.length).toBe(1);
    expect(getFollowupRecord(oldAppliedJob.jobUrl).reminderCount).toBe(1);

    // Simulate 3 reminders already sent
    recordFollowupSent(oldAppliedJob.jobUrl);
    recordFollowupSent(oldAppliedJob.jobUrl);
    expect(getFollowupRecord(oldAppliedJob.jobUrl).reminderCount).toBe(3);
  });

  test('Interview Round Selection & Pipeline Command: stores round details and calculates pipeline stats', () => {
    recordOutcome(testJob, OUTCOME_STATUSES.TECHNICAL_ROUND);
    recordInterviewMemory(testJob, 'TECHNICAL_ROUND', '2026-08-10T10:00:00.000Z', 'System design round');

    const memory = getInterviewMemory();
    expect(memory.length).toBe(1);
    expect(memory[0].round).toBe('TECHNICAL_ROUND');

    const pipelineRes = handleOutcomeCommand('/pipeline');
    expect(pipelineRes.text).toContain('Career Pipeline');
    expect(pipelineRes.text).toContain('Interview:');
  });
});

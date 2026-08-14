const fs = require('fs');
const path = require('path');
const {
  recordOutcome,
  getOutcomes,
  getOutcomeByJob,
  getOutcomeStats,
  OUTCOME_STATUSES,
  OUTCOMES_FILE_PATH
} = require('../src/tracking/outcome.tracker');
const { handleOutcomeCommand, recordInterviewMemory, INTERVIEW_MEMORY_PATH } = require('../src/telegram/outcome.commands');

describe('Phase 8: Application Outcome Tracking Engine Tests', () => {
  const testJob = {
    applicationId: 'app_test_123',
    jobUrl: 'https://www.naukri.com/job-listings-outcome-test-123',
    company: 'Outcome Tech',
    role: 'MERN Stack Developer'
  };

  const fileSnapshots = new Map();
  const testFiles = [OUTCOMES_FILE_PATH, INTERVIEW_MEMORY_PATH];

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
    [OUTCOMES_FILE_PATH, INTERVIEW_MEMORY_PATH].forEach((file) => {
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch (_) {}
      }
    });
  });

  afterEach(() => {
    restoreDataFiles();
  });

  test('Outcome Recording: stores outcome entry and updates status', () => {
    recordOutcome(testJob, OUTCOME_STATUSES.INTERVIEW_SCHEDULED, 'HR interview scheduled on Friday');

    const outcomes = getOutcomes();
    expect(outcomes.length).toBe(1);
    expect(outcomes[0].company).toBe('Outcome Tech');
    expect(outcomes[0].status).toBe(OUTCOME_STATUSES.INTERVIEW_SCHEDULED);
    expect(outcomes[0].notes).toContain('HR interview');

    const found = getOutcomeByJob(testJob.jobUrl);
    expect(found).toBeDefined();
    expect(found.applicationId).toBe('app_test_123');
  });

  test('Outcome Statistics Aggregation: calculates interview & offer totals', () => {
    recordOutcome(testJob, OUTCOME_STATUSES.INTERVIEW_SCHEDULED);
    recordOutcome(
      { jobUrl: 'https://www.naukri.com/job-2', company: 'Offer Corp', role: 'Dev' },
      OUTCOME_STATUSES.OFFER
    );

    const stats = getOutcomeStats();
    expect(stats.totalTracked).toBe(2);
    expect(stats.interviews).toBe(1);
    expect(stats.offers).toBe(1);
  });

  test('Telegram Outcome Commands: /outcomes, /interviews, /offers return formatted markdown', () => {
    recordOutcome(testJob, OUTCOME_STATUSES.INTERVIEW_SCHEDULED);
    recordInterviewMemory(testJob, OUTCOME_STATUSES.INTERVIEW_SCHEDULED);

    const interviewRes = handleOutcomeCommand('/interviews');
    expect(interviewRes.text).toContain('Interview Calendar & Pipeline');
    expect(interviewRes.text).toContain('Outcome Tech');

    const offerRes = handleOutcomeCommand('/offers');
    expect(offerRes.text).toContain('Job Offers Summary');
  });
});

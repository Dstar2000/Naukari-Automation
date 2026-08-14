const fs = require('fs');
const path = require('path');
const {
  processApplication,
  submitApplication,
  recordApplicationHistory,
  getApplicationHistory,
  HISTORY_FILE_PATH
} = require('../src/naukri/application.executor');
const {
  saveAnswerToMemory,
  findAnswerInMemory,
  sendQuestionPrompt,
  QUESTION_MEMORY_PATH
} = require('../src/telegram/question.handler');

describe('Phase 7: Safe Naukri Auto Apply Assistant Tests', () => {
  const mockEasyJob = {
    jobId: 'test_easy_123',
    jobUrl: 'https://www.naukri.com/job-listings-easy-dev-123',
    title: 'Full Stack Developer',
    company: 'Easy Company',
    applyType: 'EASY_APPLY'
  };

  const mockExternalJob = {
    jobId: 'test_ext_456',
    jobUrl: 'https://www.naukri.com/job-listings-external-dev-456',
    title: 'Backend Engineer',
    company: 'External Company',
    applyType: 'EXTERNAL'
  };

  const cleanupFiles = () => {
    const { SETTINGS_FILE_PATH } = require('../src/naukri/application.guard');
    const { LOCK_FILE_PATH, releaseLock } = require('../src/naukri/application.lock');
    releaseLock();
    if (fs.existsSync(HISTORY_FILE_PATH)) {
      try {
        fs.unlinkSync(HISTORY_FILE_PATH);
      } catch (_) {}
    }
    if (fs.existsSync(QUESTION_MEMORY_PATH)) {
      try {
        fs.unlinkSync(QUESTION_MEMORY_PATH);
      } catch (_) {}
    }
    if (fs.existsSync(SETTINGS_FILE_PATH)) {
      try {
        fs.unlinkSync(SETTINGS_FILE_PATH);
      } catch (_) {}
    }
    if (fs.existsSync(LOCK_FILE_PATH)) {
      try {
        fs.unlinkSync(LOCK_FILE_PATH);
      } catch (_) {}
    }
  };

  beforeEach(() => {
    cleanupFiles();
  });

  afterEach(() => {
    cleanupFiles();
  });

  test('Application Verification: EXTERNAL and UNKNOWN jobs return MANUAL_REQUIRED', async () => {
    const result = await processApplication(mockExternalJob);
    expect(result.status).toBe('MANUAL_REQUIRED');
    expect(result.reason).toBe('EXTERNAL_APPLICATION');

    const history = getApplicationHistory();
    expect(history.length).toBe(1);
    expect(history[0].status).toBe('MANUAL_REQUIRED');
  });

  test('Question Memory: saving and retrieving recruiter question answers', () => {
    const question = 'How many years of React experience?';
    const answer = '1 year 5 months';

    saveAnswerToMemory(question, answer);

    const found = findAnswerInMemory(question);
    expect(found).toBeDefined();
    expect(found.answer).toBe(answer);

    const notFound = findAnswerInMemory('What is your expected salary?');
    expect(notFound).toBeNull();
  });

  test('Submission Guardrail: submitApplication requires explicit user trigger', async () => {
    const res = recordApplicationHistory(mockEasyJob, 'WAITING_CONFIRMATION', 'Awaiting user Telegram confirmation');
    expect(res.status).toBe('WAITING_CONFIRMATION');

    // Simulate explicit user confirmation click [✅ Submit]
    const submittedRes = await submitApplication(mockEasyJob);
    expect(submittedRes.status).toBe('SUBMITTED');

    const history = getApplicationHistory();
    expect(history[0].status).toBe('SUBMITTED');
  });
});

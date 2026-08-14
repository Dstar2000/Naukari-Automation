const fs = require('fs');
const path = require('path');
const {
  getSettings,
  saveSettings,
  canSubmitApplication,
  incrementSubmittedCount,
  setAutomationPause,
  SETTINGS_FILE_PATH
} = require('../src/naukri/application.guard');
const {
  recordApplicationHistory,
  getApplicationHistory,
  isAlreadyApplied,
  HISTORY_FILE_PATH
} = require('../src/naukri/application.executor');
const {
  categorizeQuestion,
  findAnswerInMemory,
  saveAnswerToMemory,
  QUESTION_MEMORY_PATH
} = require('../src/telegram/question.handler');
const { handleAdminCommand } = require('../src/telegram/admin.commands');

describe('Phase 7.1: Application Safety, Guardrails & Reliability Tests', () => {
  const testJob = {
    jobId: 'guard_test_123',
    jobUrl: 'https://www.naukri.com/job-listings-guard-test-123',
    title: 'React JS Developer',
    company: 'Guard Company',
    applyType: 'EASY_APPLY'
  };

  const cleanupFiles = () => {
    if (fs.existsSync(SETTINGS_FILE_PATH)) {
      try {
        fs.unlinkSync(SETTINGS_FILE_PATH);
      } catch (_) {}
    }
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
  };

  beforeEach(() => {
    cleanupFiles();
  });

  afterEach(() => {
    cleanupFiles();
  });

  test('Daily Limit: enforces daily limit (10) and blocks extra submissions', () => {
    saveSettings({
      dailyApplyLimit: 2,
      submittedToday: 2,
      lastResetDate: new Date().toISOString().split('T')[0],
      requireConfirmation: true,
      automationPaused: false
    });

    const guard = canSubmitApplication();
    expect(guard.allowed).toBe(false);
    expect(guard.reason).toContain('limit reached');
  });

  test('Emergency Pause Mode: blocks submissions when automationPaused is true', () => {
    setAutomationPause(true);
    const guard = canSubmitApplication();
    expect(guard.allowed).toBe(false);
    expect(guard.reason).toContain('paused');

    setAutomationPause(false);
    const guard2 = canSubmitApplication();
    expect(guard2.allowed).toBe(true);
  });

  test('Duplicate Application Protection: prevents duplicate submissions by jobUrl or company+role', () => {
    recordApplicationHistory(testJob, 'SUBMITTED', 'Applied successfully');

    const duplicateCheck = isAlreadyApplied(testJob);
    expect(duplicateCheck).toBe(true);

    const sameCompRole = {
      jobUrl: 'https://www.naukri.com/different-url-999',
      title: 'React JS Developer',
      company: 'Guard Company'
    };
    expect(isAlreadyApplied(sameCompRole)).toBe(true);
  });

  test('Question Memory Normalization: maps similar relocation & experience queries', () => {
    expect(categorizeQuestion('Are you willing to relocate?')).toBe('relocate');
    expect(categorizeQuestion('Would you relocate?')).toBe('relocate');
    expect(categorizeQuestion('How many years of experience?')).toBe('experience');

    saveAnswerToMemory('Are you willing to relocate?', 'Yes, ready to move');

    const found = findAnswerInMemory('Would you relocate?');
    expect(found).toBeDefined();
    expect(found.answer).toBe('Yes, ready to move');
  });

  test('Telegram Control Commands: /status, /pause, /resume, /limits, /history', () => {
    expect(handleAdminCommand('/status')).toContain('Automation Status Summary');
    expect(handleAdminCommand('/pause')).toContain('Emergency Stop Activated');
    expect(canSubmitApplication().allowed).toBe(false);

    expect(handleAdminCommand('/resume')).toContain('Automation Resumed');
    expect(canSubmitApplication().allowed).toBe(true);

    expect(handleAdminCommand('/limits')).toContain('Daily Limit');
    expect(handleAdminCommand('/history')).toBeDefined();
  });
});

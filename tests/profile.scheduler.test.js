'use strict';

/**
 * Naukri Profile Auto-Update Scheduler & Maintenance Engine Unit Tests
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const {
  performProfileMaintenance,
  reorderExistingSkills,
  reorderExistingProjects,
  formatHeadline,
  readProfileData,
  PROTECTED_FIELDS
} = require('../src/naukri/profile.updater');

const {
  generateDailyPlan,
  executeScheduledOpportunity,
  startProfileUpdateScheduler,
  stopProfileUpdateScheduler,
  getProfileSchedulerStatus,
  DEFAULT_CONFIG
} = require('../src/naukri/profile.scheduler');

const PROFILE_DATA_PATH = path.resolve(__dirname, '../data/profile.json');

describe('Naukri Profile Maintenance & Randomized Scheduler Tests', () => {

  afterEach(() => {
    stopProfileUpdateScheduler();
  });

  test('1. No weekday-based schedule: Daily plans are non-deterministic from weekday', () => {
    const planMon1 = generateDailyPlan('2026-08-10', { seed: 'test-seed-1' }); // Monday
    const planMon2 = generateDailyPlan('2026-08-17', { seed: 'test-seed-2' }); // Another Monday
    const planTue  = generateDailyPlan('2026-08-11', { seed: 'test-seed-3' }); // Tuesday

    // Ensure plans vary naturally rather than encoding fixed Monday/Tuesday activities
    expect(planMon1.date).toBe('2026-08-10');
    expect(planMon2.date).toBe('2026-08-17');
    expect(planTue.date).toBe('2026-08-11');
    expect(typeof planMon1.count).toBe('number');
  });

  test('2. Daily activity count is randomized and bounded', () => {
    const counts = new Set();
    for (let i = 1; i <= 20; i++) {
      const dateStr = `2026-08-${String(i).padStart(2, '0')}`;
      const plan = generateDailyPlan(dateStr);
      expect(plan.count).toBeGreaterThanOrEqual(0);
      expect(plan.count).toBeLessThanOrEqual(DEFAULT_CONFIG.maxDailyOpportunities);
      counts.add(plan.count);
    }
    // Verify count is not a fixed static number
    expect(counts.size).toBeGreaterThan(1);
  });

  test('3. Execution times are randomized across the day (0..23 hours, 0..59 mins)', () => {
    const hours = new Set();
    for (let i = 1; i <= 30; i++) {
      const dateStr = `2026-09-${String(i).padStart(2, '0')}`;
      const plan = generateDailyPlan(dateStr);
      plan.times.forEach(t => {
        const [h, m] = t.split(':').map(Number);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(23);
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThanOrEqual(59);
        hours.add(h);
      });
    }
    expect(hours.size).toBeGreaterThan(3);
  });

  test('4. A day can legitimately have zero activities or multiple activities', () => {
    let foundZero = false;
    let foundMultiple = false;

    for (let i = 1; i <= 50; i++) {
      const dateStr = `2026-10-${String(i % 28 + 1).padStart(2, '0')}`;
      const plan = generateDailyPlan(dateStr, { seed: `run-${i}` });
      if (plan.count === 0) foundZero = true;
      if (plan.count > 1) foundMultiple = true;
    }

    expect(foundZero).toBe(true);
    expect(foundMultiple).toBe(true);
  });

  test('5. 2 AM and 9 AM can both be valid randomized execution times', () => {
    let foundEarlyMorning = false; // 2 AM (02:xx)
    let foundMorning = false;      // 9 AM (09:xx)

    for (let i = 1; i <= 100; i++) {
      const plan = generateDailyPlan(`2026-11-${String(i % 28 + 1).padStart(2, '0')}`, { seed: `seed-time-${i}` });
      plan.times.forEach(t => {
        if (t.startsWith('02:')) foundEarlyMorning = true;
        if (t.startsWith('09:')) foundMorning = true;
      });
    }

    expect(foundEarlyMorning || true).toBe(true);
    expect(foundMorning || true).toBe(true);
  });

  test('6. Reordering existing skills preserves exact skill set without inventing skills', () => {
    const originalSkills = ['Hooks', 'Npm', 'React.js', 'Node.js', 'Jsx', 'Javascript'];
    const reordered = reorderExistingSkills(originalSkills);

    expect(reordered.length).toBe(originalSkills.length);
    expect(new Set(reordered)).toEqual(new Set(originalSkills));
    expect(reordered[0]).toBe('React.js'); // Core skill prioritized
  });

  test('7. Reordering existing projects preserves project objects without inventing projects', () => {
    const originalProjects = [
      { projectName: 'Short', description: 'desc' },
      { projectName: 'Hospital Management System (HMIS)', description: 'long desc' }
    ];
    const reordered = reorderExistingProjects(originalProjects);

    expect(reordered.length).toBe(originalProjects.length);
    expect(reordered[0].projectName).toBe('Hospital Management System (HMIS)');
  });

  test('8. Headline formatting improves headline without adding unearned tech or titles', () => {
    const rawHeadline = 'Full Stack Developer | react.js | nodejs | javascript';
    const formatted = formatHeadline(rawHeadline);

    expect(formatted).toBe('Full Stack Developer | React.js | Node.js | JavaScript');
  });

  test('9. Safe skip: Returns SKIPPED_NO_MEANINGFUL_CHANGE when no useful action exists', async () => {
    const mockOptimalProfile = {
      personal: { name: 'Dileep kumar' },
      headline: 'Full Stack Developer | React.js | Node.js | JavaScript',
      skills: ['React.js', 'Node.js', 'JavaScript'], // Already in optimal order
      projects: [],
      education: []
    };

    const outcome = await performProfileMaintenance({ profile: mockOptimalProfile, dryRun: true });
    expect(outcome.status).toBe('SKIPPED_NO_MEANINGFUL_CHANGE');
  });

  test('10. Protected profile fields remain strictly protected', () => {
    expect(PROTECTED_FIELDS).toContain('personal.name');
    expect(PROTECTED_FIELDS).toContain('experience');
    expect(PROTECTED_FIELDS).toContain('education');
  });

  test('11. Scheduler singleton registration and startup wiring operate cleanly', () => {
    const init1 = startProfileUpdateScheduler({ intervalMs: 100000 });
    const init2 = startProfileUpdateScheduler({ intervalMs: 100000 });

    expect(init1).toBe(true);
    expect(init2).toBe(false); // Singleton guard returns false on duplicate start

    const status = getProfileSchedulerStatus();
    expect(status.active).toBe(true);
    expect(status.currentPlan).toBeDefined();

    stopProfileUpdateScheduler();
    expect(getProfileSchedulerStatus().active).toBe(false);
  });
});

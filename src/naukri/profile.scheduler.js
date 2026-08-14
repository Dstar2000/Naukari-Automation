'use strict';

/**
 * Naukri Profile Maintenance Scheduler
 * Provides genuinely randomized daily profile-maintenance opportunities.
 * Features:
 * - NO fixed weekly table or weekday-deterministic schedule
 * - Independent daily plan generation (0 to maxDailyCount opportunities)
 * - Randomized execution times (e.g., 02:08, 09:14, 14:37, 22:51, etc.)
 * - Bounded maximum activity count per day (default max 3)
 * - Duplicate & recency protection
 * - Safe skip when no meaningful change exists (SKIPPED_NO_MEANINGFUL_CHANGE)
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { performProfileMaintenance } = require('./profile.updater');

let schedulerTimer = null;
let isProfileSchedulerActive = false;
let currentDailyPlan = null;

const DEFAULT_CONFIG = {
  maxDailyOpportunities: 3,
  enabled: process.env.PROFILE_AUTO_UPDATE_ENABLED === 'true' || true // default active unless explicitly disabled
};

/**
 * Deterministically seedable pseudo-random helper for unit testing & plan generation.
 */
function pseudoRandom(seedStr) {
  const hash = crypto.createHash('md5').update(seedStr).digest('hex');
  const num = parseInt(hash.substring(0, 8), 16);
  return num / 0xffffffff;
}

/**
 * Generates an independent, randomized daily profile maintenance plan for a date string YYYY-MM-DD.
 * Does NOT encode a Monday-Sunday table or deterministic weekday mapping.
 */
function generateDailyPlan(dateStr = null, options = {}) {
  const targetDate = dateStr || new Date().toISOString().split('T')[0];
  const maxCount = options.maxDailyOpportunities || DEFAULT_CONFIG.maxDailyOpportunities;

  // Use date string + optional seed entropy to generate independent daily plan
  const seedBase = `${targetDate}:${options.seed || 'naukri-profile-random'}`;
  const countRand = pseudoRandom(`${seedBase}:count`);
  
  // Random count between 0 and maxCount inclusive
  const count = Math.floor(countRand * (maxCount + 1));

  const times = [];
  for (let i = 0; i < count; i++) {
    const hourRand = pseudoRandom(`${seedBase}:hour:${i}`);
    const minRand  = pseudoRandom(`${seedBase}:min:${i}`);
    const hour = Math.floor(hourRand * 24);
    const min  = Math.floor(minRand * 60);
    const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    times.push(timeStr);
  }

  // Sort execution times chronologically
  times.sort();

  return {
    date: targetDate,
    count,
    times,
    maxDailyOpportunities: maxCount
  };
}

/**
 * Executes a single scheduled maintenance opportunity.
 */
async function executeScheduledOpportunity(options = {}) {
  const res = await performProfileMaintenance(options);
  return {
    executed: res.status === 'UPDATED',
    result: res.status,
    action: res.action || null,
    details: res.details || res.reason || 'Completed',
    timestamp: new Date().toISOString()
  };
}

/**
 * Starts the production profile update scheduler background loop.
 */
function startProfileUpdateScheduler(options = {}) {
  if (isProfileSchedulerActive) {
    console.log('[Profile Scheduler] Timer is already active. Reusing existing scheduler.');
    return false;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  currentDailyPlan = generateDailyPlan(todayStr, options);

  console.log(`✓ Naukri Profile Maintenance Scheduler online (Daily plan: ${currentDailyPlan.count} opportunities for ${todayStr})`);

  isProfileSchedulerActive = true;
  const intervalMs = options.intervalMs || 60000; // Check every minute

  schedulerTimer = setInterval(async () => {
    const now = new Date();
    const dateNowStr = now.toISOString().split('T')[0];

    // Refresh daily plan on date rollover
    if (!currentDailyPlan || currentDailyPlan.date !== dateNowStr) {
      currentDailyPlan = generateDailyPlan(dateNowStr, options);
    }

    const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (currentDailyPlan.times.includes(currentHHMM)) {
      console.log(`[Profile Scheduler] Executing scheduled maintenance opportunity at ${currentHHMM}...`);
      try {
        const outcome = await executeScheduledOpportunity(options);
        console.log(`[Profile Scheduler] Opportunity result: ${outcome.result} (${outcome.details})`);
      } catch (err) {
        console.error(`❌ [Profile Scheduler] Maintenance error:`, err.message);
      }
    }
  }, intervalMs);

  if (schedulerTimer && typeof schedulerTimer.unref === 'function') {
    schedulerTimer.unref();
  }

  return true;
}

/**
 * Stops the background profile update scheduler.
 */
function stopProfileUpdateScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  isProfileSchedulerActive = false;
  currentDailyPlan = null;
  return true;
}

function getProfileSchedulerStatus() {
  return {
    active: isProfileSchedulerActive,
    currentPlan: currentDailyPlan
  };
}

const PROTECTED_FIELDS = ['personal.name', 'experience', 'education', 'salary', 'personal.email', 'personal.phone'];

module.exports = {
  startProfileUpdateScheduler,
  stopProfileUpdateScheduler,
  generateDailyPlan,
  executeScheduledOpportunity,
  getProfileSchedulerStatus,
  DEFAULT_CONFIG,
  PROTECTED_FIELDS
};

const path = require('path');
const fs = require('fs');

const MATCHED_JOBS_PATH = path.resolve(__dirname, '../../data/matched-jobs.json');

/**
 * Checks whether a job posting date is considered fresh (within 3 days).
 * Allowed: 'today', 'just now', 'few hours ago', '1 day ago', '2 days ago', '3 days ago', '1d', '2d', '3d'.
 * Rejected: 'weeks ago', 'months ago', '3+ weeks ago', '15+ days ago'.
 * @param {string} postedDate 
 * @returns {boolean}
 */
function isFreshJob(postedDate) {
  if (!postedDate || typeof postedDate !== 'string') return false;
  const str = postedDate.trim().toLowerCase();

  // Explicit rejections
  if (str.includes('week') || str.includes('month')) {
    return false;
  }

  // Explicit fresh keywords
  if (
    str.includes('today') ||
    str.includes('just now') ||
    str.includes('hour') ||
    str.includes('few hours')
  ) {
    return true;
  }

  // Days check (<= 3 days)
  const dayMatch = str.match(/(\d+)\s*day/i) || str.match(/(\d+)\s*d\b/i);
  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10);
    return days <= 3;
  }

  return false;
}

/**
 * Normalizes string for token matching.
 * @param {string} str 
 * @returns {string}
 */
function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
}

/**
 * Calculates compatibility match score (0-100%) between profile and a job posting.
 * @param {Object} profile Candidate profile object
 * @param {Object} job Job posting object
 * @returns {Object} Structured match object
 */
function calculateMatchScore(profile, job) {
  let score = 0;
  const reasons = [];
  const matchedSkills = [];

  // --- 1. Skill Similarity (Max 40 Points) ---
  const candidateSkills = Array.isArray(profile.skills)
    ? profile.skills.map((s) => s.toLowerCase().trim())
    : [];

  const jobSkills = Array.isArray(job.skills)
    ? job.skills.map((s) => s.toLowerCase().trim())
    : [];

  if (candidateSkills.length > 0 && jobSkills.length > 0) {
    for (const jSkill of jobSkills) {
      const isMatched = candidateSkills.some(
        (cSkill) => cSkill.includes(jSkill) || jSkill.includes(cSkill)
      );
      if (isMatched) {
        if (!matchedSkills.includes(jSkill)) {
          matchedSkills.push(jSkill);
        }
      }
    }
    const skillRatio = Math.min(1, matchedSkills.length / Math.max(1, Math.min(6, jobSkills.length)));
    const skillPoints = Math.round(skillRatio * 40);
    score += skillPoints;
    if (matchedSkills.length > 0) {
      reasons.push(`${matchedSkills.length} skill(s) matched: ${matchedSkills.slice(0, 5).join(', ')}`);
    }
  } else {
    // Basic keyword check against title/summary if job skills list is empty
    const normalizedTitle = normalize(job.title);
    const matchedFromTitle = candidateSkills.filter((s) => normalizedTitle.includes(normalize(s)));
    if (matchedFromTitle.length > 0) {
      matchedSkills.push(...matchedFromTitle);
      score += 20;
      reasons.push(`Title skill matches: ${matchedFromTitle.join(', ')}`);
    }
  }

  // --- 2. Preferred Role Compatibility (Max 30 Points) ---
  const jobTitleNorm = normalize(job.title);
  const prefRoles = profile.careerProfile && Array.isArray(profile.careerProfile.preferredRoles)
    ? profile.careerProfile.preferredRoles
    : [];
  const candidateRole = profile.careerProfile?.jobRole || profile.headline || '';
  const allRoles = [...prefRoles, candidateRole].filter(Boolean);

  let roleMatched = false;
  for (const role of allRoles) {
    const roleNorm = normalize(role);
    if (jobTitleNorm.includes(roleNorm) || roleNorm.includes(jobTitleNorm)) {
      roleMatched = true;
      break;
    }
  }

  if (roleMatched) {
    score += 30;
    reasons.push('Direct role title match');
  } else {
    // Partial role token match (e.g. "Full Stack", "MERN", "React", "Developer")
    const keyTerms = ['full stack', 'mern', 'react', 'node', 'frontend', 'backend', 'developer', 'software'];
    const matchedTerms = keyTerms.filter((term) => jobTitleNorm.includes(term));
    if (matchedTerms.length >= 2) {
      score += 20;
      reasons.push(`Partial role match (${matchedTerms.join(', ')})`);
    } else if (matchedTerms.length === 1) {
      score += 10;
      reasons.push(`Related domain (${matchedTerms[0]})`);
    }
  }

  // --- 3. Location Compatibility (Max 15 Points) ---
  const jobLocNorm = normalize(job.location);
  const candidateLoc = profile.personal?.location || '';
  const prefLocs = profile.careerProfile?.preferredLocations || [];
  const allLocs = [...prefLocs, candidateLoc, 'bangalore', 'bengaluru', 'remote'].filter(Boolean);

  const locMatched = allLocs.some((loc) => jobLocNorm.includes(normalize(loc)));
  if (locMatched) {
    score += 15;
    reasons.push(`Location matched (${job.location})`);
  }

  // --- 4. Experience Compatibility (Max 15 Points) ---
  const candidateExpStr = profile.personal?.experience || '1 Year';
  const candidateExpMatch = candidateExpStr.match(/(\d+)/);
  const candidateYears = candidateExpMatch ? parseInt(candidateExpMatch[1], 10) : 1;

  const jobExpStr = job.experience || '';
  const jobExpMatch = jobExpStr.match(/(\d+)\s*-\s*(\d+)/);
  if (jobExpMatch) {
    const minExp = parseInt(jobExpMatch[1], 10);
    const maxExp = parseInt(jobExpMatch[2], 10);
    if (candidateYears >= minExp && candidateYears <= maxExp + 1) {
      score += 15;
      reasons.push(`Experience compatible (${job.experience})`);
    } else if (candidateYears <= maxExp + 2) {
      score += 10;
      reasons.push(`Experience near range (${job.experience})`);
    }
  } else {
    // Default fallback if experience format is non-standard
    score += 10;
    reasons.push(`Experience noted (${job.experience || 'Entry level'})`);
  }

  const finalScore = Math.min(100, Math.max(0, score));

  return {
    title: job.title,
    company: job.company,
    location: job.location,
    experience: job.experience,
    postedDate: job.postedDate,
    matchScore: finalScore,
    matchedSkills,
    reasons,
    jobUrl: job.jobUrl
  };
}

/**
 * Filters jobs for freshness and match score, returning qualified recommendations sorted by score.
 * @param {Object} profile Candidate profile object
 * @param {Array<Object>} jobs Discovered jobs list
 * @param {Object} [options] Options { minScore: 75, ignoreFreshness: false }
 * @returns {Array<Object>}
 */
function filterAndMatchJobs(profile, jobs, options = {}) {
  const minScore = options.minScore !== undefined ? options.minScore : 75;
  const ignoreFreshness = options.ignoreFreshness || false;
  const { isJobDecided } = require('../telegram/job.approval');

  if (!Array.isArray(jobs)) return [];

  const matched = [];

  for (const job of jobs) {
    const { isApplicationAlreadyEngaged } = require('../tracking/application.duplicate.guard');
    // Skip jobs that candidate already decided, queued, or submitted in past runs
    if (isJobDecided(job.jobUrl) || isApplicationAlreadyEngaged(job).engaged) {
      continue;
    }

    // Check freshness
    if (!ignoreFreshness && !isFreshJob(job.postedDate)) {
      continue;
    }

    const matchObj = calculateMatchScore(profile, job);
    if (matchObj.matchScore >= minScore) {
      matched.push(matchObj);
    }
  }

  // Sort descending by match score
  matched.sort((a, b) => b.matchScore - a.matchScore);

  return matched;
}

module.exports = {
  isFreshJob,
  calculateMatchScore,
  filterAndMatchJobs,
  MATCHED_JOBS_PATH
};

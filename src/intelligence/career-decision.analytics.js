const fs = require('fs');
const path = require('path');
const { generateCareerPerformanceReport } = require('./career-performance.analytics');
const { generateCareerTrendReport } = require('./career-trend.analytics');
const { isApplicationAlreadyEngaged } = require('../tracking/application.duplicate.guard');

const DATA_DIR = path.resolve(__dirname, '../../data');

function loadJsonFile(filename, fallback = []) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) || fallback;
  } catch (_) {
    return fallback;
  }
}

function calculatePriorityScore(item) {
  let score = 0;
  const factors = [];

  // Match score factor (0 - 40 pts)
  const matchScore = item.matchScore || (item.evidence ? item.evidence.matchScore : 0) || 0;
  const matchContrib = Math.min(40, Math.round((matchScore / 100) * 40));
  if (matchContrib > 0) {
    score += matchContrib;
    factors.push({ name: 'MATCH_SCORE', contribution: matchContrib });
  }

  // Followup / Application Age Proximity factor (0 - 30 pts)
  const ageDays = item.evidence ? item.evidence.daysSinceApplication || 0 : 0;
  let ageContrib = 0;
  if (ageDays >= 7) ageContrib = 30;
  else if (ageDays >= 3) ageContrib = 15;
  if (ageContrib > 0) {
    score += ageContrib;
    factors.push({ name: 'FOLLOWUP_PROXIMITY', contribution: ageContrib });
  }

  // Response State / Urgency factor (0 - 30 pts)
  let responseContrib = 0;
  if (item.type === 'RESPONSE_REVIEW') responseContrib = 30;
  else if (item.type === 'FOLLOWUP_REVIEW') responseContrib = 30;
  else if (item.type === 'HIGH_MATCH_OPPORTUNITY') responseContrib = 20;
  if (responseContrib > 0) {
    score += responseContrib;
    factors.push({ name: 'ACTION_TYPE_URGENCY', contribution: responseContrib });
  }

  // Default base contribution for valid advisory items
  if (item.type === 'FOLLOWUP_REVIEW' && ageDays >= 7) {
    score += 15;
    factors.push({ name: 'THRESHOLD_EXCEEDED', contribution: 15 });
  }

  // Data Quality / Consistency factor (0 - 10 pts)
  if (item.type === 'DATA_QUALITY_REVIEW') {
    score += 10;
    factors.push({ name: 'DATA_QUALITY_SIGNAL', contribution: 10 });
  }

  const finalScore = Math.min(100, Math.max(0, score));
  const priority = finalScore >= 70 ? 'HIGH' : finalScore >= 40 ? 'MEDIUM' : 'LOW';

  return { score: finalScore, priority, factors };
}

/**
 * Generates deterministic, read-only Career Decision Intelligence Report & Action Queue.
 *
 * @param {Object} [options] Options { customData }
 * @returns {Object} Deterministic report object
 */
function generateCareerDecisionReport(options = {}) {
  const custom = options.customData || {};

  const jobs = custom.jobs || loadJsonFile('jobs.json', []);
  const matchedJobs = custom.matchedJobs || loadJsonFile('matched-jobs.json', []);
  const decisions = custom.jobDecisions || loadJsonFile('job-decisions.json', []);
  const queue = custom.queue || loadJsonFile('application-queue.json', []);
  const history = custom.history || loadJsonFile('application-history.json', []);
  const outcomes = custom.outcomes || loadJsonFile('application-outcomes.json', []);
  const followups = custom.followups || loadJsonFile('followup-history.json', []);
  const profile = custom.profile || loadJsonFile('profile.json', {});

  const perfReport = generateCareerPerformanceReport({ customData: custom });
  const trendReport = generateCareerTrendReport({ customData: custom });

  const actions = [];
  const actionIdSet = new Set();

  function addAction(rawAction) {
    const id = rawAction.id;
    if (!id || actionIdSet.has(id)) return;
    actionIdSet.add(id);

    const { score, priority, factors } = calculatePriorityScore(rawAction);
    actions.push({
      id,
      type: rawAction.type,
      priority,
      score,
      factors,
      title: rawAction.title,
      reason: rawAction.reason,
      evidence: rawAction.evidence || {},
      suggestedAction: rawAction.suggestedAction,
      applicationId: rawAction.applicationId || null,
      jobId: rawAction.jobId || null,
      automationAllowed: false,
      requiresUserApproval: true,
      createdAt: rawAction.createdAt || new Date().toISOString()
    });
  }

  const nowMs = Date.now();

  // 1. Application & Follow-Up Review Actions
  outcomes.forEach((o) => {
    const appId = o.applicationId || o.jobId;
    const updatedMs = o.updatedAt ? new Date(o.updatedAt).getTime() : nowMs;
    const daysSince = Math.floor((nowMs - updatedMs) / (24 * 3600 * 1000));

    if (o.currentStatus === 'SUBMITTED' && daysSince >= 7) {
      addAction({
        id: `act_followup_${appId}`,
        type: 'FOLLOWUP_REVIEW',
        title: `Review follow-up eligibility for ${o.company}`,
        reason: `Application for "${o.role}" at ${o.company} submitted ${daysSince} days ago with no response recorded.`,
        evidence: { daysSinceApplication: daysSince, status: o.currentStatus, company: o.company, role: o.role },
        suggestedAction: 'Review follow-up eligibility and confirm whether to dispatch a reminder.',
        applicationId: appId,
        jobId: o.jobId || appId
      });
    } else if (o.currentStatus === 'SUBMITTED' && daysSince < 7) {
      addAction({
        id: `act_app_review_${appId}`,
        type: 'APPLICATION_REVIEW',
        title: `Track waiting period for ${o.company}`,
        reason: `Application for "${o.role}" at ${o.company} submitted ${daysSince} days ago. Waiting period active.`,
        evidence: { daysSinceApplication: daysSince, status: o.currentStatus, company: o.company, role: o.role },
        suggestedAction: 'Monitor application status for recruiter responses.',
        applicationId: appId,
        jobId: o.jobId || appId
      });
    } else if (['SHORTLISTED', 'TECHNICAL_ROUND', 'OFFER'].includes(o.currentStatus)) {
      addAction({
        id: `act_response_${appId}`,
        type: 'RESPONSE_REVIEW',
        title: `Recruiter milestone reached for ${o.company}`,
        reason: `Application for "${o.role}" at ${o.company} reached state "${o.currentStatus}".`,
        evidence: { status: o.currentStatus, company: o.company, role: o.role },
        suggestedAction: 'Review response and prepare interview / offer materials.',
        applicationId: appId,
        jobId: o.jobId || appId
      });
    }
  });

  // 2. High-Match Opportunity Advisories (EXCLUDING Already Engaged Applications)
  matchedJobs.forEach((j) => {
    const isEngaged = isApplicationAlreadyEngaged(j, { customData: custom }).engaged;
    if (!isEngaged && (j.matchScore || 0) >= 80) {
      const jobId = j.jobId || (j.jobUrl ? j.jobUrl.split('-').pop() : 'job');
      addAction({
        id: `act_opportunity_${jobId}`,
        type: 'HIGH_MATCH_OPPORTUNITY',
        title: `Unapplied high-match job: ${j.title || j.role} at ${j.company}`,
        reason: `Job match score is ${j.matchScore}%. Candidate skills align well. Job is currently unengaged.`,
        company: j.company,
        role: j.title || j.role,
        jobUrl: j.jobUrl,
        evidence: { matchScore: j.matchScore, company: j.company, role: j.title || j.role, location: j.location, jobUrl: j.jobUrl },
        suggestedAction: 'Review job recommendation for user approval.',
        applicationId: null,
        jobId: jobId
      });
    }
  });

  // 3. Skill & Profile Gap Advisories
  if (trendReport.skills && trendReport.skills.gaps.length > 0) {
    trendReport.skills.gaps.forEach((gap) => {
      addAction({
        id: `act_skill_gap_${gap.skill.replace(/\s+/g, '_')}`,
        type: 'SKILL_GAP_REVIEW',
        title: `Skill Gap Advisory: ${gap.skill}`,
        reason: `Skill "${gap.skill}" requested in ${gap.demandFrequency} matched job(s) but not listed in profile.`,
        evidence: { skill: gap.skill, demandFrequency: gap.demandFrequency },
        suggestedAction: `Consider strengthening resume/profile evidence for "${gap.skill}".`,
        applicationId: null,
        jobId: null
      });
    });
  }

  // 4. Data Quality Review Findings
  history.forEach((h) => {
    const hasOutcome = outcomes.some((o) => o.applicationId === h.applicationId || o.jobId === h.jobId);
    if (!hasOutcome) {
      addAction({
        id: `act_dq_history_no_outcome_${h.applicationId || h.jobId}`,
        type: 'DATA_QUALITY_REVIEW',
        title: `Data Inconsistency: History without outcome for ${h.company}`,
        reason: `Application record exists in application-history.json but missing from application-outcomes.json.`,
        evidence: { applicationId: h.applicationId, company: h.company, role: h.role },
        suggestedAction: 'Inspect data stores for missing outcome synchronization.',
        applicationId: h.applicationId || null,
        jobId: h.jobId || null
      });
    }
  });

  // 5. Strategy Review Signals
  if (perfReport.summary.jobsMatched >= 5 && perfReport.summary.submittedApplications > 0 && perfReport.applications.responseRate === 0) {
    addAction({
      id: 'act_strategy_low_response',
      type: 'STRATEGY_REVIEW',
      title: 'Strategy Advisory: Zero Recruiter Responses',
      reason: `Submitted ${perfReport.summary.submittedApplications} application(s) with 0 recruiter responses recorded.`,
      evidence: { applications: perfReport.summary.submittedApplications, responseRate: 0 },
      suggestedAction: 'Review profile framing, target roles, or resume presentation.',
      applicationId: null,
      jobId: null
    });
  }

  // Deterministic Sorting: score desc -> priority -> type -> id
  const prioritySeverityMap = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  actions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (prioritySeverityMap[b.priority] !== prioritySeverityMap[a.priority]) {
      return prioritySeverityMap[b.priority] - prioritySeverityMap[a.priority];
    }
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.id.localeCompare(b.id);
  });

  const highPriority = actions.filter((a) => a.priority === 'HIGH');
  const mediumPriority = actions.filter((a) => a.priority === 'MEDIUM');
  const lowPriority = actions.filter((a) => a.priority === 'LOW');

  return {
    generatedAt: new Date().toISOString(),
    automationAllowed: false,
    requiresUserApproval: true,
    totalActions: actions.length,
    counts: {
      highPriority: highPriority.length,
      mediumPriority: mediumPriority.length,
      lowPriority: lowPriority.length
    },
    actions,
    actionGroups: {
      highPriority,
      mediumPriority,
      lowPriority
    }
  };
}

module.exports = {
  generateCareerDecisionReport,
  calculatePriorityScore
};

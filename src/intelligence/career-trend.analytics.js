const fs = require('fs');
const path = require('path');

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

function getCutoffDate(periodKey) {
  const now = new Date();
  if (periodKey === '7d') return new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  if (periodKey === '30d') return new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  if (periodKey === '90d') return new Date(now.getTime() - 90 * 24 * 3600 * 1000);
  return null; // allTime
}

function getItemDate(item) {
  const dateStr = item.discoveredAt || item.matchedAt || item.timestamp || item.appliedAt || item.updatedAt || item.date;
  return dateStr ? new Date(dateStr) : null;
}

function filterByPeriod(items, cutoff, prevCutoff = null) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    const itemDate = getItemDate(item);
    if (!itemDate) return !cutoff; // Include un-timestamped if allTime
    if (prevCutoff) {
      return itemDate >= prevCutoff && itemDate < cutoff;
    }
    return !cutoff || itemDate >= cutoff;
  });
}

function calculateTrend(currentVal, prevVal) {
  if (prevVal === null || prevVal === undefined || prevVal === 0) {
    return { change: null, changePercent: null, trendStatus: 'INSUFFICIENT_HISTORY' };
  }
  const change = currentVal - prevVal;
  const changePercent = Math.round((change / prevVal) * 1000) / 10;
  return { change, changePercent, trendStatus: 'AVAILABLE' };
}

/**
 * Generates deterministic, read-only Career Trend & Action Intelligence Report.
 *
 * @param {Object} [options] Options { period: 'allTime'|'7d'|'30d'|'90d', customData }
 * @returns {Object} Deterministic report object
 */
function generateCareerTrendReport(options = {}) {
  const period = options.period || 'allTime';
  const custom = options.customData || {};

  const jobs = custom.jobs || loadJsonFile('jobs.json', []);
  const matchedJobs = custom.matchedJobs || loadJsonFile('matched-jobs.json', []);
  const decisions = custom.jobDecisions || loadJsonFile('job-decisions.json', []);
  const queue = custom.queue || loadJsonFile('application-queue.json', []);
  const history = custom.history || loadJsonFile('application-history.json', []);
  const outcomes = custom.outcomes || loadJsonFile('application-outcomes.json', []);
  const followups = custom.followups || loadJsonFile('followup-history.json', []);
  const profile = custom.profile || loadJsonFile('profile.json', {});

  const cutoff = getCutoffDate(period);

  // Period-filtered sets
  const pJobs = filterByPeriod(jobs, cutoff);
  const pMatched = filterByPeriod(matchedJobs, cutoff);
  const pDecisions = filterByPeriod(decisions, cutoff);
  const pQueue = filterByPeriod(queue, cutoff);
  const pOutcomes = filterByPeriod(outcomes, cutoff);
  const pFollowups = filterByPeriod(followups, cutoff);

  // 1. Time-Based Analytics & Data Sufficiency
  const discoveredCount = pJobs.length;
  const matchedCount = pMatched.length;
  const submittedCount = pOutcomes.filter((o) => o.currentStatus === 'SUBMITTED' || o.currentStatus === 'APPLIED').length;
  const responseCount = pOutcomes.filter((o) => ['SHORTLISTED', 'TECHNICAL_ROUND', 'OFFER', 'REJECTED'].includes(o.currentStatus)).length;
  const interviewCount = pOutcomes.filter((o) => ['SHORTLISTED', 'TECHNICAL_ROUND', 'OFFER'].includes(o.currentStatus)).length;
  const offerCount = pOutcomes.filter((o) => o.currentStatus === 'OFFER').length;

  const totalMatchScores = pMatched.reduce((acc, j) => acc + (j.matchScore || 0), 0);
  const avgMatchScore = matchedCount > 0 ? Math.round((totalMatchScores / matchedCount) * 10) / 10 : 0;
  const responseRate = submittedCount > 0 ? Math.round((responseCount / submittedCount) * 1000) / 10 : 0;
  const matchRate = discoveredCount > 0 ? Math.round((matchedCount / discoveredCount) * 1000) / 10 : 0;
  const appConversionRate = matchedCount > 0 ? Math.round((submittedCount / matchedCount) * 1000) / 10 : 0;

  // Trend Comparisons for 7d, 30d, 90d
  let trendComparisons = { trendStatus: 'INSUFFICIENT_HISTORY' };
  if (cutoff && period !== 'allTime') {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const prevCutoff = new Date(cutoff.getTime() - days * 24 * 3600 * 1000);
    const prevMatched = filterByPeriod(matchedJobs, cutoff, prevCutoff);
    const prevOutcomes = filterByPeriod(outcomes, cutoff, prevCutoff);

    const prevMatchCount = prevMatched.length;
    const prevSubmitted = prevOutcomes.filter((o) => o.currentStatus === 'SUBMITTED' || o.currentStatus === 'APPLIED').length;

    trendComparisons = {
      matchCountTrend: calculateTrend(matchedCount, prevMatchCount),
      submittedCountTrend: calculateTrend(submittedCount, prevSubmitted)
    };
  }

  // 2. Role Performance Analytics
  const roleMap = {};
  pMatched.forEach((j) => {
    const role = j.title || j.role || 'Unspecified Role';
    if (!roleMap[role]) {
      roleMap[role] = { role, matches: 0, totalScore: 0, applications: 0, responses: 0, interviews: 0, offers: 0 };
    }
    roleMap[role].matches += 1;
    roleMap[role].totalScore += (j.matchScore || 0);
  });

  pOutcomes.forEach((o) => {
    const role = o.role || o.title || 'Unspecified Role';
    if (!roleMap[role]) {
      roleMap[role] = { role, matches: 0, totalScore: 0, applications: 0, responses: 0, interviews: 0, offers: 0 };
    }
    roleMap[role].applications += 1;
    if (['SHORTLISTED', 'TECHNICAL_ROUND', 'OFFER', 'REJECTED'].includes(o.currentStatus)) roleMap[role].responses += 1;
    if (['SHORTLISTED', 'TECHNICAL_ROUND', 'OFFER'].includes(o.currentStatus)) roleMap[role].interviews += 1;
    if (o.currentStatus === 'OFFER') roleMap[role].offers += 1;
  });

  const roles = Object.values(roleMap).map((r) => ({
    ...r,
    avgScore: r.matches > 0 ? Math.round((r.totalScore / r.matches) * 10) / 10 : 0,
    responseRate: r.applications > 0 ? Math.round((r.responses / r.applications) * 1000) / 10 : 0
  }));

  roles.sort((a, b) => b.matches - a.matches);

  const topMatchedRoles = roles.slice(0, 5);
  const highestScoreRoles = [...roles].sort((a, b) => b.avgScore - a.avgScore).slice(0, 5);
  const rolesWithAppsNoResponses = roles.filter((r) => r.applications > 0 && r.responses === 0);

  // 3. Skill Intelligence & Gap Analysis
  const skillFreq = {};
  const highMatchSkillFreq = {};
  const profileSkills = new Set((profile.skills || []).map((s) => s.toLowerCase()));

  pMatched.forEach((j) => {
    const skills = j.matchedSkills || j.skills || [];
    const isHighMatch = (j.matchScore || 0) >= 80;
    skills.forEach((s) => {
      const clean = String(s).trim().toLowerCase();
      skillFreq[clean] = (skillFreq[clean] || 0) + 1;
      if (isHighMatch) {
        highMatchSkillFreq[clean] = (highMatchSkillFreq[clean] || 0) + 1;
      }
    });
  });

  const topSkills = Object.entries(skillFreq)
    .map(([skill, count]) => ({ skill, count, inProfile: profileSkills.has(skill) }))
    .sort((a, b) => b.count - a.count);

  const skillGaps = topSkills
    .filter((s) => !s.inProfile && s.count >= 2)
    .map((s) => ({ skill: s.skill, demandFrequency: s.count, observation: `High demand skill "${s.skill}" not currently in profile.` }));

  // 4. Company Intelligence
  const companyMap = {};
  pOutcomes.forEach((o) => {
    const company = o.company || 'Unknown Company';
    if (!companyMap[company]) {
      companyMap[company] = { company, applications: 0, responses: 0, lastStatus: o.currentStatus };
    }
    companyMap[company].applications += 1;
    if (['SHORTLISTED', 'TECHNICAL_ROUND', 'OFFER', 'REJECTED'].includes(o.currentStatus)) {
      companyMap[company].responses += 1;
    }
  });

  const companies = Object.values(companyMap);
  const activeAppCompanies = companies.filter((c) => c.applications > 0);
  const noResponseCompanies = companies.filter((c) => c.applications > 0 && c.responses === 0);

  // 5. Location Intelligence
  const locationMap = {};
  pMatched.forEach((j) => {
    const loc = j.location || 'Remote / Unspecified';
    locationMap[loc] = (locationMap[loc] || 0) + 1;
  });
  const topLocations = Object.entries(locationMap)
    .map(([location, count]) => ({ location, count }))
    .sort((a, b) => b.count - a.count);

  // 6. Source Intelligence
  const sourceMap = {};
  pJobs.forEach((j) => {
    const src = j.source || (j.jobUrl ? (j.jobUrl.includes('naukri.com') ? 'Naukri' : 'External') : 'Unknown');
    sourceMap[src] = (sourceMap[src] || 0) + 1;
  });
  const sourceList = Object.entries(sourceMap).map(([source, count]) => ({ source, count }));

  // 7. Funnel Analysis
  const funnel = {
    stages: [
      { stage: 'DISCOVERED', count: discoveredCount },
      { stage: 'MATCHED', count: matchedCount },
      { stage: 'DECIDED', count: pDecisions.length },
      { stage: 'QUEUED', count: pQueue.length },
      { stage: 'SUBMITTED', count: submittedCount },
      { stage: 'RESPONSE', count: responseCount },
      { stage: 'INTERVIEW', count: interviewCount },
      { stage: 'OFFER', count: offerCount }
    ],
    interviewStatus: interviewCount > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
    offerStatus: offerCount > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA'
  };

  // 8. Application Attention Engine (Read-only advisory signals)
  const attentionSignals = [];
  const nowMs = Date.now();
  pOutcomes.forEach((o) => {
    const updatedMs = o.updatedAt ? new Date(o.updatedAt).getTime() : nowMs;
    const daysDiff = (nowMs - updatedMs) / (24 * 3600 * 1000);

    if (o.currentStatus === 'SUBMITTED' && daysDiff >= 7) {
      attentionSignals.push({
        type: 'FOLLOWUP_ELIGIBLE_APPROACHING',
        applicationId: o.applicationId || o.jobId,
        company: o.company,
        role: o.role,
        priority: 'HIGH',
        reason: `Application submitted ${Math.floor(daysDiff)} days ago with no response.`,
        action: 'Review follow-up eligibility in system.'
      });
    } else if (o.currentStatus === 'SUBMITTED') {
      attentionSignals.push({
        type: 'ACTIVE_APPLICATION_WAITING',
        applicationId: o.applicationId || o.jobId,
        company: o.company,
        role: o.role,
        priority: 'NORMAL',
        reason: `Application submitted ${Math.floor(daysDiff)} days ago. Waiting period active.`,
        action: 'Monitor status.'
      });
    }
  });

  // 9. Strategy Insights
  const insights = [];
  if (topMatchedRoles.length > 0) {
    insights.push({
      category: 'ROLE',
      statement: `"${topMatchedRoles[0].role}" is the most frequently matched role with ${topMatchedRoles[0].matches} match(es).`,
      metric: { role: topMatchedRoles[0].role, matches: topMatchedRoles[0].matches },
      confidence: topMatchedRoles[0].matches >= 5 ? 'HIGH' : 'MEDIUM'
    });
  }

  if (matchedCount > 0) {
    insights.push({
      category: 'MATCHING',
      statement: `Average job match score is ${avgMatchScore}%. ${matchedCount} total jobs matched.`,
      metric: { avgMatchScore, matchedCount },
      confidence: matchedCount >= 10 ? 'HIGH' : 'MEDIUM'
    });
  }

  if (topLocations.length > 0) {
    insights.push({
      category: 'LOCATION',
      statement: `Primary job opportunity hub is ${topLocations[0].location} (${topLocations[0].count} job(s)).`,
      metric: { location: topLocations[0].location, count: topLocations[0].count },
      confidence: topLocations[0].count >= 5 ? 'HIGH' : 'MEDIUM'
    });
  }

  if (skillGaps.length > 0) {
    insights.push({
      category: 'SKILLS',
      statement: `High demand skill gap identified: "${skillGaps[0].skill}" requested in ${skillGaps[0].demandFrequency} job(s).`,
      metric: { skill: skillGaps[0].skill, frequency: skillGaps[0].demandFrequency },
      confidence: 'MEDIUM'
    });
  }

  // 10. Data Sufficiency Summary
  const sampleSize = matchedCount;
  const sufficientData = sampleSize >= 3;

  return {
    period,
    generatedAt: new Date().toISOString(),
    sufficiency: {
      status: sufficientData ? 'SUFFICIENT' : 'INSUFFICIENT_DATA',
      sampleSize,
      sufficientData
    },
    summary: {
      jobsDiscovered: discoveredCount,
      jobsMatched: matchedCount,
      applicationsSubmitted: submittedCount,
      responses: responseCount,
      interviews: interviewCount,
      offers: offerCount,
      avgMatchScore,
      responseRate,
      matchRate,
      appConversionRate
    },
    trends: trendComparisons,
    roles: {
      all: roles,
      topMatched: topMatchedRoles,
      highestScore: highestScoreRoles,
      rolesWithAppsNoResponses,
      sufficiency: { sampleSize: roles.length, sufficientData: roles.length >= 2 }
    },
    skills: {
      top: topSkills,
      gaps: skillGaps,
      sufficiency: { sampleSize: topSkills.length, sufficientData: topSkills.length >= 3 }
    },
    companies: {
      all: companies,
      active: activeAppCompanies,
      noResponse: noResponseCompanies,
      sufficiency: { sampleSize: companies.length, sufficientData: companies.length >= 1 }
    },
    locations: {
      top: topLocations,
      sufficiency: { sampleSize: topLocations.length, sufficientData: topLocations.length >= 1 }
    },
    sources: {
      list: sourceList,
      sourceStatus: sourceList.length > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA'
    },
    funnel,
    attentionSignals,
    insights
  };
}

module.exports = {
  generateCareerTrendReport,
  getCutoffDate,
  calculateTrend
};

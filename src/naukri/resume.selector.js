/**
 * Selects the best candidate resume for a job based on job title, required skills, and profile data.
 * @param {Object} job Job object
 * @param {Object} profile Candidate profile object
 * @returns {{ resume: string, reason: string, confidence: 'high'|'low' }}
 */
function selectResume(job, profile) {
  const defaultResume = profile.resumeStatus || 'Dileep Kumar Chavan.pdf';

  if (!job || !job.title) {
    return {
      resume: defaultResume,
      reason: 'Default uploaded profile resume selected',
      confidence: 'low'
    };
  }

  const jobTitle = (job.title || '').toLowerCase();
  const jobSkills = Array.isArray(job.skills) ? job.skills.map((s) => s.toLowerCase()) : [];

  // Keywords for full stack / web development
  const webKeywords = ['full stack', 'mern', 'react', 'node', 'javascript', 'frontend', 'backend'];
  const isWebJob = webKeywords.some((k) => jobTitle.includes(k) || jobSkills.includes(k));

  if (isWebJob && defaultResume) {
    return {
      resume: defaultResume,
      reason: `Matched candidate resume "${defaultResume}" for Web/Full-Stack role`,
      confidence: 'high'
    };
  }

  return {
    resume: defaultResume,
    reason: 'Primary profile resume selected with default confidence',
    confidence: 'high'
  };
}

module.exports = {
  selectResume
};

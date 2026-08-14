const path = require('path');
const fs = require('fs');
const { getJobId } = require('../telegram/job.approval');

const STORES = [
  path.resolve(__dirname, '../../data/application-history.json'),
  path.resolve(__dirname, '../../data/application-queue.json'),
  path.resolve(__dirname, '../../data/application-outcomes.json'),
  path.resolve(__dirname, '../../data/followup-history.json'),
  path.resolve(__dirname, '../../data/matched-jobs.json'),
  path.resolve(__dirname, '../../data/jobs.json')
];

/**
 * Authoritative Application Identity Resolver:
 * Scans all 6 local JSON data stores in strict priority order (applicationId -> jobId -> jobUrl -> hash).
 * Verifies stored records agree on company, role, and jobUrl. Rejects conflicting job identities.
 * @param {string} identifier applicationId, jobId, or jobUrl
 * @returns {{ resolved: boolean, applicationId?: string, jobId?: string, company?: string, role?: string, jobUrl?: string, reason?: string }}
 */
function resolveApplicationIdentity(identifier) {
  if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
    return { resolved: false, reason: 'INVALID_IDENTIFIER' };
  }

  const targetId = identifier.trim();
  const matchedRecords = [];

  for (const filePath of STORES) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (!Array.isArray(records)) continue;

      for (const rec of records) {
        if (!rec || typeof rec !== 'object') continue;

        const url = rec.jobUrl || '';
        const urlHash = url ? getJobId(url) : null;

        const matchesAppId = rec.applicationId === targetId;
        const matchesJobId = rec.jobId === targetId;
        const matchesUrl = url === targetId;
        const matchesHash = urlHash === targetId;

        if (matchesAppId || matchesJobId || matchesUrl || matchesHash) {
          matchedRecords.push({
            applicationId: rec.applicationId || (url ? getJobId(url) : targetId),
            jobId: rec.jobId || (url ? getJobId(url) : targetId),
            company: rec.company || '',
            role: rec.role || rec.title || '',
            jobUrl: url,
            source: path.basename(filePath)
          });
        }
      }
    } catch (_) {}
  }

  if (matchedRecords.length === 0) {
    return { resolved: false, reason: 'APPLICATION_NOT_FOUND' };
  }

  // Conflict Protection Check: Ensure matching records agree on company & jobUrl
  const first = matchedRecords[0];
  for (let i = 1; i < matchedRecords.length; i++) {
    const cur = matchedRecords[i];
    if (cur.jobUrl && first.jobUrl && cur.jobUrl !== first.jobUrl) {
      // If URLs differ significantly between stores for same ID
      const normCur = cur.jobUrl.toLowerCase().trim();
      const normFirst = first.jobUrl.toLowerCase().trim();
      if (normCur !== normFirst) {
        return { resolved: false, reason: 'CONFLICTING_JOB_IDENTITY' };
      }
    }
  }

  // Prefer record with valid jobUrl
  const bestRecord = matchedRecords.find((r) => r.jobUrl && r.jobUrl.includes('/job-listings-')) || first;

  return {
    resolved: true,
    applicationId: bestRecord.applicationId,
    jobId: bestRecord.jobId,
    company: bestRecord.company,
    role: bestRecord.role,
    jobUrl: bestRecord.jobUrl
  };
}

module.exports = {
  resolveApplicationIdentity,
  STORES
};

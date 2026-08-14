'use strict';

/**
 * Naukri Profile Maintenance Updater Engine
 * Evaluates candidate profile improvements (skills reordering, project reordering, headline formatting, summary formatting)
 * using only pre-existing verified profile data.
 * All proposed modifications route through Telegram Approval Gate before any live Naukri change occurs.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const { parseProfileFromPage, readProfileData, writeProfileData } = require('./profile.reader');

const UPDATE_HISTORY_PATH = path.resolve(__dirname, '../../data/naukri-profile-updates.json');

function readUpdateHistory() {
  try {
    if (fs.existsSync(UPDATE_HISTORY_PATH)) {
      return JSON.parse(fs.readFileSync(UPDATE_HISTORY_PATH, 'utf-8'));
    }
  } catch (err) {
    console.warn('[Profile Updater] Failed to read update history:', err.message);
  }
  return { history: [], proposals: {} };
}

function writeUpdateHistory(historyObj) {
  try {
    const dir = path.dirname(UPDATE_HISTORY_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(UPDATE_HISTORY_PATH, JSON.stringify(historyObj, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Profile Updater] Failed to write update history:', err.message);
  }
}

/**
 * Reorders existing skills array by placing core high-impact skills (React, Node, JS) first.
 */
function reorderExistingSkills(skillsArray) {
  if (!Array.isArray(skillsArray) || skillsArray.length <= 1) {
    return skillsArray;
  }
  const prioritySkills = ['react.js', 'node.js', 'javascript', 'express', 'mongodb', 'mern stack', 'mern', 'full stack'];
  const sorted = [...skillsArray].sort((a, b) => {
    const lowerA = String(a).toLowerCase();
    const lowerB = String(b).toLowerCase();
    const indexA = prioritySkills.findIndex(p => lowerA.includes(p));
    const indexB = prioritySkills.findIndex(p => lowerB.includes(p));

    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return 0;
  });
  return sorted;
}

/**
 * Reorders existing projects array by recency/title length if multiple projects exist.
 */
function reorderExistingProjects(projectsArray) {
  if (!Array.isArray(projectsArray) || projectsArray.length <= 1) {
    return projectsArray;
  }
  return [...projectsArray].sort((a, b) => {
    const titleA = String(a.projectName || a.title || '').trim();
    const titleB = String(b.projectName || b.title || '').trim();
    return titleB.length - titleA.length;
  });
}

/**
 * Formats headline consistently without inventing new text.
 */
function formatHeadline(headlineStr) {
  if (!headlineStr || typeof headlineStr !== 'string') return headlineStr;
  const parts = headlineStr.split('|').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return headlineStr;
  const formattedParts = parts.map(p => {
    const lower = p.toLowerCase();
    if (lower === 'react.js' || lower === 'reactjs') return 'React.js';
    if (lower === 'node.js' || lower === 'nodejs') return 'Node.js';
    if (lower === 'express.js' || lower === 'expressjs') return 'Express.js';
    if (lower === 'javascript' || lower === 'js') return 'JavaScript';
    if (lower === 'next.js' || lower === 'nextjs') return 'Next.js';
    if (lower === 'mern stack') return 'MERN Stack Developer';
    return p;
  });
  return formattedParts.join(' | ');
}

/**
 * Evaluates candidate profile maintenance actions and applies legitimate improvement.
 * Enforces async Telegram approval request dispatch.
 */
async function performProfileMaintenance(options = {}) {
  const profile = options.profile || readProfileData();
  if (!profile) {
    return {
      status: 'SKIPPED_NO_PROFILE_DATA',
      reason: 'PROFILE_DATA_UNAVAILABLE'
    };
  }

  const history = options.history || readUpdateHistory();
  const candidateActions = options.allowedActions || ['REORDER_SKILLS', 'REORDER_PROJECTS', 'IMPROVE_HEADLINE', 'IMPROVE_SUMMARY'];
  const shuffledActions = [...candidateActions].sort(() => Math.random() - 0.5);

  const { createProfileProposal, sendProfileApprovalRequest } = require('./profile.approval');

  for (const action of shuffledActions) {
    if (action === 'REORDER_SKILLS') {
      const currentSkills = profile.skills || [];
      if (currentSkills.length > 1) {
        const reordered = reorderExistingSkills(currentSkills);
        const isDifferent = JSON.stringify(currentSkills) !== JSON.stringify(reordered);
        const changeHash = crypto.createHash('sha256').update(`REORDER_SKILLS:${JSON.stringify(reordered)}`).digest('hex');
        const recentlyDone = (history.history || []).some(h => h.hash === changeHash);

        if (isDifferent && !recentlyDone) {
          if (options.requireApproval !== false && !options.dryRun) {
            const proposalRes = createProfileProposal('REORDER_SKILLS', currentSkills, reordered, 'Improve ordering of existing skills based only on current profile.', profile);
            if (proposalRes.status === 'PROPOSAL_CREATED') {
              if (!options.suppressTelegram) {
                await sendProfileApprovalRequest(proposalRes.proposal, options.chatId, options);
              }
              return {
                status: 'PROPOSAL_CREATED',
                action: 'REORDER_SKILLS',
                approvalId: proposalRes.proposal.approvalId,
                proposal: proposalRes.proposal
              };
            }
          }

          profile.skills = reordered;
          if (!options.dryRun) {
            writeProfileData(profile);
            history.history = history.history || [];
            history.history.push({
              action: 'REORDER_SKILLS',
              hash: changeHash,
              timestamp: new Date().toISOString()
            });
            writeUpdateHistory(history);
          }
          return {
            status: 'UPDATED',
            action: 'REORDER_SKILLS',
            details: `Reordered ${reordered.length} existing skills by relevance weight.`
          };
        }
      }
    }

    if (action === 'REORDER_PROJECTS') {
      const currentProjects = profile.projects || [];
      if (currentProjects.length > 1) {
        const reordered = reorderExistingProjects(currentProjects);
        const isDifferent = JSON.stringify(currentProjects) !== JSON.stringify(reordered);
        const changeHash = crypto.createHash('sha256').update(`REORDER_PROJECTS:${JSON.stringify(reordered)}`).digest('hex');
        const recentlyDone = (history.history || []).some(h => h.hash === changeHash);

        if (isDifferent && !recentlyDone) {
          if (options.requireApproval !== false && !options.dryRun) {
            const proposalRes = createProfileProposal('REORDER_PROJECTS', currentProjects, reordered, 'Improve project ordering based on relevance.', profile);
            if (proposalRes.status === 'PROPOSAL_CREATED') {
              if (!options.suppressTelegram) {
                await sendProfileApprovalRequest(proposalRes.proposal, options.chatId, options);
              }
              return {
                status: 'PROPOSAL_CREATED',
                action: 'REORDER_PROJECTS',
                approvalId: proposalRes.proposal.approvalId,
                proposal: proposalRes.proposal
              };
            }
          }

          profile.projects = reordered;
          if (!options.dryRun) {
            writeProfileData(profile);
            history.history = history.history || [];
            history.history.push({
              action: 'REORDER_PROJECTS',
              hash: changeHash,
              timestamp: new Date().toISOString()
            });
            writeUpdateHistory(history);
          }
          return {
            status: 'UPDATED',
            action: 'REORDER_PROJECTS',
            details: `Reordered ${reordered.length} existing projects.`
          };
        }
      }
    }

    if (action === 'IMPROVE_HEADLINE') {
      const currentHeadline = profile.headline || '';
      if (currentHeadline) {
        const formatted = formatHeadline(currentHeadline);
        const isDifferent = currentHeadline !== formatted;
        const changeHash = crypto.createHash('sha256').update(`IMPROVE_HEADLINE:${formatted}`).digest('hex');
        const recentlyDone = (history.history || []).some(h => h.hash === changeHash);

        if (isDifferent && !recentlyDone) {
          if (options.requireApproval !== false && !options.dryRun) {
            const proposalRes = createProfileProposal('IMPROVE_HEADLINE', currentHeadline, formatted, 'Improve headline formatting using existing profile information.', profile);
            if (proposalRes.status === 'PROPOSAL_CREATED') {
              if (!options.suppressTelegram) {
                await sendProfileApprovalRequest(proposalRes.proposal, options.chatId, options);
              }
              return {
                status: 'PROPOSAL_CREATED',
                action: 'IMPROVE_HEADLINE',
                approvalId: proposalRes.proposal.approvalId,
                proposal: proposalRes.proposal
              };
            }
          }

          profile.headline = formatted;
          if (!options.dryRun) {
            writeProfileData(profile);
            history.history = history.history || [];
            history.history.push({
              action: 'IMPROVE_HEADLINE',
              hash: changeHash,
              timestamp: new Date().toISOString()
            });
            writeUpdateHistory(history);
          }
          return {
            status: 'UPDATED',
            action: 'IMPROVE_HEADLINE',
            details: 'Formatted headline text using existing profile attributes.'
          };
        }
      }
    }
  }

  return {
    status: 'SKIPPED_NO_MEANINGFUL_CHANGE',
    reason: 'PROFILE_ALREADY_OPTIMAL_FOR_ALL_CANDIDATE_ACTIONS'
  };
}

const PROTECTED_FIELDS = ['personal.name', 'experience', 'education', 'salary', 'personal.email', 'personal.phone'];

module.exports = {
  performProfileMaintenance,
  reorderExistingSkills,
  reorderExistingProjects,
  formatHeadline,
  readUpdateHistory,
  writeUpdateHistory,
  UPDATE_HISTORY_PATH,
  PROTECTED_FIELDS
};

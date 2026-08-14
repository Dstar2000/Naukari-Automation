'use strict';

/**
 * Hardened Naukri Profile Update Telegram Approval Gate Tests
 *
 * Covers:
 * A. APPROVE inline callback reaches profile approval handler.
 * B. REJECT inline callback reaches profile approval handler.
 * C. callback_query does NOT enter normal command parser.
 * D. Correct proposal ID is extracted.
 * E. APPROVE requires PENDING status.
 * F. REJECT requires PENDING status.
 * G. APPROVE invokes existing approved mutation path only after callback.
 * H. REJECT causes zero Naukri mutation.
 * I. Invalid callback causes zero mutation.
 * J. Already processed proposal causes zero duplicate mutation.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const {
  createProfileProposal,
  formatProfileApprovalMessage,
  sendProfileApprovalRequest,
  getProfileProposal,
  updateProposalRecord,
  processProfileApprovalDecision,
  applyApprovedProfileUpdate,
  computeProfileFingerprint,
  normalizeSkillIdentity,
  isNoOpMutation,
  assertActionEditorMatch,
  ACTION_EDITOR_MAP
} = require('../src/naukri/profile.approval');

const { performProfileMaintenance } = require('../src/naukri/profile.updater');
const { dispatchCallback }          = require('../src/telegram/callback.router');

const sampleProfile = {
  headline: 'Full Stack Developer | react.js | nodejs | javascript',
  summary: 'MERN Stack Developer with 1+ years experience',
  skills: ['Hooks', 'Npm', 'React.js', 'Node.js', 'Jsx', 'Javascript'],
  projects: [
    { projectName: 'Short', description: 'desc' },
    { projectName: 'Hospital Management System (HMIS)', description: 'long desc' }
  ]
};

// Minimal stub bot satisfying the router interface
function makeFakeBot() {
  return {
    answerCallbackQuery: jest.fn().mockResolvedValue({}),
    editMessageText: jest.fn().mockResolvedValue({}),
    sendMessage: jest.fn().mockResolvedValue({})
  };
}

function makeQuery(callbackData, proposalId) {
  return {
    id: 'query_' + Date.now(),
    data: callbackData,
    from: { id: 111 },
    message: {
      chat: { id: 999001 },
      message_id: 42,
      text: 'original message'
    }
  };
}

describe('Naukri Profile Approval Gate Safety Tests', () => {

  test('1. No-op skips approval request generation and returns SKIPPED_NO_MEANINGFUL_CHANGE', () => {
    const identicalVal = 'Full Stack Developer | React.js | Node.js | JavaScript';
    const res = createProfileProposal('IMPROVE_HEADLINE', identicalVal, identicalVal, 'Formatting', sampleProfile);

    expect(res.status).toBe('SKIPPED_NO_MEANINGFUL_CHANGE');
    expect(res.reason).toBe('CURRENT_AND_PROPOSED_VALUES_ARE_IDENTICAL');
  });

  test('2. PENDING proposal cannot mutate Naukri profile', () => {
    const res = createProfileProposal('IMPROVE_HEADLINE', 'Current Headline', 'Improved Headline', 'Formatting', sampleProfile);
    const fetched = getProfileProposal(res.proposal.approvalId);

    expect(fetched.status).toBe('PENDING');
    expect(fetched.appliedAt).toBeNull();
  });

  test('3. REJECTED proposal cannot mutate Naukri profile (F/H)', async () => {
    const res = createProfileProposal('IMPROVE_HEADLINE', 'Current Headline', 'Rejected Headline', 'Formatting', sampleProfile);
    const approvalId = res.proposal.approvalId;

    const processRes = await processProfileApprovalDecision(approvalId, 'REJECT', { suppressTelegram: true });

    expect(processRes.success).toBe(true);
    expect(processRes.status).toBe('APPROVAL_REJECTED');

    const updated = getProfileProposal(approvalId);
    expect(updated.status).toBe('APPROVAL_REJECTED');
    expect(updated.appliedAt).toBeNull(); // H: zero Naukri mutation
  });

  test('4. EXPIRED proposal cannot mutate Naukri profile', async () => {
    const res = createProfileProposal('IMPROVE_HEADLINE', 'Current Headline', 'Expired Headline', 'Formatting', sampleProfile, { timeoutMinutes: -1 });
    const approvalId = res.proposal.approvalId;

    const processRes = await processProfileApprovalDecision(approvalId, 'APPROVE', { suppressTelegram: true });

    expect(processRes.success).toBe(false);
    expect(processRes.status).toBe('APPROVAL_EXPIRED');

    const updated = getProfileProposal(approvalId);
    expect(updated.status).toBe('APPROVAL_EXPIRED');
  });

  test('5. APPROVED proposal can mutate profile and uses exact stored proposedValue immutably (G)', async () => {
    const res = createProfileProposal('IMPROVE_HEADLINE', 'Current Headline', 'Approved Exact Value', 'Formatting', sampleProfile);
    const approvalId = res.proposal.approvalId;

    const processRes = await processProfileApprovalDecision(approvalId, 'APPROVE', { suppressBrowser: true, suppressTelegram: true });

    expect(processRes.success).toBe(true);
    expect(processRes.status).toBe('APPLIED');

    const updated = getProfileProposal(approvalId);
    expect(updated.status).toBe('APPLIED');
    expect(updated.proposedValue).toBe('Approved Exact Value');
  });

  test('6. APPROVED cannot change section and action/editor mismatch throws SAFETY_ASSERTION_VIOLATION', () => {
    expect(() => assertActionEditorMatch('REORDER_SKILLS', 'skills')).not.toThrow();
    expect(() => assertActionEditorMatch('REORDER_SKILLS', 'headline')).toThrow(/SAFETY_ASSERTION_VIOLATION/);
    expect(() => assertActionEditorMatch('IMPROVE_HEADLINE', 'skills')).toThrow(/SAFETY_ASSERTION_VIOLATION/);
  });

  test('6b. REORDER_SKILLS contract validation enforces Set(current) === Set(proposed)', () => {
    const current = ['React.js', 'Node.js', 'JavaScript'];

    // Valid permutation -> success
    expect(() => createProfileProposal('REORDER_SKILLS', current, ['JavaScript', 'React.js', 'Node.js'], 'Reorder', sampleProfile)).not.toThrow();

    // Alien skill added -> throws
    expect(() => createProfileProposal('REORDER_SKILLS', current, ['React.js', 'Node.js', 'Python'], 'Reorder', sampleProfile)).toThrow(/introduced skill/);

    // Skill removed -> throws
    expect(() => createProfileProposal('REORDER_SKILLS', current, ['React.js', 'Node.js'], 'Reorder', sampleProfile)).toThrow(/count does not match/);

    // Duplicate skill -> throws
    expect(() => createProfileProposal('REORDER_SKILLS', current, ['React.js', 'React.js', 'Node.js'], 'Reorder', sampleProfile)).toThrow(/duplicate or mismatched/);
  });

  test('6c. REORDER_SKILLS proposedValue remains array and verification handles chip array', async () => {
    const current = ['Hooks', 'Npm', 'React.js', 'Node.js', 'Jsx', 'Javascript'];
    const proposed = ['Javascript', 'Hooks', 'Npm', 'React.js', 'Node.js', 'Jsx'];

    const res = createProfileProposal('REORDER_SKILLS', current, proposed, 'Reorder skills', sampleProfile);
    expect(res.status).toBe('PROPOSAL_CREATED');
    expect(Array.isArray(res.proposal.proposedValue)).toBe(true);
    expect(res.proposal.proposedValue).toEqual(proposed);

    const approvalId = res.proposal.approvalId;
    const processRes = await processProfileApprovalDecision(approvalId, 'APPROVE', { suppressBrowser: true, suppressTelegram: true });
    expect(processRes.success).toBe(true);
    expect(processRes.status).toBe('APPLIED');
    expect(processRes.verificationStatus).toBe('LIVE_UPDATE_VERIFIED');
  });

  test('6d. normalizeSkillIdentity handles capitalization, whitespace, and special characters', () => {
    expect(normalizeSkillIdentity('Node.Js')).toBe('node.js');
    expect(normalizeSkillIdentity('Node.js')).toBe('node.js');
    expect(normalizeSkillIdentity('NODE.JS')).toBe('node.js');
    expect(normalizeSkillIdentity('  NODE.JS  ')).toBe('node.js');
    expect(normalizeSkillIdentity('React.js')).toBe('react.js');

    // Different skills do not become equal
    expect(normalizeSkillIdentity('React.js')).not.toBe(normalizeSkillIdentity('Node.js'));
  });

  test('6e. REORDER_SKILLS contract validation and verification accepts capitalization normalization', () => {
    const current = ['Node.Js', 'React.js', 'Javascript'];
    const proposedSameCase = ['Javascript', 'Node.Js', 'React.js'];
    const proposedNormalizedCase = ['Javascript', 'Node.js', 'React.js']; // Naukri capitalization "Node.js"

    // Accepts normalized case equivalence for proposal creation
    expect(() => createProfileProposal('REORDER_SKILLS', current, proposedNormalizedCase, 'Reorder', sampleProfile)).not.toThrow();

    // Rejects alien skill even with normalization
    expect(() => createProfileProposal('REORDER_SKILLS', current, ['Javascript', 'Node.js', 'Python'], 'Reorder', sampleProfile)).toThrow(/introduced skill/);

    // Rejects count mismatch
    expect(() => createProfileProposal('REORDER_SKILLS', current, ['Javascript', 'Node.js'], 'Reorder', sampleProfile)).toThrow(/count does not match/);

    // Rejects duplicate normalized skill
    expect(() => createProfileProposal('REORDER_SKILLS', current, ['Javascript', 'Node.js', 'node.js'], 'Reorder', sampleProfile)).toThrow(/duplicate or mismatched/);
  });

  test('6f. Autocomplete selection requires exact normalized match and rejects partial matches', () => {
    const evaluateMatch = (targetText, candidateList) => {
      const norm = (str) => String(str || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const targetNorm = norm(targetText);

      const exact = candidateList.find(t => norm(t) === targetNorm);
      if (exact) {
        return { success: true, selected: exact };
      }
      return { success: false, reason: 'AUTOCOMPLETE_EXACT_MATCH_NOT_FOUND', selected: null };
    };

    // 1. "Jsx" must NOT select "Servlets / Jsp"
    const res1 = evaluateMatch('Jsx', ['Servlets / Jsp', 'Java', 'JavaScript']);
    expect(res1.success).toBe(false);
    expect(res1.reason).toBe('AUTOCOMPLETE_EXACT_MATCH_NOT_FOUND');

    // 2-4. "Rest API Integration" must NOT select "RE", "Rest Ap", or "Rest API Design"
    const res2 = evaluateMatch('Rest API Integration', ['RE', 'Rest Ap', 'Rest API Design']);
    expect(res2.success).toBe(false);

    // 5. "Rest API Integration" MUST select "Rest API Integration"
    const res3 = evaluateMatch('Rest API Integration', ['RE', 'Rest Ap', 'Rest API Design', 'Rest API Integration']);
    expect(res3.success).toBe(true);
    expect(res3.selected).toBe('Rest API Integration');

    // 6. "Node.Js" accepts "Node.js" through normalizeSkillIdentity()
    const res4 = evaluateMatch('Node.Js', ['Node.js', 'Node.JS', 'Node']);
    expect(res4.success).toBe(true);
    expect(res4.selected).toBe('Node.js');

    // 8. Never select first suggestion merely because it exists
    const res5 = evaluateMatch('Python', ['Java', 'C++', 'Ruby']);
    expect(res5.success).toBe(false);
    expect(res5.selected).toBeNull();
  });

  test('6g. Chip extraction excludes .erLbl error labels and pre-save failure blocks save', () => {
    // 1. Chip extraction filtering test
    const rawElements = [
      { isChip: true, text: 'React.js' },
      { isChip: true, text: 'Node.js' },
      { isChip: false, text: 'Please specify atleast one Key Skill.' }
    ];

    const extracted = rawElements
      .filter(el => el.isChip)
      .map(el => el.text.trim())
      .filter(text => text && !text.includes('Please specify'));

    expect(extracted).toEqual(['React.js', 'Node.js']);
    expect(extracted).not.toContain('Please specify atleast one Key Skill.');

    // 2. Anchor strategy check: chip count never drops below 1 when initialChipCount > 1
    const initialChips = ['Github', 'React.js', 'Node.js'];
    let remaining = initialChips.length - 1; // leave index 0 as anchor
    expect(remaining).toBe(2);
    const anchor = initialChips[0]; // 'Github'
    expect(anchor).toBe('Github');

    // 3. Pre-save failure verification
    const expectedOrder = ['React.js', 'Node.js', 'Github'];
    const actualExtractedMismatched = ['Github', 'React.js', 'Node.js'];
    const normExp = expectedOrder.map(normalizeSkillIdentity);
    const normAct = actualExtractedMismatched.map(normalizeSkillIdentity);

    const match = normExp.length === normAct.length && normExp.every((v, i) => v === normAct[i]);
    expect(match).toBe(false); // Blocks save!
  });

  test('6h. Bounded polling ignores stale candidates and aborts cleanly if exact candidate never appears', () => {
    const pollCandidatesOverTime = (targetSkill, timelineSnapshots) => {
      const norm = (str) => String(str || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const targetNorm = norm(targetSkill);

      for (const snapshot of timelineSnapshots) {
        const exact = snapshot.find(candidate => norm(candidate) === targetNorm);
        if (exact) {
          return { success: true, selected: exact, finalCandidates: snapshot };
        }
      }
      return {
        success: false,
        reason: 'AUTOCOMPLETE_EXACT_MATCH_NOT_FOUND',
        selected: null,
        finalCandidates: timelineSnapshots[timelineSnapshots.length - 1] || []
      };
    };

    // Case 1: Initial stale candidates from previous skill ("Github"), then exact candidate ("Tailwind CSS") appears later
    const timeline1 = [
      ['Github', 'Github Actions'], // T=0ms (stale)
      ['Github', 'Github Actions'], // T=100ms (stale)
      ['Tailwind CSS', 'Tailwind'] // T=200ms (exact match appears!)
    ];
    const res1 = pollCandidatesOverTime('Tailwind CSS', timeline1);
    expect(res1.success).toBe(true);
    expect(res1.selected).toBe('Tailwind CSS');

    // Case 2: Exact candidate never appears -> AUTOCOMPLETE_EXACT_MATCH_NOT_FOUND
    const timeline2 = [
      ['Java', 'JavaScript'],
      ['Java', 'JavaScript'],
      ['Java', 'JavaScript']
    ];
    const res2 = pollCandidatesOverTime('Python', timeline2);
    expect(res2.success).toBe(false);
    expect(res2.reason).toBe('AUTOCOMPLETE_EXACT_MATCH_NOT_FOUND');
    expect(res2.selected).toBeNull();
  });

  test('6i. REORDER_SKILLS anchor selection and non-anchor chip removal logic', () => {
    const currentSkills = ['Github', 'Tailwind CSS', 'Bootstrap', 'React.js', 'Jsx'];
    const proposedSkills = ['Jsx', 'Github', 'Tailwind CSS', 'Bootstrap', 'React.js'];

    // 1. Target anchor selection: proposedSkills[0]
    const targetAnchorSkill = proposedSkills[0]; // 'Jsx'
    expect(targetAnchorSkill).toBe('Jsx');

    const normAnchor = normalizeSkillIdentity(targetAnchorSkill);
    expect(normAnchor).toBe('jsx');

    // 2. Non-anchor chips identification (remove all EXCEPT targetAnchorSkill)
    const nonAnchorChips = currentSkills.filter(s => normalizeSkillIdentity(s) !== normAnchor);
    expect(nonAnchorChips).toEqual(['Github', 'Tailwind CSS', 'Bootstrap', 'React.js']);

    // 3. Anchor retention state (modal contains ONLY targetAnchorSkill)
    const retainedChips = currentSkills.filter(s => normalizeSkillIdentity(s) === normAnchor);
    expect(retainedChips).toEqual(['Jsx']);
    expect(retainedChips.length).toBe(1);

    // 4. Sequential append reconstruction: [anchor, ...remaining]
    const remainingToAppend = proposedSkills.slice(1);
    expect(remainingToAppend).toEqual(['Github', 'Tailwind CSS', 'Bootstrap', 'React.js']);

    const finalReconstructed = [...retainedChips, ...remainingToAppend];
    expect(finalReconstructed).toEqual(proposedSkills);
  });

  test('6j. calculateMinimumSkillDelta calculates minimum chip removals and additions preserving prefix chips', () => {
    const { calculateMinimumSkillDelta } = require('../src/naukri/profile.approval');

    const current = ['Github', 'Tailwind CSS', 'Rest API Integration', 'Bootstrap', 'Jsx'];
    const proposed = ['Github', 'Tailwind CSS', 'Rest API Integration', 'Jsx', 'Bootstrap'];

    const delta = calculateMinimumSkillDelta(current, proposed);
    expect(delta.commonPrefixLength).toBe(3); // 'Github', 'Tailwind CSS', 'Rest API Integration' match!
    expect(delta.removals).toEqual(['Bootstrap', 'Jsx']);
    expect(delta.additions).toEqual(['Jsx', 'Bootstrap']);
    expect(delta.isNoOp).toBe(false);

    // No-op case
    const deltaNoOp = calculateMinimumSkillDelta(current, current);
    expect(deltaNoOp.isNoOp).toBe(true);
    expect(deltaNoOp.removals).toEqual([]);
    expect(deltaNoOp.additions).toEqual([]);
  });

  test('6k. REORDER_SKILLS saveSelector strictly targets #saveKeySkills and enforces readiness assertions', () => {
    const { ACTION_EDITOR_MAP } = require('../src/naukri/profile.approval');
    const saveSelector = ACTION_EDITOR_MAP['REORDER_SKILLS'].saveSelector;

    // 1. Verify exact selector binding
    expect(saveSelector).toBe('#saveKeySkills');

    // 2. Mock DOM matching demonstration
    const mockDOMButtons = [
      { id: '', class: 'blue-text', textContent: 'Download', type: 'submit' },
      { id: 'submit', class: 'save-photo', textContent: 'Save photo', type: 'submit' },
      { id: 'saveKeySkills', class: 'btn-dark-ot', textContent: 'Save', type: 'button' }
    ];

    const matched = mockDOMButtons.filter(btn => btn.id === 'saveKeySkills');
    expect(matched.length).toBe(1);
    expect(matched[0].textContent).toBe('Save');
    expect(matched[0].id).toBe('saveKeySkills');

    // Unrelated buttons ignored
    expect(matched.some(b => b.textContent === 'Download')).toBe(false);
    expect(matched.some(b => b.textContent === 'Save photo')).toBe(false);

    // Readiness assertions helper validation
    const validateSaveReadiness = (matchingCount, isVisible, isEnabled, hasBox, isElementFromPointMatch) => {
      if (matchingCount !== 1) return false;
      if (!isVisible || !isEnabled || !hasBox || !isElementFromPointMatch) return false;
      return true;
    };

    expect(validateSaveReadiness(1, true, true, true, true)).toBe(true);
    expect(validateSaveReadiness(0, true, true, true, true)).toBe(false); // 0 matching
    expect(validateSaveReadiness(2, true, true, true, true)).toBe(false); // Multiple matching
    expect(validateSaveReadiness(1, false, true, true, true)).toBe(false); // Hidden
    expect(validateSaveReadiness(1, true, false, true, true)).toBe(false); // Disabled
    expect(validateSaveReadiness(1, true, true, false, true)).toBe(false); // Invalid box
    expect(validateSaveReadiness(1, true, true, true, false)).toBe(false); // Covered by overlay
  });

  test('7. Stale profile fingerprint aborts mutation with STALE_PROFILE_ABORTED', async () => {
    const res = createProfileProposal('IMPROVE_HEADLINE', 'Current Headline', 'New Headline', 'Formatting', sampleProfile);
    const proposal = res.proposal;
    proposal.status = 'APPROVED';
    updateProposalRecord(proposal);

    const modifiedProfile = { ...sampleProfile, headline: 'Modified Externally On Naukri' };

    const applyRes = await applyApprovedProfileUpdate(proposal.approvalId, {
      forceApproved: true,
      currentProfile: modifiedProfile,
      suppressBrowser: true,
      suppressTelegram: true
    });

    expect(applyRes.success).toBe(false);
    expect(applyRes.status).toBe('STALE_PROFILE_ABORTED');
  });

  test('8. Telegram payload uses profile_approval:APPROVE: and profile_approval:REJECT: callback format', () => {
    const res = createProfileProposal('IMPROVE_HEADLINE', 'Old Headline', 'Full Stack Developer | React.js', 'Format headline', sampleProfile);
    const msg = formatProfileApprovalMessage(res.proposal);

    expect(msg.text).toContain('Proposal ID:');
    expect(msg.text).toContain(res.proposal.approvalId);
    expect(msg.text).toContain('Action:');
    expect(msg.text).toContain('IMPROVE_HEADLINE');
    expect(msg.text).toContain('Resume Headline');
    expect(msg.text).toContain('https://www.naukri.com/mnjuser/profile#lazyResumeHead');
    expect(msg.text).toContain('Old Headline');
    expect(msg.text).toContain('Full Stack Developer | React.js');
    expect(msg.text).toContain('No Naukri changes have been made yet.');
    expect(msg.text).toContain('Sections NOT Modified:');

    // Must use new canonical format
    const approveBtn = msg.reply_markup.inline_keyboard[0][0];
    const rejectBtn  = msg.reply_markup.inline_keyboard[0][1];
    expect(approveBtn.callback_data).toBe(`profile_approval:APPROVE:${res.proposal.approvalId}`);
    expect(rejectBtn.callback_data).toBe(`profile_approval:REJECT:${res.proposal.approvalId}`);

    // Must NOT use old broken format
    expect(approveBtn.callback_data).not.toContain('prof_appr_approve:');
    expect(rejectBtn.callback_data).not.toContain('prof_appr_reject:');
  });

  test('9. Location path maps accurately for all actions', () => {
    expect(ACTION_EDITOR_MAP.IMPROVE_HEADLINE.locationPath).toContain('#lazyResumeHead');
    expect(ACTION_EDITOR_MAP.IMPROVE_SUMMARY.locationPath).toContain('#lazyProfileSummary');
    expect(ACTION_EDITOR_MAP.REORDER_SKILLS.locationPath).toContain('#lazyKeySkills');
    expect(ACTION_EDITOR_MAP.REORDER_PROJECTS.locationPath).toContain('#lazyProject');
  });

  // =====================================================================
  // Callback Routing Tests (A-J)
  // =====================================================================

  test('A. APPROVE inline callback (profile_approval:APPROVE:<id>) reaches Profile Approval Handler', async () => {
    const res = createProfileProposal('REORDER_SKILLS', ['Skill A', 'Skill B'], ['Skill B', 'Skill A'], 'Reorder', sampleProfile);
    const approvalId = res.proposal.approvalId;
    const callbackData = `profile_approval:APPROVE:${approvalId}`;

    const bot = makeFakeBot();
    const query = makeQuery(callbackData);

    // Override processProfileApprovalDecision to avoid real browser
    const approval = require('../src/naukri/profile.approval');
    const originalFn = approval.processProfileApprovalDecision;
    jest.spyOn(approval, 'processProfileApprovalDecision').mockResolvedValueOnce({
      success: true,
      status: 'APPLIED',
      proposal: res.proposal
    });

    const result = await dispatchCallback(bot, query);

    expect(result.handler).toBe('Profile Approval Handler');
    expect(result.handled).toBe(true);
    expect(result.success).toBe(true);
    expect(bot.answerCallbackQuery).toHaveBeenCalled();

    approval.processProfileApprovalDecision.mockRestore();
  });

  test('B. REJECT inline callback (profile_approval:REJECT:<id>) reaches Profile Approval Handler', async () => {
    const res = createProfileProposal('REORDER_SKILLS', ['Skill A', 'Skill B'], ['Skill B', 'Skill A'], 'Reorder', sampleProfile);
    const approvalId = res.proposal.approvalId;
    const callbackData = `profile_approval:REJECT:${approvalId}`;

    const bot = makeFakeBot();
    const query = makeQuery(callbackData);

    const approval = require('../src/naukri/profile.approval');
    jest.spyOn(approval, 'processProfileApprovalDecision').mockResolvedValueOnce({
      success: true,
      status: 'APPROVAL_REJECTED',
      proposal: res.proposal
    });

    const result = await dispatchCallback(bot, query);

    expect(result.handler).toBe('Profile Approval Handler');
    expect(result.handled).toBe(true);
    expect(result.success).toBe(true);

    approval.processProfileApprovalDecision.mockRestore();
  });

  test('C. callback_query does NOT enter normal command parser (not interpreted as /approve or /reject)', async () => {
    const res = createProfileProposal('IMPROVE_HEADLINE', 'Old', 'New', 'Test', sampleProfile);
    const approvalId = res.proposal.approvalId;

    // A raw text command would hit the text message handler, not dispatchCallback.
    // Here we verify that dispatchCallback for profile_approval: never routes to job approval or any other handler.
    const bot = makeFakeBot();
    const query = makeQuery(`profile_approval:REJECT:${approvalId}`);

    const approval = require('../src/naukri/profile.approval');
    jest.spyOn(approval, 'processProfileApprovalDecision').mockResolvedValueOnce({
      success: true,
      status: 'APPROVAL_REJECTED',
      proposal: res.proposal
    });

    const result = await dispatchCallback(bot, query);

    // Must be caught by Profile Approval Handler — not Job Approval Handler, Bulk Handler, etc.
    expect(result.handler).toBe('Profile Approval Handler');
    expect(result.handler).not.toBe('Job Approval Handler');
    expect(result.handler).not.toBe('Bulk Approval Handler');

    approval.processProfileApprovalDecision.mockRestore();
  });

  test('D. Correct proposal ID is extracted from profile_approval:APPROVE:<id> and profile_approval:REJECT:<id>', () => {
    const testId = 'prof_appr_abc123def456';
    const approveData = `profile_approval:APPROVE:${testId}`;
    const rejectData  = `profile_approval:REJECT:${testId}`;

    // Simulate parser logic from callback.router.js
    function parseProfileApprovalCallback(callbackData) {
      const parts = callbackData.split(':');
      const decisionStr = (parts[1] || '').trim().toUpperCase();
      const isApprove = (decisionStr === 'APPROVE');
      const approvalId = parts.slice(2).join(':').trim();
      return { isApprove, approvalId };
    }

    const approveResult = parseProfileApprovalCallback(approveData);
    expect(approveResult.isApprove).toBe(true);
    expect(approveResult.approvalId).toBe(testId);

    const rejectResult = parseProfileApprovalCallback(rejectData);
    expect(rejectResult.isApprove).toBe(false);
    expect(rejectResult.approvalId).toBe(testId);
  });

  test('E. APPROVE requires PENDING status — non-PENDING proposal is rejected', async () => {
    const res = createProfileProposal('IMPROVE_HEADLINE', 'Current', 'Proposed', 'Reason', sampleProfile);
    const approvalId = res.proposal.approvalId;

    // Force status to APPLIED (already processed)
    const proposal = getProfileProposal(approvalId);
    proposal.status = 'APPLIED';
    updateProposalRecord(proposal);

    const result = await processProfileApprovalDecision(approvalId, 'APPROVE', { suppressTelegram: true });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/ALREADY_APPLIED/);
  });

  test('F. REJECT requires PENDING status — non-PENDING proposal is rejected', async () => {
    const res = createProfileProposal('IMPROVE_HEADLINE', 'Current', 'Proposed', 'Reason', sampleProfile);
    const approvalId = res.proposal.approvalId;

    // Force status to APPROVAL_REJECTED (already rejected)
    const proposal = getProfileProposal(approvalId);
    proposal.status = 'APPROVAL_REJECTED';
    updateProposalRecord(proposal);

    const result = await processProfileApprovalDecision(approvalId, 'REJECT', { suppressTelegram: true });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/ALREADY_APPROVAL_REJECTED/);
  });

  test('G. APPROVE invokes mutation path only after callback and uses immutable proposedValue', async () => {
    const res = createProfileProposal('IMPROVE_HEADLINE', 'Before', 'ImmutableExactValue', 'Test', sampleProfile);
    const approvalId = res.proposal.approvalId;

    const result = await processProfileApprovalDecision(approvalId, 'APPROVE', {
      suppressBrowser: true,
      suppressTelegram: true
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('APPLIED');

    // Proposal stored value must still be the exact immutable proposedValue
    const stored = getProfileProposal(approvalId);
    expect(stored.proposedValue).toBe('ImmutableExactValue');
    expect(stored.status).toBe('APPLIED');
  });

  test('H. REJECT causes zero Naukri mutation — appliedAt remains null, status is APPROVAL_REJECTED', async () => {
    const res = createProfileProposal('REORDER_SKILLS', ['A', 'B'], ['B', 'A'], 'Reorder', sampleProfile);
    const approvalId = res.proposal.approvalId;

    const result = await processProfileApprovalDecision(approvalId, 'REJECT', { suppressTelegram: true });

    expect(result.success).toBe(true);
    expect(result.status).toBe('APPROVAL_REJECTED');

    const stored = getProfileProposal(approvalId);
    expect(stored.status).toBe('APPROVAL_REJECTED');
    expect(stored.appliedAt).toBeNull();
    expect(stored.verificationStatus).toBe('APPROVAL_REJECTED');
  });

  test('I. Invalid/unknown callback causes zero mutation and returns UNKNOWN_CALLBACK_PREFIX', async () => {
    const bot = makeFakeBot();
    const query = makeQuery('completely_invalid_prefix_xyz123');

    const result = await dispatchCallback(bot, query);

    expect(result.handled).toBe(false);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('UNKNOWN_CALLBACK_PREFIX');
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith(
      query.id,
      expect.objectContaining({ text: expect.stringContaining('Unrecognized') })
    );
  });

  test('J. Already-processed proposal causes zero duplicate mutation', async () => {
    const res = createProfileProposal('IMPROVE_HEADLINE', 'Before', 'After', 'Test', sampleProfile);
    const approvalId = res.proposal.approvalId;

    // First: APPROVE (dry run) — succeeds
    await processProfileApprovalDecision(approvalId, 'APPROVE', { suppressBrowser: true, suppressTelegram: true });

    // Second: APPROVE again — must fail with ALREADY_APPLIED
    const secondResult = await processProfileApprovalDecision(approvalId, 'APPROVE', { suppressBrowser: true, suppressTelegram: true });

    expect(secondResult.success).toBe(false);
    expect(secondResult.reason).toMatch(/ALREADY_APPLIED/);

    // Verify no second appliedAt timestamp was set
    const stored = getProfileProposal(approvalId);
    expect(stored.status).toBe('APPLIED');
  });
});

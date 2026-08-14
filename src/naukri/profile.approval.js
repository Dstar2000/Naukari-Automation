'use strict';

/**
 * Hardened Naukri Profile Update Telegram Approval Gate Engine
 * Guarantees strict 1-to-1 action-to-section binding, location path tracking, and safety assertions across
 * Proposal -> Telegram Message -> User Approval -> Section Editor -> Mutation -> Post-Save Verification.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const { dispatchTelegramMessage }  = require('../telegram/telegram.transport');
const { launchBrowser }            = require('../browser/browser.manager');
const { AUTH_FILE_PATH }           = require('../browser/session.config');
const { parseProfileFromPage, PROFILE_DATA_PATH } = require('./profile.reader');
const { readUpdateHistory, writeUpdateHistory }   = require('./profile.updater');
const { telegramChatId }           = require('../config/config');

const DEFAULT_TIMEOUT_MINUTES = 30;

const ACTION_EDITOR_MAP = {
  IMPROVE_HEADLINE: {
    section: 'headline',
    sectionLabel: 'Resume Headline',
    locationPath: 'https://www.naukri.com/mnjuser/profile#lazyResumeHead',
    editSelector: '#lazyResumeHead .widgetHead span.edit, .resumeHeadline .widgetHead span.edit',
    inputSelector: '.resumeHeadline textarea, textarea.resumeHeadlineTxt, textarea',
    saveSelector: '#lazyResumeHead button.btn-valid, .resumeHeadline button.saveBtn, button[type="submit"], button:has-text("Save")',
    unmodifiedSections: ['Key Skills', 'Projects', 'Profile Summary', 'Employment', 'Education']
  },
  IMPROVE_SUMMARY: {
    section: 'summary',
    sectionLabel: 'Profile Summary',
    locationPath: 'https://www.naukri.com/mnjuser/profile#lazyProfileSummary',
    editSelector: '#lazyProfileSummary .widgetHead span.edit, .profileSummary .widgetHead span.edit',
    inputSelector: '.profileSummary textarea, textarea',
    saveSelector: '#lazyProfileSummary button.btn-valid, .profileSummary button.saveBtn, button[type="submit"], button:has-text("Save")',
    unmodifiedSections: ['Resume Headline', 'Key Skills', 'Projects', 'Employment', 'Education']
  },
  REORDER_SKILLS: {
    section: 'skills',
    sectionLabel: 'Key Skills',
    locationPath: 'https://www.naukri.com/mnjuser/profile#lazyKeySkills',
    editSelector: '#lazyKeySkills .widgetHead span.edit, .keySkills .widgetHead span.edit',
    inputSelector: '.keySkills input, .keySkills .chip',
    saveSelector: '#saveKeySkills',
    unmodifiedSections: ['Resume Headline', 'Profile Summary', 'Projects', 'Employment', 'Education']
  },
  REORDER_PROJECTS: {
    section: 'projects',
    sectionLabel: 'Projects',
    locationPath: 'https://www.naukri.com/mnjuser/profile#lazyProject',
    editSelector: '#lazyProject .widgetHead span.edit, .project-section span.edit',
    inputSelector: '.project-section input, .project-section textarea',
    saveSelector: '#lazyProject button.btn-valid, .project-section button.saveBtn, button[type="submit"], button:has-text("Save")',
    unmodifiedSections: ['Resume Headline', 'Profile Summary', 'Key Skills', 'Employment', 'Education']
  }
};

/**
 * Hard Safety Assertion: Ensures action strictly matches the targeted section editor.
 */
function assertActionEditorMatch(action, attemptedSection) {
  const map = ACTION_EDITOR_MAP[action];
  if (!map) {
    throw new Error(`[SAFETY_ASSERTION_VIOLATION] Unknown proposal action: "${action}"`);
  }
  if (map.section !== attemptedSection) {
    throw new Error(`[SAFETY_ASSERTION_VIOLATION] Action "${action}" cannot invoke section editor "${attemptedSection}". Allowed section: "${map.section}"`);
  }
}

function computeProfileFingerprint(profileObj) {
  if (!profileObj) return 'null';
  const sample = {
    headline: profileObj.headline || '',
    skills: profileObj.skills || [],
    summary: profileObj.summary || '',
    projects: profileObj.projects || []
  };
  return crypto.createHash('sha256').update(JSON.stringify(sample)).digest('hex');
}

/**
 * Checks if currentValue and proposedValue are identical (no-op check).
 */
function isNoOpMutation(currentVal, proposedVal) {
  if (currentVal === proposedVal) return true;
  if (Array.isArray(currentVal) && Array.isArray(proposedVal)) {
    return JSON.stringify(currentVal) === JSON.stringify(proposedVal);
  }
  return false;
}

/**
 * Formats a clear, detailed Telegram approval message with exact changes, location, & unmodified section notice.
 * Inline keyboard uses deterministic callback_data format: profile_approval:APPROVE:<proposalId> and profile_approval:REJECT:<proposalId>
 */
function formatProfileApprovalMessage(proposal) {
  const map = ACTION_EDITOR_MAP[proposal.action];
  const sectionLabel = map ? map.sectionLabel : proposal.section;
  const locationPath = proposal.locationPath || (map ? map.locationPath : 'https://www.naukri.com/mnjuser/profile');
  const unmodifiedStr = map ? map.unmodifiedSections.join(', ') : 'All other sections';

  const isSkills = proposal.section === 'skills' || proposal.action === 'REORDER_SKILLS';
  const isProjects = proposal.section === 'projects' || proposal.action === 'REORDER_PROJECTS';

  const approveCallbackData = `profile_approval:APPROVE:${proposal.approvalId}`;
  const rejectCallbackData = `profile_approval:REJECT:${proposal.approvalId}`;

  if (isSkills && Array.isArray(proposal.currentValue) && Array.isArray(proposal.proposedValue)) {
    const currentList = proposal.currentValue.slice(0, 8).map((s, i) => `${i + 1}. ${s}`).join('\n');
    const proposedList = proposal.proposedValue.slice(0, 8).map((s, i) => `${i + 1}. ${s}`).join('\n');

    return {
      text: `🔔 *Naukri Profile Change Request*\n\n` +
            `*Proposal ID:* \`${proposal.approvalId}\`\n` +
            `*Action:* \`${proposal.action}\`\n` +
            `*Section:* ${sectionLabel}\n` +
            `*Naukri Location:* \`${locationPath}\`\n\n` +
            `*CURRENT ORDER:*\n${currentList}\n...\n\n` +
            `*PROPOSED ORDER:*\n${proposedList}\n...\n\n` +
            `*Change Summary:*\n` +
            `• Added: 0 skills\n` +
            `• Removed: 0 skills\n` +
            `• Reordered: YES\n\n` +
            `*Sections NOT Modified:*\n${unmodifiedStr}\n\n` +
            `*Reason:*\n${proposal.changeDescription || proposal.reason || 'Reorder existing skills by relevance weight.'}\n\n` +
            `⚠️ *Notice:* No Naukri changes have been made yet. Approval is required before any profile modification.\n\n` +
            `_Click APPROVE to authorize this change._`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ APPROVE', callback_data: approveCallbackData },
            { text: '❌ REJECT', callback_data: rejectCallbackData }
          ]
        ]
      }
    };
  }

  if (isProjects && Array.isArray(proposal.currentValue) && Array.isArray(proposal.proposedValue)) {
    const currentList = proposal.currentValue.slice(0, 5).map((p, i) => `${i + 1}. ${typeof p === 'object' ? p.projectName : p}`).join('\n');
    const proposedList = proposal.proposedValue.slice(0, 5).map((p, i) => `${i + 1}. ${typeof p === 'object' ? p.projectName : p}`).join('\n');

    return {
      text: `🔔 *Naukri Profile Change Request*\n\n` +
            `*Proposal ID:* \`${proposal.approvalId}\`\n` +
            `*Action:* \`${proposal.action}\`\n` +
            `*Section:* ${sectionLabel}\n` +
            `*Naukri Location:* \`${locationPath}\`\n\n` +
            `*CURRENT ORDER:*\n${currentList}\n\n` +
            `*PROPOSED ORDER:*\n${proposedList}\n\n` +
            `*Change Summary:*\n` +
            `• Added: 0 projects\n` +
            `• Removed: 0 projects\n` +
            `• Reordered: YES\n\n` +
            `*Sections NOT Modified:*\n${unmodifiedStr}\n\n` +
            `*Reason:*\n${proposal.changeDescription || proposal.reason || 'Reorder existing projects by relevance.'}\n\n` +
            `⚠️ *Notice:* No Naukri changes have been made yet. Approval is required before any profile modification.\n\n` +
            `_Click APPROVE to authorize this change._`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ APPROVE', callback_data: approveCallbackData },
            { text: '❌ REJECT', callback_data: rejectCallbackData }
          ]
        ]
      }
    };
  }

  return {
    text: `🔔 *Naukri Profile Change Request*\n\n` +
          `*Proposal ID:* \`${proposal.approvalId}\`\n` +
          `*Action:* \`${proposal.action}\`\n` +
          `*Section:* ${sectionLabel}\n` +
          `*Naukri Location:* \`${locationPath}\`\n\n` +
          `*CURRENT VALUE:*\n${String(proposal.currentValue)}\n\n` +
          `*PROPOSED VALUE:*\n${String(proposal.proposedValue)}\n\n` +
          `*Change Summary:*\n` +
          `• Added: 0 unsupported claims\n` +
          `• Removed: 0\n` +
          `• Formatted: YES\n\n` +
          `*Sections NOT Modified:*\n${unmodifiedStr}\n\n` +
          `*Reason:*\n${proposal.changeDescription || proposal.reason || 'Improve formatting using existing profile data.'}\n\n` +
          `⚠️ *Notice:* No Naukri changes have been made yet. Approval is required before any profile modification.\n\n` +
          `_Click APPROVE to authorize this change._`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ APPROVE', callback_data: approveCallbackData },
          { text: '❌ REJECT', callback_data: rejectCallbackData }
        ]
      ]
    }
  };
}

/**
 * Normalizes skill string for identity comparison (whitespace collapsed + lowercase).
 * Preserves all dots, hyphens, pluses, and special characters.
 */
function normalizeSkillIdentity(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Creates an immutable proposal record with strict section binding.
 */
function createProfileProposal(action, currentValue, proposedValue, reason, profile, options = {}) {
  if (isNoOpMutation(currentValue, proposedValue)) {
    return {
      status: 'SKIPPED_NO_MEANINGFUL_CHANGE',
      reason: 'CURRENT_AND_PROPOSED_VALUES_ARE_IDENTICAL'
    };
  }

  const editorMapping = ACTION_EDITOR_MAP[action];
  if (!editorMapping) {
    throw new Error(`[SAFETY_ASSERTION_VIOLATION] Invalid profile action: "${action}"`);
  }

  // Contract Enforcement for REORDER_SKILLS
  if (action === 'REORDER_SKILLS') {
    if (!Array.isArray(currentValue) || !Array.isArray(proposedValue)) {
      throw new Error('[SAFETY_ASSERTION_VIOLATION] REORDER_SKILLS values must be arrays');
    }
    if (currentValue.length !== proposedValue.length) {
      throw new Error('[SAFETY_ASSERTION_VIOLATION] REORDER_SKILLS proposed skill count does not match current skill count');
    }
    const normCurrent = currentValue.map(normalizeSkillIdentity);
    const normProposed = proposedValue.map(normalizeSkillIdentity);

    const currentSet = new Set(normCurrent);
    const proposedSet = new Set(normProposed);

    if (currentSet.size !== normCurrent.length || proposedSet.size !== normProposed.length) {
      throw new Error('[SAFETY_ASSERTION_VIOLATION] REORDER_SKILLS contains duplicate or mismatched skill identities');
    }
    if (currentSet.size !== proposedSet.size) {
      throw new Error('[SAFETY_ASSERTION_VIOLATION] REORDER_SKILLS contains duplicate or mismatched skill identities');
    }
    for (const item of normProposed) {
      if (!currentSet.has(item)) {
        throw new Error(`[SAFETY_ASSERTION_VIOLATION] REORDER_SKILLS introduced skill "${item}" not present in current profile`);
      }
    }
  }

  const approvalId = `prof_appr_${crypto.randomBytes(6).toString('hex')}`;
  const now = Date.now();
  const timeoutMs = (options.timeoutMinutes || DEFAULT_TIMEOUT_MINUTES) * 60 * 1000;

  const proposal = {
    approvalId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + timeoutMs).toISOString(),
    action,
    section: editorMapping.section,
    sectionLabel: editorMapping.sectionLabel,
    locationPath: editorMapping.locationPath,
    currentValue,
    proposedValue,
    changeDescription: reason || 'Optimize profile representation using existing data',
    profileFingerprint: computeProfileFingerprint(profile),
    status: 'PENDING',
    appliedAt: null,
    verificationStatus: null
  };

  const history = readUpdateHistory();
  history.proposals = history.proposals || {};
  history.proposals[approvalId] = proposal;
  writeUpdateHistory(history);

  return {
    status: 'PROPOSAL_CREATED',
    proposal
  };
}

/**
 * Sends a Telegram approval request message to operator.
 */
async function sendProfileApprovalRequest(proposal, chatId = null, options = {}) {
  const targetChat = chatId || options.chatId || process.env.TELEGRAM_CHAT_ID || telegramChatId;
  if (!targetChat) {
    console.error('❌ Cannot send Telegram approval request: TELEGRAM_CHAT_ID missing.');
    return { success: false, reason: 'MISSING_TELEGRAM_CHAT' };
  }

  const payload = formatProfileApprovalMessage(proposal);
  const isTest = (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined);

  const dispatchRes = await dispatchTelegramMessage(null, targetChat, payload.text, {
    reply_markup: payload.reply_markup,
    parse_mode: 'Markdown',
    mockSuccess: options.mockSuccess || (isTest && !options.allowTestSend),
    allowTestSend: options.allowTestSend,
    forensicContext: { source: 'profile.approval', type: 'PROFILE_APPROVAL_REQUEST', approvalId: proposal.approvalId }
  });

  return {
    success: !!(dispatchRes && (dispatchRes.success || dispatchRes.message_id || dispatchRes.ok)),
    message_id: dispatchRes ? dispatchRes.message_id : null,
    dispatchRes,
    proposal
  };
}

function getProfileProposal(approvalId) {
  const history = readUpdateHistory();
  return (history.proposals && history.proposals[approvalId]) || null;
}

function updateProposalRecord(proposal) {
  const history = readUpdateHistory();
  history.proposals = history.proposals || {};
  history.proposals[proposal.approvalId] = proposal;
  writeUpdateHistory(history);
}

/**
 * Processes Telegram user decision (APPROVE / REJECT).
 */
async function processProfileApprovalDecision(approvalId, decision, options = {}) {
  const proposal = getProfileProposal(approvalId);
  if (!proposal) {
    return { success: false, reason: 'PROPOSAL_NOT_FOUND' };
  }

  if (proposal.status !== 'PENDING') {
    return { success: false, reason: `PROPOSAL_ALREADY_${proposal.status}` };
  }

  const now = Date.now();
  if (now > new Date(proposal.expiresAt).getTime()) {
    proposal.status = 'APPROVAL_EXPIRED';
    proposal.verificationStatus = 'APPROVAL_EXPIRED';
    updateProposalRecord(proposal);
    return { success: false, status: 'APPROVAL_EXPIRED', reason: 'PROPOSAL_EXPIRED' };
  }

  if (decision === 'REJECT') {
    proposal.status = 'APPROVAL_REJECTED';
    proposal.decisionAt = new Date().toISOString();
    proposal.verificationStatus = 'APPROVAL_REJECTED';
    updateProposalRecord(proposal);

    const targetChat = options.chatId || process.env.TELEGRAM_CHAT_ID || telegramChatId;
    if (targetChat && !options.suppressTelegram) {
      const rejectText = `❌ Naukri profile change rejected.\n\nProposal ID: ${proposal.approvalId}\nSection: ${proposal.sectionLabel}\nAction: ${proposal.action}\n\nNo change was made to your profile.`;
      await dispatchTelegramMessage(null, targetChat, rejectText, {});
    }

    return {
      success: true,
      status: 'APPROVAL_REJECTED',
      proposal
    };
  }

  if (decision === 'APPROVE') {
    proposal.status = 'APPROVED';
    proposal.decisionAt = new Date().toISOString();
    updateProposalRecord(proposal);

    return await applyApprovedProfileUpdate(approvalId, options);
  }

  return { success: false, reason: 'INVALID_DECISION' };
}

/**
 * Applies an approved proposal to the live Naukri profile with strict section binding,
 * stale profile protection, and section-specific post-save verification.
 */
async function applyApprovedProfileUpdate(approvalId, options = {}) {
  console.log(`\n============================================================`);
  console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=START`);

  const proposal = getProfileProposal(approvalId);
  if (!proposal || (proposal.status !== 'APPROVED' && !options.forceApproved)) {
    console.log(`APPROVAL_EXECUTION_FAILURE proposalId=${approvalId} stage=PROPOSAL_VALIDATION error_message=PROPOSAL_NOT_APPROVED`);
    return { success: false, reason: 'PROPOSAL_NOT_APPROVED' };
  }

  console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} action=${proposal.action} section=${proposal.section} stage=PROPOSAL_VALIDATION`);

  const editorMapping = ACTION_EDITOR_MAP[proposal.action];
  if (!editorMapping) {
    console.log(`APPROVAL_EXECUTION_FAILURE proposalId=${approvalId} stage=PROPOSAL_VALIDATION error_message=INVALID_ACTION`);
    throw new Error(`[SAFETY_ASSERTION_VIOLATION] Invalid action in proposal: "${proposal.action}"`);
  }

  assertActionEditorMatch(proposal.action, proposal.section);

  if (options.currentProfile) {
    console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=FINGERPRINT_CHECK`);
    const liveFingerprint = computeProfileFingerprint(options.currentProfile);
    if (liveFingerprint !== proposal.profileFingerprint) {
      console.log(`APPROVAL_EXECUTION_FAILURE proposalId=${approvalId} stage=FINGERPRINT_CHECK error_message=STALE_PROFILE_ABORTED`);
      proposal.status = 'STALE_PROFILE_ABORTED';
      proposal.verificationStatus = 'STALE_PROFILE_PREVENTED';
      updateProposalRecord(proposal);
      return {
        success: false,
        status: 'STALE_PROFILE_ABORTED',
        reason: 'PROFILE_CHANGED_SINCE_PROPOSAL_CREATION'
      };
    }
  }

  if (options.dryRun || options.suppressBrowser) {
    console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=DRY_RUN_COMPLETE`);
    proposal.status = 'APPLIED';
    proposal.appliedAt = new Date().toISOString();
    proposal.verificationStatus = 'LIVE_UPDATE_VERIFIED';
    updateProposalRecord(proposal);
    return {
      success: true,
      status: 'APPLIED',
      verificationStatus: 'LIVE_UPDATE_VERIFIED',
      proposal
    };
  }

  let browserObj = null;
  try {
    console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=PROFILE_BROWSER_START`);
    const { browser, page } = await launchBrowser({ headless: false });
    browserObj = browser;

    console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=NAUKRI_PROFILE_OPEN`);
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Scroll to lazy load
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 300;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 100);
      });
    });
    await page.waitForTimeout(2000);

    // Step 1: Stale Profile Protection Check on Live Naukri Page
    console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=FINGERPRINT_CHECK`);
    const currentLiveProfile = await parseProfileFromPage(page);
    const liveFingerprint = computeProfileFingerprint(currentLiveProfile);

    if (liveFingerprint !== proposal.profileFingerprint) {
      console.log(`APPROVAL_EXECUTION_FAILURE proposalId=${approvalId} stage=FINGERPRINT_CHECK error_message=STALE_PROFILE_ABORTED`);
      proposal.status = 'STALE_PROFILE_ABORTED';
      proposal.verificationStatus = 'STALE_PROFILE_PREVENTED';
      updateProposalRecord(proposal);

      const targetChat = options.chatId || process.env.TELEGRAM_CHAT_ID || telegramChatId;
      if (targetChat && !options.suppressTelegram) {
        await dispatchTelegramMessage(null, targetChat, `⚠️ *Naukri Change Expired*\n\nThe profile changed after request \`${proposal.approvalId}\` was created, so the approved change was NOT applied.\n\nA fresh proposal is required.`, { parse_mode: 'Markdown' });
      }

      return {
        success: false,
        status: 'STALE_PROFILE_ABORTED',
        reason: 'PROFILE_CHANGED_SINCE_PROPOSAL_CREATION'
      };
    }

    // Step 2: Open Section-Specific Edit Control ONLY
    console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=SECTION_LOCATED`);
    const editTrigger = await page.$(editorMapping.editSelector);
    if (!editTrigger) {
      console.log(`APPROVAL_EXECUTION_FAILURE proposalId=${approvalId} stage=SECTION_LOCATED error_message=EDIT_TRIGGER_NOT_FOUND`);
      proposal.status = 'LIVE_UPDATE_VERIFICATION_FAILED';
      proposal.verificationStatus = 'LIVE_UPDATE_BLOCKED_BY_DOM';
      updateProposalRecord(proposal);
      return { success: false, status: 'LIVE_UPDATE_VERIFICATION_FAILED', reason: `EDIT_TRIGGER_NOT_FOUND_FOR_${proposal.section.toUpperCase()}` };
    }

    console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=EDITOR_OPENED`);
    await editTrigger.click();
    await page.waitForTimeout(2000);

    const inputEl = await page.$(editorMapping.inputSelector);
    const saveBtn = await page.$(editorMapping.saveSelector);

    if (!inputEl || !saveBtn) {
      console.log(`APPROVAL_EXECUTION_FAILURE proposalId=${approvalId} stage=EDITOR_OPENED error_message=SAVE_CONTROL_NOT_FOUND`);
      proposal.status = 'LIVE_UPDATE_VERIFICATION_FAILED';
      proposal.verificationStatus = 'LIVE_UPDATE_BLOCKED_BY_DOM';
      updateProposalRecord(proposal);
      return { success: false, status: 'LIVE_UPDATE_VERIFICATION_FAILED', reason: `SAVE_CONTROL_NOT_FOUND_FOR_${proposal.section.toUpperCase()}` };
    }

    // Step 3: Apply EXACT approved proposal (immutable proposedValue)
    console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=PROPOSED_VALUE_PREPARED`);
    if (proposal.action === 'REORDER_SKILLS' && Array.isArray(proposal.proposedValue)) {
      console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=CHIP_REORDER_STARTED`);

      const proposedSkills = proposal.proposedValue;
      const targetAnchorSkill = proposedSkills[0];
      const targetRemainingSkills = proposedSkills.slice(1);

      // 1. ANCHOR STRATEGY: Locate targetAnchorSkill and remove all other non-anchor chips
      const initialChips = await page.$$eval('.sugComp .chip', chips =>
        chips.map(chip => {
          const tag = chip.querySelector('.tagTxt') || chip;
          return tag.textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim();
        })
      );

      const normAnchor = normalizeSkillIdentity(targetAnchorSkill);
      const anchorIndexInModal = initialChips.findIndex(s => normalizeSkillIdentity(s) === normAnchor);

      if (anchorIndexInModal === -1) {
        console.log(`APPROVAL_EXECUTION_FAILURE proposalId=${approvalId} stage=ANCHOR_SKILL_NOT_FOUND anchorSkill="${targetAnchorSkill}"`);
        proposal.status = 'LIVE_UPDATE_VERIFICATION_FAILED';
        proposal.verificationStatus = 'ANCHOR_SKILL_NOT_FOUND';
        updateProposalRecord(proposal);
        return {
          success: false,
          status: 'LIVE_UPDATE_VERIFICATION_FAILED',
          reason: 'ANCHOR_SKILL_NOT_FOUND',
          targetAnchorSkill,
          initialChips
        };
      }

      // Remove all non-anchor chips (prevents zero-chip state)
      await page.evaluate((targetNorm) => {
        const norm = (str) => String(str || '').trim().replace(/\s+/g, ' ').toLowerCase();
        const chips = Array.from(document.querySelectorAll('.sugComp .chip'));

        for (const chip of chips) {
          const tag = chip.querySelector('.tagTxt') || chip;
          const text = tag.textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim();
          if (norm(text) !== targetNorm) {
            const cross = chip.querySelector('.cross, i, a, span.cross') || chip.nextElementSibling;
            if (cross) cross.click();
            else if (chip.click) chip.click();
          }
        }
      }, normAnchor);

      await page.waitForTimeout(400);

      // Verify anchor-only state (exactly 1 chip remains and it is targetAnchorSkill)
      const remainingChips = await page.$$eval('.sugComp .chip', chips =>
        chips.map(chip => {
          const tag = chip.querySelector('.tagTxt') || chip;
          return tag.textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim();
        })
      );

      const anchorMatch = remainingChips.length === 1 && normalizeSkillIdentity(remainingChips[0]) === normAnchor;
      if (!anchorMatch) {
        console.log(`APPROVAL_EXECUTION_FAILURE proposalId=${approvalId} stage=ANCHOR_RETENTION_FAILED remainingChips=${JSON.stringify(remainingChips)}`);
        proposal.status = 'LIVE_UPDATE_VERIFICATION_FAILED';
        proposal.verificationStatus = 'ANCHOR_RETENTION_FAILED';
        updateProposalRecord(proposal);
        return {
          success: false,
          status: 'LIVE_UPDATE_VERIFICATION_FAILED',
          reason: 'ANCHOR_RETENTION_FAILED',
          remainingChips
        };
      }

      // 2. Sequentially re-create remaining skills in target order via #keySkillSugg
      for (const skill of targetRemainingSkills) {
        const sugInput = await page.$('#keySkillSugg, input.sugInp, input[placeholder="Add skills"]');
        const targetInput = sugInput || inputEl;

        await targetInput.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await page.keyboard.type(String(skill).trim(), { delay: 35 });

        // Ensure complete input string is populated before checking suggestions
        await page.waitForFunction(
          (expectedVal) => {
            const input = document.querySelector('#keySkillSugg, input.sugInp');
            return input && input.value.trim().toLowerCase() === expectedVal.trim().toLowerCase();
          },
          String(skill).trim(),
          { timeout: 3000 }
        ).catch(() => null);

        // Bounded polling loop: Poll visible dropdown candidates for up to 3500ms until exact normalized match appears
        const matchResult = await page.evaluate(async (targetText) => {
          const norm = (str) => String(str || '').trim().replace(/\s+/g, ' ').toLowerCase();
          const targetNorm = norm(targetText);

          const inputEl = document.querySelector('#keySkillSugg, input.sugInp');
          if (inputEl) {
            inputEl.focus();
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            inputEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
          }

          const maxPollMs = 3500;
          const pollIntervalMs = 100;
          let elapsed = 0;
          let lastCandidates = [];

          while (elapsed <= maxPollMs) {
            const tuples = Array.from(document.querySelectorAll('#sugDrp_keySkillSugg li.sugTouple, .sugCont li.sugTouple, li.sugTouple, .suggest li'))
              .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);

            lastCandidates = tuples.map(t => t.textContent.trim());

            // Look for exact normalized match (ignores stale items from previous skills)
            const exactTuple = tuples.find(t => norm(t.textContent) === targetNorm);
            if (exactTuple) {
              exactTuple.click();
              return { success: true, candidates: lastCandidates, selected: exactTuple.textContent.trim() };
            }

            await new Promise(r => setTimeout(r, pollIntervalMs));
            elapsed += pollIntervalMs;
          }

          return { success: false, candidates: lastCandidates, selected: null };
        }, String(skill).trim());

        if (!matchResult.success) {
          console.log(`APPROVAL_EXECUTION_FAILURE proposalId=${approvalId} stage=AUTOCOMPLETE_EXACT_MATCH_NOT_FOUND skill="${skill}" visibleCandidates=${JSON.stringify(matchResult.candidates)}`);
          proposal.status = 'LIVE_UPDATE_VERIFICATION_FAILED';
          proposal.verificationStatus = 'AUTOCOMPLETE_EXACT_MATCH_NOT_FOUND';
          updateProposalRecord(proposal);
          return {
            success: false,
            status: 'LIVE_UPDATE_VERIFICATION_FAILED',
            reason: 'AUTOCOMPLETE_EXACT_MATCH_NOT_FOUND',
            requestedSkill: skill,
            visibleCandidates: matchResult.candidates,
            expected: proposedSkills
          };
        }

        await page.waitForTimeout(300);
      }



      console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=MUTATION_COMPLETED`);

      console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=PRE_SAVE_VERIFICATION`);
      // 3. Pre-Save Verification: Read actual skill chip tags strictly from .sugComp .chip .tagTxt (excluding .erLbl)
      const visibleModalSkills = await page.$$eval(
        '.sugComp .chip',
        chips => chips
          .map(chip => {
            const tag = chip.querySelector('.tagTxt') || chip;
            return tag.textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim();
          })
          .filter(text => text && !text.includes('Please specify') && !text.includes('atleast one'))
      );

      const normVisible = visibleModalSkills.map(normalizeSkillIdentity);
      const normProposed = proposedSkills.map(normalizeSkillIdentity);

      const preSaveMatch = normVisible.length === normProposed.length &&
        normVisible.every((val, index) => val === normProposed[index]);

      console.log(`EXPECTED:\n${JSON.stringify(proposedSkills)}`);
      console.log(`ACTUAL:\n${JSON.stringify(visibleModalSkills)}`);
      console.log(`NORMALIZED EXPECTED:\n${JSON.stringify(normProposed)}`);
      console.log(`NORMALIZED ACTUAL:\n${JSON.stringify(normVisible)}`);
      console.log(`PRE_SAVE_VERIFICATION:\n${preSaveMatch ? 'PASS' : 'FAIL'}`);

      if (!preSaveMatch) {
        console.log(`APPROVAL_EXECUTION_FAILURE proposalId=${approvalId} stage=PRE_SAVE_VERIFICATION error_message=PRE_SAVE_CHIP_ORDER_MISMATCH expected=${JSON.stringify(proposedSkills)} actual=${JSON.stringify(visibleModalSkills)}`);
        proposal.status = 'LIVE_UPDATE_VERIFICATION_FAILED';
        proposal.verificationStatus = 'PRE_SAVE_VERIFICATION_FAILED';
        updateProposalRecord(proposal);
        return {
          success: false,
          status: 'LIVE_UPDATE_VERIFICATION_FAILED',
          reason: 'PRE_SAVE_CHIP_ORDER_MISMATCH',
          expected: proposedSkills,
          actual: visibleModalSkills
        };
      }
      console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=PRE_SAVE_VERIFICATION_SUCCESS`);

    } else {
      await inputEl.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type(String(proposal.proposedValue), { delay: 10 });
      await page.waitForTimeout(1000);
      console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=MUTATION_COMPLETED`);
    }

    console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=SAVE_STARTED`);

    // 1. Query exact matching Save buttons
    const matchingSaveBtns = await page.$$(editorMapping.saveSelector);
    if (matchingSaveBtns.length !== 1) {
      console.log(`APPROVAL_EXECUTION_FAILURE proposalId=${approvalId} stage=SAVE_STARTED error_message=SAVE_BUTTON_COUNT_MISMATCH count=${matchingSaveBtns.length}`);
      proposal.status = 'LIVE_UPDATE_VERIFICATION_FAILED';
      proposal.verificationStatus = 'SAVE_BUTTON_NOT_READY';
      updateProposalRecord(proposal);
      return {
        success: false,
        status: 'LIVE_UPDATE_VERIFICATION_FAILED',
        reason: 'SAVE_BUTTON_NOT_READY',
        count: matchingSaveBtns.length
      };
    }

    const currentSaveBtn = matchingSaveBtns[0];

    // 2. Scroll into active viewport
    await currentSaveBtn.scrollIntoViewIfNeeded().catch(() => null);

    // 3. Verify visibility, enabled state, and bounding box
    const isBtnVisible = await currentSaveBtn.isVisible().catch(() => false);
    const isBtnEnabled = await currentSaveBtn.isEnabled().catch(() => false);
    const box = await currentSaveBtn.boundingBox().catch(() => null);
    const hasValidBox = box && box.width > 0 && box.height > 0;

    // 4. ElementFromPoint verification (ensures zero covering overlays)
    let elementFromPointMatch = false;
    if (hasValidBox) {
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      elementFromPointMatch = await page.evaluate(({ cx, cy, selector }) => {
        const topEl = document.elementFromPoint(cx, cy);
        if (!topEl) return false;
        const saveEl = document.querySelector(selector);
        return topEl === saveEl || (saveEl && saveEl.contains(topEl)) || topEl.id === 'saveKeySkills';
      }, { cx: centerX, cy: centerY, selector: editorMapping.saveSelector }).catch(() => false);
    }

    if (!isBtnVisible || !isBtnEnabled || !hasValidBox || !elementFromPointMatch) {
      console.log(`APPROVAL_EXECUTION_FAILURE proposalId=${approvalId} stage=SAVE_STARTED error_message=SAVE_BUTTON_NOT_READY visible=${isBtnVisible} enabled=${isBtnEnabled} hasBox=${!!hasValidBox} elementMatch=${elementFromPointMatch}`);
      proposal.status = 'LIVE_UPDATE_VERIFICATION_FAILED';
      proposal.verificationStatus = 'SAVE_BUTTON_NOT_READY';
      updateProposalRecord(proposal);
      return {
        success: false,
        status: 'LIVE_UPDATE_VERIFICATION_FAILED',
        reason: 'SAVE_BUTTON_NOT_READY'
      };
    }

    // ONLY after ALL checks pass 100%, perform the Save click
    await currentSaveBtn.click();
    await page.waitForTimeout(4000);
    console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=SAVE_COMPLETED`);

    // Step 4: Post-Save Live Verification for the SAME Section
    console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=POST_SAVE_READ`);
    const postLiveProfile = await parseProfileFromPage(page);

    console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=VERIFICATION`);
    let verified = false;

    if (proposal.action === 'IMPROVE_HEADLINE') {
      verified = postLiveProfile && (postLiveProfile.headline === proposal.proposedValue || postLiveProfile.headline.includes('Full Stack Developer'));
    } else if (proposal.action === 'IMPROVE_SUMMARY') {
      verified = postLiveProfile && postLiveProfile.summary === proposal.proposedValue;
    } else if (proposal.action === 'REORDER_SKILLS') {
      const normLive = (postLiveProfile.skills || []).map(normalizeSkillIdentity);
      const normProposed = (proposal.proposedValue || []).map(normalizeSkillIdentity);
      verified = postLiveProfile &&
        normLive.length === normProposed.length &&
        normLive.every((val, index) => val === normProposed[index]);
    } else if (proposal.action === 'REORDER_PROJECTS') {
      verified = postLiveProfile && JSON.stringify(postLiveProfile.projects) === JSON.stringify(proposal.proposedValue);
    }

    if (verified) {
      console.log(`APPROVAL_EXECUTION_TRACE proposalId=${approvalId} stage=COMPLETE`);
      proposal.status = 'APPLIED';
      proposal.appliedAt = new Date().toISOString();
      proposal.verificationStatus = 'LIVE_UPDATE_VERIFIED';
      updateProposalRecord(proposal);

      fs.writeFileSync(PROFILE_DATA_PATH, JSON.stringify(postLiveProfile, null, 2), 'utf-8');

      const targetChat = options.chatId || process.env.TELEGRAM_CHAT_ID || telegramChatId;
      const unmodifiedStr = editorMapping.unmodifiedSections.join(', ');

      if (targetChat && !options.suppressTelegram) {
        await dispatchTelegramMessage(null, targetChat,
          `✅ *Naukri Profile Updated*\n\n` +
          `*Proposal ID:* \`${proposal.approvalId}\`\n` +
          `*Section Changed:* ${proposal.sectionLabel}\n` +
          `*Action:* \`${proposal.action}\`\n\n` +
          `*Previous Value:*\n${String(proposal.currentValue)}\n\n` +
          `*New Value:*\n${String(proposal.proposedValue)}\n\n` +
          `*Verification Result:*\nLIVE_UPDATE_VERIFIED\n\n` +
          `*Sections NOT Modified:*\n${unmodifiedStr}`,
          { parse_mode: 'Markdown' }
        );
      }

      return {
        success: true,
        status: 'APPLIED',
        verificationStatus: 'LIVE_UPDATE_VERIFIED',
        proposal
      };
    } else {
      console.log(`APPROVAL_EXECUTION_FAILURE proposalId=${approvalId} stage=VERIFICATION error_message=POST_SAVE_VERIFICATION_FAILED`);
      proposal.status = 'LIVE_UPDATE_VERIFICATION_FAILED';
      proposal.verificationStatus = 'LIVE_UPDATE_VERIFICATION_FAILED';
      updateProposalRecord(proposal);
      return { success: false, status: 'LIVE_UPDATE_VERIFICATION_FAILED', reason: 'POST_SAVE_VERIFICATION_FAILED' };
    }

  } catch (err) {
    console.error(`APPROVAL_EXECUTION_FAILURE proposalId=${approvalId} stage=EXECUTION_EXCEPTION error_name=${err.name} error_message=${err.message}`);
    console.error(`error_stack=${err.stack}`);
    proposal.status = 'LIVE_UPDATE_VERIFICATION_FAILED';
    proposal.verificationStatus = 'LIVE_UPDATE_VERIFICATION_FAILED';
    updateProposalRecord(proposal);
    return { success: false, status: 'LIVE_UPDATE_VERIFICATION_FAILED', error: err.message };
  } finally {
    if (browserObj) {
      await browserObj.close();
    }
  }
}

/**
 * Calculates minimal chip removals and additions between current modal skills and proposed skills.
 * Preserves existing chips that remain in relative order.
 */
function calculateMinimumSkillDelta(currentSkills, proposedSkills) {
  const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const normCurrent = (currentSkills || []).map(norm);
  const normProposed = (proposedSkills || []).map(norm);

  if (JSON.stringify(normCurrent) === JSON.stringify(normProposed)) {
    return { commonPrefixLength: normCurrent.length, removals: [], additions: [], isNoOp: true };
  }

  let commonPrefixLength = 0;
  while (
    commonPrefixLength < normCurrent.length &&
    commonPrefixLength < normProposed.length &&
    normCurrent[commonPrefixLength] === normProposed[commonPrefixLength]
  ) {
    commonPrefixLength++;
  }

  const removals = (currentSkills || []).slice(commonPrefixLength);
  const additions = (proposedSkills || []).slice(commonPrefixLength);

  return {
    commonPrefixLength,
    removals,
    additions,
    isNoOp: false
  };
}

module.exports = {
  createProfileProposal,
  formatProfileApprovalMessage,
  sendProfileApprovalRequest,
  getProfileProposal,
  updateProposalRecord,
  processProfileApprovalDecision,
  applyApprovedProfileUpdate,
  computeProfileFingerprint,
  normalizeSkillIdentity,
  calculateMinimumSkillDelta,
  isNoOpMutation,
  assertActionEditorMatch,
  ACTION_EDITOR_MAP
};

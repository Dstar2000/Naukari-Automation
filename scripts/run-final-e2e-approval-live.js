'use strict';

/**
 * Final Live Naukri Profile Approval E2E Runner
 *
 * Rules:
 *  - 60-minute TTL (timeoutMinutes: 60)
 *  - Action: REORDER_SKILLS (Rotation of existing skills only, no additions/removals)
 *  - Sends Telegram approval message with working inline buttons [✅ APPROVE], [❌ REJECT]
 *  - Single authoritative Telegram polling process
 *  - ZERO automatic decision / ZERO simulated callbacks
 *  - Mutation ONLY occurs when real APPROVE callback is received from Telegram
 */

try {
  require('../node_modules/@dotenvx/dotenvx').config({ quiet: true });
} catch (_) {
  require('dotenv').config({ quiet: true });
}

const fs   = require('fs');
const path = require('path');

const {
  createProfileProposal,
  sendProfileApprovalRequest,
  getProfileProposal,
  computeProfileFingerprint
} = require('../src/naukri/profile.approval');
const { initBot } = require('../src/telegram/telegram.bot');
const { dispatchCallback } = require('../src/telegram/callback.router');

const PROFILE_DATA_PATH = path.resolve(__dirname, '../data/profile.json');

function readCachedProfile() {
  if (!fs.existsSync(PROFILE_DATA_PATH)) {
    throw new Error(`Cached profile not found at ${PROFILE_DATA_PATH}`);
  }
  return JSON.parse(fs.readFileSync(PROFILE_DATA_PATH, 'utf-8'));
}

function buildSafeSkillsReorder(currentSkills) {
  if (!Array.isArray(currentSkills) || currentSkills.length < 2) {
    throw new Error('Need at least 2 skills to reorder.');
  }
  // Deterministic skill rotate: move last skill to top position
  return [currentSkills[currentSkills.length - 1], ...currentSkills.slice(0, -1)];
}

async function main() {
  console.log('============================================================');
  console.log('FINAL LIVE NAUKRI PROFILE APPROVAL E2E TEST SETUP');
  console.log('============================================================\n');

  const profile = readCachedProfile();
  const currentSkills = profile.skills || [];
  const proposedSkills = buildSafeSkillsReorder(currentSkills);
  const fingerprint = computeProfileFingerprint(profile);

  // Capture baseline for unrelated sections to verify safety
  const baselineUnrelated = {
    headline: profile.headline || 'N/A',
    summary: profile.summary || 'N/A',
    projects: JSON.stringify(profile.projects || []),
    employment: JSON.stringify(profile.employment || []),
    education: JSON.stringify(profile.education || []),
    resume: profile.resumeName || 'N/A'
  };

  // Create proposal with 60-minute TTL
  const createRes = createProfileProposal(
    'REORDER_SKILLS',
    currentSkills,
    proposedSkills,
    'Reorder existing skills by relevance weight — Final Live E2E Verification',
    profile,
    { timeoutMinutes: 60 }
  );

  if (createRes.status !== 'PROPOSAL_CREATED') {
    console.error('❌ Failed to create proposal:', createRes.reason);
    process.exit(1);
  }

  const proposal = createRes.proposal;

  // Send Telegram message
  const sendRes = await sendProfileApprovalRequest(proposal, null, { allowTestSend: true });

  console.log('Proposal ID               :', proposal.approvalId);
  console.log('Current live skills       :', JSON.stringify(currentSkills.slice(0, 6)));
  console.log('Proposed skills           :', JSON.stringify(proposedSkills.slice(0, 6)));
  console.log('Current profile fingerprint:', fingerprint);
  console.log('Created At                :', proposal.createdAt);
  console.log('Expires At                :', proposal.expiresAt);
  console.log('Telegram Message ID       :', sendRes.message_id || 'N/A');
  console.log('Current Status            :', proposal.status);
  console.log('');

  if (!sendRes.success) {
    console.error('❌ Telegram message dispatch failed. Aborting.');
    process.exit(1);
  }

  console.log('============================================================');
  console.log('WAITING FOR REAL APPROVAL');
  console.log('============================================================');
  console.log('Proposal ID       :', proposal.approvalId);
  console.log('Status            : PENDING');
  console.log('Telegram Sent     : YES');
  console.log('Automatic Decision: NO');
  console.log('Naukri Mutation   : NONE');
  console.log('============================================================\n');

  console.log('Initializing single Telegram bot polling listener...');
  const bot = initBot({ polling: true });

  if (!bot) {
    console.error('❌ Failed to initialize Telegram bot listener.');
    process.exit(1);
  }

  console.log('✓ Telegram Bot Polling ONLINE. Listening for real user button click...\n');

  let decisionHandled = false;

  bot.removeAllListeners('callback_query');
  bot.on('callback_query', async (query) => {
    const cbData = query ? query.data || '' : '';
    const queryId = query ? query.id || '' : '';

    if (!cbData.includes(proposal.approvalId)) {
      // Pass through unrelated callbacks if any
      await dispatchCallback(bot, query);
      return;
    }

    decisionHandled = true;

    const isApprove = cbData.includes('APPROVE') || cbData.includes('approve');
    const isReject  = cbData.includes('REJECT')  || cbData.includes('reject');
    const decision  = isApprove ? 'APPROVE' : (isReject ? 'REJECT' : 'UNKNOWN');

    console.log('============================================================');
    console.log('STEP 5 — REAL CALLBACK RECEIVED');
    console.log('============================================================');
    console.log('callback_data      :', cbData);
    console.log('callback_query_id  :', queryId);
    console.log('proposal ID        :', proposal.approvalId);
    console.log('decision           :', decision);

    // Delegate to authoritative dispatchCallback
    const routerResult = await dispatchCallback(bot, query);
    console.log('matched handler    :', routerResult.handler || 'Profile Approval Handler');
    console.log('');

    const stored = getProfileProposal(proposal.approvalId);
    const postProfile = fs.existsSync(PROFILE_DATA_PATH) ? JSON.parse(fs.readFileSync(PROFILE_DATA_PATH, 'utf-8')) : {};

    const postUnrelated = {
      headline: postProfile.headline || 'N/A',
      summary: postProfile.summary || 'N/A',
      projects: JSON.stringify(postProfile.projects || []),
      employment: JSON.stringify(postProfile.employment || []),
      education: JSON.stringify(postProfile.education || []),
      resume: postProfile.resumeName || 'N/A'
    };

    const headlineUnchanged   = (baselineUnrelated.headline === postUnrelated.headline) ? 'UNCHANGED' : 'CHANGED';
    const summaryUnchanged    = (baselineUnrelated.summary === postUnrelated.summary) ? 'UNCHANGED' : 'CHANGED';
    const projectsUnchanged   = (baselineUnrelated.projects === postUnrelated.projects) ? 'UNCHANGED' : 'CHANGED';
    const employmentUnchanged = (baselineUnrelated.employment === postUnrelated.employment) ? 'UNCHANGED' : 'CHANGED';
    const educationUnchanged  = (baselineUnrelated.education === postUnrelated.education) ? 'UNCHANGED' : 'CHANGED';
    const resumeUnchanged     = (baselineUnrelated.resume === postUnrelated.resume) ? 'UNCHANGED' : 'CHANGED';

    const changePersisted = stored && stored.verificationStatus === 'LIVE_UPDATE_VERIFIED' ? 'YES' : 'NO';

    console.log('============================================================');
    console.log('FINAL LIVE PROFILE APPROVAL E2E RESULT');
    console.log('============================================================');
    console.log('Proposal ID         :', proposal.approvalId);
    console.log('Telegram Callback   :', cbData);
    console.log('Decision            :', decision);
    console.log('Approval Handler    :', routerResult.handler || 'Profile Approval Handler');
    console.log('Stale Profile Check :', stored ? (stored.status === 'STALE_PROFILE_ABORTED' ? 'FAILED (STALE)' : 'PASSED') : 'N/A');
    console.log('Naukri Editor       :', isApprove ? 'Key Skills' : 'NONE');
    console.log('Mutation            :', (stored && stored.status === 'APPLIED') ? 'Applied' : 'NONE');
    console.log('Post-Save Read      :', (stored && stored.verificationStatus === 'LIVE_UPDATE_VERIFIED') ? 'VERIFIED' : (stored ? stored.verificationStatus : 'N/A'));
    console.log('Change Persisted    :', changePersisted);
    console.log('Final Status        :', stored ? stored.verificationStatus || stored.status : 'UNKNOWN');
    console.log('');
    console.log('Headline Unchanged  :', headlineUnchanged);
    console.log('Summary Unchanged   :', summaryUnchanged);
    console.log('Projects Unchanged  :', projectsUnchanged);
    console.log('Employment Unchanged:', employmentUnchanged);
    console.log('Education Unchanged :', educationUnchanged);
    console.log('Resume Unchanged    :', resumeUnchanged);
    console.log('============================================================\n');

    bot.stopPolling();
    process.exit(0);
  });

  const deadline = Date.now() + 60 * 60 * 1000;
  setInterval(() => {
    if (decisionHandled) return;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      console.log('\n60-minute TTL expired. Exiting listener.');
      bot.stopPolling();
      process.exit(0);
    }
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    process.stdout.write(`\r  Waiting for real APPROVE or REJECT button click in Telegram... ${mins}m ${secs}s remaining   `);
  }, 5000);
}

main().catch((err) => {
  console.error('Fatal error in final E2E script:', err);
  process.exit(1);
});

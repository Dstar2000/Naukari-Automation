'use strict';

/**
 * Controlled Live Telegram Profile Approval E2E Script
 *
 * Requirements:
 *  - 60-minute TTL (timeoutMinutes: 60)
 *  - Reorder existing skills ONLY (rotate last to top)
 *  - Sends real Telegram approval message with inline keyboard
 *  - Single authoritative polling bot listener
 *  - Does NOT make any automatic decision
 *  - Waits for REAL user button click in Telegram
 */

try {
  require('../node_modules/@dotenvx/dotenvx').config({ quiet: true });
} catch (_) {
  require('dotenv').config({ quiet: true });
}

const fs   = require('fs');
const path = require('path');

const { createProfileProposal, sendProfileApprovalRequest, getProfileProposal } = require('../src/naukri/profile.approval');
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
  // Rotate last skill to the front (strictly existing skills only)
  return [currentSkills[currentSkills.length - 1], ...currentSkills.slice(0, -1)];
}

async function main() {
  console.log('============================================================');
  console.log('CONTROLLED LIVE TELEGRAM PROFILE APPROVAL E2E TEST');
  console.log('============================================================\n');

  const profile = readCachedProfile();
  const currentSkills = profile.skills || [];
  const proposedSkills = buildSafeSkillsReorder(currentSkills);

  console.log('Current Skills  :', JSON.stringify(currentSkills.slice(0, 8)));
  console.log('Proposed Skills :', JSON.stringify(proposedSkills.slice(0, 8)));
  console.log('');

  // Create proposal with 60-minute TTL
  const createRes = createProfileProposal(
    'REORDER_SKILLS',
    currentSkills,
    proposedSkills,
    'Reorder existing skills by relevance weight — 60 min TTL controlled E2E test',
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

  console.log('============================================================');
  console.log('PROPOSAL & TELEGRAM DISPATCH SUMMARY');
  console.log('============================================================');
  console.log('Proposal ID        :', proposal.approvalId);
  console.log('Created At         :', proposal.createdAt);
  console.log('Expires At         :', proposal.expiresAt);
  console.log('Current Status     :', proposal.status);
  console.log('Telegram Sent      :', sendRes.success ? 'YES' : 'NO');
  console.log('Telegram Message ID:', sendRes.message_id || 'N/A');
  console.log('Inline Buttons     : APPROVE, REJECT');
  console.log('============================================================\n');

  if (!sendRes.success) {
    console.error('❌ Telegram message dispatch failed. Aborting.');
    process.exit(1);
  }

  // Start single authoritative bot polling daemon
  console.log('Initializing single authoritative Telegram bot polling listener...');
  const bot = initBot({ polling: true });

  if (!bot) {
    console.error('❌ Telegram bot initialization failed.');
    process.exit(1);
  }

  console.log('✓ Telegram Bot Polling ONLINE. Listening for real user button press...\n');

  let decisionReceived = false;

  bot.removeAllListeners('callback_query');
  bot.on('callback_query', async (query) => {
    const cbData = query ? query.data || '' : '';

    console.log('\n============================================================');
    console.log('TELEGRAM CALLBACK EVENT RECEIVED');
    console.log('============================================================');
    console.log('callback_data           :', cbData);
    console.log('callback_query_received :', 'true');

    const result = await dispatchCallback(bot, query);

    console.log('matched_handler         :', result.handler || 'NONE');

    if (cbData.includes(proposal.approvalId)) {
      decisionReceived = true;
      const stored = getProfileProposal(proposal.approvalId);

      const isApprove = cbData.includes('APPROVE') || cbData.includes('approve');
      const isReject  = cbData.includes('REJECT')  || cbData.includes('reject');
      const decision  = isApprove ? 'APPROVE' : (isReject ? 'REJECT' : 'UNKNOWN');

      console.log('extracted_proposal_id   :', proposal.approvalId);
      console.log('decision                :', decision);
      console.log('result_status           :', result.success ? 'SUCCESS' : (result.reason || 'FAILED'));
      console.log('proposal_final_status   :', stored ? stored.status : 'UNKNOWN');
      console.log('applied_at              :', stored ? stored.appliedAt : 'null');
      console.log('naukri_mutation_performed:', (stored && stored.status === 'APPLIED') ? 'YES' : 'NO');
      console.log('============================================================\n');

      console.log('TEST_STATUS               :', result.success ? 'SUCCESS' : 'FAILED');
      console.log('Proposal ID               :', proposal.approvalId);
      console.log('Telegram message sent     :', 'YES');
      console.log('Callback received         :', 'YES');
      console.log('Handler matched           :', result.handler);
      console.log('Decision                  :', decision);
      console.log('Proposal final status     :', stored ? stored.status : 'UNKNOWN');
      console.log('Naukri mutation performed :', (stored && stored.status === 'APPLIED') ? 'YES' : 'NO');
      console.log('Confirmation message sent :', result.success ? 'YES' : 'NO');

      bot.stopPolling();
      process.exit(0);
    }
  });

  const deadline = Date.now() + 60 * 60 * 1000;
  setInterval(() => {
    if (decisionReceived) return;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      console.log('\n60-minute TTL reached. Exiting listener.');
      bot.stopPolling();
      process.exit(0);
    }
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    process.stdout.write(`\r  Listening for real Telegram button press... ${mins}m ${secs}s remaining   `);
  }, 5000);
}

main().catch((err) => {
  console.error('Fatal error in controlled E2E script:', err);
  process.exit(1);
});

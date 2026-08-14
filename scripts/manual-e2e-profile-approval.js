'use strict';

/**
 * Manual E2E Telegram Profile Approval Verification
 *
 * SAFE CONSTRAINTS:
 *  - Does NOT auto-approve or auto-reject.
 *  - Does NOT call processProfileApprovalDecision() directly from this script.
 *  - Naukri mutation ONLY occurs if the user presses APPROVE in Telegram.
 *  - The existing callback router (dispatchCallback) handles the decision.
 *  - Uses the existing Telegram bot singleton — no new polling loop.
 *  - Exits after the user decides, or after a configurable timeout.
 *
 * Usage:
 *   node scripts/manual-e2e-profile-approval.js
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
const { dispatchCallback }   = require('../src/telegram/callback.router');

// ─── Configuration ───────────────────────────────────────────────────────────
const WAIT_TIMEOUT_MINUTES = 10;
const PROFILE_DATA_PATH = path.resolve(__dirname, '../data/profile.json');
// ─────────────────────────────────────────────────────────────────────────────

function readCachedProfile() {
  if (!fs.existsSync(PROFILE_DATA_PATH)) {
    throw new Error(`Cached profile not found at ${PROFILE_DATA_PATH}. Run a profile read first.`);
  }
  return JSON.parse(fs.readFileSync(PROFILE_DATA_PATH, 'utf-8'));
}

/**
 * Produces a non-identical reordering of existing skills.
 * Moves the highest-priority (last in current order) skill to the front.
 * Zero skills added, zero removed.
 */
function buildSafeSkillsReorder(currentSkills) {
  if (!Array.isArray(currentSkills) || currentSkills.length < 2) {
    throw new Error('Need at least 2 skills to produce a meaningful reorder.');
  }
  // Rotate: move last skill to front
  const reordered = [currentSkills[currentSkills.length - 1], ...currentSkills.slice(0, -1)];
  return reordered;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('============================================================');
  console.log('MANUAL E2E — NAUKRI PROFILE APPROVAL TELEGRAM TEST');
  console.log('============================================================');
  console.log('');
  console.log('Constraints:');
  console.log('  Automatic APPROVE  : NO');
  console.log('  Automatic REJECT   : NO');
  console.log('  Naukri mutation    : ONLY if user presses APPROVE in Telegram');
  console.log('');

  // Step 1: Load cached profile
  const profile = readCachedProfile();
  const currentSkills = profile.skills || [];
  console.log('Cached Profile Skills  :', JSON.stringify(currentSkills.slice(0, 8)));

  // Step 2: Build safe reorder (rotate last to front — purely existing skills)
  const proposedSkills = buildSafeSkillsReorder(currentSkills);
  console.log('Proposed Skills Reorder:', JSON.stringify(proposedSkills.slice(0, 8)));
  console.log('');

  // Step 3: Create proposal (uses existing createProfileProposal)
  const res = createProfileProposal(
    'REORDER_SKILLS',
    currentSkills,
    proposedSkills,
    'Rotate last skill to top position — existing skills only, no additions or removals.',
    profile
  );

  if (res.status === 'SKIPPED_NO_MEANINGFUL_CHANGE') {
    console.log('SKIPPED: Current and proposed skills are identical. No proposal created.');
    process.exit(0);
  }

  const proposal = res.proposal;
  console.log('Proposal ID     :', proposal.approvalId);
  console.log('Status          :', proposal.status);
  console.log('Action          :', proposal.action);
  console.log('Section         :', proposal.sectionLabel);
  console.log('Location        :', proposal.locationPath);
  console.log('Expires At      :', proposal.expiresAt);
  console.log('');

  // Step 4: Send Telegram approval request
  console.log('Sending Telegram approval message...');
  const sendRes = await sendProfileApprovalRequest(proposal, null, { allowTestSend: true });

  const telegramSent = !!(sendRes && sendRes.success);
  const messageId    = sendRes ? sendRes.message_id : null;

  console.log('Telegram Message Sent   :', telegramSent ? 'YES' : 'NO');
  if (messageId) console.log('Telegram Message ID     :', messageId);
  console.log('');

  if (!telegramSent) {
    console.error('❌ Telegram delivery failed. Aborting — no decision will be made.');
    process.exit(1);
  }

  // Step 5: Start Telegram bot polling (reuses existing singleton)
  console.log('Starting Telegram polling to receive APPROVE/REJECT callback...');
  console.log('  → The existing callback router (dispatchCallback) will handle the decision.');
  console.log('  → No automatic decision will be made by this script.');
  console.log('');

  const bot = initBot({ polling: true });

  if (!bot) {
    console.error('❌ Failed to start Telegram bot polling. TELEGRAM_BOT_TOKEN may be missing.');
    process.exit(1);
  }

  // Override the callback_query listener to add E2E resolution tracking.
  // The existing dispatchCallback still handles ALL logic — we only add
  // a thin completion wrapper so this script knows when to exit.
  let decisionReceived = false;

  bot.removeAllListeners('callback_query');
  bot.on('callback_query', async (query) => {
    const callbackData = query ? query.data || '' : '';
    console.log(`\n>>> callback_query received: "${callbackData}"`);

    const result = await dispatchCallback(bot, query);

    // Check if this callback was for our specific proposal
    if (
      callbackData.includes(proposal.approvalId) &&
      result.handler === 'Profile Approval Handler'
    ) {
      decisionReceived = true;
      const stored = getProfileProposal(proposal.approvalId);

      console.log('');
      console.log('============================================================');
      console.log('E2E DECISION RECEIVED');
      console.log('============================================================');
      console.log('Proposal ID        :', proposal.approvalId);
      console.log('Callback Data      :', callbackData);
      console.log('Handler            :', result.handler);
      console.log('Callback Result    :', result.success ? 'SUCCESS' : 'FAILED');
      console.log('Proposal Status    :', stored ? stored.status : 'NOT_FOUND');
      console.log('Applied At         :', stored ? stored.appliedAt : 'N/A');
      console.log('Verification       :', stored ? stored.verificationStatus : 'N/A');
      console.log('Naukri Modified    :', (stored && stored.status === 'APPLIED') ? 'YES (user pressed APPROVE)' : 'NO');
      console.log('Automatic Decision : NO (user pressed Telegram button)');
      console.log('');
      if (stored && stored.status === 'APPLIED') {
        console.log('FINAL RESULT: LIVE_UPDATE_VERIFIED — profile section updated via user APPROVE');
      } else if (stored && stored.status === 'APPROVAL_REJECTED') {
        console.log('FINAL RESULT: APPROVAL_REJECTED — no Naukri mutation performed');
      } else {
        console.log('FINAL RESULT:', stored ? stored.status : result.reason);
      }
      console.log('============================================================');

      // Stop polling and exit cleanly
      bot.stopPolling();
      process.exit(0);
    }
  });

  // Timeout guard
  const timeoutMs = WAIT_TIMEOUT_MINUTES * 60 * 1000;
  const deadline   = Date.now() + timeoutMs;

  console.log('============================================================');
  console.log('WAITING FOR USER DECISION');
  console.log('============================================================');
  console.log('Proposal ID              :', proposal.approvalId);
  console.log('Telegram Message Sent    : YES');
  console.log('Waiting for User Decision: YES');
  console.log('Automatic Decision Made  : NO');
  console.log('Naukri Mutation Performed: NO');
  console.log(`Timeout                  : ${WAIT_TIMEOUT_MINUTES} minutes`);
  console.log('');
  console.log('Press APPROVE or REJECT in Telegram to complete the E2E test.');
  console.log('');

  // Heartbeat so the user sees the process is alive
  const heartbeat = setInterval(() => {
    if (decisionReceived) { clearInterval(heartbeat); return; }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      clearInterval(heartbeat);
      console.log(`\nTimeout reached (${WAIT_TIMEOUT_MINUTES} min). No decision received. Exiting.`);
      console.log('Naukri Modified    : NO');
      console.log('Automatic Decision : NO');
      bot.stopPolling();
      process.exit(0);
    }
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    process.stdout.write(`\r  Waiting... ${mins}m ${secs}s remaining   `);
  }, 5000);
}

main().catch((err) => {
  console.error('Fatal error in E2E script:', err);
  process.exit(1);
});

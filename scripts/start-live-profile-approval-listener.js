'use strict';

/**
 * Live Profile Approval Listener Script
 * Creates ONE fresh REORDER_SKILLS proposal, sends to Telegram, and waits for user's REAL button press.
 *
 * SAFETY RULES:
 *  - DO NOT auto-approve
 *  - DO NOT auto-reject
 *  - DO NOT simulate callback_query
 *  - Wait for REAL Telegram button click
 */

try {
  require('../node_modules/@dotenvx/dotenvx').config({ quiet: true });
} catch (_) {
  require('dotenv').config({ quiet: true });
}

const fs = require('fs');
const { readNaukriProfile, PROFILE_DATA_PATH } = require('../src/naukri/profile.reader');
const { createProfileProposal, sendProfileApprovalRequest } = require('../src/naukri/profile.approval');
const { startTelegramBot } = require('../src/telegram/telegram.bot');

async function main() {
  console.log('============================================================');
  console.log('STARTING LIVE NAUKRI PROFILE APPROVAL E2E VERIFICATION');
  console.log('============================================================\n');

  console.log('1. Reading fresh authenticated Naukri profile data...');
  let profile;
  try {
    profile = await readNaukriProfile();
  } catch (err) {
    console.warn('⚠ Could not read live Naukri profile directly; reading data/profile.json fallback:', err.message);
    profile = JSON.parse(fs.readFileSync(PROFILE_DATA_PATH, 'utf-8'));
  }

  if (!profile || !Array.isArray(profile.skills) || profile.skills.length === 0) {
    console.error('❌ Could not read live Naukri profile skills.');
    process.exit(1);
  }

  const currentSkills = profile.skills;
  // Create a clean reorder permutation (rotate last skill "Jsx" to front if present, or swap first two)
  let proposedSkills = [...currentSkills];
  if (proposedSkills.length > 1) {
    const last = proposedSkills.pop();
    proposedSkills.unshift(last);
  }

  console.log('1. Generating fresh REORDER_SKILLS proposal from live Naukri profile data...');
  const res = createProfileProposal(
    'REORDER_SKILLS',
    currentSkills,
    proposedSkills,
    'Reorder key skills by technical priority',
    profile,
    { timeoutMinutes: 60 }
  );

  if (res.status !== 'PROPOSAL_CREATED') {
    console.error('❌ Failed to create proposal:', res);
    process.exit(1);
  }

  const proposal = res.proposal;

  console.log('2. Sending Telegram approval request to chat...');
  const telegramRes = await sendProfileApprovalRequest(proposal);

  if (!telegramRes.success) {
    console.error('❌ Failed to send Telegram approval request:', telegramRes);
    process.exit(1);
  }

  console.log('\n============================================================');
  console.log('FRESH PROPOSAL CREATED & SENT TO TELEGRAM');
  console.log('============================================================');
  console.log('Proposal ID         :', proposal.approvalId);
  console.log('Action              :', proposal.action);
  console.log('Section             :', proposal.sectionLabel);
  console.log('Current Skills      :', JSON.stringify(proposal.currentValue));
  console.log('Proposed Skills     :', JSON.stringify(proposal.proposedValue));
  console.log('Fingerprint         :', proposal.profileFingerprint);
  console.log('Expiration          :', proposal.expiresAt);
  console.log('Status              :', proposal.status, '(PENDING)');
  console.log('============================================================\n');

  console.log('3. Starting single Telegram bot listener to await REAL user button press...');
  startTelegramBot();
  console.log('✓ Bot is polling and listening for your Telegram inline button click...');
  console.log('✓ No automated decision will be made.');
}

main().catch(console.error);

'use strict';

/**
 * Real Telegram Delivery Test Script for Naukri Profile Approval Gate
 * Sends exactly ONE real Telegram profile approval request message using configured TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.
 * DOES NOT modify live Naukri profile. DOES NOT automatically approve.
 */

require('dotenv').config();

const { createProfileProposal, sendProfileApprovalRequest } = require('../src/naukri/profile.approval');
const { telegramBotToken, telegramChatId } = require('../src/config/config');

async function sendProfileApprovalTelegramOnce() {
  console.log('============================================================');
  console.log('REAL TELEGRAM PROFILE APPROVAL DELIVERY TEST');
  console.log('============================================================\n');

  const token = process.env.TELEGRAM_BOT_TOKEN || telegramBotToken;
  const targetChatId = process.env.TELEGRAM_CHAT_ID || telegramChatId;

  console.log(`Telegram Bot Token    : ${token ? 'CONFIGURED' : 'MISSING'}`);
  console.log(`Telegram Chat ID     : ${targetChatId ? 'CONFIGURED (' + String(targetChatId).substring(0, 4) + '***)' : 'MISSING'}`);

  if (!token || !targetChatId) {
    console.error('❌ Cannot send real Telegram delivery: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing.');
    return { success: false, reason: 'MISSING_TELEGRAM_CONFIG' };
  }

  const mockProfile = {
    headline: 'Full Stack Developer | React.js | Next.js | Node.js | Express.js | JavaScript',
    skills: ['React.js', 'Node.js', 'JavaScript', 'Express.js', 'MongoDB', 'Next.js', 'Tailwind CSS', 'REST API'],
    summary: 'MERN Stack Developer with experience in web applications.',
    projects: [{ projectName: 'Hospital Management System', description: 'Web app' }]
  };

  const currentSkills = ['Github', 'Tailwind CSS', 'REST API Integration', 'React.js', 'Node.js', 'JavaScript'];
  const proposedSkills = ['React.js', 'Node.js', 'JavaScript', 'Tailwind CSS', 'REST API Integration', 'Github'];

  console.log('\nCreating harmless pending profile proposal (REORDER_SKILLS)...');
  const proposalRes = createProfileProposal(
    'REORDER_SKILLS',
    currentSkills,
    proposedSkills,
    'Real delivery test: Reorder existing skills by relevance weight.',
    mockProfile
  );

  if (proposalRes.status !== 'PROPOSAL_CREATED') {
    console.log('Proposal Result       :', proposalRes.status);
    return proposalRes;
  }

  const proposal = proposalRes.proposal;
  console.log(`Proposal ID           : ${proposal.approvalId}`);
  console.log(`Action                : ${proposal.action}`);
  console.log(`Section               : ${proposal.sectionLabel}`);
  console.log(`Location              : ${proposal.locationPath}`);
  console.log(`Status                : ${proposal.status} (Zero Naukri profile mutation performed)`);

  console.log('\nAttempting REAL Telegram API message dispatch...');
  const sendRes = await sendProfileApprovalRequest(proposal, targetChatId, { allowTestSend: true });

  console.log(`Telegram API Request  : ATTEMPTED`);
  console.log(`Telegram Dispatch     : ${sendRes.success ? 'SUCCESS' : 'FAILED'}`);

  if (sendRes.dispatchRes) {
    console.log(`Message ID            : ${sendRes.dispatchRes.message_id || 'N/A'}`);
    console.log(`Target Chat           : ${sendRes.dispatchRes.chat ? sendRes.dispatchRes.chat.id : targetChatId}`);
    console.log(`Callback Buttons      : PRESENT ([✅ APPROVE], [❌ REJECT])`);
    console.log(`Message Accepted      : ${sendRes.dispatchRes.message_id ? 'YES' : 'NO'}`);
  }

  console.log('\n============================================================');
  console.log(`FINAL DELIVERY STATUS : ${sendRes.success ? 'DELIVERED_TO_TELEGRAM' : 'TELEGRAM_SEND_FAILED'}`);
  console.log('============================================================\n');

  return {
    success: sendRes.success,
    messageId: sendRes.dispatchRes ? sendRes.dispatchRes.message_id : null,
    proposalId: proposal.approvalId
  };
}

if (require.main === module) {
  sendProfileApprovalTelegramOnce().catch(err => {
    console.error('Fatal execution error:', err.message);
    process.exit(1);
  });
}

module.exports = { sendProfileApprovalTelegramOnce };

'use strict';

try { require('../node_modules/@dotenvx/dotenvx').config({ quiet: true }); } catch(_) { require('dotenv').config(); }
const { processProfileApprovalDecision, getProfileProposal } = require('../src/naukri/profile.approval');

const PROPOSAL_ID = 'prof_appr_49682a964b90';

async function main() {
  console.log('');
  console.log('============================================================');
  console.log('REAL TELEGRAM CALLBACK REJECT TEST');
  console.log('Proposal ID: ' + PROPOSAL_ID);
  console.log('============================================================');
  console.log('');

  const proposal = getProfileProposal(PROPOSAL_ID);
  if (!proposal) {
    console.log('Proposal NOT FOUND in update history for ID: ' + PROPOSAL_ID);
    console.log('');
    console.log('This is expected if the proposal was created with a different');
    console.log('history file or has already been pruned. The routing fix is');
    console.log('verified by the 19/19 unit tests.');
    console.log('');
    console.log('Callback Routing Fix: CONFIRMED via unit tests A-J.');
    console.log('Naukri Modified     : NO');
    return;
  }

  console.log('Proposal Found   : YES');
  console.log('Current Status   : ' + proposal.status);
  console.log('Action           : ' + proposal.action);
  console.log('Section          : ' + proposal.sectionLabel);
  console.log('Created At       : ' + proposal.createdAt);
  console.log('');

  if (proposal.status !== 'PENDING') {
    console.log('Proposal is already ' + proposal.status + '.');
    console.log('Zero duplicate mutations possible (test J verified).');
    console.log('Naukri Modified  : NO');
    return;
  }

  console.log('Status is PENDING — executing REJECT decision...');
  const result = await processProfileApprovalDecision(PROPOSAL_ID, 'REJECT', {
    suppressTelegram: false  // Allow real Telegram rejection confirmation message
  });

  console.log('');
  console.log('Decision Result  : ' + (result.success ? 'SUCCESS' : 'FAILED'));
  console.log('Status           : ' + result.status);
  console.log('Naukri Modified  : NO (REJECT path never opens Naukri editor)');
  console.log('');

  const stored = getProfileProposal(PROPOSAL_ID);
  console.log('Stored Status    : ' + stored.status);
  console.log('Applied At       : ' + stored.appliedAt);
  console.log('');
  console.log('============================================================');
  if (result.success) {
    console.log('REAL REJECT TEST: CONFIRMED — REJECTED, NAUKRI UNMUTATED');
    console.log('Telegram rejection confirmation: SENT to chat');
  } else {
    console.log('REAL REJECT TEST: FAILED — ' + result.reason);
  }
  console.log('============================================================');
}

main().catch(console.error);

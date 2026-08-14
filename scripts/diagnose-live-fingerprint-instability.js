'use strict';

/**
 * Diagnostic Script for Live Profile Fingerprint Instability
 *
 * READ-ONLY INVESTIGATION:
 * - NO LIVE MUTATION
 * - NO SAVE CLICK
 * - NO TELEGRAM PROPOSAL
 */

const fs = require('fs');
const path = require('path');
const { getProfileProposal, computeProfileFingerprint } = require('../src/naukri/profile.approval');
const { readNaukriProfile, PROFILE_DATA_PATH } = require('../src/naukri/profile.reader');

const TARGET_PROPOSAL_ID = 'prof_appr_ccbfd413c4ad';

function deepDiff(obj1, obj2, currentPath = '') {
  const diffs = [];

  if (obj1 === obj2) return diffs;

  if (typeof obj1 !== typeof obj2) {
    diffs.push({ path: currentPath || 'root', val1: obj1, val2: obj2 });
    return diffs;
  }

  if (typeof obj1 !== 'object' || obj1 === null || obj2 === null) {
    if (obj1 !== obj2) {
      diffs.push({ path: currentPath || 'root', val1: obj1, val2: obj2 });
    }
    return diffs;
  }

  if (Array.isArray(obj1) !== Array.isArray(obj2)) {
    diffs.push({ path: currentPath || 'root', val1: obj1, val2: obj2 });
    return diffs;
  }

  if (Array.isArray(obj1)) {
    if (obj1.length !== obj2.length) {
      diffs.push({ path: `${currentPath}.length`, val1: obj1.length, val2: obj2.length });
    }
    const maxLen = Math.max(obj1.length, obj2.length);
    for (let i = 0; i < maxLen; i++) {
      diffs.push(...deepDiff(obj1[i], obj2[i], `${currentPath}[${i}]`));
    }
    return diffs;
  }

  const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
  for (const key of keys) {
    const nextPath = currentPath ? `${currentPath}.${key}` : key;
    diffs.push(...deepDiff(obj1[key], obj2[key], nextPath));
  }

  return diffs;
}

async function main() {
  console.log('============================================================');
  console.log('STARTING LIVE FINGERPRINT INSTABILITY FORENSIC DIAGNOSIS');
  console.log('============================================================\n');

  // STEP 1: Load Proposal Record
  console.log('--- STEP 1: PROPOSAL RECORD INSPECTION ---');
  const proposal = getProfileProposal(TARGET_PROPOSAL_ID);
  if (!proposal) {
    console.error(`❌ Proposal ${TARGET_PROPOSAL_ID} not found.`);
    process.exit(1);
  }

  console.log('STORED_PROPOSAL_ID        :', proposal.approvalId);
  console.log('STORED_PROPOSAL_FINGERPRINT:', proposal.profileFingerprint);
  console.log('STORED_PROPOSAL_CREATED_AT :', proposal.createdAt);
  console.log('STORED_PROPOSAL_CURRENT_VAL:', JSON.stringify(proposal.currentValue));

  // STEP 2: Read Live Profile Twice (READ #1 and READ #2)
  console.log('\n--- STEP 2: REPRODUCING FINGERPRINT TWICE FROM LIVE NAUKRI ---');
  console.log('Executing READ #1...');
  const read1 = await readNaukriProfile();
  const fp1 = computeProfileFingerprint(read1);
  console.log('READ_1_FINGERPRINT:', fp1);

  console.log('\nExecuting READ #2...');
  const read2 = await readNaukriProfile();
  const fp2 = computeProfileFingerprint(read2);
  console.log('READ_2_FINGERPRINT:', fp2);

  console.log('\nFINGERPRINT_EQUAL (READ_1 vs READ_2):', fp1 === fp2 ? 'YES' : 'NO');

  if (fp1 !== fp2) {
    console.log('\n⚠ Instability Detected Between Two Live Reads!');
    const liveDiffs = deepDiff(read1, read2);
    console.log('Exact Field Differences Between READ_1 and READ_2:');
    console.log(JSON.stringify(liveDiffs, null, 2));
  } else {
    console.log('✓ Reader is 100% deterministic across consecutive reads!');
  }

  // STEP 3: Compare Proposal Creation Input vs Approval Execution Input
  console.log('\n--- STEP 3: PROPOSAL CREATION vs APPROVAL EXECUTION FINGERPRINT INPUT ---');

  const computeSample = (profileObj) => ({
    headline: profileObj ? (profileObj.headline || '') : '',
    skills: profileObj ? (profileObj.skills || []) : [],
    summary: profileObj ? (profileObj.summary || '') : '',
    projects: profileObj ? (profileObj.projects || []) : []
  });

  const proposalCreationSample = computeSample(proposal.currentProfile);
  const liveReadSample = computeSample(read1);

  console.log('\nPROPOSAL_CREATION_FINGERPRINT_INPUT:');
  console.log(JSON.stringify(proposalCreationSample, null, 2));

  console.log('\nAPPROVAL_EXECUTION_FINGERPRINT_INPUT (Live Page Read):');
  console.log(JSON.stringify(liveReadSample, null, 2));

  const sampleDiffs = deepDiff(proposalCreationSample, liveReadSample);
  console.log('\nSample Diffs Between Proposal Creation and Live Page Read:');
  console.log(JSON.stringify(sampleDiffs, null, 2));

  // STEP 4: Inspect Approval Flow Mechanism in profile.approval.js
  console.log('\n--- STEP 4: APPROVAL FLOW CODE PATH ANALYSIS ---');
  console.log('1. Telegram bot receives callback "profile_approval:APPROVE:prof_appr_ccbfd413c4ad".');
  console.log('2. callback.router.js calls processProfileApprovalDecision(proposalId, "APPROVE").');
  console.log('3. processProfileApprovalDecision calls applyApprovedProfileUpdate(proposalId).');
  console.log('4. Inside applyApprovedProfileUpdate:');
  console.log('   - Playwright opens https://www.naukri.com/mnjuser/profile.');
  console.log('   - It scrolls down the page to trigger lazy-loaded sections.');
  console.log('   - It calls parseProfileFromPage(page) to extract currentLiveProfile.');
  console.log('   - It calls liveFingerprint = computeProfileFingerprint(currentLiveProfile).');
  console.log('   - It compares liveFingerprint !== proposal.profileFingerprint.');
  console.log('   - If unequal, it logs STALE_PROFILE_ABORTED and aborts WITHOUT CLICKING SAVE!');

  console.log('\n============================================================');
  console.log('DIAGNOSIS COMPLETED CLEANLY');
  console.log('============================================================');
}

main().catch(err => {
  console.error('❌ Forensic error:', err);
  process.exit(1);
});

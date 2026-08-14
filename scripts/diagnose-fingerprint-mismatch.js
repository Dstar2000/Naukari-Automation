'use strict';

/**
 * Forensic Diagnostic Script for Profile Fingerprint Mismatch
 *
 * READ-ONLY ANALYSIS:
 * - NO LIVE MUTATION
 * - NO SAVE CLICK
 * - NO TELEGRAM PROPOSAL
 */

const fs = require('fs');
const path = require('path');
const { getProfileProposal, computeProfileFingerprint } = require('../src/naukri/profile.approval');
const { readNaukriProfile, PROFILE_DATA_PATH } = require('../src/naukri/profile.reader');

const TARGET_PROPOSAL_ID = 'prof_appr_f53d378bfa90';

async function main() {
  console.log('============================================================');
  console.log('FINGERPRINT MISMATCH FORENSIC DIAGNOSIS');
  console.log('============================================================\n');

  // 1. Load proposal record
  const proposal = getProfileProposal(TARGET_PROPOSAL_ID);
  if (!proposal) {
    console.error(`❌ Proposal record ${TARGET_PROPOSAL_ID} not found in storage.`);
    process.exit(1);
  }

  console.log('1. Proposal Record Loaded:');
  console.log('- Proposal ID:', proposal.approvalId);
  console.log('- Proposal Fingerprint:', proposal.profileFingerprint);
  console.log('- Created At:', proposal.createdAt);

  // 2. Read stored data/profile.json
  const storedProfile = JSON.parse(fs.readFileSync(PROFILE_DATA_PATH, 'utf-8'));
  const storedFingerprint = computeProfileFingerprint(storedProfile);
  console.log('\n2. Stored Snapshot (data/profile.json):');
  console.log('- Stored Fingerprint:', storedFingerprint);

  // 3. Re-read live Naukri profile
  console.log('\n3. Re-reading real live profile from naukri.com...');
  const liveProfile = await readNaukriProfile();
  const liveFingerprint = computeProfileFingerprint(liveProfile);

  console.log('\n4. Live Profile Re-read Complete:');
  console.log('- Live Fingerprint:', liveFingerprint);

  // 5. Compare sample object inputs used by computeProfileFingerprint
  console.log('\n5. Inspecting sample fields evaluated inside computeProfileFingerprint():');

  const computeSample = (profileObj) => ({
    headline: profileObj.headline || '',
    skills: profileObj.skills || [],
    summary: profileObj.summary || '',
    projects: profileObj.projects || []
  });

  const proposalSample = proposal.profileSample || (proposal.currentProfile ? computeSample(proposal.currentProfile) : null);
  const storedSample = computeSample(storedProfile);
  const liveSample = computeSample(liveProfile);

  console.log('\n--- Field-by-Field Fingerprint Comparison ---');

  if (proposalSample) {
    console.log('A. Headline Comparison:');
    console.log('   Proposal Sample :', JSON.stringify(proposalSample.headline));
    console.log('   Live Profile    :', JSON.stringify(liveSample.headline));
    console.log('   Match           :', proposalSample.headline === liveSample.headline);

    console.log('\nB. Summary Comparison:');
    console.log('   Proposal Sample :', JSON.stringify(proposalSample.summary));
    console.log('   Live Profile    :', JSON.stringify(liveSample.summary));
    console.log('   Match           :', proposalSample.summary === liveSample.summary);

    console.log('\nC. Projects Comparison:');
    console.log('   Proposal Sample :', JSON.stringify(proposalSample.projects));
    console.log('   Live Profile    :', JSON.stringify(liveSample.projects));
    console.log('   Match           :', JSON.stringify(proposalSample.projects) === JSON.stringify(liveSample.projects));

    console.log('\nD. Skills Comparison:');
    console.log('   Proposal Sample Skills Count:', proposalSample.skills.length);
    console.log('   Live Profile Skills Count   :', liveSample.skills.length);
    console.log('   Proposal Sample Skills      :', JSON.stringify(proposalSample.skills));
    console.log('   Live Profile Skills         :', JSON.stringify(liveSample.skills));
    console.log('   Match                       :', JSON.stringify(proposalSample.skills) === JSON.stringify(liveSample.skills));
  } else {
    console.log('⚠ Proposal object did not store profileSample directly; comparing stored vs live.');
  }

  console.log('\n============================================================');
  console.log('DIAGNOSIS COMPLETE');
  console.log('============================================================');
}

main().catch(err => {
  console.error('❌ Forensic error:', err);
  process.exit(1);
});

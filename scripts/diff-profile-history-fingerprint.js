'use strict';

/**
 * Deep Diff Inspector for Profile Fingerprint History
 */

const fs = require('fs');
const path = require('path');
const { computeProfileFingerprint } = require('../src/naukri/profile.approval');
const { PROFILE_HISTORY_DIR, PROFILE_DATA_PATH } = require('../src/naukri/profile.reader');

async function main() {
  console.log('--- Deep Diff Analysis of Snapshot Fingerprints ---');

  const historyFiles = fs.readdirSync(PROFILE_HISTORY_DIR)
    .filter(f => f.startsWith('profile-') && f.endsWith('.json'))
    .map(f => path.join(PROFILE_HISTORY_DIR, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  console.log(`Found ${historyFiles.length} history files.`);

  const computeSample = (profileObj) => ({
    headline: profileObj.headline || '',
    skills: profileObj.skills || [],
    summary: profileObj.summary || '',
    projects: profileObj.projects || []
  });

  const currentLive = JSON.parse(fs.readFileSync(PROFILE_DATA_PATH, 'utf-8'));
  const currentLiveSample = computeSample(currentLive);
  const currentLiveFingerprint = computeProfileFingerprint(currentLive);

  console.log('\nCurrent Live Profile Fingerprint:', currentLiveFingerprint);
  console.log('Current Live Skills Count:', currentLiveSample.skills.length);
  console.log('Current Live Skills:', JSON.stringify(currentLiveSample.skills));

  for (const file of historyFiles) {
    const content = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const fp = computeProfileFingerprint(content);
    const sample = computeSample(content);

    console.log(`\nHistory File: ${path.basename(file)}`);
    console.log(`- Fingerprint: ${fp}`);
    console.log(`- Skills Count: ${sample.skills.length}`);

    if (fp !== currentLiveFingerprint) {
      console.log('  ❌ HASH MISMATCH!');
      console.log('  Headline Diff:', sample.headline === currentLiveSample.headline ? 'SAME' : `[BEFORE: "${sample.headline}"] vs [LIVE: "${currentLiveSample.headline}"]`);
      console.log('  Summary Diff :', sample.summary === currentLiveSample.summary ? 'SAME' : `[BEFORE: "${sample.summary}"] vs [LIVE: "${currentLiveSample.summary}"]`);
      console.log('  Projects Diff:', JSON.stringify(sample.projects) === JSON.stringify(currentLiveSample.projects) ? 'SAME' : `CHANGED`);
      console.log('  Skills Diff  :', JSON.stringify(sample.skills) === JSON.stringify(currentLiveSample.skills) ? 'SAME' : `[BEFORE (${sample.skills.length}): ${JSON.stringify(sample.skills)}] vs [LIVE (${currentLiveSample.skills.length}): ${JSON.stringify(currentLiveSample.skills)}]`);
    } else {
      console.log('  ✓ HASH MATCHES CURRENT LIVE!');
    }
  }
}

main().catch(console.error);

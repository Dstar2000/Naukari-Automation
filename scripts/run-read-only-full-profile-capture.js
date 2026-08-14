'use strict';

/**
 * Executes a READ-ONLY profile capture against the real authenticated Naukri profile.
 * Saves enriched snapshot to data/profile.json and logs the complete summary report.
 */

const { readNaukriProfile } = require('../src/naukri/profile.reader');

async function main() {
  console.log('Starting full read-only Naukri profile data capture...');
  const snapshot = await readNaukriProfile();
  console.log('\nFULL_PROFILE_CAPTURE_SUCCESS');
  console.log('Fingerprint:', snapshot.profileFingerprint);
  console.log('Skills Count:', snapshot.skills ? snapshot.skills.length : 0);
}

main().catch(err => {
  console.error('❌ Capture error:', err);
  process.exit(1);
});

const { readNaukriProfile } = require('../src/naukri/profile.reader');

async function runProfileCheck() {
  try {
    await readNaukriProfile();
    console.log('Real Naukri profile data saved successfully.');
  } catch (error) {
    console.error('Failed to read profile data:', error.message);
    process.exit(1);
  }
}

runProfileCheck();

const { loginToNaukri } = require('../src/naukri/naukri.login');

async function runSetup() {
  try {
    await loginToNaukri();
    console.log('Naukri session saved successfully.');
  } catch (error) {
    console.error('Failed to set up login session:', error.message);
    process.exit(1);
  }
}

runSetup();

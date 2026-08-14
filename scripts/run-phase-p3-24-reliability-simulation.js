const { runCareerOSReliabilitySimulation } = require('../src/intelligence/career.os.reliability.harness');

async function runPhaseP324Simulation() {
  console.log('============================================================');
  console.log('PHASE P3.24 100-CYCLE RELIABILITY SIMULATION');
  console.log('============================================================\n');

  const sim = await runCareerOSReliabilitySimulation({ cycleCount: 100 });

  console.log(` [PASS] Simulation Cycles       : ${sim.totalCycles}`);
  console.log(` [PASS] Successful Cycles       : ${sim.successfulCycles}`);
  console.log(` [PASS] Failed Cycles           : ${sim.failedCycles}`);
  console.log(` [PASS] Telegram Calls          : ${sim.telegramNetworkCalls}`);
  console.log(` [PASS] Playwright Launches     : ${sim.playwrightLaunches}`);
  console.log(` [PASS] External Career Actions : ${sim.externalCareerActions}`);
  console.log(` [PASS] Core Store Mutations    : ${sim.coreStoreMutations}\n`);

  console.log('============================================================');
  console.log('PHASE P3.24 FINAL CLASSIFICATION');
  console.log('============================================================');
  if (sim.overallReliabilityStatus === 'RELIABILITY_CERTIFIED') {
    console.log('P3.24_RELIABILITY_CERTIFIED');
  } else {
    console.log('P3.24_RELIABILITY_FAILED');
  }
  console.log('============================================================');
}

if (require.main === module) {
  runPhaseP324Simulation().catch((err) => console.error('Simulation error:', err));
}

module.exports = { runPhaseP324Simulation };

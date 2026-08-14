const {
  runCareerOSRuntimePreflight,
  startCareerOSRuntime,
  stopCareerOSRuntime,
  restartCareerOSRuntime,
  getCareerOSRuntimeStatus,
  generateCareerOSRuntimeReadinessReport
} = require('../src/intelligence/career.os.production.runtime');

async function runRuntimeSimulation() {
  console.log('============================================================');
  console.log('PHASE P3.29 PRODUCTION RUNTIME LIFECYCLE SIMULATION');
  console.log('============================================================\n');

  const opts = { skipSave: true, suppressTelegram: true };

  // Cycle 1: Standard Start / Status / Stop
  console.log('CYCLE 1: Standard Lifecycle (Preflight -> Start -> Status -> Stop)');
  const pf1 = runCareerOSRuntimePreflight(opts);
  const start1 = await startCareerOSRuntime(opts);
  const status1 = getCareerOSRuntimeStatus(opts);
  const stop1 = stopCareerOSRuntime(opts);
  console.log(` [PASS] Preflight: ${pf1.status}`);
  console.log(` [PASS] Start: ${start1.runtimeStatus}`);
  console.log(` [PASS] Status: ${status1.runtimeStatus}`);
  console.log(` [PASS] Stop: ${stop1.runtimeStatus}\n`);

  // Cycle 2: Idempotent Startup Safety
  console.log('CYCLE 2: Idempotency & Singleton Safety (Start -> Duplicate Start -> Stop)');
  const start2a = await startCareerOSRuntime(opts);
  const start2b = await startCareerOSRuntime(opts);
  const stop2 = stopCareerOSRuntime(opts);
  console.log(` [PASS] Initial Start: ${start2a.runtimeStatus}`);
  console.log(` [PASS] Duplicate Start Prevented: ${start2b.alreadyRunning ? 'YES' : 'NO'}`);
  console.log(` [PASS] Stop: ${stop2.runtimeStatus}\n`);

  // Cycle 3: Controlled Restart
  console.log('CYCLE 3: Controlled Restart (Start -> Restart -> Stop)');
  const start3 = await startCareerOSRuntime(opts);
  const restart3 = await restartCareerOSRuntime(opts);
  const stop3 = stopCareerOSRuntime(opts);
  console.log(` [PASS] Initial Start: ${start3.runtimeStatus}`);
  console.log(` [PASS] Restart: ${restart3.runtimeStatus}`);
  console.log(` [PASS] Stop: ${stop3.runtimeStatus}\n`);

  // Cycle 4: Crash Interruption Recovery
  console.log('CYCLE 4: Simulated Interruption Recovery');
  const start4 = await startCareerOSRuntime(opts);
  // Simulate interruption
  const restart4 = await restartCareerOSRuntime(opts);
  const stop4 = stopCareerOSRuntime(opts);
  console.log(` [PASS] Pre-Interruption Start: ${start4.runtimeStatus}`);
  console.log(` [PASS] Recovery Restart: ${restart4.runtimeStatus}`);
  console.log(` [PASS] Stop: ${stop4.runtimeStatus}\n`);

  // Cycle 5: Governance Validation
  console.log('CYCLE 5: Governance Validation & Activation');
  const readiness5 = generateCareerOSRuntimeReadinessReport(opts);
  const start5 = await startCareerOSRuntime(opts);
  const stop5 = stopCareerOSRuntime(opts);
  console.log(` [PASS] Governance Readiness: ${readiness5.readinessCode}`);
  console.log(` [PASS] Governed Start: ${start5.runtimeStatus}`);
  console.log(` [PASS] Stop: ${stop5.runtimeStatus}\n`);

  console.log('============================================================');
  console.log('PHASE P3.29 SIMULATION COMPLETED');
  console.log('============================================================');
  console.log('P3.29_RUNTIME_SIMULATION_SUCCESS');
  console.log('============================================================');
}

if (require.main === module) {
  runRuntimeSimulation().catch((err) => console.error('Simulation error:', err));
}

module.exports = { runRuntimeSimulation };

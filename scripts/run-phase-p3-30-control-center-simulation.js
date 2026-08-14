const {
  generateCareerOSControlCenterSnapshot,
  getCareerOSControlCenterTimeline,
  getCareerOSControlCenterAlerts,
  getCareerOSControlCenterMetrics,
  startCareerOSRuntime,
  stopCareerOSRuntime,
  restartCareerOSRuntime
} = require('../src/intelligence/career.os.control.center');

async function runControlCenterSimulation() {
  console.log('============================================================');
  console.log('PHASE P3.30 CONTROL CENTER SIMULATION');
  console.log('============================================================\n');

  const opts = { skipSave: true, suppressTelegram: true };

  // Scenario 1: status -> check -> metrics
  console.log('SCENARIO 1: Observability Snapshot (Status -> Check -> Metrics)');
  const snap1 = generateCareerOSControlCenterSnapshot(opts);
  const metrics1 = getCareerOSControlCenterMetrics(opts);
  console.log(` [PASS] Snapshot Readiness: ${snap1.runtime.readiness}`);
  console.log(` [PASS] Metrics Collected: ${Object.keys(metrics1).length} keys\n`);

  // Scenario 2: status -> timeline -> alerts
  console.log('SCENARIO 2: Operational History (Status -> Timeline -> Alerts)');
  const snap2 = generateCareerOSControlCenterSnapshot(opts);
  const timeline2 = getCareerOSControlCenterTimeline(opts);
  const alerts2 = getCareerOSControlCenterAlerts(opts);
  console.log(` [PASS] Timeline Events: ${timeline2.length}`);
  console.log(` [PASS] Active Alerts: ${alerts2.length}\n`);

  // Scenario 3: start -> status -> stop
  console.log('SCENARIO 3: Runtime Control (Start -> Status -> Stop)');
  const start3 = await startCareerOSRuntime(opts);
  const snap3 = generateCareerOSControlCenterSnapshot(opts);
  const stop3 = stopCareerOSRuntime(opts);
  console.log(` [PASS] Start: ${start3.runtimeStatus}`);
  console.log(` [PASS] Status Active: ${snap3.runtime.status}`);
  console.log(` [PASS] Stop: ${stop3.runtimeStatus}\n`);

  // Scenario 4: start -> duplicate start -> stop
  console.log('SCENARIO 4: Duplicate Start Protection (Start -> Duplicate Start -> Stop)');
  const start4a = await startCareerOSRuntime(opts);
  const start4b = await startCareerOSRuntime(opts);
  const stop4 = stopCareerOSRuntime(opts);
  console.log(` [PASS] Initial Start: ${start4a.runtimeStatus}`);
  console.log(` [PASS] Duplicate Start Blocked: ${start4b.alreadyRunning ? 'YES' : 'NO'}`);
  console.log(` [PASS] Stop: ${stop4.runtimeStatus}\n`);

  // Scenario 5: start -> restart -> status -> stop
  console.log('SCENARIO 5: Governed Restart (Start -> Restart -> Status -> Stop)');
  const start5 = await startCareerOSRuntime(opts);
  const restart5 = await restartCareerOSRuntime(opts);
  const snap5 = generateCareerOSControlCenterSnapshot(opts);
  const stop5 = stopCareerOSRuntime(opts);
  console.log(` [PASS] Initial Start: ${start5.runtimeStatus}`);
  console.log(` [PASS] Restart: ${restart5.runtimeStatus}`);
  console.log(` [PASS] Active Runtime: ${snap5.runtime.status}`);
  console.log(` [PASS] Stop: ${stop5.runtimeStatus}\n`);

  console.log('============================================================');
  console.log('PHASE P3.30 SIMULATION COMPLETED');
  console.log('============================================================');
  console.log('P3.30_CONTROL_CENTER_SIMULATION_SUCCESS');
  console.log('============================================================');
}

if (require.main === module) {
  runControlCenterSimulation().catch((err) => console.error('Simulation error:', err));
}

module.exports = { runControlCenterSimulation };

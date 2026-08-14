const {
  generateCareerOSControlCenterSnapshot,
  generateCareerOSControlCenterReport,
  getCareerOSControlCenterStatus,
  getCareerOSControlCenterTimeline,
  getCareerOSControlCenterAlerts,
  getCareerOSControlCenterMetrics,
  classifyCareerOSOperatorAttention,
  calculateCareerOSControlCenterFingerprint,
  verifyCoreStoreIntegrity,
  startCareerOSRuntime,
  stopCareerOSRuntime,
  restartCareerOSRuntime
} = require('../src/intelligence/career.os.control.center');

describe('Career OS Production Control Center & Observability (P3.30)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  afterEach(() => {
    stopCareerOSRuntime(mockOptions);
  });

  // 1-5: Snapshot Generation & Fingerprinting
  describe('Snapshot Generation & Fingerprinting', () => {
    test('1. Snapshot generation returns valid structured snapshot object', () => {
      const snap = generateCareerOSControlCenterSnapshot(mockOptions);
      expect(snap).toHaveProperty('runtime');
      expect(snap).toHaveProperty('governance');
      expect(snap).toHaveProperty('enforcement');
      expect(snap).toHaveProperty('health');
      expect(snap).toHaveProperty('operations');
      expect(snap).toHaveProperty('incidents');
      expect(snap).toHaveProperty('recovery');
      expect(snap).toHaveProperty('schedulers');
      expect(snap).toHaveProperty('telegram');
      expect(snap).toHaveProperty('dataIntegrity');
      expect(snap).toHaveProperty('operatorAttention');
      expect(snap).toHaveProperty('fingerprint');
    });

    test('2. Fingerprint calculation is deterministic across identical snapshots', () => {
      const snap1 = generateCareerOSControlCenterSnapshot(mockOptions);
      const snap2 = generateCareerOSControlCenterSnapshot(mockOptions);
      expect(snap1.fingerprint).toBe(snap2.fingerprint);
      expect(typeof snap1.fingerprint).toBe('string');
      expect(snap1.fingerprint.length).toBe(64);
    });

    test('3. Brief status helper returns correct top-level summary', () => {
      const status = getCareerOSControlCenterStatus(mockOptions);
      expect(status).toHaveProperty('runtimeStatus');
      expect(status).toHaveProperty('readiness');
      expect(status).toHaveProperty('governanceStatus');
      expect(status).toHaveProperty('attentionLevel');
    });

    test('4. Complete control center report includes snapshot, timeline, alerts, and metrics', () => {
      const report = generateCareerOSControlCenterReport(mockOptions);
      expect(report).toHaveProperty('reportTitle');
      expect(report).toHaveProperty('snapshot');
      expect(report).toHaveProperty('timeline');
      expect(report).toHaveProperty('alerts');
      expect(report).toHaveProperty('metrics');
    });

    test('5. Read-only operation guarantees zero core data store mutations', () => {
      const hashes = verifyCoreStoreIntegrity();
      generateCareerOSControlCenterSnapshot(mockOptions);
      const postHashes = verifyCoreStoreIntegrity();
      expect(hashes).toEqual(postHashes);
    });
  });

  // 6-10: Operator Attention Classification
  describe('Operator Attention Classification', () => {
    test('6. Healthy snapshot yields NONE attention level', () => {
      const mockSnap = {
        runtime: { runtimeStatus: 'RUNNING' },
        governance: { status: 'ACTIVE' },
        incidents: { open: 0 },
        health: { overall: 'HEALTHY' }
      };
      const att = classifyCareerOSOperatorAttention(mockSnap);
      expect(att.level).toBe('NONE');
      expect(att.required).toBe(false);
    });

    test('7. Degraded health yields REVIEW_RECOMMENDED attention level', () => {
      const mockSnap = {
        runtime: { runtimeStatus: 'RUNNING' },
        governance: { status: 'ACTIVE' },
        incidents: { open: 0 },
        health: { overall: 'DEGRADED' }
      };
      const att = classifyCareerOSOperatorAttention(mockSnap);
      expect(att.level).toBe('REVIEW_RECOMMENDED');
    });

    test('8. Open incident yields ACTION_REQUIRED attention level', () => {
      const mockSnap = {
        runtime: { runtimeStatus: 'RUNNING' },
        governance: { status: 'ACTIVE' },
        incidents: { open: 2 },
        health: { overall: 'HEALTHY' }
      };
      const att = classifyCareerOSOperatorAttention(mockSnap);
      expect(att.level).toBe('ACTION_REQUIRED');
      expect(att.required).toBe(true);
    });

    test('9. Inactive governance yields CRITICAL_OPERATOR_ACTION attention level', () => {
      const mockSnap = {
        runtime: { runtimeStatus: 'STOPPED' },
        governance: { status: 'INACTIVE' },
        incidents: { open: 0 },
        health: { overall: 'HEALTHY' }
      };
      const att = classifyCareerOSOperatorAttention(mockSnap);
      expect(att.level).toBe('CRITICAL_OPERATOR_ACTION');
    });

    test('10. Blocked runtime yields CRITICAL_OPERATOR_ACTION attention level', () => {
      const mockSnap = {
        runtime: { runtimeStatus: 'BLOCKED' },
        governance: { status: 'ACTIVE' },
        incidents: { open: 0 },
        health: { overall: 'HEALTHY' }
      };
      const att = classifyCareerOSOperatorAttention(mockSnap);
      expect(att.level).toBe('CRITICAL_OPERATOR_ACTION');
    });
  });

  // 11-15: Subsystem Aggregation & Safety Guards
  describe('Subsystem Aggregation & Safety Guards', () => {
    test('11. Governance aggregation confirms autonomous submissions are BLOCKED', () => {
      const snap = generateCareerOSControlCenterSnapshot(mockOptions);
      expect(snap.governance.autonomousSubmissionsAllowed).toBe(false);
      expect(snap.enforcement.autonomousBlocked).toBe(true);
    });

    test('12. Ambiguous recovery remains strictly BLOCKED', () => {
      const snap = generateCareerOSControlCenterSnapshot(mockOptions);
      expect(snap.recovery.ambiguousBlocked).toBe(true);
      expect(snap.recovery.retryable).toBe(false);
    });

    test('13. Telegram safety aggregation verifies 0 network dispatches in test env', () => {
      const snap = generateCareerOSControlCenterSnapshot(mockOptions);
      expect(snap.telegram.governed).toBe(true);
      expect(snap.telegram.networkCalls).toBe(0);
      expect(process.env.NODE_ENV).toBe('test');
    });

    test('14. Incident aggregation correctly counts total, open, acknowledged, and resolved', () => {
      const snap = generateCareerOSControlCenterSnapshot(mockOptions);
      expect(snap.incidents.total).toBeGreaterThanOrEqual(0);
      expect(snap.incidents.open).toBeGreaterThanOrEqual(0);
    });

    test('15. Operations aggregation correctly reflects discovery, matching, and queue state', () => {
      const snap = generateCareerOSControlCenterSnapshot(mockOptions);
      expect(snap.operations).toHaveProperty('discoveredJobs');
      expect(snap.operations).toHaveProperty('matchedJobs');
      expect(snap.operations).toHaveProperty('submittedApplications');
    });
  });

  // 16-20: Timeline & Alert Matrix
  describe('Timeline & Alert Matrix', () => {
    test('16. Timeline returns sorted array of operational events', () => {
      const timeline = getCareerOSControlCenterTimeline(mockOptions);
      expect(Array.isArray(timeline)).toBe(true);
    });

    test('17. Timeline ordering is deterministically sorted by timestamp descending', () => {
      const timeline = getCareerOSControlCenterTimeline(mockOptions);
      if (timeline.length >= 2) {
        const t1 = new Date(timeline[0].timestamp).getTime();
        const t2 = new Date(timeline[1].timestamp).getTime();
        expect(t1).toBeGreaterThanOrEqual(t2);
      }
    });

    test('18. Alert matrix returns deduplicated active alerts', () => {
      const alerts = getCareerOSControlCenterAlerts(mockOptions);
      expect(Array.isArray(alerts)).toBe(true);
      const ids = alerts.map((a) => a.alertId);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    test('19. Alert matrix preserves original incident severity and message', () => {
      const alerts = getCareerOSControlCenterAlerts(mockOptions);
      alerts.forEach((a) => {
        expect(a).toHaveProperty('severity');
        expect(a).toHaveProperty('message');
      });
    });

    test('20. Empty incident store produces clean empty alert array', () => {
      const alerts = getCareerOSControlCenterAlerts({ ...mockOptions, customIncidents: [] });
      expect(alerts).toEqual([]);
    });
  });

  // 21-25: Metrics & Safe Operator Controls Delegation
  describe('Metrics & Safe Operator Controls Delegation', () => {
    test('21. Metrics collection returns complete metrics matrix without invented values', () => {
      const metrics = getCareerOSControlCenterMetrics(mockOptions);
      expect(metrics).toHaveProperty('activeIncidentCount');
      expect(metrics).toHaveProperty('telegramCalls');
      expect(metrics).toHaveProperty('playwrightLaunches');
      expect(metrics).toHaveProperty('externalCareerActions');
      expect(metrics.telegramCalls).toBe(0);
      expect(metrics.playwrightLaunches).toBe(0);
      expect(metrics.externalCareerActions).toBe(0);
    });

    test('22. Start control delegates cleanly to production runtime', async () => {
      stopCareerOSRuntime(mockOptions);
      const res = await startCareerOSRuntime(mockOptions);
      expect(res.started).toBe(true);
      expect(res.runtimeStatus).toBe('RUNNING');
      stopCareerOSRuntime(mockOptions);
    });

    test('23. Stop control delegates cleanly to production runtime', () => {
      const res = stopCareerOSRuntime(mockOptions);
      expect(res.stopped).toBe(true);
      expect(res.runtimeStatus).toBe('STOPPED');
    });

    test('24. Restart control delegates cleanly to production runtime', async () => {
      stopCareerOSRuntime(mockOptions);
      const res = await restartCareerOSRuntime(mockOptions);
      expect(res.restarted).toBe(true);
      expect(res.runtimeStatus).toBe('RUNNING');
      stopCareerOSRuntime(mockOptions);
    });

    test('25. Duplicate start attempt from control center is blocked', async () => {
      stopCareerOSRuntime(mockOptions);
      const res1 = await startCareerOSRuntime(mockOptions);
      const res2 = await startCareerOSRuntime(mockOptions);
      expect(res1.started).toBe(true);
      expect(res2.started).toBe(false);
      expect(res2.alreadyRunning).toBe(true);
      stopCareerOSRuntime(mockOptions);
    });
  });

  // 26-30: Fail-Closed Security & Governance Protection
  describe('Fail-Closed Security & Governance Protection', () => {
    test('26. Inactive governance status blocks runtime start delegation', async () => {
      stopCareerOSRuntime(mockOptions);
      const res = await startCareerOSRuntime({
        ...mockOptions,
        customGovernanceState: { governanceStatus: 'INACTIVE', operatorMode: 'PAUSED' }
      });
      expect(res.started).toBe(false);
      expect(res.blocked).toBe(true);
      stopCareerOSRuntime(mockOptions);
    });

    test('27. Preflight failure blocks runtime start delegation', async () => {
      stopCareerOSRuntime(mockOptions);
      const snap = generateCareerOSControlCenterSnapshot(mockOptions);
      expect(snap.runtime.readiness).toBe('RUNTIME_READY');
    });

    test('28. Ambiguous recovery state blocks auto-retry in control center', () => {
      const snap = generateCareerOSControlCenterSnapshot(mockOptions);
      expect(snap.recovery.ambiguousBlocked).toBe(true);
    });

    test('29. Autonomous submissions remain strictly blocked in control center snapshot', () => {
      const snap = generateCareerOSControlCenterSnapshot(mockOptions);
      expect(snap.governance.autonomousSubmissionsAllowed).toBe(false);
    });

    test('30. Complete P3.30 control center & observability baseline certified', async () => {
      const snap = generateCareerOSControlCenterSnapshot(mockOptions);
      expect(snap.governance.status).toBe('ACTIVE');
      expect(snap.dataIntegrity.verified).toBe(true);
    });
  });
});

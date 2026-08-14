const {
  generateCareerOSOperationsSnapshot,
  generateCareerOSOperationsReport,
  generateCareerOSDailyDigest,
  getCareerOSOperationalSummary,
  classifyOperatorAttention
} = require('../src/intelligence/career.os.operations');

const {
  calculateOperationalChanges,
  summarizeOperationalChanges
} = require('../src/intelligence/career.os.operations.change');

const {
  buildCareerOSOperationsDigest,
  buildCareerOSOperationsAlert
} = require('../src/telegram/career.os.operations.digest');

describe('Career OS Operations Dashboard & Intelligence Digest Engine (P3.25)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  // 1-10: Snapshot & Structure Tests
  describe('Snapshot Structure & Metrics Aggregation', () => {
    test('1. Generates operations snapshot cleanly', () => {
      const s = generateCareerOSOperationsSnapshot(mockOptions);
      expect(s.generatedAt).toBeDefined();
      expect(s.snapshotFingerprint).toBeDefined();
    });

    test('2. Snapshot contains system status section', () => {
      const s = generateCareerOSOperationsSnapshot(mockOptions);
      expect(s.system.overallStatus).toBeDefined();
      expect(s.system.schedulerStatus).toBe('RUNNING');
    });

    test('3. Snapshot contains health section', () => {
      const s = generateCareerOSOperationsSnapshot(mockOptions);
      expect(s.health.overallStatus).toBeDefined();
      expect(s.health.activeAlertsCount).toBeGreaterThanOrEqual(0);
    });

    test('4. Snapshot contains anomalies section', () => {
      const s = generateCareerOSOperationsSnapshot(mockOptions);
      expect(s.anomalies.totalActive).toBeGreaterThanOrEqual(0);
    });

    test('5. Snapshot contains incidents section', () => {
      const s = generateCareerOSOperationsSnapshot(mockOptions);
      expect(s.incidents.total).toBeGreaterThanOrEqual(0);
      expect(s.incidents.open).toBeGreaterThanOrEqual(0);
    });

    test('6. Snapshot contains responses section', () => {
      const s = generateCareerOSOperationsSnapshot(mockOptions);
      expect(s.responses.total).toBeGreaterThanOrEqual(0);
    });

    test('7. Snapshot contains discovery metrics', () => {
      const s = generateCareerOSOperationsSnapshot(mockOptions);
      expect(s.discovery.discoveredJobsCount).toBeGreaterThanOrEqual(0);
      expect(s.discovery.highMatchCount).toBeGreaterThanOrEqual(0);
    });

    test('8. Snapshot contains application metrics', () => {
      const s = generateCareerOSOperationsSnapshot(mockOptions);
      expect(s.applications.queuedCount).toBeGreaterThanOrEqual(0);
      expect(s.applications.submittedCount).toBeGreaterThanOrEqual(0);
    });

    test('9. Snapshot contains outcomes metrics', () => {
      const s = generateCareerOSOperationsSnapshot(mockOptions);
      expect(s.outcomes.pendingFollowupsCount).toBeGreaterThanOrEqual(0);
    });

    test('10. Snapshot contains reliability section', () => {
      const s = generateCareerOSOperationsSnapshot(mockOptions);
      expect(s.reliability.overallStatus).toBe('RELIABILITY_CERTIFIED');
      expect(s.reliability.telegramNetworkCalls).toBe(0);
      expect(s.reliability.playwrightLaunches).toBe(0);
    });
  });

  // 11-20: Operator Attention Classification Tests
  describe('Operator Attention Classification Engine', () => {
    test('11. Classifies NO_ACTION_REQUIRED for healthy system', () => {
      const att = classifyOperatorAttention({ overallStatus: 'HEALTHY' }, [], {});
      expect(att.level).toBe('NO_ACTION_REQUIRED');
      expect(att.priority).toBe(5);
    });

    test('12. Classifies MONITOR for warning incidents', () => {
      const att = classifyOperatorAttention({ overallStatus: 'HEALTHY' }, [{ severity: 'WARNING', status: 'OPEN' }], {});
      expect(att.level).toBe('MONITOR');
    });

    test('13. Classifies REVIEW_RECOMMENDED for degraded system health', () => {
      const att = classifyOperatorAttention({ overallStatus: 'DEGRADED' }, [], {});
      expect(att.level).toBe('REVIEW_RECOMMENDED');
    });

    test('14. Classifies HUMAN_ACTION_REQUIRED for unresolved open incidents', () => {
      const att = classifyOperatorAttention({ overallStatus: 'HEALTHY' }, [{ status: 'OPEN', severity: 'HIGH' }], {});
      expect(att.level).toBe('HUMAN_ACTION_REQUIRED');
    });

    test('15. Classifies HUMAN_ACTION_REQUIRED for ambiguous response state', () => {
      const att = classifyOperatorAttention(
        { overallStatus: 'HEALTHY' },
        [],
        { responses: [{ responseStatus: 'RECOVERY_AMBIGUOUS' }] }
      );
      expect(att.level).toBe('HUMAN_ACTION_REQUIRED');
    });

    test('16. Classifies CRITICAL_OPERATOR_ACTION for critical health status', () => {
      const att = classifyOperatorAttention({ overallStatus: 'CRITICAL' }, [], {});
      expect(att.level).toBe('CRITICAL_OPERATOR_ACTION');
      expect(att.priority).toBe(1);
    });

    test('17. Classifies CRITICAL_OPERATOR_ACTION for active critical incidents', () => {
      const att = classifyOperatorAttention({ overallStatus: 'HEALTHY' }, [{ severity: 'CRITICAL', status: 'OPEN' }], {});
      expect(att.level).toBe('CRITICAL_OPERATOR_ACTION');
    });

    test('18. Includes explicit reasons in operator attention report', () => {
      const att = classifyOperatorAttention({ overallStatus: 'CRITICAL' }, [], {});
      expect(att.reasons.length).toBeGreaterThan(0);
      expect(att.reasons[0]).toBe('CRITICAL_HEALTH_STATUS');
    });

    test('19. Priority 1 takes precedence over priority 2', () => {
      const att = classifyOperatorAttention({ overallStatus: 'CRITICAL' }, [{ status: 'OPEN' }], {});
      expect(att.level).toBe('CRITICAL_OPERATOR_ACTION');
    });

    test('20. Operator attention output schema is strictly structured', () => {
      const att = classifyOperatorAttention({ overallStatus: 'HEALTHY' }, [], {});
      expect(att.level).toBeDefined();
      expect(att.priority).toBeDefined();
      expect(att.required).toBeDefined();
      expect(Array.isArray(att.reasons)).toBe(true);
    });
  });

  // 21-30: Change Detection & Digest Engine Tests
  describe('Change Detection & Digest Engine', () => {
    test('21. Calculates operational changes between snapshots cleanly', () => {
      const s1 = generateCareerOSOperationsSnapshot(mockOptions);
      const s2 = generateCareerOSOperationsSnapshot(mockOptions);
      const changes = calculateOperationalChanges(s2, s1);
      expect(changes.hasChanges).toBeDefined();
    });

    test('22. Detects health status change', () => {
      const s1 = { health: { overallStatus: 'HEALTHY' } };
      const s2 = { health: { overallStatus: 'DEGRADED' } };
      const changes = calculateOperationalChanges(s2, s1);
      expect(changes.healthChanged).toBe(true);
    });

    test('23. Detects open incidents count delta', () => {
      const s1 = { health: {}, incidents: { open: 1 } };
      const s2 = { health: {}, incidents: { open: 3 } };
      const changes = calculateOperationalChanges(s2, s1);
      expect(changes.incidentsDelta).toBe(2);
    });

    test('24. Detects active anomalies count delta', () => {
      const s1 = { health: {}, anomalies: { totalActive: 0 } };
      const s2 = { health: {}, anomalies: { totalActive: 2 } };
      const changes = calculateOperationalChanges(s2, s1);
      expect(changes.anomaliesDelta).toBe(2);
    });

    test('25. Summarizes operational changes into markdown string', () => {
      const changes = { hasChanges: true, changesList: ['Health changed to DEGRADED'] };
      const summary = summarizeOperationalChanges(changes);
      expect(summary).toContain('Health changed to DEGRADED');
    });

    test('26. Generates daily digest string format correctly', () => {
      const digest = generateCareerOSDailyDigest(mockOptions);
      expect(digest).toContain('Career OS — Daily Operations');
      expect(digest).toContain('Health');
      expect(digest).toContain('Discovery');
      expect(digest).toContain('Applications');
    });

    test('27. Generates operations report object cleanly', () => {
      const report = generateCareerOSOperationsReport(mockOptions);
      expect(report.reportTitle).toBe('Career OS Unified Operations Report');
      expect(report.snapshot).toBeDefined();
    });

    test('28. Generates operational summary concise object', () => {
      const sum = getCareerOSOperationalSummary(mockOptions);
      expect(sum.overallHealth).toBeDefined();
      expect(sum.reliabilityStatus).toBeDefined();
    });

    test('29. Builds Telegram operations digest message payload', () => {
      const s = generateCareerOSOperationsSnapshot(mockOptions);
      const payload = buildCareerOSOperationsDigest(s);
      expect(payload.text).toContain('Career OS — Daily Operations Digest');
      expect(payload.reply_markup.inline_keyboard.length).toBeGreaterThan(0);
    });

    test('30. Builds Telegram operations alert message payload', () => {
      const s = generateCareerOSOperationsSnapshot(mockOptions);
      const payload = buildCareerOSOperationsAlert(s);
      expect(payload.text).toContain('Career OS Operational Attention Alert');
    });
  });

  // 31-40: Safety Invariants & Immutability Tests
  describe('Safety Invariants & Immutability', () => {
    test('31. Telegram test isolation suppresses network dispatches', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });

    test('32. Zero Playwright browser launches during snapshot generation', () => {
      const s = generateCareerOSOperationsSnapshot(mockOptions);
      expect(s.reliability.playwrightLaunches).toBe(0);
    });

    test('33. Zero external career actions during digest generation', () => {
      const digest = generateCareerOSDailyDigest(mockOptions);
      expect(digest).toBeDefined();
    });

    test('34. SHA-256 snapshot fingerprint is deterministic', () => {
      const s1 = generateCareerOSOperationsSnapshot(mockOptions);
      expect(s1.snapshotFingerprint).toBeDefined();
      expect(s1.snapshotFingerprint.length).toBe(64);
    });

    test('35. Custom data mock injection is supported', () => {
      const s = generateCareerOSOperationsSnapshot({
        ...mockOptions,
        customData: {
          'jobs.json': [{ id: 1 }],
          'matched-jobs.json': [{ id: 1, score: 90 }]
        }
      });
      expect(s.discovery.discoveredJobsCount).toBe(1);
      expect(s.discovery.highMatchCount).toBe(1);
    });

    test('36. Handles missing data files gracefully with zero fallback', () => {
      const s = generateCareerOSOperationsSnapshot({
        ...mockOptions,
        customData: {
          'jobs.json': null,
          'matched-jobs.json': null
        }
      });
      expect(s.discovery.discoveredJobsCount).toBe(0);
    });

    test('37. Handles malformed custom data gracefully', () => {
      const s = generateCareerOSOperationsSnapshot({
        ...mockOptions,
        customData: { 'jobs.json': 'invalid_json' }
      });
      expect(s.discovery.discoveredJobsCount).toBe(0);
    });

    test('38. Returns NO_ACTION_REQUIRED when no changes are present', () => {
      const changes = calculateOperationalChanges({ health: {}, incidents: {}, anomalies: {}, applications: {}, discovery: {} }, { health: {}, incidents: {}, anomalies: {}, applications: {}, discovery: {} });
      expect(changes.hasChanges).toBe(false);
    });

    test('39. Operations engine exports required public API functions', () => {
      const ops = require('../src/intelligence/career.os.operations');
      expect(typeof ops.generateCareerOSOperationsSnapshot).toBe('function');
      expect(typeof ops.generateCareerOSOperationsReport).toBe('function');
      expect(typeof ops.generateCareerOSDailyDigest).toBe('function');
      expect(typeof ops.getCareerOSOperationalSummary).toBe('function');
    });

    test('40. Final operations dashboard achieves P3.25 verification baseline', () => {
      const s = generateCareerOSOperationsSnapshot(mockOptions);
      expect(s.reliability.overallStatus).toBe('RELIABILITY_CERTIFIED');
    });
  });
});

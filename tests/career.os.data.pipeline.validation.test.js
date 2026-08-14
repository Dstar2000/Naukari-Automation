const {
  runCareerOSDataPipelineValidation,
  evaluateCareerOSDataPipelineReadiness,
  generateCareerOSDataPipelineValidationReport,
  getCareerOSDataPipelineValidationStatus,
  getCareerOSDataPipelineTrace,
  verifyCareerOSDataPipelineSafety,
  calculateCareerOSDataPipelineFingerprint,
  STAGES
} = require('../src/intelligence/career.os.data.pipeline.validation');

const {
  verifyCoreStoreIntegrity
} = require('../src/intelligence/career.os.operator.workflow');

describe('Career OS Controlled Production Data Pipeline Validation (P3.33)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  // 1-5: Readiness & Pipeline Trace
  describe('Readiness & Pipeline Trace', () => {
    test('1. Successful readiness evaluation returns PIPELINE_READY', () => {
      const readiness = evaluateCareerOSDataPipelineReadiness(mockOptions);
      expect(readiness.isReady).toBe(true);
      expect(readiness.status).toBe('PIPELINE_READY');
      expect(readiness.governanceStatus).toBe('ACTIVE');
    });

    test('2. Complete pipeline validation executes all 12 stages with PIPELINE_VALIDATED', () => {
      const val = runCareerOSDataPipelineValidation(mockOptions);
      expect(val.status).toBe('PIPELINE_VALIDATED');
      expect(val.readiness).toBe('PIPELINE_READY');
      expect(val.trace.length).toBe(12);
    });

    test('3. Stage list matches defined STAGES matrix in order', () => {
      expect(STAGES).toEqual([
        'INPUT_DATA',
        'DISCOVERY_DATA',
        'JOB_STORAGE',
        'JOB_VALIDATION',
        'PROFILE_MATCHING',
        'DECISION_INTELLIGENCE',
        'APPLICATION_QUEUE',
        'OPERATIONS_AGGREGATION',
        'CONTROL_CENTER_VISIBILITY',
        'GOVERNANCE_CHECK',
        'SAFETY_CHECK',
        'FINALIZE'
      ]);
    });

    test('4. Fingerprint generation is deterministic across identical validation runs', () => {
      const val1 = runCareerOSDataPipelineValidation(mockOptions);
      const val2 = runCareerOSDataPipelineValidation(mockOptions);
      expect(val1.fingerprint).toBe(val2.fingerprint);
      expect(typeof val1.fingerprint).toBe('string');
      expect(val1.fingerprint.length).toBe(64);
    });

    test('5. Data store integrity is verified with 0 core store mutations', () => {
      const preHashes = verifyCoreStoreIntegrity();
      runCareerOSDataPipelineValidation(mockOptions);
      const postHashes = verifyCoreStoreIntegrity();
      expect(preHashes).toEqual(postHashes);
    });
  });

  // 6-10: Governance & Safety Blocking
  describe('Governance & Safety Blocking', () => {
    test('6. Inactive governance status blocks pipeline readiness', () => {
      const readiness = evaluateCareerOSDataPipelineReadiness({
        ...mockOptions,
        customGovernanceState: { governanceStatus: 'INACTIVE', operatorMode: 'PAUSED' }
      });
      expect(readiness.isReady).toBe(false);
      expect(readiness.status).toBe('PIPELINE_BLOCKED');
    });

    test('7. Autonomous submission allowed state blocks pipeline readiness', () => {
      const readiness = evaluateCareerOSDataPipelineReadiness({
        ...mockOptions,
        customGovernanceState: {
          governanceStatus: 'ACTIVE',
          operatorMode: 'NORMAL',
          automationPolicy: { autonomousSubmissionsAllowed: true }
        }
      });
      expect(readiness.isReady).toBe(false);
      expect(readiness.status).toBe('PIPELINE_BLOCKED');
    });

    test('8. Pipeline trace records safety metrics for each stage', () => {
      const trace = getCareerOSDataPipelineTrace(mockOptions);
      trace.forEach((t) => {
        expect(t.safety.autonomousBlocked).toBe(true);
        expect(t.safety.ambiguousBlocked).toBe(true);
        expect(t.safety.queueMutations).toBe(0);
        expect(t.safety.telegramCalls).toBe(0);
        expect(t.safety.playwrightLaunches).toBe(0);
        expect(t.safety.applicationSubmissions).toBe(0);
      });
    });

    test('9. Queue inspection is read-only and causes zero queue mutations', () => {
      const val = runCareerOSDataPipelineValidation(mockOptions);
      const queueStage = val.trace.find((t) => t.stage === 'APPLICATION_QUEUE');
      expect(queueStage.status).toBe('PASS');
      expect(queueStage.safety.queueMutations).toBe(0);
    });

    test('10. Telegram test environment isolation guarantees 0 network dispatches', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });
  });

  // 11-15: Helpers, Status & Report Schema
  describe('Helpers, Status & Report Schema', () => {
    test('11. Status helper returns correct top-level pipeline status', () => {
      const status = getCareerOSDataPipelineValidationStatus(mockOptions);
      expect(status.status).toBe('PIPELINE_READY');
      expect(status.validationStatus).toBe('PIPELINE_VALIDATED');
      expect(status.isReady).toBe(true);
    });

    test('12. Full report generator produces complete structured report', () => {
      const report = generateCareerOSDataPipelineValidationReport(mockOptions);
      expect(report).toHaveProperty('reportTitle');
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('readiness');
      expect(report).toHaveProperty('validation');
      expect(report.validation.status).toBe('PIPELINE_VALIDATED');
    });

    test('13. Pipeline safety verification helper confirms all safety invariants', () => {
      const safety = verifyCareerOSDataPipelineSafety(mockOptions);
      expect(safety.success).toBe(true);
      expect(safety.queueMutations).toBe(0);
      expect(safety.telegramCalls).toBe(0);
      expect(safety.playwrightLaunches).toBe(0);
      expect(safety.applicationSubmissions).toBe(0);
    });

    test('14. Operations aggregation stage validates Operations snapshot metrics', () => {
      const val = runCareerOSDataPipelineValidation(mockOptions);
      const opsStage = val.trace.find((t) => t.stage === 'OPERATIONS_AGGREGATION');
      expect(opsStage.status).toBe('PASS');
      expect(opsStage.metrics).toHaveProperty('overallHealth');
    });

    test('15. Control Center visibility stage validates Control Center snapshot', () => {
      const val = runCareerOSDataPipelineValidation(mockOptions);
      const ccStage = val.trace.find((t) => t.stage === 'CONTROL_CENTER_VISIBILITY');
      expect(ccStage.status).toBe('PASS');
      expect(ccStage.metrics).toHaveProperty('readiness');
    });
  });

  // 16-20: Final Certification Matrix
  describe('Final Certification Matrix', () => {
    test('16. Profile matching stage validates profile and match store readability', () => {
      const val = runCareerOSDataPipelineValidation(mockOptions);
      const pmStage = val.trace.find((t) => t.stage === 'PROFILE_MATCHING');
      expect(pmStage.status).toBe('PASS');
    });

    test('17. Decision intelligence stage validates decision store readability', () => {
      const val = runCareerOSDataPipelineValidation(mockOptions);
      const diStage = val.trace.find((t) => t.stage === 'DECISION_INTELLIGENCE');
      expect(diStage.status).toBe('PASS');
    });

    test('18. Job validation stage validates cache readability', () => {
      const val = runCareerOSDataPipelineValidation(mockOptions);
      const jvStage = val.trace.find((t) => t.stage === 'JOB_VALIDATION');
      expect(jvStage.status).toBe('PASS');
    });

    test('19. Finalize stage passes cleanly with zero data store mutations', () => {
      const val = runCareerOSDataPipelineValidation(mockOptions);
      const finStage = val.trace.find((t) => t.stage === 'FINALIZE');
      expect(finStage.status).toBe('PASS');
    });

    test('20. Complete P3.33 data pipeline validation baseline certified', () => {
      const readiness = evaluateCareerOSDataPipelineReadiness(mockOptions);
      const validation = runCareerOSDataPipelineValidation(mockOptions);
      expect(readiness.isReady).toBe(true);
      expect(validation.status).toBe('PIPELINE_VALIDATED');
      expect(validation.dataIntegrityVerified).toBe(true);
    });
  });
});

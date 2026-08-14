const {
  runCareerOSDataPipelineValidation,
  evaluateCareerOSDataPipelineReadiness,
  verifyCareerOSDataPipelineSafety
} = require('../src/intelligence/career.os.data.pipeline.validation');

describe('Career OS Data Pipeline Validation Integration Test Suite (P3.33)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  test('1. Full production data pipeline integration validation completes with PIPELINE_VALIDATED', () => {
    const val = runCareerOSDataPipelineValidation(mockOptions);
    expect(val.status).toBe('PIPELINE_VALIDATED');
    expect(val.failures.length).toBe(0);
  });

  test('2. All 12 data pipeline stages pass against real data stores & modules', () => {
    const val = runCareerOSDataPipelineValidation(mockOptions);
    expect(val.trace.length).toBe(12);
    val.trace.forEach((t) => {
      expect(t.status).toBe('PASS');
    });
  });

  test('3. Core store immutability and fingerprint stability are verified in integration environment', () => {
    const val1 = runCareerOSDataPipelineValidation(mockOptions);
    const val2 = runCareerOSDataPipelineValidation(mockOptions);
    expect(val1.fingerprint).toBe(val2.fingerprint);
    expect(val1.dataIntegrityVerified).toBe(true);
  });
});

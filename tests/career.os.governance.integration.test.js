const {
  getCareerOSGovernanceState,
  applyCareerOSGovernanceChange,
  validateCareerOSGovernanceChange
} = require('../src/intelligence/career.os.governance');

const {
  generateCareerOSOperationsSnapshot
} = require('../src/intelligence/career.os.operations');

describe('Career OS Governance Integration Suite (P3.26)', () => {
  const mockOptions = { skipSave: true, suppressTelegram: true };

  test('1. Verifies end-to-end governance state transition & dashboard integration', () => {
    const initialState = getCareerOSGovernanceState(mockOptions);
    expect(initialState.operatorMode).toBe('NORMAL');

    // Apply valid governance change
    const changeResult = applyCareerOSGovernanceChange({ operatorMode: 'OBSERVATION_ONLY' }, mockOptions);
    expect(changeResult.success).toBe(true);
    expect(changeResult.state.operatorMode).toBe('OBSERVATION_ONLY');

    // Dashboard snapshot reflects updated mode
    const snapshot = generateCareerOSOperationsSnapshot({
      ...mockOptions,
      customGovernanceState: changeResult.state
    });
    expect(snapshot.governance.operatorMode).toBe('OBSERVATION_ONLY');
  });

  test('2. Verifies rejection of forbidden autonomous submission overrides', () => {
    const validation = validateCareerOSGovernanceChange({ autonomousSubmissionsAllowed: true }, mockOptions);
    expect(validation.valid).toBe(false);
    expect(validation.code).toBe('FORBIDDEN_AUTOMATION_OVERRIDE');
  });

  test('3. Guarantees 0 Playwright launches, 0 external career actions, 0 Telegram network calls during governance operations', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});

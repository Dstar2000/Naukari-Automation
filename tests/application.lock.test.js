const fs = require('fs');
const {
  acquireLock,
  releaseLock,
  isLocked,
  LOCK_FILE_PATH
} = require('../src/naukri/application.lock');

describe('Phase 7.2: Application Execution Lock Tests', () => {
  afterEach(() => {
    releaseLock();
    if (fs.existsSync(LOCK_FILE_PATH)) {
      try {
        fs.unlinkSync(LOCK_FILE_PATH);
      } catch (_) {}
    }
  });

  test('Process Locking: acquireLock creates lock file and prevents concurrent execution', () => {
    releaseLock();
    expect(isLocked()).toBe(false);

    const lock1 = acquireLock();
    expect(lock1.acquired).toBe(true);
    expect(isLocked()).toBe(true);

    // Concurrent lock attempt should fail
    const lock2 = acquireLock();
    expect(lock2.acquired).toBe(false);
    expect(lock2.reason).toContain('active');

    releaseLock();
    expect(isLocked()).toBe(false);
  });
});

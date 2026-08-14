const path = require('path');
const fs = require('fs');

const LOCK_FILE_PATH = path.resolve(__dirname, '../../data/application-lock.json');
const STALE_LOCK_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Checks if a process ID is currently alive on OS.
 * @param {number} pid 
 * @returns {boolean}
 */
function isPidRunning(pid) {
  if (!pid) return false;
  try {
    return process.kill(pid, 0);
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/**
 * Checks if application process lock is active.
 * @returns {boolean}
 */
function isLocked() {
  if (!fs.existsSync(LOCK_FILE_PATH)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(LOCK_FILE_PATH, 'utf-8'));
    if (!data || !data.active) return false;

    const lockTime = new Date(data.lockedAt).getTime();
    const isStale = Date.now() - lockTime > STALE_LOCK_MS;

    if (isStale) {
      releaseLock();
      return false;
    }

    if (data.pid && !isPidRunning(data.pid)) {
      releaseLock();
      return false;
    }

    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Attempts to acquire single-instance application execution lock.
 * @returns {{ acquired: boolean, pid?: number, reason?: string }}
 */
function acquireLock() {
  if (isLocked()) {
    try {
      const existing = JSON.parse(fs.readFileSync(LOCK_FILE_PATH, 'utf-8'));
      return {
        acquired: false,
        pid: existing.pid,
        reason: `Process lock active (PID: ${existing.pid})`
      };
    } catch (_) {
      return { acquired: false, reason: 'Process lock active' };
    }
  }

  const lockData = {
    pid: process.pid,
    lockedAt: new Date().toISOString(),
    active: true
  };

  const dir = path.dirname(LOCK_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(LOCK_FILE_PATH, JSON.stringify(lockData, null, 2), 'utf-8');
  return { acquired: true, pid: process.pid };
}

/**
 * Releases process lock.
 */
function releaseLock() {
  if (fs.existsSync(LOCK_FILE_PATH)) {
    try {
      const lockData = {
        pid: null,
        lockedAt: null,
        active: false
      };
      fs.writeFileSync(LOCK_FILE_PATH, JSON.stringify(lockData, null, 2), 'utf-8');
    } catch (_) {}
  }
}

module.exports = {
  acquireLock,
  releaseLock,
  isLocked,
  LOCK_FILE_PATH
};

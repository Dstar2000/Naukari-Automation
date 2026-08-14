const fs = require('fs');
const path = require('path');

describe('Browser & Session Setup Tests', () => {
  test('Session config: exports AUTH_FILE_PATH and default options', () => {
    const { AUTH_FILE_PATH, defaultBrowserOptions } = require('../src/browser/session.config');
    expect(AUTH_FILE_PATH).toBeDefined();
    expect(typeof AUTH_FILE_PATH).toBe('string');
    expect(AUTH_FILE_PATH.endsWith('auth.json')).toBe(true);
    expect(defaultBrowserOptions).toBeDefined();
  });

  test('Browser manager: exports launchBrowser function', () => {
    const { launchBrowser } = require('../src/browser/browser.manager');
    expect(launchBrowser).toBeDefined();
    expect(typeof launchBrowser).toBe('function');
  });

  test('Naukri login: exports loginToNaukri function', () => {
    const { loginToNaukri } = require('../src/naukri/naukri.login');
    expect(loginToNaukri).toBeDefined();
    expect(typeof loginToNaukri).toBe('function');
  });
});

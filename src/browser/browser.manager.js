const { chromium } = require('playwright');
const fs = require('fs');
const { AUTH_FILE_PATH, defaultBrowserOptions } = require('./session.config');

/**
 * Launches a Playwright Chromium browser instance with persistent session context if available.
 * @param {Object} options Options to override default browser settings (e.g. { headless: true })
 * @returns {Promise<{ browser: import('playwright').Browser, context: import('playwright').BrowserContext, page: import('playwright').Page }>}
 */
async function launchBrowser(options = {}) {
  const mergedOptions = { ...defaultBrowserOptions, ...options };
  const { headless, viewport, args, ...restOptions } = mergedOptions;

  const browser = await chromium.launch({
    headless: headless !== undefined ? headless : false,
    args: args || []
  });

  const contextOptions = {
    viewport: viewport || { width: 1280, height: 800 },
    ...restOptions
  };

  if (fs.existsSync(AUTH_FILE_PATH)) {
    try {
      contextOptions.storageState = AUTH_FILE_PATH;
    } catch (err) {
      console.warn('Failed to load existing auth storageState:', err.message);
    }
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  return { browser, context, page };
}

module.exports = {
  launchBrowser
};

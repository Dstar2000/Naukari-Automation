const { launchBrowser } = require('../browser/browser.manager');
const { AUTH_FILE_PATH } = require('../browser/session.config');

/**
 * Opens Naukri login page, waits for manual user authentication, and saves session state to data/auth/auth.json.
 * @returns {Promise<boolean>}
 */
async function loginToNaukri() {
  console.log('Opening Naukri login page in browser...');
  const { browser, context, page } = await launchBrowser({ headless: false });

  try {
    await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded' });
    console.log('Please log in manually to Naukri in the opened browser window...');

    // Wait for user to successfully navigate away from login page to dashboard/homepage
    await page.waitForURL((url) => {
      const href = url.href;
      return (
        href.includes('/mnjuser/homepage') ||
        href.includes('/mynaukri') ||
        (href.includes('naukri.com') && !href.includes('/nlogin/login'))
      );
    }, { timeout: 300000 }); // 5 minutes timeout for manual interaction

    // Wait 2 seconds for cookies to stabilize
    await page.waitForTimeout(2000);

    console.log('Login detected. Saving session to auth.json...');
    await context.storageState({ path: AUTH_FILE_PATH });

    return true;
  } catch (error) {
    console.error('Naukri login error:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

module.exports = {
  loginToNaukri
};

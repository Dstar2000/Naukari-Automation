const { launchBrowser } = require('../browser/browser.manager');

/**
 * Detects the application type for a Naukri job URL by inspecting the live DOM.
 * Returns EASY_APPLY, EXTERNAL, or UNKNOWN without fabricating fake statuses.
 * @param {string} jobUrl 
 * @param {import('playwright').Page} [existingPage] Optional reusable Playwright page
 * @returns {Promise<{ applyType: 'EASY_APPLY'|'EXTERNAL'|'UNKNOWN', canAutoApply: boolean }>}
 */
async function detectApplyType(jobUrl, existingPage = null) {
  let page = existingPage;
  let browserInstance = null;

  if (!jobUrl || typeof jobUrl !== 'string') {
    return { applyType: 'UNKNOWN', canAutoApply: false };
  }

  try {
    if (!page) {
      // Launch non-headless browser context to bypass anti-bot challenges on job detail pages
      const launched = await launchBrowser({ headless: false });
      browserInstance = launched.browser;
      page = launched.page;
    }

    console.log(`Detecting apply type for: ${jobUrl} ...`);
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    const detection = await page.evaluate(() => {
      const bodyText = document.body ? document.body.innerText.toLowerCase() : '';
      const bodyHtml = document.body ? document.body.innerHTML : '';

      // Known external recruitment/ATS domains
      const externalDomainRegex = /https?:\/\/[^\s"'<>]*(ezrecruit\.ai|lever\.co|greenhouse\.io|workday|myworkdayjobs|bamboohr|ashbyhq|smartrecruiters|darwinbox|typeform|forms\.gle|google\.com\/forms|jotform|careers\.|apply\.)[^\s"'<>]*/i;

      // Search anchor tags for external URLs
      const externalLinks = Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href') || '')
        .filter((href) => href.startsWith('http') && !href.includes('naukri.com'));

      // Check text for "apply here" or "apply link" with external URL
      const hasApplyHereUrl =
        bodyText.includes('apply here') ||
        bodyText.includes('apply at') ||
        bodyText.includes('apply link') ||
        bodyText.includes('apply on company website') ||
        bodyText.includes('apply on company site') ||
        bodyText.includes('apply on employer site') ||
        bodyText.includes('redirected to company website');

      const matchesExternalDomain = externalDomainRegex.test(bodyHtml) || externalDomainRegex.test(bodyText);
      const hasExternalLink = externalLinks.length > 0 || matchesExternalDomain;

      if (hasApplyHereUrl && hasExternalLink) {
        return { applyType: 'EXTERNAL_APPLICATION_REQUIRED', canAutoApply: false, reason: 'EXTERNAL_APPLY_HERE_URL_DETECTED' };
      }

      if (matchesExternalDomain || (hasApplyHereUrl && externalLinks.length > 0)) {
        return { applyType: 'EXTERNAL_APPLICATION_REQUIRED', canAutoApply: false, reason: 'EXTERNAL_RECRUITMENT_DOMAIN_DETECTED' };
      }

      // Check for External application indicators
      const isExternalButton =
        document.querySelector('.company-site-button, .external-apply, a[class*="company-site"]') !== null;

      if (isExternalButton) {
        return { applyType: 'EXTERNAL_APPLICATION_REQUIRED', canAutoApply: false, reason: 'EXTERNAL_APPLY_BUTTON_DETECTED' };
      }

      // Check for Easy Apply / Native Apply button indicators
      const applyBtn =
        document.querySelector('#apply-button') ||
        document.querySelector('.apply-button') ||
        document.querySelector('button.apply-message') ||
        document.querySelector('div[class*="apply-button"] button') ||
        Array.from(document.querySelectorAll('button, a.btn')).find((el) => {
          const text = el.innerText ? el.innerText.trim().toLowerCase() : '';
          return text === 'apply' || text === 'apply now' || text.includes('easy apply');
        });

      if (applyBtn) {
        const btnText = applyBtn.innerText ? applyBtn.innerText.toLowerCase() : '';
        const btnHref = applyBtn.getAttribute('href') || '';

        if (btnText.includes('company') || (btnHref.includes('http') && !btnHref.includes('naukri.com'))) {
          return { applyType: 'EXTERNAL_APPLICATION_REQUIRED', canAutoApply: false, reason: 'EXTERNAL_BUTTON_LINK_DETECTED' };
        }

        // Final check on description content before confirming EASY_APPLY
        if (matchesExternalDomain) {
          return { applyType: 'EXTERNAL_APPLICATION_REQUIRED', canAutoApply: false, reason: 'JOB_DESCRIPTION_CONTAINS_EXTERNAL_URL' };
        }

        return { applyType: 'EASY_APPLY', canAutoApply: true };
      }

      // Fallback check on text content
      if (bodyText.includes('apply now') || bodyText.includes('easy apply')) {
        if (matchesExternalDomain || externalLinks.length > 0) {
          return { applyType: 'EXTERNAL_APPLICATION_REQUIRED', canAutoApply: false, reason: 'TEXT_MATCH_WITH_EXTERNAL_LINK' };
        }
        return { applyType: 'EASY_APPLY', canAutoApply: true };
      }

      return { applyType: 'UNKNOWN', canAutoApply: false };
    });

    return detection;
  } catch (error) {
    console.warn(`Could not detect apply type for ${jobUrl}:`, error.message);
    return { applyType: 'UNKNOWN', canAutoApply: false };
  } finally {
    if (browserInstance) {
      await browserInstance.close();
    }
  }
}

module.exports = {
  detectApplyType
};

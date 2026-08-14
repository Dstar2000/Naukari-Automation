'use strict';

/**
 * Detailed Sub-field DOM Inspector for IT Skills, Accomplishments, Personal Details, Resume
 */

const { launchBrowser } = require('../src/browser/browser.manager');

const PROFILE_URL = 'https://www.naukri.com/mnjuser/profile';

async function main() {
  const { browser, page } = await launchBrowser({ headless: false });
  await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Scroll to load all sections
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
    });
  });
  await page.waitForTimeout(2000);

  const subFields = await page.evaluate(() => {
    const safeText = (sel) => document.querySelector(sel)?.innerText?.trim() || '';

    // 1. IT Skills table / rows
    const itSkillsRows = Array.from(document.querySelectorAll('#lazyITSkills table tr, .itSkills table tr, div[class*="itSkills"] table tr'))
      .map(tr => Array.from(tr.querySelectorAll('td, th')).map(td => td.innerText.trim()))
      .filter(row => row.length > 0);

    // 2. Accomplishments sub-sections (Online courses, Certifications, Work samples, White papers, Presentation, Publications, Patents)
    const accList = Array.from(document.querySelectorAll('#lazyAccomplishment .widgetCont, .accomplishments .widgetCont'))
      .map(node => {
        const title = node.querySelector('.title, .heading, h3, div[class*="title"]')?.innerText?.trim() || '';
        const desc = node.querySelector('.desc, .text, p, div[class*="desc"]')?.innerText?.trim() || '';
        return { title, desc };
      }).filter(a => a.title || a.desc);

    // 3. Personal details sub-fields (Gender, Date of Birth, Category, Marital Status, Permanent Address, Languages)
    const personalRows = Array.from(document.querySelectorAll('#lazyPersonalDetail .row .col, .personalDetails .row .col'))
      .map(col => {
        const title = col.querySelector('.title')?.innerText?.trim() || '';
        const desc = col.querySelector('.desc')?.innerText?.trim() || '';
        return { title, desc };
      }).filter(p => p.title);

    // 4. Contact / Verification status (Phone, Email verification badge)
    const phoneVerified = !!document.querySelector('.phone-verified, .icon-verified, [class*="verified"]');
    const emailVerified = !!document.querySelector('.email-verified, .icon-verified, [class*="verified"]');

    return {
      itSkillsRows,
      accList,
      personalRows,
      phoneVerified,
      emailVerified
    };
  });

  console.log('Detailed Sub-fields Discovered:');
  console.log(JSON.stringify(subFields, null, 2));

  await browser.close();
}

main().catch(console.error);

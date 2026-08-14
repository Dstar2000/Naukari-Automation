'use strict';

/**
 * Read-Only DOM Inspector for Complete Naukri Profile Sections & Selectors
 */

const { launchBrowser } = require('../src/browser/browser.manager');

const PROFILE_URL = 'https://www.naukri.com/mnjuser/profile';

async function main() {
  console.log('============================================================');
  console.log('READ-ONLY NAUKRI COMPLETE PROFILE DOM INSPECTION');
  console.log('============================================================\n');

  const { browser, page } = await launchBrowser({ headless: false });

  console.log('1. Navigating to live profile:', PROFILE_URL);
  await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Scroll page to lazy-load all sections
  console.log('2. Triggering smooth scroll for lazy-loaded sections...');
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

  console.log('3. Inspecting all available card/widget sections on page...');
  const sections = await page.evaluate(() => {
    const cardElements = Array.from(document.querySelectorAll('.card, .widget, div[id^="lazy"], div[class*="widget"]'));
    
    return cardElements.map(card => {
      const heading = card.querySelector('.widgetHead, .head, .heading, h2, h3, .title')?.innerText?.trim() || '';
      const id = card.id || '';
      const className = card.className || '';
      return { id, className: className.slice(0, 50), heading };
    }).filter(c => c.heading || c.id);
  });

  console.log('Discovered Card/Widget Sections:');
  console.log(JSON.stringify(sections, null, 2));

  console.log('\n4. Closing browser without modifying anything...');
  await browser.close();
  console.log('============================================================');
}

main().catch(err => {
  console.error('❌ DOM inspection failed:', err);
  process.exit(1);
});

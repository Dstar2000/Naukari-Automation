'use strict';

/**
 * Diagnostic Script: Inspect Suggestor Dropdown DOM when typing into #keySkillSugg (NO SAVE)
 */

try {
  require('../node_modules/@dotenvx/dotenvx').config({ quiet: true });
} catch (_) {
  require('dotenv').config({ quiet: true });
}

const { launchBrowser } = require('../src/browser/browser.manager');

async function main() {
  console.log('============================================================');
  console.log('NAUKRI SUGGESTOR DROPDOWN DOM FORENSICS (NO SAVE)');
  console.log('============================================================\n');

  let browserObj = null;
  try {
    const { browser, page } = await launchBrowser({ headless: false });
    browserObj = browser;

    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Scroll
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let total = 0;
        const timer = setInterval(() => {
          window.scrollBy(0, 300);
          total += 300;
          if (total >= document.body.scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 100);
      });
    });
    await page.waitForTimeout(2000);

    // Open editor
    const editBtn = await page.$('#lazyKeySkills .widgetHead span.edit, .keySkills .widgetHead span.edit');
    await editBtn.click();
    await page.waitForTimeout(3000);

    // Remove 1 chip ("Github")
    console.log('1. Removing 1 chip ("Github")...');
    await page.evaluate(() => {
      const chips = Array.from(document.querySelectorAll('.sugComp .chip, .sugComp span, .suggest.keySkillSuggCont span'));
      for (const chip of chips) {
        if (chip.textContent.includes('Github')) {
          const cross = chip.querySelector('.cross, i, a, span.cross') || chip.nextElementSibling;
          if (cross) cross.click();
          else chip.click();
          break;
        }
      }
    });
    await page.waitForTimeout(1000);

    console.log('2. Focusing #keySkillSugg and typing "Github"...');
    const inputEl = await page.$('#keySkillSugg, input.sugInp');
    await inputEl.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('Github', { delay: 100 });
    await page.waitForTimeout(1500);

    // Inspect dropdown container in DOM
    const dropdownElements = await page.evaluate(() => {
      const allDivs = Array.from(document.querySelectorAll('div, ul, li, span, a')).filter(el => {
        const cls = el.className || '';
        return (cls.includes('sug') || cls.includes('dropdown') || cls.includes('layer') || cls.includes('menu')) && el.offsetWidth > 0;
      });

      return allDivs.map(el => ({
        tag: el.tagName,
        class: el.className,
        id: el.id,
        text: el.textContent.trim().slice(0, 100)
      }));
    });

    console.log('Dropdown DOM elements found:', JSON.stringify(dropdownElements, null, 2));

    // Try pressing Down Arrow then Enter
    console.log('\n3. Testing Pressing ArrowDown then Enter...');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    const chipsAfterArrow = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.sugComp .chip, .sugComp span, .suggest.keySkillSuggCont span'))
        .filter(el => !el.className.includes('cross') && !el.textContent.toLowerCase().includes('cross'))
        .map(el => el.textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim())
        .filter(Boolean);
    });

    console.log('Chips after ArrowDown + Enter:', JSON.stringify(chipsAfterArrow.slice(0, 5)));
    console.log('Github chip re-created?', chipsAfterArrow.includes('Github') ? 'YES (SUCCESS!)' : 'NO');

    console.log('\nClosing editor WITHOUT saving...');
    const cancelBtn = await page.$('.cancel, .close, span.cross, a.cross, button.btn-cancel, button:has-text("Cancel")');
    if (cancelBtn) {
      await cancelBtn.click().catch(() => {});
    }
    await page.waitForTimeout(1000);

  } catch (err) {
    console.error('Fatal error during suggestor dropdown diagnostic:', err);
  } finally {
    if (browserObj) {
      await browserObj.close();
    }
  }
}

main().catch(console.error);

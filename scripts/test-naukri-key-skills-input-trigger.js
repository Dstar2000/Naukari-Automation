'use strict';

/**
 * Diagnostic Script: Test Autocomplete Input Triggers in Open Key Skills Editor (NO SAVE)
 */

try {
  require('../node_modules/@dotenvx/dotenvx').config({ quiet: true });
} catch (_) {
  require('dotenv').config({ quiet: true });
}

const { launchBrowser } = require('../src/browser/browser.manager');

async function main() {
  console.log('============================================================');
  console.log('NAUKRI KEY SKILLS INPUT TRIGGER DIAGNOSTIC (NO SAVE)');
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

    console.log('1. Locating all text/input elements inside open editor...');
    const inputElements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input')).map(i => ({
        id: i.id,
        className: i.className,
        name: i.name,
        placeholder: i.placeholder,
        visible: i.offsetWidth > 0 && i.offsetHeight > 0
      }));
    });

    console.log('Visible inputs in editor:', JSON.stringify(inputElements.filter(i => i.visible), null, 2));

    // Try typing into each input candidate and checking dropdown
    const selectorsToTest = [
      '#keySkillSugg',
      'input.sugInp',
      '.suggestor-input',
      '.keySkills input',
      'input[placeholder*="skill" i]',
      'input[placeholder*="Add" i]'
    ];

    for (const selector of selectorsToTest) {
      console.log(`\nTesting input selector: "${selector}"...`);
      const el = await page.$(selector);
      if (!el) {
        console.log(`  Selector "${selector}" NOT found in DOM.`);
        continue;
      }

      const isVisible = await el.isVisible();
      if (!isVisible) {
        console.log(`  Selector "${selector}" is not visible.`);
        continue;
      }

      await el.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.type('React', { delay: 50 });
      await page.waitForTimeout(1000);

      // Check dropdown options in entire document
      const suggestions = await page.evaluate(() => {
        const sel = '.sugItem, .sug-list li, .searchSugg .sugItem, .dropdownMainContainer li, [class*="sug"], [class*="dropdown"] li';
        return Array.from(document.querySelectorAll(sel))
          .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0 && el.textContent.trim().length > 0 && el.textContent.trim().length < 50)
          .map(el => ({ tag: el.tagName, class: el.className, text: el.textContent.trim() }));
      });

      console.log(`  Suggestions triggered by "${selector}":`, JSON.stringify(suggestions.slice(0, 5), null, 2));

      // Test pressing Enter or clicking suggestion
      if (suggestions.length > 0) {
        const topSug = await page.$('.sugItem, .sug-list li, .searchSugg .sugItem, .dropdownMainContainer li, [class*="sugItem"]');
        if (topSug) {
          console.log('  Clicking top suggestion...');
          await topSug.click();
        } else {
          console.log('  Pressing Enter...');
          await page.keyboard.press('Enter');
        }
      } else {
        console.log('  Pressing Enter on typed input...');
        await page.keyboard.press('Enter');
      }

      await page.waitForTimeout(1000);

      // Check chips in .sugComp
      const chips = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.sugComp .chip, .sugComp span, .suggest.keySkillSuggCont span'))
          .filter(el => !el.className.includes('cross') && !el.textContent.toLowerCase().includes('cross'))
          .map(el => el.textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim())
          .filter(Boolean);
      });

      const hasReact = chips.some(c => c.toLowerCase().includes('react'));
      console.log(`  Chip created after testing "${selector}"? ${hasReact ? 'YES (SUCCESS!)' : 'NO'}`);
      console.log(`  Total chips now: ${chips.length}`);

      // Clean up typed text
      await el.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);
    }

    console.log('\nClosing editor WITHOUT saving...');
    const cancelBtn = await page.$('.cancel, .close, span.cross, a.cross, button.btn-cancel, button:has-text("Cancel")');
    if (cancelBtn) {
      await cancelBtn.click().catch(() => {});
    }
    await page.waitForTimeout(1000);

  } catch (err) {
    console.error('Fatal error during input trigger diagnostic:', err);
  } finally {
    if (browserObj) {
      await browserObj.close();
    }
  }
}

main().catch(console.error);

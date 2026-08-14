'use strict';

/**
 * Read-Only DOM Inspector for Naukri Key Skills Chip Reorder Mechanics
 *
 * SAFETY RULES:
 * - NO SAVE CLICK
 * - NO PROFILE MUTATION
 * - NO TELEGRAM PROPOSAL
 */

const path = require('path');
const { launchBrowser } = require('../src/browser/browser.manager');

const PROFILE_URL = 'https://www.naukri.com/mnjuser/profile';

async function main() {
  console.log('============================================================');
  console.log('READ-ONLY NAUKRI KEY SKILLS REORDER DOM INSPECTION');
  console.log('============================================================\n');

  const { browser, page } = await launchBrowser({ headless: false });

  console.log('1. Navigating to live profile:', PROFILE_URL);
  await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Scroll to lazy load key skills
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

  const editSelector = '#lazyKeySkills .widgetHead span.edit, .keySkills .widgetHead span.edit';
  await page.waitForSelector(editSelector, { timeout: 10000 }).catch(() => null);

  const editBtn = await page.$(editSelector);
  if (!editBtn) {
    console.error('❌ Edit button not found in Key Skills section');
    await browser.close();
    process.exit(1);
  }

  console.log('2. Opening Key Skills editor modal...');
  await editBtn.click();
  await page.waitForTimeout(1500);

  console.log('3. Inspecting DOM for reorder / drag-drop capabilities...');
  const inspectionResult = await page.evaluate(() => {
    const sugComp = document.querySelector('.sugComp');
    const chips = Array.from(document.querySelectorAll('.sugComp .chip'));

    const chipDetails = chips.map((c, i) => {
      const style = window.getComputedStyle(c);
      return {
        index: i,
        text: c.textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim(),
        tagName: c.tagName,
        className: c.className,
        draggableAttr: c.getAttribute('draggable'),
        cursorStyle: style.cursor,
        hasDragHandle: !!c.querySelector('.handle, .drag, .reorder, i.fa-bars, .icon-drag'),
        childrenCount: c.children.length
      };
    });

    const isJQuerySortable = typeof window.$ !== 'undefined' && !!window.$('.sugComp').data('ui-sortable');
    const hasSortableClass = sugComp ? sugComp.classList.contains('ui-sortable') || sugComp.classList.contains('sortable') : false;

    return {
      totalChips: chips.length,
      sugCompClasses: sugComp ? sugComp.className : null,
      isJQuerySortable,
      hasSortableClass,
      chipDetails: chipDetails.slice(0, 5)
    };
  });

  console.log('Inspection Results:');
  console.log('- Total Chips:', inspectionResult.totalChips);
  console.log('- Container Classes:', inspectionResult.sugCompClasses);
  console.log('- jQuery UI Sortable Present:', inspectionResult.isJQuerySortable);
  console.log('- Sortable Class Present:', inspectionResult.hasSortableClass);
  console.log('- Chip Sample Details:', JSON.stringify(inspectionResult.chipDetails, null, 2));

  console.log('\n4. Closing browser without saving (SAVE IS UNTOUCHED)...');
  await browser.close();
  console.log('============================================================');
}

main().catch(err => {
  console.error('❌ Inspection error:', err);
  process.exit(1);
});

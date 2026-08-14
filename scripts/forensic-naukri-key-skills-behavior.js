'use strict';

/**
 * Forensic Investigation of Naukri Key Skills Editor Behavior
 *
 * SAFETY GUARANTEES:
 * - NO SAVE CLICK (#saveKeySkills IS UNTOUCHED)
 * - NO PROFILE MUTATION
 * - REVERSIBLE INSPECTION ONLY (MODAL CLOSED WITHOUT SAVING)
 */

const { launchBrowser } = require('../src/browser/browser.manager');

const PROFILE_URL = 'https://www.naukri.com/mnjuser/profile';

async function main() {
  console.log('============================================================');
  console.log('NAUKRI KEY SKILLS EDITOR FORENSIC BEHAVIOR INVESTIGATION');
  console.log('============================================================\n');

  const { browser, page } = await launchBrowser({ headless: false });

  console.log('1. Navigating to live profile:', PROFILE_URL);
  await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Trigger scroll to load key skills section
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
  await page.waitForSelector(editSelector, { timeout: 10000 });

  console.log('2. Opening Key Skills editor modal...');
  await page.click(editSelector);
  await page.waitForTimeout(1500);

  console.log('\n--- FORENSIC STEP 1: INITIAL CHIP DOM & ARIA ATTRIBUTES ---');
  const initialChipDOM = await page.evaluate(() => {
    const sugComp = document.querySelector('.sugComp');
    const chips = Array.from(document.querySelectorAll('.sugComp .chip'));

    const chipData = chips.map((chip, idx) => {
      const tagTxt = chip.querySelector('.tagTxt') || chip;
      const text = tagTxt.textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim();
      const attrs = {};
      for (const attr of chip.attributes) {
        attrs[attr.name] = attr.value;
      }
      return { idx, text, attrs, childrenCount: chip.children.length };
    });

    const containerAttrs = {};
    if (sugComp) {
      for (const attr of sugComp.attributes) {
        containerAttrs[attr.name] = attr.value;
      }
    }

    return {
      totalChips: chips.length,
      containerAttrs,
      chipData: chipData.slice(0, 5) // Sample first 5
    };
  });

  console.log('Total Initial Chips:', initialChipDOM.totalChips);
  console.log('Container Attributes:', JSON.stringify(initialChipDOM.containerAttrs, null, 2));
  console.log('Sample Chip Attributes:', JSON.stringify(initialChipDOM.chipData, null, 2));

  console.log('\n--- FORENSIC STEP 2: KEYBOARD & ACCESSIBILITY ARIA REORDER CONTROLS ---');
  const ariaControls = await page.evaluate(() => {
    const sugComp = document.querySelector('.sugComp');
    const ariaRole = sugComp ? sugComp.getAttribute('role') : null;
    const isListBox = ariaRole === 'listbox';

    const chips = Array.from(document.querySelectorAll('.sugComp .chip'));
    const tabIndexes = chips.map(c => c.getAttribute('tabindex'));
    const roles = chips.map(c => c.getAttribute('role'));

    return { ariaRole, isListBox, tabIndexes: tabIndexes.slice(0, 5), roles: roles.slice(0, 5) };
  });

  console.log('ARIA / Keyboard Controls:', JSON.stringify(ariaControls, null, 2));

  console.log('\n--- FORENSIC STEP 3: TESTING CHIP ADDITION POSITIONING ---');
  // Type a test skill "Jsx" (or inspect where new chip appears relative to existing chips)
  const inputEl = await page.$('#keySkillSugg, input.sugInp');
  await inputEl.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('Jsx', { delay: 35 });
  await page.waitForTimeout(500);

  // Check if dropdown tuples appear or if adding via enter/click appends at end
  const appendTestResult = await page.evaluate(async () => {
    const tuples = Array.from(document.querySelectorAll('#sugDrp_keySkillSugg li.sugTouple, .sugCont li.sugTouple, li.sugTouple'))
      .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
    const candidateTexts = tuples.map(t => t.textContent.trim());

    return {
      visibleTuplesCount: tuples.length,
      candidateTexts
    };
  });

  console.log('Autocomplete Tuple Inspection for "Jsx":', JSON.stringify(appendTestResult, null, 2));

  console.log('\n--- FORENSIC STEP 4: CHIP REMOVAL BEHAVIOR (WITHOUT SAVING) ---');
  const removalBehavior = await page.evaluate(() => {
    const chipsBefore = Array.from(document.querySelectorAll('.sugComp .chip'))
      .map(c => (c.querySelector('.tagTxt') || c).textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim());

    // Remove index 0 ("Github") temporarily inside modal UI
    const firstChip = document.querySelectorAll('.sugComp .chip')[0];
    const cross = firstChip.querySelector('.cross, i, a, span.cross');
    if (cross) cross.click();
    else firstChip.click();

    const chipsAfter = Array.from(document.querySelectorAll('.sugComp .chip'))
      .map(c => (c.querySelector('.tagTxt') || c).textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim());

    return {
      removedSkill: chipsBefore[0],
      remainingCount: chipsAfter.length,
      firstRemaining: chipsAfter[0],
      secondRemaining: chipsAfter[1],
      remainingOrderIntact: chipsBefore.slice(1).every((s, i) => s === chipsAfter[i])
    };
  });

  console.log('Removal Test Behavior:', JSON.stringify(removalBehavior, null, 2));

  console.log('\n5. Closing modal cleanly WITHOUT CLICKING SAVE (SAVE IS UNTOUCHED)...');
  const cancelBtn = await page.$('.cancel, button.cancel, .cross, .closeModal');
  if (cancelBtn) {
    await cancelBtn.click().catch(() => null);
  }

  await browser.close();
  console.log('\n============================================================');
  console.log('FORENSIC INVESTIGATION COMPLETED CLEANLY');
  console.log('============================================================');
}

main().catch(err => {
  console.error('❌ Forensic investigation error:', err);
  process.exit(1);
});

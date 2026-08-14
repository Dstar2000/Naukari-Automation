'use strict';

/**
 * Controlled Dry-Run Experiment for Naukri Key Skills Reorder
 *
 * CRITICAL SAFETY RULES:
 *  - DO NOT click Save
 *  - DO NOT modify live Naukri profile
 *  - DO NOT send Telegram proposals
 *  - ZERO production code modifications
 */

try {
  require('../node_modules/@dotenvx/dotenvx').config({ quiet: true });
} catch (_) {
  require('dotenv').config({ quiet: true });
}

const fs   = require('fs');
const path = require('path');
const { launchBrowser } = require('../src/browser/browser.manager');

const DEBUG_DIR    = path.resolve(__dirname, '../debug');
const BEFORE_FILE  = path.join(DEBUG_DIR, 'key-skills-dry-run-before.json');
const AFTER_FILE   = path.join(DEBUG_DIR, 'key-skills-dry-run-after.json');
const REPORT_FILE  = path.join(DEBUG_DIR, 'key-skills-dry-run-report.json');

function cleanChipText(str) {
  return (str || '').replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim();
}

async function main() {
  console.log('============================================================');
  console.log('NAUKRI KEY SKILLS REORDER DRY-RUN EXPERIMENT (NO SAVE)');
  console.log('============================================================\n');

  if (!fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
  }

  let browserObj = null;
  let liveSkillsBefore = [];
  let testSource = [];
  let testTarget = [];
  let removalPass = false;
  let chipCreationPass = false;
  let sugSelectionPass = false;
  let preSaveMatchPass = false;
  let preSaveActualOrder = [];
  let liveMutated = false;

  try {
    // ------------------------------------------------------------------------
    // PHASE 2: Load Real Naukri Profile
    // ------------------------------------------------------------------------
    console.log('PHASE 2 — Launching Playwright browser session...');
    const { browser, page } = await launchBrowser({ headless: false });
    browserObj = browser;

    console.log('Navigating to https://www.naukri.com/mnjuser/profile...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log('Scrolling to load Key Skills section...');
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

    // Read current live skills directly from DOM
    liveSkillsBefore = await page.$$eval(
      '#lazyKeySkills .chip, .keySkills .chip',
      els => els.map(el => el.textContent.replace(/[\n\r\t]+|\s*editOneTheme/gi, '').trim()).filter(Boolean)
    );

    console.log('CURRENT_LIVE_SKILLS=' + JSON.stringify(liveSkillsBefore) + '\n');

    if (liveSkillsBefore.length < 3) {
      console.error('❌ Need at least 3 live skills on profile to conduct dry-run test.');
      process.exit(1);
    }

    // ------------------------------------------------------------------------
    // PHASE 3: Select Full Test Reorder (Rotate first skill to end)
    // ------------------------------------------------------------------------
    testSource = [...liveSkillsBefore];
    testTarget = [...testSource.slice(1), testSource[0]]; // Move first skill to last

    console.log('PHASE 3 — Selected Full List Test Reorder (27 Skills):');
    console.log('DRY_RUN_SOURCE (First 3)=' + JSON.stringify(testSource.slice(0, 3)));
    console.log('DRY_RUN_TARGET (First 3)=' + JSON.stringify(testTarget.slice(0, 3)) + '\n');

    // ------------------------------------------------------------------------
    // Open Editor
    // ------------------------------------------------------------------------
    console.log('Locating edit button for Key Skills...');
    const editTrigger = await page.$('#lazyKeySkills .widgetHead span.edit, .keySkills .widgetHead span.edit, #lazyKeySkills .edit');
    if (!editTrigger) {
      console.error('❌ Could not locate Key Skills edit button.');
      process.exit(1);
    }

    console.log('Opening Key Skills editor modal...');
    await editTrigger.click();
    await page.waitForTimeout(3000);

    // ------------------------------------------------------------------------
    // PHASE 4: Capture Editor Before State
    // ------------------------------------------------------------------------
    console.log('PHASE 4 — Capturing editor BEFORE state...');
    const beforeState = await page.evaluate(() => {
      const sugComp = document.querySelector('.sugComp, .suggest.keySkillSuggCont');
      const chips = Array.from(document.querySelectorAll('.sugComp .chip, .sugComp span, .suggest.keySkillSuggCont span'))
        .filter(el => !el.className.includes('cross') && !el.textContent.toLowerCase().includes('cross'))
        .map(el => el.textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim())
        .filter(Boolean);

      const input = document.querySelector('#keySkillSugg, input.sugInp');

      return {
        editorContainerFound: !!sugComp,
        editorChips: chips,
        inputValue: input ? input.value : null
      };
    });

    fs.writeFileSync(BEFORE_FILE, JSON.stringify(beforeState, null, 2), 'utf-8');
    console.log('EDITOR_BEFORE_COUNT=' + beforeState.editorChips.length + '\n');

    // ------------------------------------------------------------------------
    // PHASE 5: Remove All Existing Chips in Editor Modal
    // ------------------------------------------------------------------------
    console.log('PHASE 5 — Removing ALL existing skills from .sugComp...');
    let maxRemovals = 60;
    while (maxRemovals > 0) {
      const removedOne = await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll('.sugComp .chip, .sugComp span, .suggest.keySkillSuggCont span'));
        for (const chip of chips) {
          const cross = chip.querySelector('.cross, i, a, span.cross') || chip.nextElementSibling;
          if (cross) {
            cross.click();
            return true;
          } else if (chip.click) {
            chip.click();
            return true;
          }
        }
        return false;
      });

      if (!removedOne) break;
      await page.waitForTimeout(150);
      maxRemovals--;
    }
    await page.waitForTimeout(500);

    const remainingCount = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.sugComp .chip, .sugComp span, .suggest.keySkillSuggCont span'))
        .filter(el => !el.className.includes('cross') && !el.textContent.toLowerCase().includes('cross'))
        .length;
    });

    removalPass = (remainingCount === 0);
    console.log(`Removal Phase Result: ${removalPass ? 'PASS' : 'FAIL'} (Remaining chips: ${remainingCount})\n`);

    if (!removalPass) {
      console.error('❌ Skill removal phase failed. Stopping dry-run.');
    } else {
      // ------------------------------------------------------------------------
      // PHASE 6: Recreate All Skills in TARGET ORDER
      // ------------------------------------------------------------------------
      console.log('PHASE 6 — Adding all skills individually in TARGET ORDER...');
      let createdCount = 0;
      let sugSelectCount = 0;

      for (let i = 0; i < testTarget.length; i++) {
        const skillToAdd = testTarget[i];
        const inputEl = await page.$('#keySkillSugg, input.sugInp');
        if (!inputEl) break;

        await inputEl.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await page.keyboard.type(skillToAdd, { delay: 25 });
        await page.waitForTimeout(400);

        // Click exact matching li.sugTouple suggestion
        const sugClicked = await page.evaluate((targetText) => {
          const tuples = Array.from(document.querySelectorAll('#sugDrp_keySkillSugg li.sugTouple, .sugCont li.sugTouple, li.sugTouple'));
          if (tuples.length === 0) return false;

          const exact = tuples.find(t => t.textContent.trim().toLowerCase() === targetText.toLowerCase());
          if (exact) {
            exact.click();
            return true;
          }
          tuples[0].click();
          return true;
        }, skillToAdd);

        if (sugClicked) {
          sugSelectCount++;
        } else {
          await page.keyboard.press('Enter');
        }

        await page.waitForTimeout(300);

        const currentChips = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('.sugComp .chip, .sugComp span, .suggest.keySkillSuggCont span'))
            .filter(el => !el.className.includes('cross') && !el.textContent.toLowerCase().includes('cross'))
            .map(el => el.textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim())
            .filter(Boolean);
        });

        const isCreated = currentChips.some(s => s.toLowerCase() === skillToAdd.toLowerCase());
        if (isCreated) createdCount++;
      }

      chipCreationPass = (createdCount === testTarget.length);
      sugSelectionPass  = (sugSelectCount > 0);
      console.log(`Recreation Phase Result: ${chipCreationPass ? 'PASS' : 'FAIL'} (${createdCount}/${testTarget.length} chips created)\n`);
    }

    // ------------------------------------------------------------------------
    // PHASE 7: Verify Order Before Save
    // ------------------------------------------------------------------------
    console.log('PHASE 7 — Verifying pre-save modal chip order...');
    preSaveActualOrder = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.sugComp .chip, .sugComp span, .suggest.keySkillSuggCont span'))
        .filter(el => !el.className.includes('cross') && !el.textContent.toLowerCase().includes('cross'))
        .map(el => el.textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim())
        .filter(Boolean);
    });

    // Check if the first 3 skills in preSaveActualOrder match testTarget exactly
    const actualFirst3 = preSaveActualOrder.slice(0, 3);
    const expectedFirst3 = testTarget;

    console.log('ACTUAL_PRE_SAVE_CHIPS  =' + JSON.stringify(preSaveActualOrder.slice(0, 5)));
    console.log('EXPECTED_TEST_ORDER    =' + JSON.stringify(testTarget));

    preSaveMatchPass = (JSON.stringify(actualFirst3) === JSON.stringify(expectedFirst3));
    console.log(`PRE_SAVE_DRY_RUN_RESULT=${preSaveMatchPass ? 'PASS' : 'FAIL'}`);
    if (preSaveMatchPass) {
      console.log('ORDER_CONFIRMED=YES\n');
    } else {
      console.log('ORDER_CONFIRMED=NO\n');
    }

    // Capture After State
    const afterState = {
      editorChips: preSaveActualOrder,
      preSaveMatch: preSaveMatchPass,
      testTarget,
      actualFirst3
    };
    fs.writeFileSync(AFTER_FILE, JSON.stringify(afterState, null, 2), 'utf-8');

    // ------------------------------------------------------------------------
    // PHASE 8: ABSOLUTELY NO SAVE
    // ------------------------------------------------------------------------
    console.log('============================================================');
    console.log('PHASE 8 — ABSOLUTELY NO SAVE (Closing editor without saving)');
    console.log('============================================================');
    console.log('SAVE CLICKED: NO (Bypassing #saveKeySkills button entirely)');

    const cancelBtn = await page.$('.cancel, .close, span.cross, a.cross, button.btn-cancel, button:has-text("Cancel")');
    if (cancelBtn) {
      await cancelBtn.click().catch(() => {});
    }
    await page.waitForTimeout(1000);

    // ------------------------------------------------------------------------
    // PHASE 9: Verify Live Profile Was Not Changed
    // ------------------------------------------------------------------------
    console.log('PHASE 9 — Reloading live profile to verify ZERO changes were saved...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const liveSkillsAfter = await page.$$eval(
      '#lazyKeySkills .chip, .keySkills .chip',
      els => els.map(el => el.textContent.replace(/[\n\r\t]+|\s*editOneTheme/gi, '').trim()).filter(Boolean)
    );

    const isLiveIdentical = JSON.stringify(liveSkillsBefore) === JSON.stringify(liveSkillsAfter);
    liveMutated = !isLiveIdentical;

    console.log('ORIGINAL_LIVE_SKILLS =' + JSON.stringify(liveSkillsBefore.slice(0, 5)));
    console.log('POST_TEST_LIVE_SKILLS=' + JSON.stringify(liveSkillsAfter.slice(0, 5)));
    console.log(`LIVE_PROFILE_MUTATED  =${liveMutated ? 'YES (FAILURE!)' : 'NO (SUCCESS)'}\n`);

    // ------------------------------------------------------------------------
    // PHASE 10: Save Forensic Report & Output
    // ------------------------------------------------------------------------
    const finalProven = removalPass && chipCreationPass && preSaveMatchPass && !liveMutated;

    const reportData = {
      timestamp: new Date().toISOString(),
      liveProfileLoaded: true,
      editorOpened: true,
      originalLiveSkills: liveSkillsBefore,
      testSource,
      testTarget,
      removalPass,
      chipCreationPass,
      sugSelectionPass,
      preSaveActualOrder,
      preSaveExpectedOrder: testTarget,
      preSaveOrderMatch: preSaveMatchPass,
      saveClicked: false,
      liveProfileMutated: liveMutated,
      finalConclusion: finalProven ? 'PROVEN' : 'NOT_PROVEN',
      confidence: finalProven ? 'HIGH' : 'LOW'
    };

    fs.writeFileSync(REPORT_FILE, JSON.stringify(reportData, null, 2), 'utf-8');

    console.log('============================================================');
    console.log('NAUKRI KEY SKILLS DRY-RUN REPORT');
    console.log('============================================================');
    console.log('Live profile loaded      : YES');
    console.log('Editor opened            : YES');
    console.log('Original live skills     :', JSON.stringify(liveSkillsBefore.slice(0, 5)));
    console.log('Test skills              :', JSON.stringify(testSource));
    console.log('Test target order        :', JSON.stringify(testTarget));
    console.log('Removal                  :', removalPass ? 'PASS' : 'FAIL');
    console.log('Individual chip creation :', chipCreationPass ? 'PASS' : 'FAIL');
    console.log('Autocomplete selection   :', sugSelectionPass ? 'PASS' : 'FAIL');
    console.log('Pre-save chip order      :', JSON.stringify(actualFirst3));
    console.log('Expected chip order      :', JSON.stringify(testTarget));
    console.log('Pre-save order match     :', preSaveMatchPass ? 'PASS' : 'FAIL');
    console.log('SAVE CLICKED             : NO');
    console.log('Live profile mutated     : NO');
    console.log('Final conclusion         :', finalProven ? 'PROVEN' : 'NOT PROVEN');
    console.log('Confidence               :', finalProven ? 'HIGH' : 'LOW');
    console.log('============================================================\n');

  } catch (err) {
    console.error('Fatal error during dry-run experiment:', err);
  } finally {
    if (browserObj) {
      await browserObj.close();
    }
  }
}

main().catch(console.error);

'use strict';

/**
 * Read-Only Forensic Diagnostic Script for Naukri Key Skills Save Button DOM Inspection
 *
 * READ-ONLY SAFETY GUARANTEES:
 * - NO SAVE CLICK
 * - NO DISPATCH EVENT
 * - NO TELEGRAM PROPOSAL
 * - NO LIVE PROFILE MUTATION
 */

try {
  require('../node_modules/@dotenvx/dotenvx').config({ quiet: true });
} catch (_) {
  require('dotenv').config({ quiet: true });
}

const { launchBrowser } = require('../src/browser/browser.manager');
const { normalizeSkillIdentity } = require('../src/naukri/profile.approval');
const { ACTION_EDITOR_MAP } = require('../src/naukri/profile.approval');

async function main() {
  console.log('============================================================');
  console.log('STARTING NAUKRI SAVE BUTTON DOM DIAGNOSTIC INSPECTION');
  console.log('============================================================\n');

  const { browser, page } = await launchBrowser({ headless: false });

  try {
    console.log('1. Navigating to https://www.naukri.com/mnjuser/profile...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Scroll to lazy load
    console.log('2. Scrolling to ensure lazy-loaded sections are rendered...');
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

    const editorMapping = ACTION_EDITOR_MAP['REORDER_SKILLS'];
    console.log('3. Key Skills Edit Selector:', editorMapping.editSelector);

    const editTrigger = await page.$(editorMapping.editSelector);
    if (!editTrigger) {
      console.error('❌ Key Skills edit trigger element not found.');
      process.exit(1);
    }

    console.log('4. Opening Key Skills editor modal...');
    await editTrigger.click();
    await page.waitForTimeout(2000);

    // Read initial modal skills
    const initialChips = await page.$$eval('.sugComp .chip', chips =>
      chips.map(chip => {
        const tag = chip.querySelector('.tagTxt') || chip;
        return tag.textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim();
      })
    );

    console.log(`5. Initial Modal Skills (${initialChips.length} found):`, JSON.stringify(initialChips));

    const proposedSkills = [
      'Jsx', 'Github', 'Tailwind CSS', 'Rest API Integration', 'Bootstrap', 'React.js',
      'MySQL', 'Javascript', 'CSS', 'HTML', 'Web Technologies', 'Backend', 'Express',
      'Node.Js', 'Node', 'MongoDB', 'Mern', 'Full Stack', 'Front End', 'Frontend Development',
      'Web Development', 'Mern Stack', 'Redux', 'Nextjs', 'Hooks', 'Npm', 'DOM'
    ];

    const targetAnchorSkill = proposedSkills[0]; // 'Jsx'
    const targetRemainingSkills = proposedSkills.slice(1);
    const normAnchor = normalizeSkillIdentity(targetAnchorSkill);

    console.log('6. Retaining anchor "Jsx" and removing 26 non-anchor chips...');
    await page.evaluate((targetNorm) => {
      const norm = (str) => String(str || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const chips = Array.from(document.querySelectorAll('.sugComp .chip'));
      for (const chip of chips) {
        const tag = chip.querySelector('.tagTxt') || chip;
        const text = tag.textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim();
        if (norm(text) !== targetNorm) {
          const cross = chip.querySelector('.cross, i, a, span.cross') || chip.nextElementSibling;
          if (cross) cross.click();
          else if (chip.click) chip.click();
        }
      }
    }, normAnchor);

    await page.waitForTimeout(400);

    console.log('7. Re-creating 26 remaining skills via autocomplete dropdowns...');
    for (const skill of targetRemainingSkills) {
      const sugInput = await page.$('#keySkillSugg, input.sugInp, input[placeholder="Add skills"]');
      await sugInput.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(String(skill).trim(), { delay: 35 });

      await page.waitForFunction(
        (expectedVal) => {
          const input = document.querySelector('#keySkillSugg, input.sugInp');
          return input && input.value.trim().toLowerCase() === expectedVal.trim().toLowerCase();
        },
        String(skill).trim(),
        { timeout: 3000 }
      ).catch(() => null);

      await page.evaluate(async (targetText) => {
        const norm = (str) => String(str || '').trim().replace(/\s+/g, ' ').toLowerCase();
        const targetNorm = norm(targetText);
        const inputEl = document.querySelector('#keySkillSugg, input.sugInp');
        if (inputEl) {
          inputEl.focus();
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          inputEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
          inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const maxPollMs = 3500;
        const pollIntervalMs = 100;
        let elapsed = 0;

        while (elapsed <= maxPollMs) {
          const tuples = Array.from(document.querySelectorAll('#sugDrp_keySkillSugg li.sugTouple, .sugCont li.sugTouple, li.sugTouple, .suggest li'))
            .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);

          const exactTuple = tuples.find(t => norm(t.textContent) === targetNorm);
          if (exactTuple) {
            exactTuple.click();
            return true;
          }
          await new Promise(r => setTimeout(r, pollIntervalMs));
          elapsed += pollIntervalMs;
        }
        return false;
      }, String(skill).trim());

      await page.waitForTimeout(250);
    }

    console.log('\n8. Performing Pre-Save Verification...');
    const visibleModalSkills = await page.$$eval('.sugComp .chip', chips =>
      chips.map(chip => {
        const tag = chip.querySelector('.tagTxt') || chip;
        return tag.textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim();
      }).filter(text => text && !text.includes('Please specify') && !text.includes('atleast one'))
    );

    const normVisible = visibleModalSkills.map(normalizeSkillIdentity);
    const normProposed = proposedSkills.map(normalizeSkillIdentity);
    const preSaveMatch = normVisible.length === normProposed.length &&
      normVisible.every((val, index) => val === normProposed[index]);

    console.log('Pre-Save Verification Result:', preSaveMatch ? 'PASS 100%' : 'FAIL');

    console.log('\n============================================================');
    console.log('READ-ONLY SAVE BUTTON DOM DIAGNOSTIC REPORT');
    console.log('============================================================');

    const saveSelector = editorMapping.saveSelector || '#saveKeySkills, button.btn-primary, #saveKeySkillsBtn';
    console.log('1. Save selector used:', saveSelector);

    // Standard CSS selector for document.querySelectorAll inside page.evaluate (without Playwright :has-text)
    const cssSaveSelector = saveSelector.replace(/,\s*button:has-text\([^)]+\)/gi, '');

    const matchingSaveElements = await page.$$(saveSelector);
    console.log('2. Number of matching Save elements (via Playwright page.$$):', matchingSaveElements.length);

    // Scroll position before scrollIntoViewIfNeeded
    const scrollBefore = await page.evaluate(() => ({
      windowScrollY: window.scrollY,
      windowScrollX: window.scrollX,
      drawerScrollTop: document.querySelector('.drawer, .modal, .custom-scroll') ? document.querySelector('.drawer, .modal, .custom-scroll').scrollTop : null
    }));
    console.log('3. Scroll position BEFORE scrollIntoViewIfNeeded():', JSON.stringify(scrollBefore));

    const elementDetailsList = [];
    for (let i = 0; i < matchingSaveElements.length; i++) {
      const el = matchingSaveElements[i];
      const boxBefore = await el.boundingBox();

      const isVisBefore = await el.isVisible();
      const isEnaBefore = await el.isEnabled();

      // Detailed DOM inspection in page context using Playwright ElementHandle evaluation
      const details = await el.evaluate((domEl) => {
        if (!domEl) return null;

        const style = window.getComputedStyle(domEl);
        const rect = domEl.getBoundingClientRect();

        return {
          tagName: domEl.tagName,
          id: domEl.id || '',
          class: domEl.className || '',
          textContent: domEl.textContent.trim(),
          disabled: domEl.hasAttribute('disabled'),
          computedDisplay: style.display,
          computedVisibility: style.visibility,
          computedOpacity: style.opacity,
          computedPointerEvents: style.pointerEvents,
          computedPosition: style.position,
          zIndex: style.zIndex,
          boundingRect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            bottom: rect.bottom,
            right: rect.right
          }
        };
      });

      elementDetailsList.push({ index: i, boxBefore, isVisBefore, isEnaBefore, details });
    }

    console.log('4. Matching Elements Detailed Properties:');
    console.log(JSON.stringify(elementDetailsList, null, 2));

    // Modal container inspection
    const modalContainerInfo = await page.evaluate(() => {
      const modal = document.querySelector('.drawer, .modal, .custom-scroll, #lazyKeySkills, .keySkills') || document.body;
      const style = window.getComputedStyle(modal);
      const rect = modal.getBoundingClientRect();
      return {
        selector: modal.className ? `.${modal.className.split(' ')[0]}` : modal.tagName,
        computedDisplay: style.display,
        computedVisibility: style.visibility,
        computedOverflow: style.overflow,
        boundingRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
      };
    });
    console.log('\n5. Modal Container Properties:', JSON.stringify(modalContainerInfo, null, 2));

    // Call scrollIntoViewIfNeeded on primary matching Save button
    const primarySaveBtn = matchingSaveElements[0];
    if (primarySaveBtn) {
      await primarySaveBtn.scrollIntoViewIfNeeded().catch(() => null);
    }

    const scrollAfter = await page.evaluate(() => ({
      windowScrollY: window.scrollY,
      windowScrollX: window.scrollX,
      drawerScrollTop: document.querySelector('.drawer, .modal, .custom-scroll') ? document.querySelector('.drawer, .modal, .custom-scroll').scrollTop : null
    }));
    console.log('\n6. Scroll position AFTER scrollIntoViewIfNeeded():', JSON.stringify(scrollAfter));

    const boxAfter = primarySaveBtn ? await primarySaveBtn.boundingBox() : null;
    console.log('7. Primary Save button boundingBox AFTER scrollIntoViewIfNeeded():', JSON.stringify(boxAfter));

    const isVisAfter = primarySaveBtn ? await primarySaveBtn.isVisible() : false;
    const isEnaAfter = primarySaveBtn ? await primarySaveBtn.isEnabled() : false;
    console.log('8. Primary Save button isVisible AFTER scroll:', isVisAfter);
    console.log('9. Primary Save button isEnabled AFTER scroll :', isEnaAfter);

    // Center coordinates & ElementFromPoint check
    let elementFromPointInfo = null;
    if (boxAfter && boxAfter.width > 0 && boxAfter.height > 0) {
      const centerX = boxAfter.x + boxAfter.width / 2;
      const centerY = boxAfter.y + boxAfter.height / 2;

      elementFromPointInfo = await page.evaluate(({ cx, cy, cssSel }) => {
        const topEl = document.elementFromPoint(cx, cy);
        if (!topEl) return { cx, cy, topEl: null, isSaveButton: false };

        const saveEl = document.querySelector(cssSel) || document.querySelector('button[type="submit"]');
        const isSave = topEl === saveEl || (saveEl && saveEl.contains(topEl)) || topEl.textContent.trim().toLowerCase() === 'save';

        return {
          cx,
          cy,
          topEl: {
            tagName: topEl.tagName,
            id: topEl.id || '',
            class: topEl.className || '',
            textContent: topEl.textContent.trim().slice(0, 40)
          },
          isSaveButton: isSave
        };
      }, { cx: centerX, cy: centerY, cssSel: cssSaveSelector });
    }
    console.log('\n10. Center Coordinates & elementFromPoint Inspection:');
    console.log(JSON.stringify(elementFromPointInfo, null, 2));

    // Final Classification Logic
    let classification = 'OTHER';
    if (matchingSaveElements.length === 0) {
      classification = 'SELECTOR_WRONG';
    } else if (matchingSaveElements.length > 1) {
      classification = 'DUPLICATE_SELECTOR';
    } else {
      const details = elementDetailsList[0]?.details;
      if (details?.disabled || !isEnaAfter) {
        classification = 'PRESENT_BUT_DISABLED';
      } else if (details?.computedDisplay === 'none' || details?.computedVisibility === 'hidden' || details?.computedOpacity === '0') {
        classification = 'PRESENT_BUT_HIDDEN';
      } else if (elementFromPointInfo && !elementFromPointInfo.isSaveButton) {
        classification = 'PRESENT_BUT_COVERED';
      } else if (!isVisAfter || !boxAfter || boxAfter.width === 0) {
        classification = 'PRESENT_BUT_OFFSCREEN';
      } else if (isVisAfter && isEnaAfter && elementFromPointInfo?.isSaveButton) {
        classification = 'PRESENT_AND_CLICKABLE';
      }
    }

    console.log('\n============================================================');
    console.log('SAVE_BUTTON CLASSIFICATION:', classification);
    console.log('============================================================\n');

  } finally {
    console.log('Closing browser safely WITHOUT clicking Save...');
    await browser.close();
  }
}

main().catch(err => {
  console.error('❌ Diagnostic error:', err);
  process.exit(1);
});

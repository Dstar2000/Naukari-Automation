'use strict';

/**
 * Read-Only Native DOM Forensics Script for Naukri Key Skills Editor
 *
 * ABSOLUTE SAFETY RULES:
 *  - DO NOT click Save
 *  - DO NOT modify profile
 *  - DO NOT send Telegram proposals
 *  - Read-Only DOM inspection ONLY
 */

try {
  require('../node_modules/@dotenvx/dotenvx').config({ quiet: true });
} catch (_) {
  require('dotenv').config({ quiet: true });
}

const fs   = require('fs');
const path = require('path');
const { launchBrowser } = require('../src/browser/browser.manager');

const DEBUG_DIR  = path.resolve(__dirname, '../debug');
const HTML_FILE  = path.join(DEBUG_DIR, 'naukri-key-skills-editor.html');
const JSON_FILE  = path.join(DEBUG_DIR, 'naukri-key-skills-editor.json');

async function main() {
  console.log('============================================================');
  console.log('NAUKRI KEY SKILLS EDITOR DOM FORENSICS (READ-ONLY)');
  console.log('============================================================\n');

  if (!fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
  }

  let browserObj = null;
  try {
    console.log('1. Launching authenticated Playwright browser session...');
    const { browser, page } = await launchBrowser({ headless: false });
    browserObj = browser;

    console.log('2. Navigating to https://www.naukri.com/mnjuser/profile...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log('3. Scrolling to ensure #lazyKeySkills is loaded...');
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

    // Capture closed section DOM
    const closedSectionHTML = await page.$eval('#lazyKeySkills, .keySkills', el => el.outerHTML).catch(() => 'NOT_FOUND');
    console.log('4. Key Skills section found on page. Locating edit trigger...');

    const editTrigger = await page.$('#lazyKeySkills .widgetHead span.edit, .keySkills .widgetHead span.edit, #lazyKeySkills .edit, .keySkills .edit');
    if (!editTrigger) {
      console.error('❌ Edit trigger for Key Skills section NOT found in page DOM.');
      process.exit(1);
    }

    console.log('5. Clicking Key Skills edit button (OPEN EDITOR)...');
    await editTrigger.click();
    await page.waitForTimeout(3000);

    console.log('6. Editor opened! Extracting full DOM evidence from open modal/editor...');

    // Extract full outerHTML of open editor/modal
    const modalOuterHTML = await page.evaluate(() => {
      const modal = document.querySelector('.drawer, .modal, .keySkills, #lazyKeySkills, .edit-section, form[name="keySkillsForm"]');
      return modal ? modal.outerHTML : document.body.innerHTML;
    });

    fs.writeFileSync(HTML_FILE, modalOuterHTML, 'utf-8');
    console.log(`Saved outerHTML to ${HTML_FILE}`);

    // Perform comprehensive DOM inspection of all editor elements
    const domEvidence = await page.evaluate(() => {
      const getAttrs = (el) => {
        const attrs = {};
        for (const a of el.attributes) {
          attrs[a.name] = a.value;
        }
        return attrs;
      };

      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        return style && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0;
      };

      // 1. Inputs
      const inputs = Array.from(document.querySelectorAll('input, textarea, select')).map(el => ({
        tag: el.tagName.toLowerCase(),
        id: el.id,
        className: el.className,
        name: el.name,
        type: el.type,
        placeholder: el.placeholder,
        value: el.value,
        ariaLabel: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
        visible: isVisible(el),
        attributes: getAttrs(el)
      }));

      // 2. Buttons & Actions
      const buttons = Array.from(document.querySelectorAll('button, a.btn, input[type="submit"], input[type="button"], span.btn')).map(el => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent.trim(),
        id: el.id,
        className: el.className,
        disabled: el.disabled || el.classList.contains('disabled'),
        visible: isVisible(el),
        attributes: getAttrs(el)
      }));

      // 3. Existing Skill Chips / Elements
      const chipElements = Array.from(document.querySelectorAll('.chip, .tag, .badge, .sugItem, [class*="chip"], [class*="tag"], [class*="skill"]')).map(el => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim(),
        fullText: el.textContent.trim(),
        id: el.id,
        className: el.className,
        draggable: el.getAttribute('draggable') || el.draggable,
        parentClass: el.parentElement ? el.parentElement.className : '',
        childClasses: Array.from(el.children).map(c => c.className),
        removeButtonSelector: el.querySelector('.cross, .close, .icon-cross, a, i, span') ? el.querySelector('.cross, .close, .icon-cross, a, i, span').className : null,
        attributes: getAttrs(el)
      }));

      // 4. Containers & Hierarchy
      const containers = Array.from(document.querySelectorAll('.keySkills, #lazyKeySkills, .drawer, .modal, form')).map(el => ({
        tag: el.tagName.toLowerCase(),
        id: el.id,
        className: el.className,
        childCount: el.children.length
      }));

      return {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        inputs,
        buttons,
        chipCount: chipElements.length,
        chipElements,
        containers
      };
    });

    fs.writeFileSync(JSON_FILE, JSON.stringify(domEvidence, null, 2), 'utf-8');
    console.log(`Saved DOM evidence JSON to ${JSON_FILE}\n`);

    // --- PART 4: Harmless Read-Only Test Interaction (NO SAVE) ---
    console.log('============================================================');
    console.log('PART 4 — HARMLESS INTERACTION EXPERIMENT (NO SAVE)');
    console.log('============================================================');

    const inputInfo = domEvidence.inputs.find(i => i.visible && (i.placeholder.toLowerCase().includes('skill') || i.className.includes('skill') || i.tag === 'input'));

    if (inputInfo) {
      console.log(`Target Skill Input Found: tag=<${inputInfo.tag}> id="${inputInfo.id}" class="${inputInfo.className}" placeholder="${inputInfo.placeholder}"`);
      const targetSelector = inputInfo.id ? `#${inputInfo.id}` : `input.${inputInfo.className.split(' ').join('.')}`;

      console.log(`Typing test string "TypeScript" into ${targetSelector}...`);
      await page.focus(targetSelector);
      await page.keyboard.type('TypeScript', { delay: 30 });
      await page.waitForTimeout(1000);

      // Check if autocomplete/suggestion dropdown appeared
      const suggEvidence = await page.evaluate(() => {
        const suggs = Array.from(document.querySelectorAll('.sugItem, .sug-list, .searchSugg, [class*="sug"], [class*="autocomplete"], [class*="dropdown"]'))
          .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0)
          .map(el => ({
            tag: el.tagName.toLowerCase(),
            className: el.className,
            text: el.textContent.trim().slice(0, 100)
          }));
        return suggs;
      });

      console.log('Autocomplete Dropdown Evidence:', JSON.stringify(suggEvidence, null, 2));

      // Clear the typed text cleanly
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);
      console.log('✓ Typed text cleared cleanly without saving.');
    } else {
      console.log('⚠️ Could not locate single primary skill input element.');
    }

    // Check if cancel/close button exists and click it to close modal cleanly WITHOUT saving
    console.log('\nClosing editor modal WITHOUT saving...');
    const cancelBtn = await page.$('.cancel, .close, span.cross, a.cross, button.btn-cancel, button:has-text("Cancel")');
    if (cancelBtn) {
      await cancelBtn.click().catch(() => {});
    }
    await page.waitForTimeout(1000);

    console.log('============================================================');
    console.log('FORENSIC DOM INSPECTION COMPLETE — ZERO CHANGES SAVED');
    console.log('============================================================\n');

  } catch (err) {
    console.error('Fatal error during forensic DOM inspection:', err);
  } finally {
    if (browserObj) {
      await browserObj.close();
    }
  }
}

main().catch(console.error);

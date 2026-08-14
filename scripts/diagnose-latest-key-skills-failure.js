'use strict';

/**
 * Read-Only Forensic Diagnostic Script for Naukri Key Skills Editor
 *
 * CRITICAL SAFETY RULES:
 *  - DO NOT CLICK SAVE (#saveKeySkills)
 *  - DO NOT MUTATE LIVE PROFILE
 *  - DO NOT CREATE TELEGRAM PROPOSAL
 *  - READ-ONLY DOM INSPECTION
 */

const fs = require('fs');
const path = require('path');
const { launchBrowser } = require('../src/browser/browser.manager');

const PROFILE_URL = 'https://www.naukri.com/mnjuser/profile';
const OUTPUT_JSON_PATH = path.join(__dirname, '../debug/naukri-key-skills-forensic-diagnosis.json');

async function main() {
  console.log('============================================================');
  console.log('STARTING READ-ONLY FORENSIC DIAGNOSIS (NO SAVE / NO MUTATION)');
  console.log('============================================================\n');

  const { browser, page } = await launchBrowser({ headless: false });

  console.log('1. Navigating to live profile:', PROFILE_URL);
  await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Scroll to lazy load key skills
  console.log('2. Scrolling to lazy load Key Skills section...');
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

  const editSelector = '#lazyKeySkills .widgetHead span.edit, .keySkills .widgetHead span.edit, span:has-text("Key Skills") ~ span.edit';
  await page.waitForSelector(editSelector, { timeout: 10000 }).catch(() => null);

  const editBtn = await page.$(editSelector);
  if (!editBtn) {
    console.error('❌ Edit button not found in Key Skills section');
    await browser.close();
    process.exit(1);
  }

  console.log('3. Opening Key Skills editor modal...');
  await editBtn.click();
  await page.waitForTimeout(1500);

  // Inspect open editor DOM state
  console.log('4. Inspecting open editor DOM state...');
  const domState = await page.evaluate(() => {
    const sugComp = document.querySelector('.sugComp');
    const sugCompHTML = sugComp ? sugComp.outerHTML : null;

    const chips = Array.from(document.querySelectorAll('.sugComp .chip')).map(c => ({
      text: c.textContent.replace(/[\n\r\t]+|\s*✕|\s*×|\s*cross|\s*close/gi, '').trim(),
      fullText: c.textContent.trim(),
      className: c.className
    }));

    const nonChips = Array.from(document.querySelectorAll('.sugComp span:not(.chip)')).map(s => ({
      className: s.className,
      textContent: s.textContent.trim()
    }));

    const allSpans = Array.from(document.querySelectorAll('.sugComp span')).map(s => ({
      className: s.className,
      textContent: s.textContent.trim()
    }));

    const inputEl = document.querySelector('#keySkillSugg');
    const inputState = inputEl ? {
      id: inputEl.id,
      className: inputEl.className,
      placeholder: inputEl.placeholder,
      value: inputEl.value
    } : null;

    return {
      sugCompHTML,
      chips,
      nonChips,
      allSpans,
      inputState
    };
  });

  console.log('Existing Chip Count:', domState.chips.length);
  console.log('Existing Chips (First 5):', domState.chips.slice(0, 5).map(c => c.text));
  console.log('Non-Chip Spans inside .sugComp:', domState.nonChips);

  // 5. Test Autocomplete Candidate Capture for target skills (Jsx, Rest API Integration, Node.js, React.js)
  const testSkills = ['Jsx', 'Rest API Integration', 'Node.js', 'React.js'];
  const testResults = [];

  console.log('\n5. Testing Autocomplete Candidate behavior (READ-ONLY)...');
  for (const skill of testSkills) {
    const inputEl = await page.$('#keySkillSugg');
    if (!inputEl) break;

    await inputEl.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(skill, { delay: 30 });
    await page.waitForTimeout(600);

    const result = await page.evaluate((targetSkill) => {
      const dropdown = document.querySelector('#sugDrp_keySkillSugg, .sugCont');

      const tuples = Array.from(document.querySelectorAll('#sugDrp_keySkillSugg li.sugTouple, .sugCont li.sugTouple, li.sugTouple'))
        .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);

      const candidates = tuples.map(t => ({
        text: t.textContent.trim(),
        className: t.className
      }));

      const norm = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const targetNorm = norm(targetSkill);
      const exactMatch = candidates.find(c => norm(c.text) === targetNorm);

      return {
        targetSkill,
        targetNorm,
        dropdownVisible: !!dropdown,
        candidateCount: candidates.length,
        candidates,
        exactMatchFound: !!exactMatch,
        exactMatchText: exactMatch ? exactMatch.text : null
      };
    }, skill);

    console.log(`- Tested skill "${skill}": Candidates Found = ${result.candidateCount}, Exact Match = ${result.exactMatchFound} ("${result.exactMatchText || 'NONE'}")`);
    if (result.candidates.length > 0) {
      console.log(`  Top Candidates: ${result.candidates.slice(0, 5).map(c => c.text).join(' | ')}`);
    }
    testResults.push(result);
  }

  // Save diagnostic output JSON
  const report = {
    timestamp: new Date().toISOString(),
    domState,
    testResults
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(report, null, 2), 'utf-8');
  console.log('\n✓ Diagnostic artifact saved to:', OUTPUT_JSON_PATH);

  console.log('\n6. Closing browser without saving (SAVE IS UNTOUCHED)...');
  await browser.close();
  console.log('============================================================');
  console.log('READ-ONLY FORENSIC DIAGNOSIS COMPLETE');
  console.log('============================================================');
}

main().catch(err => {
  console.error('❌ Diagnostic error:', err);
  process.exit(1);
});

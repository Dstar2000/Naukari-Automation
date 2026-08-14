'use strict';

/**
 * Read-Only Autocomplete Failure Diagnostic Script
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
const OUTPUT_JSON_PATH = path.join(__dirname, '../debug/naukri-autocomplete-failure.json');

const targetSkillsToTest = [
  'Jsx',
  'Github',
  'Tailwind CSS',
  'Rest API Integration',
  'Bootstrap',
  'React.js',
  'MySQL',
  'Javascript',
  'CSS',
  'HTML',
  'Web Technologies',
  'Backend',
  'Express',
  'Node.Js',
  'Node',
  'MongoDB',
  'Mern',
  'Full Stack',
  'Front End',
  'Frontend Development',
  'Web Development',
  'Mern Stack',
  'Redux',
  'Nextjs',
  'Hooks',
  'Npm',
  'DOM'
];

async function main() {
  console.log('============================================================');
  console.log('STARTING READ-ONLY AUTOCOMPLETE DIAGNOSIS (NO SAVE / NO MUTATION)');
  console.log('============================================================\n');

  const { browser, page } = await launchBrowser({ headless: false });

  console.log('1. Navigating to live profile:', PROFILE_URL);
  await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Scroll to lazy load
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

  const testResults = [];

  console.log('\n3. Testing Autocomplete Candidate behavior for all 27 skills (READ-ONLY)...');
  for (const skill of targetSkillsToTest) {
    const inputEl = await page.$('#keySkillSugg, input.sugInp');
    if (!inputEl) break;

    await inputEl.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(skill, { delay: 35 });

    // Wait for input value reconciliation
    await page.waitForFunction(
      (expectedVal) => {
        const input = document.querySelector('#keySkillSugg, input.sugInp');
        return input && input.value.trim().toLowerCase() === expectedVal.trim().toLowerCase();
      },
      skill,
      { timeout: 2000 }
    ).catch(() => null);

    await page.waitForTimeout(600);

    const result = await page.evaluate((targetSkill) => {
      const input = document.querySelector('#keySkillSugg, input.sugInp');
      const inputValue = input ? input.value : null;

      const dropdown = document.querySelector('#sugDrp_keySkillSugg, .sugCont, .suggest');

      const tuples = Array.from(document.querySelectorAll('#sugDrp_keySkillSugg li.sugTouple, .sugCont li.sugTouple, li.sugTouple, .suggest li'))
        .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);

      const candidates = tuples.map(t => t.textContent.trim());

      const norm = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const targetNorm = norm(targetSkill);
      const exactMatch = candidates.find(c => norm(c) === targetNorm);

      return {
        targetSkill,
        inputValue,
        targetNorm,
        dropdownVisible: !!dropdown,
        candidateCount: candidates.length,
        candidates,
        exactMatchFound: !!exactMatch,
        exactMatchText: exactMatch || null
      };
    }, skill);

    console.log(`- Skill "${skill}": Input="${result.inputValue}" | Candidates=${result.candidateCount} | Match=${result.exactMatchFound} ("${result.exactMatchText || 'NONE'}")`);
    if (!result.exactMatchFound && result.candidateCount > 0) {
      console.log(`  Visible candidates: ${result.candidates.slice(0, 5).join(' | ')}`);
    }
    testResults.push(result);
  }

  const failingSkillReport = testResults.find(r => !r.exactMatchFound);

  const report = {
    timestamp: new Date().toISOString(),
    totalTested: testResults.length,
    failingCount: testResults.filter(r => !r.exactMatchFound).length,
    failingSkills: testResults.filter(r => !r.exactMatchFound).map(r => r.targetSkill),
    results: testResults
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(report, null, 2), 'utf-8');
  console.log('\n✓ Diagnostic artifact saved to:', OUTPUT_JSON_PATH);

  console.log('\n4. Closing browser without saving (SAVE IS UNTOUCHED)...');
  await browser.close();

  console.log('\n============================================================');
  console.log('NAUKRI AUTOCOMPLETE FAILURE DIAGNOSIS');
  console.log('============================================================');
  console.log('Proposal ID:          prof_appr_a702a5f9b4db');
  console.log('Failing Skill:        ', failingSkillReport ? failingSkillReport.targetSkill : 'NONE');
  console.log('Input Value:          ', failingSkillReport ? failingSkillReport.inputValue : 'N/A');
  console.log('Exact Match Found:    ', failingSkillReport ? failingSkillReport.exactMatchFound : true);
  console.log('Visible Candidates:   ', failingSkillReport ? JSON.stringify(failingSkillReport.candidates) : '[]');
  console.log('Root Cause:           ', failingSkillReport ? (failingSkillReport.candidateCount === 0 ? 'No autocomplete dropdown rendered after typing' : 'Naukri autocomplete returned non-matching candidates') : 'All skills matched');
  console.log('Live Profile Mutated:  NO');
  console.log('Save Clicked:         NO');
  console.log('============================================================');
}

main().catch(err => {
  console.error('❌ Diagnostic error:', err);
  process.exit(1);
});

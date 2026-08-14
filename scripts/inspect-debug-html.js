const fs = require('fs');
const path = require('path');

const htmlPath = path.resolve(__dirname, '../debug/naukri-profile-debug.html');
if (!fs.existsSync(htmlPath)) {
  console.log('No debug HTML found.');
  process.exit(0);
}

const html = fs.readFileSync(htmlPath, 'utf8');

// Regex patterns to find sections
const sections = ['resumeHeadline', 'keySkills', 'profileSummary', 'attachResume', 'careerProfile', 'employment', 'education'];

sections.forEach((sec) => {
  const reg = new RegExp(`class="[^"]*${sec}[^"]*"`, 'gi');
  const matches = html.match(reg);
  console.log(`=== Section: ${sec} ===`);
  if (matches) {
    console.log(Array.from(new Set(matches)).slice(0, 5));
  } else {
    console.log('No class match found.');
  }
});

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../debug/naukri-profile-debug.html'), 'utf8');

function findSnippet(keyword) {
  console.log(`\n================ KEYWORD: ${keyword} ================`);
  const idx = html.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx !== -1) {
    console.log(html.substring(Math.max(0, idx - 100), Math.min(html.length, idx + 400)));
  } else {
    console.log('Not found');
  }
}

findSnippet('resumeHeadline');
findSnippet('keySkills');
findSnippet('Dileep Kumar Chavan');
findSnippet('Full Stack Developer');
findSnippet('React.js');

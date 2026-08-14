const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../debug/naukri-profile-debug.html'), 'utf8');

function findHeaderSnippet(text) {
  console.log(`\n=== SNIPPET FOR: ${text} ===`);
  const idx = html.indexOf(text);
  if (idx !== -1) {
    console.log(html.substring(Math.max(0, idx - 150), Math.min(html.length, idx + 300)));
  } else {
    console.log('Not found');
  }
}

findHeaderSnippet('Dileep kumar');
findHeaderSnippet('Bangalore, INDIA');
findHeaderSnippet('1 Year 5 Months');
findHeaderSnippet('Available to join in 15 Days');

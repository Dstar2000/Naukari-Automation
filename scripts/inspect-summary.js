const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../debug/naukri-profile-debug.html'), 'utf8');
const idx = html.indexOf('id="lazyProfileSummary"');

if (idx !== -1) {
  console.log(html.substring(idx, idx + 1000));
} else {
  console.log('lazyProfileSummary not found');
}

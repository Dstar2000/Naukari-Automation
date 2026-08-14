const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../debug/naukri-profile-debug.html'), 'utf8');
const idx = html.indexOf('id="lazyKeySkills"');

if (idx !== -1) {
  console.log(html.substring(idx, idx + 1500));
} else {
  console.log('lazyKeySkills not found');
}

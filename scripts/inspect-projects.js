const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../debug/naukri-profile-debug.html'), 'utf8');

const idx = html.indexOf('id="lazyAccomplishment"');
if (idx !== -1) {
  console.log(html.substring(idx - 50, idx + 2000));
} else {
  console.log('lazyAccomplishment not found');
}

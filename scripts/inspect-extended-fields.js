const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../debug/naukri-profile-debug.html'), 'utf8');

function inspectSection(idOrClass) {
  console.log(`\n================ INSPECT: ${idOrClass} ================`);
  const idx = html.indexOf(idOrClass);
  if (idx !== -1) {
    console.log(html.substring(idx - 50, idx + 1200));
  } else {
    console.log('Not found');
  }
}

inspectSection('id="lazyDesiredProfile"');
inspectSection('id="lazyEmployment"');
inspectSection('id="lazyProjects"');
inspectSection('id="lazyPersonalDetail"');
inspectSection('class="info-card"');
inspectSection('class="name-box"');

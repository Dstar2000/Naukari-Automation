const path = require('path');
const fs = require('fs');
const { getOutcomes } = require('../src/tracking/outcome.tracker');
const { getApplicationHistory } = require('../src/naukri/application.executor');
const { resolveApplicationIdentity } = require('../src/tracking/application.identity.resolver');
const { authorizeFollowupDelivery } = require('../src/tracking/followup.delivery.guard');

async function runAuditFollowupDelivery() {
  console.log('==================================================');
  console.log('🔍 READ-ONLY FOLLOW-UP DELIVERY AUDIT');
  console.log('==================================================\n');

  const outcomes = getOutcomes();
  const submittedHistory = getApplicationHistory().filter((h) => h.status === 'SUBMITTED');

  const allMap = new Map();
  for (const app of outcomes) {
    if (app && app.jobUrl) {
      allMap.set(app.jobUrl, app);
    }
  }
  for (const app of submittedHistory) {
    if (app && app.jobUrl && !allMap.has(app.jobUrl)) {
      allMap.set(app.jobUrl, app);
    }
  }

  const pendingList = Array.from(allMap.values());
  console.log(`Found ${pendingList.length} pending application records to audit.\n`);

  for (let i = 0; i < pendingList.length; i++) {
    const app = pendingList[i];
    console.log(`--------------------------------------------------`);
    console.log(`[Item ${i + 1}/${pendingList.length}]`);

    const identity = resolveApplicationIdentity(app.applicationId || app.jobId || app.jobUrl);
    const company = identity.company || app.company || 'N/A';
    const role = identity.role || app.role || app.title || 'N/A';
    const originalUrl = identity.jobUrl || app.jobUrl || '';

    console.log(`Application ID : ${identity.applicationId || 'N/A'}`);
    console.log(`Job ID         : ${identity.jobId || 'N/A'}`);
    console.log(`Company        : ${company}`);
    console.log(`Role           : ${role}`);
    console.log(`Original URL   : ${originalUrl}`);

    const auth = await authorizeFollowupDelivery(app);
    const val = auth.validation || {};

    console.log(`\nPLAYWRIGHT VALIDATION`);
    console.log(`---------------------`);
    console.log(`Final URL       : ${val.finalUrl || 'N/A'}`);
    console.log(`Status          : ${val.status || 'UNKNOWN'}`);
    console.log(`Reason          : ${val.reason || auth.reason || 'N/A'}`);
    console.log(`Detected Company: ${val.detectedCompany || 'N/A'}`);
    console.log(`Detected Role   : ${val.detectedRole || 'N/A'}`);

    console.log(`\nDELIVERY`);
    console.log(`--------`);
    console.log(`Allowed             : ${auth.allowed}`);
    console.log(`Verified URL        : ${auth.verifiedUrl || 'null'}`);
    console.log(`Telegram Would Send : ${auth.allowed}`);
    console.log(`--------------------------------------------------\n`);
  }

  console.log('==================================================');
  console.log('✓ Read-only audit completed.');
  console.log('✓ No JSON records were modified.');
  console.log('==================================================');
}

runAuditFollowupDelivery().catch((err) => {
  console.error('Audit delivery failed:', err.message);
  process.exit(1);
});

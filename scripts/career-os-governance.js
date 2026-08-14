const {
  getCareerOSGovernanceState,
  generateCareerOSGovernanceReport,
  validateCareerOSGovernanceChange,
  applyCareerOSGovernanceChange,
  getCareerOSGovernanceHistory
} = require('../src/intelligence/career.os.governance');

function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status');
  const isHistory = args.includes('--history');
  const isValidate = args.includes('--validate');
  const isChange = args.includes('--change');
  const isJson = args.includes('--json');

  if (isJson) {
    if (isHistory) {
      console.log(JSON.stringify(getCareerOSGovernanceHistory(), null, 2));
    } else {
      console.log(JSON.stringify(generateCareerOSGovernanceReport(), null, 2));
    }
    return;
  }

  if (isHistory) {
    console.log('============================================================');
    console.log('CAREER OS GOVERNANCE AUDIT HISTORY');
    console.log('============================================================\n');

    const history = getCareerOSGovernanceHistory();
    if (history.length === 0) {
      console.log('No governance change entries recorded in history.');
    } else {
      history.slice(-20).forEach((entry, idx) => {
        console.log(`[${idx + 1}] ${entry.timestamp} | Actor: ${entry.actor} | Status: ${entry.status}`);
        console.log(`    Type: ${entry.changeType} | ID: ${entry.id}`);
        if (entry.rejectionReason) {
          console.log(`    Rejection Reason: ${entry.rejectionReason}`);
        }
        console.log('');
      });
    }

    console.log('============================================================');
    console.log('GOVERNANCE HISTORY PRINTED (READ-ONLY)');
    console.log('============================================================');
    return;
  }

  if (isValidate || isChange) {
    // Parse change parameters
    const changePayload = {};
    const modeIdx = args.indexOf('--mode');
    if (modeIdx !== -1 && args[modeIdx + 1]) {
      changePayload.operatorMode = args[modeIdx + 1];
    }

    const payloadIdx = args.indexOf('--payload');
    if (payloadIdx !== -1 && args[payloadIdx + 1]) {
      try {
        Object.assign(changePayload, JSON.parse(args[payloadIdx + 1]));
      } catch (err) {
        console.error('❌ Error parsing JSON payload:', err.message);
        process.exit(1);
      }
    }

    if (isValidate) {
      console.log('============================================================');
      console.log('CAREER OS GOVERNANCE CHANGE VALIDATION');
      console.log('============================================================\n');

      const validation = validateCareerOSGovernanceChange(changePayload);
      console.log(` Validation Result : ${validation.valid ? 'ALLOWED' : 'BLOCKED'}`);
      console.log(` Code              : ${validation.code}`);
      console.log(` Reason            : ${validation.reason}\n`);

      console.log('============================================================');
      return;
    }

    if (isChange) {
      console.log('============================================================');
      console.log('CAREER OS GOVERNANCE CHANGE MUTATION');
      console.log('============================================================\n');

      const result = applyCareerOSGovernanceChange(changePayload, { actor: 'CLI_OPERATOR' });
      console.log(` Execution Success : ${result.success}`);
      console.log(` Result Code       : ${result.code}`);
      if (result.reason) {
        console.log(` Rejection Reason  : ${result.reason}`);
      } else {
        console.log(` New Mode          : ${result.state.operatorMode}`);
        console.log(` Change Count      : ${result.state.changeCount}`);
      }

      console.log('\n============================================================');
      return;
    }
  }

  // Default output --status
  console.log('============================================================');
  console.log('CAREER OS OPERATOR GOVERNANCE CONTROL MATRIX');
  console.log('============================================================\n');

  const state = getCareerOSGovernanceState();
  console.log(` Governance Status : ${state.governanceStatus}`);
  console.log(` Operator Mode     : ${state.operatorMode}`);
  console.log(` Schedulers        : ${state.automationPolicy ? (state.automationPolicy.schedulersEnabled ? 'ENABLED' : 'DISABLED') : 'ENABLED'}`);
  console.log(` Auto Submissions  : ${state.automationPolicy ? (state.automationPolicy.autonomousSubmissionsAllowed ? 'ALLOWED' : 'STRICTLY_BLOCKED') : 'STRICTLY_BLOCKED'}`);
  console.log(` Incident Response : ${state.incidentPolicy ? (state.incidentPolicy.automatedIncidentResponseEnabled ? 'ENABLED' : 'DISABLED') : 'ENABLED'}`);
  console.log(` Telegram Alerts   : ${state.notificationPolicy ? (state.notificationPolicy.telegramNotificationsEnabled ? 'ENABLED' : 'DISABLED') : 'ENABLED'}`);
  console.log(` Last Changed At   : ${state.lastChangedAt}`);
  console.log(` Last Changed By   : ${state.lastChangedBy}`);
  console.log(` Change Count      : ${state.changeCount}`);
  console.log(` State Fingerprint : ${state.fingerprint.substring(0, 16)}...\n`);

  console.log('============================================================');
  console.log('GOVERNANCE MATRIX COMPLETED');
  console.log('============================================================');
}

if (require.main === module) {
  main();
}

module.exports = { main };

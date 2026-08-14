'use strict';

/**
 * Career OS — Career Intelligence Dashboard Runner Script
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const { generateCareerIntelligenceDashboard } = require('../src/intelligence/career.intelligence.dashboard');

const DATA_FILES = [
  path.resolve(__dirname, '../data/application-queue.json'),
  path.resolve(__dirname, '../data/application-outcomes.json'),
  path.resolve(__dirname, '../data/job-decisions.json'),
  path.resolve(__dirname, '../data/application-history.json')
];

function getHashes() {
  return DATA_FILES.map(f => fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : 'MISSING');
}

function runDashboardCLI() {
  const hashesBefore = getHashes();

  const dashboard = generateCareerIntelligenceDashboard();

  console.log(dashboard.renderedText);

  const hashesAfter = getHashes();
  const hashesMatch = JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter);

  console.log(`\nData Store Immutability Check: ${hashesMatch ? 'UNMUTATED (MATCH)' : 'MUTATED (FAILED)'}\n`);

  return dashboard;
}

if (require.main === module) {
  runDashboardCLI();
}

module.exports = { runDashboardCLI };

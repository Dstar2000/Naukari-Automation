const fs = require('fs');
const path = require('path');

const CONTAMINATION_PATTERNS = ['job-listings-test', 'flw-test', 'old-99', 'test123', 'synthetic', 'fixture'];

function scanFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const matches = [];

  CONTAMINATION_PATTERNS.forEach((pattern) => {
    if (content.includes(pattern)) {
      matches.push(pattern);
    }
  });

  return matches;
}

function runContaminationAudit() {
  console.log('========================================');
  console.log('TEST DATA CONTAMINATION AUDIT');
  console.log('========================================\n');

  const rootDir = path.resolve(__dirname, '..');
  const directoriesToScan = ['data', 'tests', 'scripts'];
  const findings = [];

  directoriesToScan.forEach((dirName) => {
    const dirPath = path.join(rootDir, dirName);
    if (!fs.existsSync(dirPath)) return;

    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.json') || f.endsWith('.js'));
    files.forEach((file) => {
      const fullPath = path.join(dirPath, file);
      const matchedPatterns = scanFile(fullPath);

      if (matchedPatterns.length > 0) {
        let classification = 'UNKNOWN';
        if (dirName === 'tests') {
          classification = 'TEST FIXTURE';
        } else if (dirName === 'scripts') {
          classification = 'SCRIPT FIXTURE/AUDIT';
        } else if (dirName === 'data') {
          classification = 'ACCIDENTALLY PERSISTED TEST DATA';
        }

        findings.push({
          file: path.relative(rootDir, fullPath),
          patterns: matchedPatterns,
          classification
        });
      }
    });
  });

  console.log(`Scanned directories: data/, tests/, scripts/`);
  console.log(`Total Contaminated Files Found: ${findings.length}\n`);

  findings.forEach((f, idx) => {
    console.log(` [${idx + 1}] File: ${f.file}`);
    console.log(`     Patterns Found: ${f.patterns.join(', ')}`);
    console.log(`     Classification: ${f.classification}\n`);
  });

  console.log('========================================');
  console.log('✓ Contamination audit completed (READ-ONLY).');
  console.log('========================================');
}

if (require.main === module) {
  runContaminationAudit();
}

module.exports = { runContaminationAudit };

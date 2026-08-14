const path = require('path');
const fs = require('fs');

const AUTH_DIR = path.resolve(__dirname, '../../data/auth');
const AUTH_FILE_PATH = path.join(AUTH_DIR, 'auth.json');

// Ensure data/auth directory exists
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

const defaultBrowserOptions = {
  headless: false,
  viewport: { width: 1280, height: 800 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
};

module.exports = {
  AUTH_DIR,
  AUTH_FILE_PATH,
  defaultBrowserOptions
};

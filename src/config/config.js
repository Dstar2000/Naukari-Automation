const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
const enableCareerDigest = process.env.CAREER_DIGEST_ENABLED === 'true';

module.exports = {
  telegramToken,
  telegramChatId,
  enableCareerDigest
};

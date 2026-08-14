const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getBot, initBot, sendTelegramMessage } = require('./telegram.bot');
const { telegramChatId, telegramToken } = require('../config/config');

const QUESTION_MEMORY_PATH = path.resolve(__dirname, '../../data/question-memory.json');

/**
 * Gets a stable hash for a question string.
 * @param {string} questionText 
 * @returns {string}
 */
function getQuestionHash(questionText) {
  return crypto.createHash('md5').update((questionText || '').toLowerCase().trim()).digest('hex').substring(0, 10);
}

/**
 * Categorizes a recruiter question for semantic memory mapping.
 * @param {string} questionText 
 * @returns {'relocate'|'experience'|'salary'|'notice'|'skills'|'general'}
 */
function categorizeQuestion(questionText) {
  const norm = (questionText || '').toLowerCase().trim();
  if (/\brelocat|\bmove to|\blocation\b/i.test(norm)) {
    return 'relocate';
  }
  if (/\bsalary\b|\bctc\b|\bpay\b|\bpackage\b/i.test(norm)) {
    return 'salary';
  }
  if (/\byears?\b|\bexperience\b|\bexp\b/i.test(norm)) {
    return 'experience';
  }
  if (/\bnotice\b|\bjoin\b|\bavailable\b/i.test(norm)) {
    return 'notice';
  }
  if (/\bskills?\b|\breact\b|\bnode\b|\bjavascript\b/i.test(norm)) {
    return 'skills';
  }
  return 'general';
}

/**
 * Normalizes question text by stripping punctuation and stop words.
 * @param {string} questionText 
 * @returns {string}
 */
function normalizeQuestionText(questionText) {
  return (questionText || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Reads question-memory.json array safely.
 * @returns {Array<Object>}
 */
function getQuestionMemory() {
  if (!fs.existsSync(QUESTION_MEMORY_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(QUESTION_MEMORY_PATH, 'utf-8')) || [];
  } catch (_) {
    return [];
  }
}

/**
 * Saves or updates an answer in question-memory.json with category and metadata.
 * @param {string} questionText 
 * @param {string} answerText 
 * @returns {Object}
 */
function saveAnswerToMemory(questionText, answerText) {
  const memory = getQuestionMemory();
  const normQ = (questionText || '').trim();
  const normKey = normalizeQuestionText(questionText);
  const category = categorizeQuestion(questionText);
  const normA = (answerText || '').trim();

  const existingIdx = memory.findIndex(
    (m) =>
      (m.question && m.question.toLowerCase().trim() === normQ.toLowerCase()) ||
      (m.normalizedQuestion && m.normalizedQuestion === normKey)
  );

  const entry = {
    question: normQ,
    normalizedQuestion: normKey,
    category,
    answer: normA,
    confidence: 'high',
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString()
  };

  if (existingIdx !== -1) {
    memory[existingIdx] = { ...memory[existingIdx], ...entry };
  } else {
    memory.push(entry);
  }

  const dir = path.dirname(QUESTION_MEMORY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(QUESTION_MEMORY_PATH, JSON.stringify(memory, null, 2), 'utf-8');

  return entry;
}

/**
 * Finds cached answer in memory for a question by exact text, normalized text, or category mapping.
 * @param {string} questionText 
 * @returns {Object|null}
 */
function findAnswerInMemory(questionText) {
  if (!questionText) return null;
  const memory = getQuestionMemory();
  const normQ = questionText.toLowerCase().trim();
  const normKey = normalizeQuestionText(questionText);
  const category = categorizeQuestion(questionText);

  // 1. Direct or normalized text match
  let match = memory.find(
    (m) =>
      (m.question && m.question.toLowerCase().trim() === normQ) ||
      (m.normalizedQuestion && m.normalizedQuestion === normKey)
  );

  // 2. Semantic category match (for non-general categories)
  if (!match && category !== 'general') {
    match = memory.find((m) => m.category === category);
  }

  if (match) {
    match.lastUsed = new Date().toISOString();
  }

  return match || null;
}

/**
 * Sends Telegram message to user for recruiter question handling.
 * @param {Object} job Job object
 * @param {string} questionText Recruiter question text
 * @param {string|number} [chatId] 
 * @returns {Promise<Object>}
 */
async function sendQuestionPrompt(job, questionText, chatId = telegramChatId) {
  let bot = getBot();
  if (!bot && telegramToken) {
    bot = initBot({ polling: false });
  }

  const cached = findAnswerInMemory(questionText);
  const qHash = getQuestionHash(questionText);
  const targetChat = chatId || telegramChatId;

  if (cached) {
    // Answer exists in memory -> Ask to reuse or change
    const text = `❓ *Recruiter Question Found in Memory*\n\n🏢 *Company:* ${job.company}\n❓ *Question:* ${questionText}\n\n*Previous answer found:*\n"${cached.answer}"\n\nUse this answer?`;
    const options = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '✅ Use Answer',
              callback_data: `use_ans_${qHash}`
            },
            {
              text: '✏️ Change',
              callback_data: `chg_ans_${qHash}`
            }
          ]
        ]
      }
    };
    if (bot) {
      return await bot.sendMessage(targetChat, text, options);
    } else {
      return await sendTelegramMessage(text, targetChat);
    }
  } else {
    // Answer NOT in memory -> Ask user to reply with answer
    const text = `Recruiter Question:\n\nCompany:\n${job.company}\n\nQuestion:\n${questionText}\n\nReply with your answer.`;
    if (bot) {
      return await bot.sendMessage(targetChat, text, { parse_mode: 'Markdown' });
    } else {
      return await sendTelegramMessage(text, targetChat);
    }
  }
}

module.exports = {
  getQuestionHash,
  categorizeQuestion,
  normalizeQuestionText,
  getQuestionMemory,
  saveAnswerToMemory,
  findAnswerInMemory,
  sendQuestionPrompt,
  QUESTION_MEMORY_PATH
};

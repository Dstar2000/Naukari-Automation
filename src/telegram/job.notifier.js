const { getBot, initBot, sendTelegramMessage } = require('./telegram.bot');
const { telegramChatId, telegramToken } = require('../config/config');
const { getJobId } = require('./job.approval');

/**
 * Formats Telegram notification message based on application type.
 * @param {Object} jobMatch 
 * @returns {string}
 */
function formatJobAlertMessage(jobMatch) {
  const isEasyApply = jobMatch.applyType === 'EASY_APPLY';

  const skillsText =
    jobMatch.matchedSkills && jobMatch.matchedSkills.length > 0
      ? jobMatch.matchedSkills.join(', ')
      : 'Full Stack / Web Tech';

  if (isEasyApply) {
    // CASE 1: EASY_APPLY
    return `🔥 *New Job Match*

📌 *${jobMatch.title}*
🏢 *Company:* ${jobMatch.company}
📍 *Location:* ${jobMatch.location || 'Bangalore'}
⏳ *Experience:* ${jobMatch.experience || 'Not specified'}
🎯 *Match:* ${jobMatch.matchScore}%

💡 *Matched Skills:* ${skillsText}`;
  } else {
    // CASE 2: EXTERNAL or UNKNOWN
    return `🔗 *Job Opportunity*

📌 *${jobMatch.title}*
🏢 *Company:* ${jobMatch.company}
📍 *Location:* ${jobMatch.location || 'Bangalore'}
🎯 *Match:* ${jobMatch.matchScore}%

⚠️ *This job requires external application.*
Open the job and apply manually.`;
  }
}

/**
 * Builds inline keyboard options array based on application type and logs generated callback_data.
 * @param {Object} jobMatch 
 * @returns {Object} Telegram reply_markup options
 */
function buildJobAlertKeyboard(jobMatch) {
  const isEasyApply = jobMatch.applyType === 'EASY_APPLY';
  const jobId = getJobId(jobMatch.jobUrl);

  if (isEasyApply) {
    const appCallback = `app_${jobId}`;
    const rejCallback = `rej_${jobId}`;

    console.log(`Generated callback: ${appCallback} | ${rejCallback} for job: "${jobMatch.title}"`);

    // CASE 1: EASY_APPLY -> View Job link, plus Apply & Reject buttons
    return {
      inline_keyboard: [
        [
          {
            text: '🔗 View Job',
            url: jobMatch.jobUrl
          }
        ],
        [
          {
            text: '✅ Apply',
            callback_data: appCallback
          },
          {
            text: '❌ Reject',
            callback_data: rejCallback
          }
        ]
      ]
    };
  } else {
    // CASE 2: EXTERNAL or UNKNOWN -> Only Open Naukri Job link button (No Apply/Reject buttons)
    return {
      inline_keyboard: [
        [
          {
            text: '🔗 Open Naukri Job',
            url: jobMatch.jobUrl
          }
        ]
      ]
    };
  }
}

/**
 * Sends a single job alert to Telegram.
 * @param {Object} jobMatch 
 * @param {string|number} [chatId]
 * @returns {Promise<Object>}
 */
async function sendJobNotification(jobMatch, chatId = telegramChatId) {
  let bot = getBot();
  if (!bot && telegramToken) {
    bot = initBot({ polling: false });
  }

  const text = formatJobAlertMessage(jobMatch);
  const keyboard = buildJobAlertKeyboard(jobMatch);
  const options = {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  };

  const targetChat = chatId || telegramChatId;

  if (bot) {
    return await bot.sendMessage(targetChat, text, options);
  } else {
    return await sendTelegramMessage(text + `\n\n🔗 Link: ${jobMatch.jobUrl}`, targetChat);
  }
}

/**
 * Sends bulk control message for EASY_APPLY recommendations.
 * @param {string|number} [chatId]
 * @returns {Promise<Object>}
 */
async function sendBulkControlMessage(chatId = telegramChatId) {
  let bot = getBot();
  if (!bot && telegramToken) {
    bot = initBot({ polling: false });
  }

  const text = `⚡ *Bulk Job Decision Controls*\n\nApply or reject all pending Easy Apply recommendations:`;
  const options = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '✅ Apply All',
            callback_data: 'apply_all'
          },
          {
            text: '❌ Reject All',
            callback_data: 'reject_all'
          }
        ]
      ]
    }
  };

  const targetChat = chatId || telegramChatId;
  if (bot) {
    return await bot.sendMessage(targetChat, text, options);
  } else {
    return await sendTelegramMessage(text, targetChat);
  }
}

/**
 * Sends a list of job recommendation alerts sequentially to Telegram.
 * @param {Array<Object>} matchedJobs 
 * @param {string|number} [chatId]
 * @returns {Promise<Array<Object>>}
 */
async function sendBulkJobNotifications(matchedJobs, chatId = telegramChatId) {
  if (!Array.isArray(matchedJobs) || matchedJobs.length === 0) {
    console.log('No matched jobs to send via Telegram.');
    return [];
  }

  const targetChat = chatId || telegramChatId;
  console.log(`Sending ${matchedJobs.length} job alert(s) to Telegram chat (${targetChat})...`);
  const results = [];
  let easyApplyCount = 0;

  for (const job of matchedJobs) {
    try {
      const res = await sendJobNotification(job, targetChat);
      results.push(res);
      if (job.applyType === 'EASY_APPLY') {
        easyApplyCount++;
      }
      console.log(`✓ Telegram alert sent for: "${job.title}" (${job.applyType || 'EASY_APPLY'}) at ${job.company}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`Failed to send Telegram alert for "${job.title}":`, err.message);
    }
  }

  // If there are Easy Apply jobs, send bulk control buttons message
  if (easyApplyCount > 0) {
    try {
      await sendBulkControlMessage(targetChat);
      console.log('✓ Bulk control buttons sent to Telegram.');
    } catch (err) {
      console.error('Failed to send bulk control message:', err.message);
    }
  }

  return results;
}

/**
 * Formats a Telegram message digest for Career Intelligence Performance Analytics.
 * @param {Object} report 
 * @returns {string}
 */
function formatCareerPerformanceDigest(report) {
  if (!report || !report.overview) {
    return '📊 *Career OS Performance Digest*\nNo analytics data available.';
  }

  const { overview, safety, classifications } = report;

  return `📊 *Career OS Performance Digest*

📈 *Application Overview*
- Total Tracked: *${overview.totalRealJobsTracked}*
- Submitted: *${overview.submittedCount}*
- Verified Applied: *${overview.verifiedAppliedCount}*
- External Required: *${overview.externalApplicationRequiredCount}*
- Autonomous Eligible: *${overview.autonomousEligibleCount}*

🛡️ *Safety & Governance*
- Blocked Applications: *${safety.blockedApplicationCount}*
- External Blocked: *${safety.externalApplicationsBlocked}*
- Duplicates Prevented: *${safety.duplicateApplicationsPrevented}*

🏷️ *Classifications*
- Easy Apply: *${classifications.EASY_APPLY}*
- External Required: *${classifications.EXTERNAL_APPLICATION_REQUIRED}*
- Already Applied: *${classifications.ALREADY_APPLIED}*

_Read-only analytics digest. Zero application actions executed._`;
}

/**
 * Sends Career Performance Digest to Telegram.
 * @param {Object} report 
 * @param {string} [chatId] 
 */
async function sendCareerPerformanceDigest(report, chatId) {
  const message = formatCareerPerformanceDigest(report);
  const targetChat = chatId || telegramChatId;
  return await sendTelegramMessage(targetChat, message);
}

module.exports = {
  formatJobAlertMessage,
  buildJobAlertKeyboard,
  sendJobNotification,
  sendBulkControlMessage,
  sendBulkJobNotifications,
  formatCareerPerformanceDigest,
  sendCareerPerformanceDigest
};

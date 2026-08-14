const path = require('path');
const fs = require('fs');
const { getOutcomes, getOutcomeStats, recordOutcome, OUTCOME_STATUSES } = require('../tracking/outcome.tracker');
const { getApplicationHistory } = require('../naukri/application.executor');
const { getJobId } = require('./job.approval');

const INTERVIEW_MEMORY_PATH = path.resolve(__dirname, '../../data/interview-memory.json');

/**
 * Reads interview memory array.
 * @returns {Array<Object>}
 */
function getInterviewMemory() {
  if (!fs.existsSync(INTERVIEW_MEMORY_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(INTERVIEW_MEMORY_PATH, 'utf-8')) || [];
  } catch (_) {
    return [];
  }
}

/**
 * Records or updates an interview schedule entry in data/interview-memory.json.
 * @param {Object} job 
 * @param {string} round 
 * @param {string} [date] 
 * @param {string} [notes] 
 * @returns {Object}
 */
function recordInterviewMemory(job, round, date = '', notes = '') {
  const memory = getInterviewMemory();
  const entry = {
    company: job.company || '',
    role: job.role || job.title || '',
    round: round || 'TECHNICAL_ROUND',
    date: date || new Date().toISOString(),
    notes: notes || ''
  };

  const existingIdx = memory.findIndex(
    (m) => m.company.toLowerCase().trim() === entry.company.toLowerCase().trim() && m.round === entry.round
  );

  if (existingIdx !== -1) {
    memory[existingIdx] = entry;
  } else {
    memory.push(entry);
  }

  const dir = path.dirname(INTERVIEW_MEMORY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(INTERVIEW_MEMORY_PATH, JSON.stringify(memory, null, 2), 'utf-8');

  return entry;
}

/**
 * Handles outcome tracking Telegram commands (/outcomes, /interviews, /offers, /pipeline).
 * @param {string} command 
 * @returns {{ text: string, reply_markup?: Object }}
 */
function handleOutcomeCommand(command) {
  const cmd = (command || '').trim().toLowerCase();
  const history = getApplicationHistory();
  const submittedHistory = history.filter((h) => h.status === 'SUBMITTED');
  const outcomes = getOutcomes();
  const stats = getOutcomeStats();

  if (cmd.startsWith('/outcomes') || cmd.startsWith('/track')) {
    if (submittedHistory.length === 0) {
      return {
        text: `📊 *Application Outcome Tracker*\n\nNo submitted applications found yet. Process and submit applications first.`
      };
    }

    const latestApp = submittedHistory[submittedHistory.length - 1];
    const appId = getJobId(latestApp.jobUrl);

    const text = `📊 *Application Outcome Tracker*

📌 *Latest Submitted Job:*
🏢 *Company:* ${latestApp.company}
🎯 *Role:* ${latestApp.role}
📅 *Submitted:* ${new Date(latestApp.timestamp).toLocaleDateString()}

*Overall Pipeline Stats:*
• ✉️ Submitted: ${stats.totalApplications}
• 📞 Interviews: ${stats.interviews} (${stats.interviewRate})
• 🎉 Offers: ${stats.offers} (${stats.offerRate})
• ❌ Rejected: ${stats.rejections}

Select recruiter response for *${latestApp.company}*:`;

    const reply_markup = {
      inline_keyboard: [
        [
          { text: '📞 Interview', callback_data: `out_int_${appId}` },
          { text: '🎉 Offer', callback_data: `out_off_${appId}` }
        ],
        [
          { text: '❌ Rejected', callback_data: `out_rej_${appId}` },
          { text: '⏳ No Response', callback_data: `out_nr_${appId}` }
        ]
      ]
    };

    return { text, reply_markup };
  }

  if (cmd.startsWith('/interviews')) {
    const memory = getInterviewMemory();
    const activeInterviews = outcomes.filter((o) =>
      ['SHORTLISTED', 'INTERVIEW_SCHEDULED', 'TECHNICAL_ROUND', 'HR_ROUND'].includes(o.currentStatus)
    );

    if (activeInterviews.length === 0 && memory.length === 0) {
      return {
        text: `📞 *Interview Calendar & Pipeline*\n\nNo active interviews recorded yet.`
      };
    }

    // Sort upcoming interviews chronologically
    memory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const items = memory.map(
      (m, i) => `${i + 1}. 📞 *${m.company}* - ${m.role}\n   Round: \`${m.round}\` | Date: ${new Date(m.date).toLocaleDateString()}`
    );

    return {
      text: `📞 *Interview Calendar & Pipeline (${memory.length || activeInterviews.length})*\n\n${items.length > 0 ? items.join('\n\n') : 'No upcoming scheduled rounds.'}`
    };
  }

  if (cmd.startsWith('/offers')) {
    const offerList = outcomes.filter((o) => o.currentStatus === 'OFFER');

    if (offerList.length === 0) {
      return {
        text: `🎉 *Job Offers Summary*\n\nNo job offers recorded yet.`
      };
    }

    const items = offerList.map(
      (o, i) => `${i + 1}. 🎉 *${o.company}* - ${o.role}\n   Status: \`OFFER RECEIVED\` 🏆`
    );

    return {
      text: `🎉 *Job Offers Summary (${offerList.length})*\n\n${items.join('\n\n')}`
    };
  }

  if (cmd.startsWith('/pipeline')) {
    const appliedCount = stats.totalApplications;
    const shortlistedCount = outcomes.filter((o) => o.currentStatus === 'SHORTLISTED').length;
    const interviewCount = stats.interviews;
    const offerCount = stats.offers;
    const rejectedCount = stats.rejections;

    const text = `📊 *Career Pipeline*

Applied:
${appliedCount}

Shortlisted:
${shortlistedCount}

Interview:
${interviewCount}

Offers:
${offerCount}

Rejected:
${rejectedCount}

*Metrics:*
• Response Rate: ${stats.responseRate}
• Interview Rate: ${stats.interviewRate}
• Offer Rate: ${stats.offerRate}
• Avg Response: ${stats.averageResponseDays} day(s)`;

    return { text };
  }

  return {
    text: `Outcome Control Commands:\n/outcomes - Update recruiter response\n/interviews - View interview calendar & pipeline\n/offers - View job offers summary\n/pipeline - View career pipeline stats`
  };
}

module.exports = {
  handleOutcomeCommand,
  recordInterviewMemory,
  getInterviewMemory,
  INTERVIEW_MEMORY_PATH
};

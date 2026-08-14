const path = require('path');
const fs = require('fs');
const { getTodayString } = require('../naukri/application.guard');
const { resolveApplicationIdentity } = require('../tracking/application.identity.resolver');

const DEBUG_DIR = path.resolve(__dirname, '../../debug');

function logTelegramCallback(logData) {
  try {
    if (!fs.existsSync(DEBUG_DIR)) {
      fs.mkdirSync(DEBUG_DIR, { recursive: true });
    }
    const today = getTodayString();
    const logFile = path.join(DEBUG_DIR, `telegram-callback-${today}.log`);
    const timestamp = new Date().toISOString();

    const logLine = `[${timestamp}] User: ${logData.userId || 'unknown'} | Chat: ${logData.chatId || 'unknown'} | Callback: "${logData.callbackData}" | Handler: ${logData.handler || 'None'} | Duration: ${logData.durationMs}ms | Success: ${logData.success} | Reason: ${logData.reason || 'N/A'}${logData.errorStack ? ` | Stack: ${logData.errorStack}` : ''}\n`;

    fs.appendFileSync(logFile, logLine, 'utf-8');
  } catch (err) {
    console.error('Failed to write telegram callback log:', err.message);
  }
}

/**
 * Centralized Callback Router: Dispatches every Telegram inline button callback safely.
 * Guarantees answerCallbackQuery, message editing with fallback, logging, and error recovery.
 * @param {import('node-telegram-bot-api')} bot 
 * @param {Object} query Telegram callback query object
 * @returns {Promise<{ handled: boolean, callback: string, handler?: string, success: boolean, reason?: string }>}
 */
async function dispatchCallback(bot, query) {
  const startTime = Date.now();
  const callbackData = query ? query.data || '' : '';
  const queryId = query ? query.id : null;
  const chatId = query && query.message && query.message.chat ? query.message.chat.id : null;
  const messageId = query && query.message ? query.message.message_id : null;
  const userId = query && query.from ? query.from.id : 'unknown';

  let handled = false;
  let success = false;
  let handlerName = 'Unknown';
  let reason = '';

  const safeAnswerCallback = async (text, showAlert = false) => {
    if (bot && queryId) {
      try {
        await bot.answerCallbackQuery(queryId, { text, show_alert: showAlert });
      } catch (err) {
        console.warn('answerCallbackQuery failed:', err.message);
      }
    }
  };

  const safeEditMessageText = async (text, options = {}) => {
    if (!bot || !chatId) return;
    const opts = { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...options };
    try {
      if (messageId) {
        await bot.editMessageText(text, opts);
      } else {
        await bot.sendMessage(chatId, text, opts);
      }
    } catch (err) {
      console.warn('editMessageText failed, falling back to sendMessage:', err.message);
      try {
        await bot.sendMessage(chatId, text, opts);
      } catch (sendErr) {
        console.error('Fallback sendMessage also failed:', sendErr.message);
      }
    }
  };

  try {
    if (!callbackData) {
      reason = 'MISSING_CALLBACK_DATA';
      await safeAnswerCallback('⚠️ Invalid request.');
      logTelegramCallback({ userId, chatId, callbackData, handler: handlerName, durationMs: Date.now() - startTime, success: false, reason });
      return { handled: false, callback: callbackData, success: false, reason };
    }

    // 0. Profile Update Approval Handler (profile_approval:, prof_appr_approve:, prof_appr_reject:)
    if (callbackData.startsWith('profile_approval:') || callbackData.startsWith('prof_appr_approve:') || callbackData.startsWith('prof_appr_reject:') || callbackData.startsWith('prof_appr_')) {
      handled = true;
      handlerName = 'Profile Approval Handler';
      let isApprove = false;
      let approvalId = '';

      if (callbackData.startsWith('profile_approval:')) {
        const parts = callbackData.split(':');
        const decisionStr = (parts[1] || '').trim().toUpperCase();
        isApprove = (decisionStr === 'APPROVE');
        approvalId = parts.slice(2).join(':').trim();
      } else if (callbackData.startsWith('prof_appr_approve:')) {
        isApprove = true;
        approvalId = callbackData.replace('prof_appr_approve:', '').trim();
      } else if (callbackData.startsWith('prof_appr_reject:')) {
        isApprove = false;
        approvalId = callbackData.replace('prof_appr_reject:', '').trim();
      }

      const { processProfileApprovalDecision, getProfileProposal } = require('../naukri/profile.approval');
      const decision = isApprove ? 'APPROVE' : 'REJECT';
      const existingProp = getProfileProposal(approvalId);

      console.log(`\nCALLBACK_APPROVAL_TRACE`);
      console.log(`callback_data=${callbackData}`);
      console.log(`decision=${decision}`);
      console.log(`proposalId=${approvalId}`);
      console.log(`proposal_status_before=${existingProp ? existingProp.status : 'NOT_FOUND'}`);

      // Step: Immediate Telegram Callback Acknowledgement (< 100ms) to prevent Telegram timeout/retries
      console.log(`CALLBACK_APPROVAL_TRACE`);
      console.log(`telegram_ack_attempt=true`);
      try {
        await safeAnswerCallback(isApprove ? '✅ Profile update approved & executing!' : '❌ Profile update rejected.', true);
        console.log(`CALLBACK_APPROVAL_TRACE`);
        console.log(`telegram_ack_success=true`);
      } catch (ackErr) {
        console.warn(`CALLBACK_APPROVAL_TRACE telegram_ack_failed=${ackErr.message}`);
      }

      console.log(`CALLBACK_APPROVAL_TRACE`);
      console.log(`entering_processProfileApprovalDecision=true`);

      let res;
      try {
        res = await processProfileApprovalDecision(approvalId, decision, { chatId });
        console.log(`CALLBACK_APPROVAL_TRACE`);
        console.log(`process_resolved=true`);
        console.log(`result_success=${res.success}`);
        console.log(`result_status=${res.status || 'N/A'}`);
        console.log(`result_reason=${res.reason || 'N/A'}`);
      } catch (err) {
        console.error(`CALLBACK_APPROVAL_TRACE`);
        console.error(`process_threw=true`);
        console.error(`error=${err.message}`);
        console.error(`stack=${err.stack}`);
        res = { success: false, reason: `EXCEPTION: ${err.message}` };
      }

      if (res.success) {
        const statusText = isApprove
          ? `✅ Naukri Profile Update Approved\n\nProposal ID: ${approvalId}\nExecuting live update on Naukri...`
          : `❌ Naukri Profile Update Rejected\n\nProposal ID: ${approvalId}\nNo change was made to your profile.`;
        await safeEditMessageText(statusText, { parse_mode: undefined });
        success = true;
      } else {
        await safeEditMessageText(`⚠️ Profile Update Approval Result\n\nProposal ID: ${approvalId}\nStatus: ${res.reason || 'Failed'}`, { parse_mode: undefined });
        success = false;
      }
      logTelegramCallback({ userId, chatId, callbackData, handler: handlerName, durationMs: Date.now() - startTime, success, reason: res.reason });
      return { handled, callback: callbackData, handler: handlerName, success, reason: res.reason };
    }

    // 1. Approval / Rejection Handlers (app_, rej_)
    if (callbackData.startsWith('app_') || callbackData.startsWith('rej_')) {
      handled = true;
      handlerName = 'Job Approval Handler';
      const isApprove = callbackData.startsWith('app_');
      const identifier = callbackData.replace(isApprove ? 'app_' : 'rej_', '').trim();
      const identity = resolveApplicationIdentity(identifier);

      if (identity.resolved) {
        // Resolve full job record to get applyType and complete metadata (title, location, experience, etc.).
        // resolveApplicationIdentity returns only a minimal identity object — it deliberately omits these fields.
        const matchedPath = path.resolve(__dirname, '../../data/matched-jobs.json');
        let fullJob = null;
        try {
          if (fs.existsSync(matchedPath)) {
            const matchedJobs = JSON.parse(fs.readFileSync(matchedPath, 'utf-8'));
            fullJob = matchedJobs.find((j) => j.jobUrl === identity.jobUrl) || null;
          }
        } catch (_) {}

        const applyType = (fullJob && fullJob.applyType) || 'EASY_APPLY';
        // Use full job record when available so recordDecision receives complete metadata.
        const jobForDecision = fullJob || identity;

        if (isApprove && applyType === 'EXTERNAL') {
          // EXTERNAL jobs have no Easy Apply flow — clicking Apply on an old notification must
          // show a manual-application prompt instead of silently queueing the job as EASY_APPLY.
          await safeAnswerCallback('⚠️ External job: manual application required', true);
          await safeEditMessageText(
            `⚠️ *External Application Required*\n\n📌 *${identity.role}*\n🏢 *${identity.company}*\n\nThis job cannot be submitted automatically.\nOpen Naukri and apply manually:\n🔗 [Open Job](${identity.jobUrl})`
          );
          success = true;
        } else {
          const { recordDecision } = require('./job.approval');
          const decisionType = isApprove ? 'approved' : 'rejected';
          recordDecision(jobForDecision, decisionType);
          await safeAnswerCallback(isApprove ? 'Job approved and queued' : 'Job rejected');

          const messageText = isApprove
            ? `✅ Approved - Added to application queue\n\n📌 *${identity.role}*\n🏢 *${identity.company}*\n🔗 [View Job](${identity.jobUrl})`
            : `❌ Rejected\n\n📌 *${identity.role}*\n🏢 *${identity.company}*`;

          await safeEditMessageText(messageText);
          success = true;
        }
      } else {
        reason = 'UNRESOLVED_APPLICATION';
        await safeAnswerCallback('⚠️ Application could not be safely resolved.', true);
        await safeEditMessageText(`⚠️ *Application could not be safely resolved.*\n\nNo application data was changed.`);
      }
    }
    // 2. Final Submission Handlers (sub_, can_)
    else if (callbackData.startsWith('sub_') || callbackData.startsWith('can_')) {
      handled = true;
      handlerName = 'Application Executor';
      const isSubmit = callbackData.startsWith('sub_');
      const identifier = callbackData.replace(isSubmit ? 'sub_' : 'can_', '').trim();
      const identity = resolveApplicationIdentity(identifier);

      if (identity.resolved) {
        if (isSubmit) {
          const { submitApplication } = require('../naukri/application.executor');
          await submitApplication(identity);
          await safeAnswerCallback('Application Submitted!');
          await safeEditMessageText(`🎉 *Application Submitted Successfully!*\n\n📌 *${identity.role}*\n🏢 *${identity.company}*`);
        } else {
          const { recordApplicationHistory } = require('../naukri/application.executor');
          recordApplicationHistory(identity, 'CANCELLED', 'Cancelled by user');
          await safeAnswerCallback('Application Cancelled');
          await safeEditMessageText(`❌ *Application Cancelled*\n\n📌 *${identity.role}*\n🏢 *${identity.company}*`);
        }
        success = true;
      } else {
        reason = 'UNRESOLVED_APPLICATION';
        await safeAnswerCallback('⚠️ Application could not be safely resolved.', true);
        await safeEditMessageText(`⚠️ *Application could not be safely resolved.*\n\nNo application data was changed.`);
      }
    }
    // 3. Follow-up Handlers (follow_wait_, follow_no_response_)
    else if (callbackData.startsWith('follow_wait_') || callbackData.startsWith('follow_no_response_')) {
      handled = true;
      handlerName = 'Follow-up Scheduler';
      const isWait = callbackData.startsWith('follow_wait_');
      const identifier = callbackData.replace(isWait ? 'follow_wait_' : 'follow_no_response_', '').trim();

      const identity = resolveApplicationIdentity(identifier);

      if (!identity.resolved) {
        reason = 'UNRESOLVED_APPLICATION';
        await safeAnswerCallback('⚠️ Application could not be safely resolved.', true);
        await safeEditMessageText(`⚠️ *Application could not be safely resolved.*\n\nNo application data was changed.`);
        logTelegramCallback({ userId, chatId, callbackData, handler: handlerName, durationMs: Date.now() - startTime, success: false, reason });
        return { handled: true, callback: callbackData, handler: handlerName, success: false, reason };
      }

      const { recordFollowupSent, getFollowupRecord } = require('../tracking/followup.scheduler');

      if (isWait) {
        const rec = recordFollowupSent(identity, 'WAITING_RESPONSE');
        const displayCount = rec.reminderCount > 0 ? rec.reminderCount : 1;
        await safeAnswerCallback('Marked as Still Waiting');
        await safeEditMessageText(
          `⏳ *Still Waiting*\n\n🏢 *Company:* ${identity.company}\n🎯 *Role:* ${identity.role}\n\nStatus:\n\`WAITING_RESPONSE\`\n\nReminder:\n${displayCount}/3`
        );
      } else {
        const { recordOutcome, OUTCOME_STATUSES } = require('../tracking/outcome.tracker');
        recordOutcome(identity, OUTCOME_STATUSES.NO_RESPONSE);
        recordFollowupSent(identity, 'NO_RESPONSE');

        await safeAnswerCallback('Marked as No Response');
        await safeEditMessageText(
          `❌ *Follow-up Closed*\n\n🏢 *Company:* ${identity.company}\n🎯 *Role:* ${identity.role}\n\nStatus:\n\`NO_RESPONSE\`\n\nNo more reminders will be sent.`
        );
      }
      success = true;
    }
    // 4. Outcome & Interview Stage Handlers (out_, stage_)
    else if (callbackData.startsWith('out_int_')) {
      handled = true;
      handlerName = 'Outcome Interview Handler';
      const appId = callbackData.replace('out_int_', '').trim();
      const identity = resolveApplicationIdentity(appId);

      if (!identity.resolved) {
        reason = 'UNRESOLVED_APPLICATION';
        await safeAnswerCallback('⚠️ Application could not be safely resolved.', true);
        await safeEditMessageText(`⚠️ *Application could not be safely resolved.*\n\nNo application data was changed.`);
        logTelegramCallback({ userId, chatId, callbackData, handler: handlerName, durationMs: Date.now() - startTime, success: false, reason });
        return { handled: true, callback: callbackData, handler: handlerName, success: false, reason };
      }

      await safeAnswerCallback('Select interview stage');
      await safeEditMessageText(`Which interview stage for *${identity.company}*?`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '👥 HR Round', callback_data: `stage_hr_${appId}` },
              { text: '💻 Technical Round', callback_data: `stage_tech_${appId}` }
            ],
            [
              { text: '👔 Manager Round', callback_data: `stage_mgr_${appId}` }
            ]
          ]
        }
      });
      success = true;
    } else if (callbackData.startsWith('stage_')) {
      handled = true;
      handlerName = 'Interview Stage Recorder';
      const { recordOutcome, OUTCOME_STATUSES } = require('../tracking/outcome.tracker');
      const { recordInterviewMemory } = require('./outcome.commands');
      const parts = callbackData.split('_');
      const stageType = parts[1];
      const appId = parts.slice(2).join('_');

      const identity = resolveApplicationIdentity(appId);

      if (!identity.resolved) {
        reason = 'UNRESOLVED_APPLICATION';
        await safeAnswerCallback('⚠️ Application could not be safely resolved.', true);
        await safeEditMessageText(`⚠️ *Application could not be safely resolved.*\n\nNo application data was changed.`);
        logTelegramCallback({ userId, chatId, callbackData, handler: handlerName, durationMs: Date.now() - startTime, success: false, reason });
        return { handled: true, callback: callbackData, handler: handlerName, success: false, reason };
      }

      const roundMap = {
        hr: OUTCOME_STATUSES.HR_ROUND,
        tech: OUTCOME_STATUSES.TECHNICAL_ROUND,
        mgr: OUTCOME_STATUSES.INTERVIEW_SCHEDULED
      };

      const roundName = roundMap[stageType] || OUTCOME_STATUSES.TECHNICAL_ROUND;
      const res = recordOutcome(identity, roundName);

      if (res.success) {
        recordInterviewMemory(identity, roundName);
        await safeAnswerCallback(`Recorded: ${roundName}`);
        await safeEditMessageText(`✅ *Interview Round Recorded: ${roundName}*\n\n📌 *${identity.role}*\n🏢 *${identity.company}*`);
        success = true;
      } else {
        reason = res.reason || 'TRANSITION_FAILED';
        await safeAnswerCallback(`⚠️ ${reason}`);
      }
    } else if (callbackData.startsWith('out_')) {
      handled = true;
      handlerName = 'Outcome Status Updater';
      const { recordOutcome, OUTCOME_STATUSES } = require('../tracking/outcome.tracker');
      const parts = callbackData.split('_');
      const outcomeType = parts[1];
      const appId = parts.slice(2).join('_');

      const identity = resolveApplicationIdentity(appId);

      if (!identity.resolved) {
        reason = 'UNRESOLVED_APPLICATION';
        await safeAnswerCallback('⚠️ Application could not be safely resolved.', true);
        await safeEditMessageText(`⚠️ *Application could not be safely resolved.*\n\nNo application data was changed.`);
        logTelegramCallback({ userId, chatId, callbackData, handler: handlerName, durationMs: Date.now() - startTime, success: false, reason });
        return { handled: true, callback: callbackData, handler: handlerName, success: false, reason };
      }

      let statusMap = {
        off: OUTCOME_STATUSES.OFFER,
        rej: OUTCOME_STATUSES.REJECTED,
        nr: OUTCOME_STATUSES.NO_RESPONSE
      };

      const newStatus = statusMap[outcomeType] || OUTCOME_STATUSES.APPLIED;
      const res = recordOutcome(identity, newStatus);

      if (res.success) {
        await safeAnswerCallback(`Outcome updated: ${newStatus}`);
        await safeEditMessageText(`✅ *Outcome Recorded: ${newStatus}*\n\n📌 *${identity.role}*\n🏢 *${identity.company}*`);
        success = true;
      } else {
        reason = res.reason || 'TRANSITION_FAILED';
        await safeAnswerCallback(`⚠️ ${reason}`);
      }
    }
    // 5. Bulk Handlers (apply_all, reject_all)
    else if (callbackData === 'apply_all' || callbackData === 'reject_all') {
      handled = true;
      handlerName = 'Bulk Approval Handler';
      const { handleBulkDecision } = require('./job.approval');
      const matchedPath = path.resolve(__dirname, '../../data/matched-jobs.json');
      let matchedJobs = [];
      if (fs.existsSync(matchedPath)) {
        try {
          matchedJobs = JSON.parse(fs.readFileSync(matchedPath, 'utf-8'));
        } catch (_) {}
      }

      if (callbackData === 'apply_all') {
        const easyApplyJobs = matchedJobs.filter((j) => j.applyType === 'EASY_APPLY' || !j.applyType);
        handleBulkDecision(easyApplyJobs, 'approved_all');
        await safeAnswerCallback('All Easy Apply jobs approved and queued');
        await safeEditMessageText(`✅ Approved - Added all ${easyApplyJobs.length} Easy Apply jobs to application queue.`);
      } else {
        handleBulkDecision(matchedJobs, 'rejected_all');
        await safeAnswerCallback('All jobs rejected');
        await safeEditMessageText(`❌ Rejected - Rejected all ${matchedJobs.length} job recommendations.`);
      }
      success = true;
    }
    // 7. Career Decision Advisory Handlers (decision_)
    else if (callbackData.startsWith('decision_')) {
      handled = true;
      handlerName = 'Career Decision Approval Handler';
      const { resolveDecisionIdentity, recordDecisionApproval, recordDecisionRejection, recordDecisionDeferral } = require('../intelligence/career-decision.approval');

      let actionType = 'review';
      let decisionId = '';

      if (callbackData.startsWith('decision_approve_')) {
        actionType = 'approve';
        decisionId = callbackData.replace('decision_approve_', '').trim();
      } else if (callbackData.startsWith('decision_reject_')) {
        actionType = 'reject';
        decisionId = callbackData.replace('decision_reject_', '').trim();
      } else if (callbackData.startsWith('decision_defer_')) {
        actionType = 'defer';
        decisionId = callbackData.replace('decision_defer_', '').trim();
      } else if (callbackData.startsWith('decision_review_')) {
        actionType = 'review';
        decisionId = callbackData.replace('decision_review_', '').trim();
      } else {
        decisionId = callbackData.replace('decision_', '').trim();
      }

      const identity = resolveDecisionIdentity(decisionId);

      if (!identity) {
        reason = 'UNRESOLVED_DECISION';
        await safeAnswerCallback('⚠️ Advisory decision could not be safely resolved.', true);
        await safeEditMessageText(`⚠️ *Advisory decision could not be safely resolved.*\n\nNo decision state was changed.`);
        logTelegramCallback({ userId, chatId, callbackData, handler: handlerName, durationMs: Date.now() - startTime, success: false, reason });
        return { handled: true, callback: callbackData, handler: handlerName, success: false, reason };
      }

      if (actionType === 'approve') {
        recordDecisionApproval(decisionId);
        await safeAnswerCallback('Advisory Decision Approved');

        if (identity.actionType === 'HIGH_MATCH_OPPORTUNITY') {
          await safeEditMessageText(
            `✅ *Application Approval Recorded*\n\n📌 *${identity.title}*\nReason: ${identity.reason}\n\n⚡ *Controlled Execution Eligibility:* This action is eligible for application submission.\nDo you want to submit this application now?`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '🚀 Confirm Application', callback_data: `decision_execute_confirm_${decisionId}` },
                    { text: '❌ Cancel', callback_data: `decision_execute_cancel_${decisionId}` }
                  ]
                ]
              }
            }
          );
        } else {
          await safeEditMessageText(`✅ *Advisory Decision Approved*\n\n📌 *${identity.title}*\nReason: ${identity.reason}\n\n🔒 *User Approval Boundary Active:* Advisory item only. Execution is blocked.`);
        }
      } else if (actionType === 'reject') {
        recordDecisionRejection(decisionId);
        await safeAnswerCallback('Advisory Decision Rejected');
        await safeEditMessageText(`❌ *Advisory Decision Rejected*\n\n📌 *${identity.title}*`);
      } else if (actionType === 'defer') {
        recordDecisionDeferral(decisionId);
        await safeAnswerCallback('Advisory Decision Deferred');
        await safeEditMessageText(`⏳ *Advisory Decision Deferred*\n\n📌 *${identity.title}*`);
      } else {
        await safeAnswerCallback('Advisory Decision Details');
        await safeEditMessageText(`📋 *Advisory Decision Details*\n\n📌 *${identity.title}*\nScore: ${identity.score} | Priority: ${identity.priority}\nReason: ${identity.reason}\nSuggested Action: ${identity.suggestedAction}\n\n🔒 *User Approval Boundary Active.*`);
      }
      success = true;
    }
    // 8. Controlled Decision Execution Confirmation Handlers (decision_execute_)
    else if (callbackData.startsWith('decision_execute_')) {
      handled = true;
      handlerName = 'Career Decision Execution Gateway';
      const { executeApprovedDecision } = require('../intelligence/career-decision.execution.gateway');
      const { resolveDecisionIdentity } = require('../intelligence/career-decision.approval');

      const isConfirm = callbackData.startsWith('decision_execute_confirm_');
      const decisionId = callbackData.replace(isConfirm ? 'decision_execute_confirm_' : 'decision_execute_cancel_', '').trim();
      const identity = resolveDecisionIdentity(decisionId);

      if (!identity) {
        reason = 'UNRESOLVED_DECISION';
        await safeAnswerCallback('⚠️ Decision identity could not be resolved.', true);
        await safeEditMessageText('⚠️ *Decision identity could not be resolved.*\n\nNo execution occurred.');
        logTelegramCallback({ userId, chatId, callbackData, handler: handlerName, durationMs: Date.now() - startTime, success: false, reason });
        return { handled: true, callback: callbackData, handler: handlerName, success: false, reason };
      }

      if (isConfirm) {
        await safeAnswerCallback('Processing execution request...');
        const execRes = await executeApprovedDecision(decisionId);
        if (execRes.success) {
          await safeEditMessageText(`🎉 *Application Submitted Successfully!*\n\n📌 *${identity.title}*\nExecution Status: \`EXECUTED\`\n\n🔒 *Persisted Execution Record Saved.*`);
          success = true;
        } else {
          reason = execRes.reason || 'EXECUTION_BLOCKED';
          await safeEditMessageText(`⚠️ *Application Not Submitted*\n\n📌 *${identity.title}*\nReason: \`${reason}\`\n\n🔒 *Execution Gateway Blocked Application.*`);
        }
      } else {
        await safeAnswerCallback('Execution Cancelled');
        await safeEditMessageText(`❌ *Execution Cancelled*\n\n📌 *${identity.title}*\nNo Playwright execution occurred.`);
        success = true;
      }
    }
    // 9. Operational Incident Control Handlers (incident_)
    else if (callbackData.startsWith('incident_')) {
      handled = true;
      handlerName = 'Operational Incident Handler';
      const {
        getCareerOSIncidents,
        acknowledgeCareerOSIncident,
        resolveCareerOSIncident,
        suppressCareerOSIncident
      } = require('../intelligence/career.os.incident');

      let action = 'review';
      let incidentId = '';

      if (callbackData.startsWith('incident_ack_')) {
        action = 'ack';
        incidentId = callbackData.replace('incident_ack_', '').trim();
      } else if (callbackData.startsWith('incident_resolve_')) {
        action = 'resolve';
        incidentId = callbackData.replace('incident_resolve_', '').trim();
      } else if (callbackData.startsWith('incident_suppress_')) {
        action = 'suppress';
        incidentId = callbackData.replace('incident_suppress_', '').trim();
      } else if (callbackData.startsWith('incident_review_')) {
        action = 'review';
        incidentId = callbackData.replace('incident_review_', '').trim();
      } else {
        incidentId = callbackData.replace('incident_', '').trim();
      }

      const incidents = getCareerOSIncidents();
      const target = incidents.find((i) => i.incidentId === incidentId);

      if (!target) {
        reason = 'INCIDENT_NOT_FOUND';
        await safeAnswerCallback('⚠️ Incident ID could not be found.', true);
        await safeEditMessageText('⚠️ *Incident ID could not be found.*\n\nNo operational state was changed.');
        logTelegramCallback({ userId, chatId, callbackData, handler: handlerName, durationMs: Date.now() - startTime, success: false, reason });
        return { handled: true, callback: callbackData, handler: handlerName, success: false, reason };
      }

      if (action === 'ack') {
        acknowledgeCareerOSIncident(incidentId);
        await safeAnswerCallback('Incident Acknowledged');
        await safeEditMessageText(`✅ *Incident Acknowledged*\n\n📌 *ID:* \`${incidentId}\`\nTitle: ${target.title}\nStatus: \`ACKNOWLEDGED\``);
      } else if (action === 'resolve') {
        resolveCareerOSIncident(incidentId, 'Resolved via Telegram Operator Button');
        await safeAnswerCallback('Incident Resolved');
        await safeEditMessageText(`🛠️ *Incident Resolved*\n\n📌 *ID:* \`${incidentId}\`\nTitle: ${target.title}\nStatus: \`RESOLVED\``);
      } else if (action === 'suppress') {
        suppressCareerOSIncident(incidentId);
        await safeAnswerCallback('Incident Notifications Suppressed');
        await safeEditMessageText(`🔕 *Incident Notifications Suppressed*\n\n📌 *ID:* \`${incidentId}\`\nTitle: ${target.title}\nStatus: \`SUPPRESSED\``);
      } else {
        await safeAnswerCallback('Incident Operational Details');
        await safeEditMessageText(`📋 *Operational Incident Details*\n\n📌 *ID:* \`${incidentId}\`\nTitle: ${target.title}\nSeverity: \`${target.severity}\` | Status: \`${target.status}\`\nComponent: \`${target.affectedComponent}\`\nOccurrences: \`${target.occurrenceCount}\`\n\nRecommended Action:\n${target.recommendedAction || 'Inspect system health.'}`);
      }
      success = true;
    }
    // 10. Operational Incident Response Control Handlers (incident_response_)
    else if (callbackData.startsWith('incident_response_')) {
      handled = true;
      handlerName = 'Operational Incident Response Handler';
      const {
        getIncidentResponseStatus,
        executeIncidentResponsePlan,
        verifyIncidentRecovery,
        finalizeIncidentResponse
      } = require('../intelligence/career.os.response.orchestrator');

      let action = 'review';
      let responseId = '';

      if (callbackData.startsWith('incident_response_confirm_')) {
        action = 'confirm';
        responseId = callbackData.replace('incident_response_confirm_', '').trim();
      } else if (callbackData.startsWith('incident_response_verify_')) {
        action = 'verify';
        responseId = callbackData.replace('incident_response_verify_', '').trim();
      } else if (callbackData.startsWith('incident_response_cancel_')) {
        action = 'cancel';
        responseId = callbackData.replace('incident_response_cancel_', '').trim();
      } else if (callbackData.startsWith('incident_response_review_')) {
        action = 'review';
        responseId = callbackData.replace('incident_response_review_', '').trim();
      } else {
        responseId = callbackData.replace('incident_response_', '').trim();
      }

      const plan = getIncidentResponseStatus(responseId);

      if (!plan) {
        reason = 'RESPONSE_PLAN_NOT_FOUND';
        await safeAnswerCallback('⚠️ Response Plan ID could not be found.', true);
        await safeEditMessageText('⚠️ *Response Plan ID could not be found.*\n\nNo operational state was changed.');
        logTelegramCallback({ userId, chatId, callbackData, handler: handlerName, durationMs: Date.now() - startTime, success: false, reason });
        return { handled: true, callback: callbackData, handler: handlerName, success: false, reason };
      }

      if (action === 'confirm') {
        await safeAnswerCallback('Executing Response Plan...');
        const execRes = await executeIncidentResponsePlan(responseId);
        if (execRes.success) {
          await safeEditMessageText(`⚡ *Response Plan Executed Successfully*\n\n📌 *ID:* \`${responseId}\`\nType: \`${plan.responseType}\`\nStatus: \`${execRes.plan.responseStatus}\`\n\nNext Step: Run recovery verification.`);
          success = true;
        } else {
          reason = execRes.reason;
          await safeEditMessageText(`⚠️ *Response Plan Execution Blocked*\n\n📌 *ID:* \`${responseId}\`\nReason: \`${reason}\``);
        }
      } else if (action === 'verify') {
        await safeAnswerCallback('Verifying Recovery...');
        const verRes = verifyIncidentRecovery(responseId);
        if (verRes.verified) {
          finalizeIncidentResponse(responseId);
          await safeEditMessageText(`✅ *Recovery Verified & Incident Resolved*\n\n📌 *ID:* \`${responseId}\`\nVerification: \`PASSED\`\nStatus: \`RESOLVED\``);
          success = true;
        } else {
          reason = verRes.reason;
          await safeEditMessageText(`⚠️ *Recovery Verification Failed*\n\n📌 *ID:* \`${responseId}\`\nReason: \`${reason}\`\nIncident remains active.`);
        }
      } else if (action === 'cancel') {
        await safeAnswerCallback('Response Plan Cancelled');
        await safeEditMessageText(`❌ *Response Plan Cancelled*\n\n📌 *ID:* \`${responseId}\`\nNo infrastructure actions taken.`);
        success = true;
      } else {
        await safeAnswerCallback('Response Plan Details');
        await safeEditMessageText(`📋 *Response Plan Details*\n\n📌 *ID:* \`${responseId}\`\nType: \`${plan.responseType}\` | Anomaly: \`${plan.anomalyType}\`\nStatus: \`${plan.responseStatus}\`\nVerification: \`${plan.recoveryVerificationStatus}\``);
        success = true;
      }
    }
    // 9. Question Memory Callbacks (use_ans_, chg_ans_)
    else if (callbackData.startsWith('use_ans_') || callbackData.startsWith('chg_ans_')) {
      handled = true;
      handlerName = 'Question Memory Handler';
      if (callbackData.startsWith('use_ans_')) {
        await safeAnswerCallback('Using answer from memory');
        await safeEditMessageText('✅ *Using answer from question memory.*');
      } else {
        await safeAnswerCallback('Please reply with new answer');
        if (chatId) {
          await bot.sendMessage(chatId, 'Please type and send your new answer for this question.');
        }
      }
      success = true;
    }
    // 7. Unknown / Unhandled Callback Prefix
    else {
      handled = false;
      handlerName = 'Unknown Callback Router';
      reason = 'UNKNOWN_CALLBACK_PREFIX';
      await safeAnswerCallback('⚠️ Unrecognized command option.');
    }
  } catch (err) {
    reason = `EXCEPTION: ${err.message}`;
    console.error('Unhandled exception in dispatchCallback:', err);
    await safeAnswerCallback('⚠️ Error processing callback. Please try again.');
    logTelegramCallback({
      userId,
      chatId,
      callbackData,
      handler: handlerName,
      durationMs: Date.now() - startTime,
      success: false,
      reason,
      errorStack: err.stack
    });
    return { handled: false, callback: callbackData, success: false, reason };
  }

  const durationMs = Date.now() - startTime;
  logTelegramCallback({
    userId,
    chatId,
    callbackData,
    handler: handlerName,
    durationMs,
    success,
    reason
  });

  return {
    handled,
    callback: callbackData,
    handler: handlerName,
    success,
    reason
  };
}

module.exports = {
  dispatchCallback,
  logTelegramCallback,
  DEBUG_DIR
};

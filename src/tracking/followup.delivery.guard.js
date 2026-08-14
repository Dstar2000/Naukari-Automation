const path = require('path');
const fs = require('fs');
const { resolveApplicationIdentity } = require('./application.identity.resolver');
const { validateJobUrl, validateLiveJob } = require('../naukri/job.url.validator');
const { getTodayString } = require('../naukri/application.guard');

const DEBUG_DIR = path.resolve(__dirname, '../../debug');

function logFollowupDeliveryTrace(data) {
  try {
    if (!fs.existsSync(DEBUG_DIR)) {
      fs.mkdirSync(DEBUG_DIR, { recursive: true });
    }
    const today = getTodayString();
    const logFile = path.join(DEBUG_DIR, `followup-delivery-${today}.log`);
    const timestamp = new Date().toISOString();

    const logLine = `[${timestamp}] applicationId=${data.applicationId || 'N/A'} jobId=${data.jobId || 'N/A'} company="${data.company || ''}" role="${data.role || ''}" originalUrl="${data.originalUrl || ''}" finalUrl="${data.finalUrl || ''}" validationStatus=${data.validationStatus} validationReason="${data.validationReason || ''}" deliveryAllowed=${data.deliveryAllowed} telegramSent=${data.telegramSent}\n`;

    fs.appendFileSync(logFile, logLine, 'utf-8');
  } catch (err) {
    console.error('Failed to write followup delivery log:', err.message);
  }
}

/**
 * Hard Delivery Guard: Authoritative final gate immediately before Telegram send.
 * Requires identity resolution, URL structure validation, and live Playwright verification.
 * Rejects every status except strictly LIVE.
 * @param {Object} app 
 * @param {Object} [options]
 * @returns {Promise<{ allowed: boolean, verifiedUrl: string|null, validation: Object, reason?: string }>}
 */
async function authorizeFollowupDelivery(app, options = {}) {
  if (!app || typeof app !== 'object') {
    return {
      allowed: false,
      verifiedUrl: null,
      validation: { status: 'INVALID_APPLICATION' },
      reason: 'INVALID_APPLICATION_OBJECT'
    };
  }

  const idToResolve = app.applicationId || app.jobId || app.jobUrl;

  // Check 1 — Application Identity Resolution
  const identity = resolveApplicationIdentity(idToResolve);
  if (!identity.resolved) {
    const reason = identity.reason || 'APPLICATION_NOT_RESOLVED';
    logFollowupDeliveryTrace({
      applicationId: app.applicationId,
      jobId: app.jobId,
      company: app.company,
      role: app.role,
      originalUrl: app.jobUrl,
      finalUrl: '',
      validationStatus: 'IDENTITY_UNRESOLVED',
      validationReason: reason,
      deliveryAllowed: false,
      telegramSent: false
    });
    return {
      allowed: false,
      verifiedUrl: null,
      validation: { status: 'IDENTITY_UNRESOLVED' },
      reason
    };
  }

  // Check 2 & Check 3 — Strict Job URL Format
  const targetUrl = identity.jobUrl || app.jobUrl;
  const urlCheck = validateJobUrl(targetUrl);
  if (!urlCheck.valid) {
    const reason = urlCheck.reason || 'INVALID_JOB_URL';
    logFollowupDeliveryTrace({
      applicationId: identity.applicationId,
      jobId: identity.jobId,
      company: identity.company,
      role: identity.role,
      originalUrl: targetUrl,
      finalUrl: '',
      validationStatus: 'INVALID_URL',
      validationReason: reason,
      deliveryAllowed: false,
      telegramSent: false
    });
    return {
      allowed: false,
      verifiedUrl: null,
      validation: { status: 'INVALID_URL' },
      reason
    };
  }

  // Check 4 — LIVE Playwright Verification (Fail-Closed, Bypass Cache)
  const validation = await validateLiveJob(
    {
      applicationId: identity.applicationId,
      jobId: identity.jobId,
      company: identity.company || app.company,
      role: identity.role || app.role,
      jobUrl: targetUrl
    },
    {
      forceLiveCheck: true,
      bypassCache: true,
      mockStatus: options.mockStatus
    }
  );

  const isAllowed = validation.status === 'LIVE';
  const verifiedUrl = isAllowed ? targetUrl : null;

  logFollowupDeliveryTrace({
    applicationId: identity.applicationId,
    jobId: identity.jobId,
    company: identity.company || app.company,
    role: identity.role || app.role,
    originalUrl: targetUrl,
    finalUrl: validation.finalUrl || '',
    validationStatus: validation.status,
    validationReason: validation.reason,
    deliveryAllowed: isAllowed,
    telegramSent: false
  });

  return {
    allowed: isAllowed,
    verifiedUrl,
    validation,
    reason: validation.reason
  };
}

module.exports = {
  authorizeFollowupDelivery,
  logFollowupDeliveryTrace
};

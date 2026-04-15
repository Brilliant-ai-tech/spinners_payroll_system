'use strict';

// ═══════════════════════════════════════════════════════════════════
// PARTICLES BACKGROUND
// ═══════════════════════════════════════════════════════════════════
(function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const particles = [];
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2.5 + 0.5,
      color: Math.random() > 0.5 ? 'rgba(245,158,11,' : 'rgba(6,182,212,',
      opacity: Math.random() * 0.5 + 0.1,
      dx: (Math.random() - 0.5) * 0.4,
      dy: -Math.random() * 0.6 - 0.1,
    });
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + p.opacity + ')';
      ctx.fill();
      p.x += p.dx;
      p.y += p.dy;
      if (p.y < -5) { p.y = canvas.height + 5; p.x = Math.random() * canvas.width; }
      if (p.x < -5 || p.x > canvas.width + 5) p.dx *= -1;
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════
let _loginState = { userId: null, email: null, mustChangePw: false, tempToken: null, forgotUserId: null, forgotTempToken: null };
let _otpTimerInterval = null;
let _resendCdInterval = null;

// ═══════════════════════════════════════════════════════════════════
// STEP MANAGEMENT
// ═══════════════════════════════════════════════════════════════════
function showLoginStep(step) {
  ['login-step-1','login-step-2','login-step-3','login-forgot','login-signup'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const targets = { 1: 'login-step-1', 2: 'login-step-2', 3: 'login-step-3', forgot: 'login-forgot', signup: 'login-signup' };
  const show = document.getElementById(targets[step]);
  if (show) show.style.display = '';
  // Update step dots
  [1,2,3].forEach(i => {
    const dot = document.getElementById('step-dot-' + i);
    const conn = document.getElementById('step-conn-' + i);
    if (!dot) return;
    dot.className = 'step-item';
    if (typeof step === 'number') {
      if (i < step) { dot.className = 'step-item done'; dot.querySelector('.step-circle').textContent = '✓'; }
      else if (i === step) { dot.className = 'step-item active'; }
    }
    if (conn) {
      const fill = conn.querySelector('.connector-fill');
      if (typeof step === 'number' && i < step) { conn.classList.add('done'); if (fill) fill.style.width='100%'; }
      else { conn.classList.remove('done'); if (fill) fill.style.width='0'; }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// STEP 1: LOGIN
// ═══════════════════════════════════════════════════════════════════
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = 'Please enter your email and password.'; errEl.style.display=''; return; }
  btn.classList.add('btn-loading'); btn.disabled = true;
  try {
    const data = await API.request('POST', '/api/auth/login', { email, password }, '');
    if (!data) return;
    if (data.step === 3) {
      _loginState.userId = data.userId;
      _loginState.tempToken = data.tempToken;
      showLoginStep(3);
      return;
    }
    if (data.step === 'dashboard') {
      Auth.save(data.token, data.user);
      return bootApp(data.user);
    }
  } catch (e) {
    console.error('Login error:', e);
    let errorMsg = 'Login failed. Please try again.';
    if (e.message === 'Failed to fetch') {
      errorMsg = 'Cannot connect to server. Make sure the server is running on http://localhost:3001';
    } else if (e.message) {
      errorMsg = e.message;
    }
    errEl.textContent = errorMsg;
    errEl.style.display = '';
    document.getElementById('login-password').classList.add('error');
    setTimeout(() => document.getElementById('login-password').classList.remove('error'), 600);
  } finally {
    btn.classList.remove('btn-loading'); btn.disabled = false;
  }
}
document.getElementById('login-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

function initOTPBoxes(containerId, onComplete) {
  const boxes = document.querySelectorAll(`#${containerId} .otp-box`);
  boxes.forEach((box, i) => {
    box.value = '';
    box.className = 'otp-box';
    box.addEventListener('input', e => {
      const v = e.target.value.replace(/\D/g, '');
      box.value = v.slice(-1);
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
      if (i === boxes.length - 1 && typeof onComplete === 'function') {
        const otp = Array.from(boxes).map(b => b.value).join('');
        if (otp.length === boxes.length) setTimeout(onComplete, 200);
      }
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !box.value && i > 0) boxes[i - 1].focus();
    });
    box.addEventListener('paste', e => {
      e.preventDefault();
      const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, boxes.length);
      paste.split('').forEach((ch, j) => { if (boxes[j]) { boxes[j].value = ch; boxes[j].classList.add('filled'); } });
      if (paste.length === boxes.length && typeof onComplete === 'function') setTimeout(onComplete, 200);
    });
  });
  boxes[0]?.focus();
}

function getOTPValue(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} .otp-box`)).map(b => b.value).join('');
}

function shakeOTPBoxes(containerId) {
  const boxes = document.querySelectorAll(`#${containerId} .otp-box`);
  boxes.forEach(b => { b.classList.add('error'); b.value = ''; b.classList.remove('filled'); });
  setTimeout(() => boxes.forEach(b => b.classList.remove('error')), 600);
  boxes[0]?.focus();
}

// ═══════════════════════════════════════════════════════════════════
// STEP 3: CHANGE PASSWORD
// ═══════════════════════════════════════════════════════════════════
function checkPwStrength(pw) {
  const checks = {
    length:  pw.length >= 8,
    upper:   /[A-Z]/.test(pw),
    digit:   /[0-9]/.test(pw),
    special: /[!@#$%^&*()_+\-=\[\]{}|;:',.<>?/\\`~"]/.test(pw),
  };
  const met = Object.values(checks).filter(Boolean).length;
  const bar = document.getElementById('pw-bar');
  const label = document.getElementById('pw-label');
  if (bar) {
    const pct = (met / 4) * 100;
    bar.style.width = pct + '%';
    const colors = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4'];
    bar.style.background = colors[met - 1] || '#EF4444';
  }
  const labels = ['', 'Very weak', 'Weak', 'Fair', 'Strong'];
  if (label) { label.textContent = labels[met] || ''; label.style.color = met >= 3 ? 'var(--green)' : 'var(--text-muted)'; }
  document.querySelectorAll('#pw-checklist .pw-check-item').forEach(li => {
    const key = li.dataset.check;
    if (checks[key]) li.classList.add('met'); else li.classList.remove('met');
  });
  return met === 4;
}

async function doChangePassword() {
  const pw = document.getElementById('new-password').value;
  const pw2 = document.getElementById('confirm-password').value;
  const errEl = document.getElementById('pw-error');
  errEl.style.display = 'none';
  if (!checkPwStrength(pw)) { errEl.textContent = 'Password does not meet all requirements.'; errEl.style.display = ''; return; }
  if (pw !== pw2) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = ''; return; }
  const btn = document.getElementById('changepw-btn');
  btn.classList.add('btn-loading'); btn.disabled = true;
  try {
    const data = await API.request('POST', '/api/auth/change-password', { newPassword: pw }, _loginState.tempToken);
    if (!data) return;
    Auth.save(data.token, data.user);
    toast('success', 'Password set!', 'Welcome to Spinners Payroll.');
    setTimeout(() => bootApp(data.user), 600);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = '';
  } finally {
    btn.classList.remove('btn-loading'); btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// FORGOT PASSWORD
// ═══════════════════════════════════════════════════════════════════
function showForgot() { showLoginStep('forgot'); }
function cancelForgot() { showLoginStep(1); ['forgot-step-2-inner','forgot-step-3-inner'].forEach(id => document.getElementById(id).style.display = 'none'); document.getElementById('forgot-step-1-inner').style.display = ''; }

async function loadSignupOptions() {
  try {
    const [depts, desigs] = await Promise.all([
      API.request('GET', '/api/public/departments', null, ''),
      API.request('GET', '/api/public/designations', null, '')
    ]);
    const deptSel = document.getElementById('signup-dept');
    const desigSel = document.getElementById('signup-desig');
    if (deptSel) {
      deptSel.innerHTML = '<option value="">Select department</option>' + (depts || []).map(d => `<option value="${d.dept_id}">${d.dept_name}</option>`).join('');
    }
    if (desigSel) {
      desigSel.innerHTML = '<option value="">Select designation</option>' + (desigs || []).map(d => `<option value="${d.desig_id}">${d.desig_name}</option>`).join('');
    }
  } catch (e) {
    const errEl = document.getElementById('signup-error');
    if (errEl) {
      errEl.textContent = e.message || 'Failed to load signup options.';
      errEl.style.display = '';
    }
  }
}

function clearSignupForm() {
  [
    'signup-first-name', 'signup-middle-name', 'signup-last-name', 'signup-email', 'signup-phone',
    'signup-national-id', 'signup-kra-pin', 'signup-nssf', 'signup-nhif', 'signup-gender',
    'signup-marital', 'signup-dob', 'signup-hire-date', 'signup-dept', 'signup-desig',
    'signup-employment-type', 'signup-password', 'signup-confirm-password'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const errEl = document.getElementById('signup-error');
  if (errEl) errEl.style.display = 'none';
}

async function showSignup() {
  clearSignupForm();
  document.getElementById('signup-hire-date').value = new Date().toISOString().split('T')[0];
  showLoginStep('signup');
  await loadSignupOptions();
}

function cancelSignup() {
  clearSignupForm();
  showLoginStep(1);
}

async function doEmployeeSignup() {
  const errEl = document.getElementById('signup-error');
  const btn = document.getElementById('signup-btn');
  const password = document.getElementById('signup-password').value;
  const confirmPassword = document.getElementById('signup-confirm-password').value;
  const payload = {
    first_name: document.getElementById('signup-first-name').value.trim(),
    middle_name: document.getElementById('signup-middle-name').value.trim(),
    last_name: document.getElementById('signup-last-name').value.trim(),
    email: document.getElementById('signup-email').value.trim(),
    phone_primary: document.getElementById('signup-phone').value.trim(),
    national_id: document.getElementById('signup-national-id').value.trim(),
    kra_pin: document.getElementById('signup-kra-pin').value.trim(),
    nssf_number: document.getElementById('signup-nssf').value.trim(),
    nhif_number: document.getElementById('signup-nhif').value.trim(),
    gender: document.getElementById('signup-gender').value,
    marital_status: document.getElementById('signup-marital').value,
    date_of_birth: document.getElementById('signup-dob').value,
    hire_date: document.getElementById('signup-hire-date').value,
    dept_id: document.getElementById('signup-dept').value,
    desig_id: document.getElementById('signup-desig').value,
    employment_type: document.getElementById('signup-employment-type').value,
    password
  };

  errEl.style.display = 'none';
  if (!payload.first_name || !payload.last_name || !payload.email || !payload.phone_primary || !payload.national_id || !payload.gender || !payload.hire_date || !payload.dept_id || !payload.desig_id || !password) {
    errEl.textContent = 'Please fill in all required fields.';
    errEl.style.display = '';
    return;
  }
  if (password !== confirmPassword) {
    errEl.textContent = 'Passwords do not match.';
    errEl.style.display = '';
    return;
  }

  btn.classList.add('btn-loading');
  btn.disabled = true;
  try {
    await API.request('POST', '/api/auth/signup-employee', payload, '');
    toast('success', 'Signup submitted', 'Your details were sent to HR for approval.');
    document.getElementById('login-email').value = payload.email;
    cancelSignup();
  } catch (e) {
    errEl.textContent = e.message || 'Signup failed.';
    errEl.style.display = '';
  } finally {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

async function doForgotRequest() {
  const email = document.getElementById('forgot-email').value.trim();
  const errEl = document.getElementById('forgot-error');
  errEl.style.display = 'none';
  if (!email) { errEl.textContent = 'Please enter your email.'; errEl.style.display = ''; return; }
  try {
    const data = await API.request('POST', '/api/auth/forgot-password', { email }, '');
    _loginState.forgotUserId = data.userId;
    document.getElementById('forgot-step-1-inner').style.display = 'none';
    document.getElementById('forgot-step-2-inner').style.display = '';
    initOTPBoxes('forgot-otp-boxes', doForgotVerify);
    toast('info', 'Code sent', 'Check your email for the reset code.');
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = '';
  }
}

async function doForgotVerify() {
  const otp = getOTPValue('forgot-otp-boxes');
  if (otp.length < 6) return;
  const errEl = document.getElementById('forgot-error');
  errEl.style.display = 'none';
  try {
    const data = await API.request('POST', '/api/auth/verify-reset-otp', { userId: _loginState.forgotUserId, otp }, '');
    _loginState.forgotTempToken = data.tempToken;
    document.querySelectorAll('#forgot-otp-boxes .otp-box').forEach(b => b.classList.add('success'));
    setTimeout(() => {
      document.getElementById('forgot-step-2-inner').style.display = 'none';
      document.getElementById('forgot-step-3-inner').style.display = '';
    }, 800);
  } catch (e) {
    shakeOTPBoxes('forgot-otp-boxes');
    errEl.textContent = e.message;
    errEl.style.display = '';
  }
}

async function doForgotReset() {
  const pw = document.getElementById('forgot-new-pw').value;
  const pw2 = document.getElementById('forgot-confirm-pw').value;
  const errEl = document.getElementById('forgot-error');
  errEl.style.display = 'none';
  if (pw !== pw2) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = ''; return; }
  try {
    const data = await API.request('POST', '/api/auth/change-password', { newPassword: pw }, _loginState.forgotTempToken);
    Auth.save(data.token, data.user);
    toast('success', 'Password reset!', 'You are now logged in.');
    setTimeout(() => bootApp(data.user), 600);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = '';
  }
}

// Init step 1 on load
showLoginStep(1);

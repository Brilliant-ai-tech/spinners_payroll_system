'use strict';

// ═══════════════════════════════════════════════════════════════════
// API HELPER
// ═══════════════════════════════════════════════════════════════════
const API = {
  async request(method, url, body, token) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    const t = token || Auth.getToken();
    if (t) opts.headers['Authorization'] = `Bearer ${t}`;
    if (body) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(url, opts);
      const data = await res.json();
      if (res.status === 401 && t) { Auth.logout(); return; }
      if (res.status === 403 && t) { toast('error', 'Access denied', 'You do not have permission to perform this action.'); return; }
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    } catch (e) {
      if (e instanceof TypeError && e.message === 'Failed to fetch') {
        throw new Error('Failed to fetch: Cannot connect to server. Is the server running?');
      }
      throw e;
    }
  },
  get:    (url)       => API.request('GET',    '/api' + url),
  post:   (url, body) => API.request('POST',   '/api' + url, body),
  put:    (url, body) => API.request('PUT',    '/api' + url, body),
  patch:  (url, body) => API.request('PATCH',  '/api' + url, body),
  delete: (url)       => API.request('DELETE', '/api' + url),
};

// ═══════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════
const Auth = {
  getToken()  { return localStorage.getItem('sp_token'); },
  getUser()   { try { return JSON.parse(localStorage.getItem('sp_user')) || {}; } catch { return {}; } },
  isLoggedIn(){ return !!this.getToken(); },
  save(token, user) {
    localStorage.setItem('sp_token', token);
    localStorage.setItem('sp_user', JSON.stringify(user));
  },
  logout() {
    localStorage.removeItem('sp_token');
    localStorage.removeItem('sp_user');
    location.reload();
  },
  hasPermission(perm) {
    const u = this.getUser();
    const perms = u.permissions || [];
    return perms.includes(perm);
  }
};

// ═══════════════════════════════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════════════════════════════
function fmt(n, dp = 2) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-KE', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function timeAgo(d) {
  if (!d) return '';
  const diff = (Date.now() - new Date(d)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}
function statusBadge(status) {
  const s = (status || '').toLowerCase().replace(/\s+/g, '-');
  const icons = { active:'●', paid:'●', approved:'●', pending:'◐', rejected:'●', terminated:'●', draft:'○', processing:'◌', open:'●', 'under-review':'◐', review:'◐', contract:'◆' };
  const icon = icons[s] || '●';
  return `<span class="badge badge-${s}"><span class="badge-dot"></span>${status}</span>`;
}
function empBadge(status) { return statusBadge(status); }

// ═══════════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════
function toast(type = 'info', title = '', message = '', duration = 4000) {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.style.setProperty('--toast-duration', duration + 'ms');
  el.innerHTML = `
    <div class="toast-header">
      <span class="toast-icon">${icons[type]}</span>
      <span class="toast-title">${title}</span>
      <button class="toast-close" onclick="this.closest('.toast').remove()">×</button>
    </div>
    ${message ? `<div class="toast-body">${message}</div>` : ''}
    <div class="toast-progress"></div>
  `;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), duration + 400);
}

// ═══════════════════════════════════════════════════════════════════
// MODAL HELPERS
// ═══════════════════════════════════════════════════════════════════
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  if (!id) {
    closeDynamicModal();
    return;
  }
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}
function showDynamicModal(content) {
  const modal = document.getElementById('modal');
  if (!modal) return;
  modal.innerHTML = content;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closeDynamicModal() {
  const modal = document.getElementById('modal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.innerHTML = '';
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop.open').forEach(m => {
      m.classList.remove('open');
      document.body.style.overflow = '';
    });
    closeDynamicModal();
  }
});

// ═══════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════
const PAGE_TITLES = {
  dashboard: 'Dashboard', employees: 'Employee Management',
  attendance: 'Attendance', leave: 'Leave Management',
  overtime: 'Overtime', payroll: 'Payroll Processing',
  reports: 'Reports', settings: 'Settings', selfservice: 'My Portal'
};

const PAGE_INITS = {
  dashboard:   () => initDashboard(),
  employees:   () => initEmployees(),
  attendance:  () => initAttendance(),
  leave:       () => initLeave(),
  overtime:    () => initOvertime(),
  payroll:     () => initPayroll(),
  reports:     () => initReports(),
  settings:    () => initSettings(),
  selfservice: () => initSelfservice()
};

const PAGE_ACCESS = {
  dashboard:   () => true,
  employees:   () => Auth.hasPermission('employees.view'),
  attendance:  () => Auth.hasPermission('attendance.view'),
  leave:       () => Auth.getUser().role === 'EMPLOYEE' || Auth.hasPermission('leave.view') || Auth.hasPermission('leave.apply'),
  overtime:    () => Auth.getUser().role === 'EMPLOYEE' || Auth.hasPermission('overtime.view') || Auth.hasPermission('overtime.submit'),
  payroll:     () => Auth.hasPermission('payroll.view'),
  reports:     () => ['reports.payroll', 'reports.statutory', 'reports.p9', 'reports.audit'].some(p => Auth.hasPermission(p)),
  settings:    () => Auth.hasPermission('admin.settings'),
  selfservice: () => Auth.getUser().role === 'EMPLOYEE'
};

const _initialized = new Set();

function navigate(page) {
  if (PAGE_ACCESS[page] && !PAGE_ACCESS[page]()) {
    toast('error', 'Access denied', 'You do not have permission to open this page.');
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const p = document.getElementById('page-' + page);
  if (p) { p.classList.add('active'); }
  const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (nav) nav.classList.add('active');
  const title = PAGE_TITLES[page] || page;
  document.getElementById('topbar-title').textContent = title;
  const alwaysRefreshPages = new Set(['selfservice', 'overtime']);
  if (PAGE_INITS[page] && (alwaysRefreshPages.has(page) || !_initialized.has(page))) {
    PAGE_INITS[page]();
    _initialized.add(page);
  }
  if (window.innerWidth < 768) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ═══════════════════════════════════════════════════════════════════
// TABLE BUILDER
// ═══════════════════════════════════════════════════════════════════
function buildTable(tbodyId, rows, cols) {
  const tbody = document.getElementById(tbodyId);
  if (!rows || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center;color:var(--text-muted);padding:40px">No data found</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(row =>
    `<tr>${cols.map(c => {
      const val = typeof c.render === 'function' ? c.render(row[c.key], row) : (row[c.key] ?? '—');
      const cls = c.class || '';
      return `<td class="${cls}">${val}</td>`;
    }).join('')}</tr>`
  ).join('');
}

function buildSkeletonRows(tbodyId, cols, count = 5) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = Array(count).fill(0).map(() =>
    `<tr>${Array(cols).fill(0).map(() => `<td><div class="skeleton skeleton-text" style="width:${60+Math.random()*30}%"></div></td>`).join('')}</tr>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════════
// CSV EXPORT
// ═══════════════════════════════════════════════════════════════════
function downloadCSV(filename, data) {
  if (!data || !data.length) return toast('warning', 'No data', 'Nothing to export.');
  const keys = Object.keys(data[0]);
  const csv = [keys.join(','), ...data.map(row => keys.map(k => `"${(row[k] ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = filename;
  a.click();
}

// ═══════════════════════════════════════════════════════════════════
// DEBOUNCE
// ═══════════════════════════════════════════════════════════════════
function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ═══════════════════════════════════════════════════════════════════
// COUNT-UP ANIMATION
// ═══════════════════════════════════════════════════════════════════
function animateCount(el, target, prefix = '', suffix = '', duration = 1200, isCurrency = false) {
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const val = Math.round(target * ease);
    el.textContent = prefix + (isCurrency ? fmt(val, 0) : val.toLocaleString()) + suffix;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ═══════════════════════════════════════════════════════════════════
// PASSWORD TOGGLE
// ═══════════════════════════════════════════════════════════════════
function togglePw(inputId, btn) {
  const inp = document.getElementById(inputId);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

// ═══════════════════════════════════════════════════════════════════
// CLOCK
// ═══════════════════════════════════════════════════════════════════
function startClock() {
  const el = document.getElementById('topbar-clock');
  if (!el) return;
  setInterval(() => {
    el.textContent = new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, 1000);
}

// ═══════════════════════════════════════════════════════════════════
// SIDEBAR BUILDER
// ═══════════════════════════════════════════════════════════════════
function buildSidebar(role) {
  const items = [];
  if (role === 'EMPLOYEE') {
    items.push({ page: 'selfservice', icon: '👤', label: 'My Portal' });
    items.push({ page: 'leave',       icon: '🏖', label: 'Leave' });
    items.push({ page: 'overtime',    icon: '⏰', label: 'Overtime' });
  } else {
    items.push({ section: 'Main' });
    items.push({ page: 'dashboard',  icon: '📊', label: 'Dashboard' });
    items.push({ page: 'employees',  icon: '👥', label: 'Employees',  perm: 'employees.view' });
    items.push({ section: 'Operations' });
    items.push({ page: 'attendance', icon: '📋', label: 'Attendance', perm: 'attendance.view' });
    items.push({ page: 'leave',      icon: '🏖',  label: 'Leave',      perm: 'leave.view' });
    items.push({ page: 'payroll',    icon: '💰', label: 'Payroll',    perm: 'payroll.view' });
    items.push({ section: 'Reports & Admin' });
    items.push({ page: 'reports',   icon: '📈', label: 'Reports',    perm: ['reports.view', 'reports.payroll', 'reports.statutory', 'reports.p9', 'reports.audit'] });
    items.push({ page: 'settings',  icon: '⚙',  label: 'Settings',   perm: 'admin.settings', roles: ['ADMIN', 'HR'] });
  }
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = items.map(it => {
    if (it.section) return `<div class="nav-section"><div class="nav-section-label">${it.section}</div></div>`;
    if (it.roles && !it.roles.includes(role)) return '';
    if (it.perm) {
      const perms = Array.isArray(it.perm) ? it.perm : [it.perm];
      if (!perms.some(perm => Auth.hasPermission(perm))) return '';
    }
    return `<div class="nav-item" data-page="${it.page}" onclick="navigate('${it.page}')">
      <span class="nav-icon">${it.icon}</span>
      <span class="nav-label">${it.label}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════
// APP BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════
function bootApp(user) {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  const initials = (user.username || 'U').substring(0, 2).toUpperCase();
  document.getElementById('sidebar-avatar').textContent = initials;
  document.getElementById('topbar-avatar').textContent = initials;
  document.getElementById('sidebar-username').textContent = user.username || user.email;
  document.getElementById('sidebar-role').textContent = user.role;
  document.getElementById('topbar-username').textContent = user.username || user.email;
  const rb = document.getElementById('topbar-role-badge');
  rb.textContent = user.role;
  rb.className = `role-badge ${user.role}`;
  buildSidebar(user.role);
  startClock();
  const startPage = user.role === 'EMPLOYEE' ? 'selfservice' : 'dashboard';
  navigate(startPage);
  _initialized.add(startPage);
  if (startPage === 'dashboard') initDashboard();
  if (startPage === 'selfservice') initSelfservice();
}

window.addEventListener('DOMContentLoaded', () => {
  if (Auth.isLoggedIn()) {
    bootApp(Auth.getUser());
  }
});

// Sparkline helper
function makeSparkline(data, color = '#F59E0B') {
  if (!data || data.length < 2) return '';
  const vals = data.map(d => Number(d.total_net || d.count || d || 0));
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const w = 100, h = 32;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:100%">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
  </svg>`;
}

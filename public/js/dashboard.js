'use strict';

async function initDashboard() {
  try {
    const data = await API.get('/dashboard/stats');
    if (!data) return;
    renderKPIs(data);
    renderQuickActions();
    renderRecentPeriods(data.recentPeriods);
    renderDepartments(data.departments);
    renderActivity(data.activity);
  } catch (e) {
    toast('error', 'Dashboard error', e.message);
  }
}

function renderKPIs(data) {
  const { kpis, payTrend } = data;
  const empTrend = kpis.employees.current >= kpis.employees.previous ? 'up' : 'down';
  const payTrendDir = kpis.lastPayroll.amount >= kpis.lastPayroll.previous ? 'up' : 'down';

  const cards = [
    {
      id: 'kpi-emp', color: 'gold', icon: '👥',
      value: kpis.employees.current, label: 'Active employees',
      sub: 'As of today', trend: empTrend,
      trendVal: Math.abs(kpis.employees.current - kpis.employees.previous),
      isCurrency: false, sparkData: payTrend, page: 'employees', sparkColor: '#F59E0B'
    },
    {
      id: 'kpi-pay', color: 'teal', icon: '💰',
      value: kpis.lastPayroll.amount, label: 'Last net payroll',
      sub: kpis.lastPayroll.period, trend: payTrendDir,
      trendVal: Math.abs(kpis.lastPayroll.amount - kpis.lastPayroll.previous),
      isCurrency: true, sparkData: payTrend, page: 'payroll', sparkColor: '#06B6D4'
    },
    {
      id: 'kpi-leave', color: 'orange', icon: '🏖',
      value: kpis.pendingLeave, label: 'Pending leave',
      sub: 'Awaiting approval', trend: kpis.pendingLeave > 0 ? 'up' : 'down',
      trendVal: kpis.pendingLeave, isCurrency: false, sparkData: null, page: 'leave', sparkColor: '#F97316'
    },
    {
      id: 'kpi-ot', color: 'blue', icon: '⏰',
      value: kpis.pendingOvertime, label: 'Pending overtime',
      sub: 'Awaiting approval', trend: kpis.pendingOvertime > 0 ? 'up' : 'down',
      trendVal: kpis.pendingOvertime, isCurrency: false, sparkData: null, page: 'attendance', sparkColor: '#3B82F6'
    }
  ];

  const grid = document.getElementById('kpi-grid');
  grid.innerHTML = cards.map((c, i) => `
    <div class="card card-${c.color} kpi-card" style="animation-delay:${(i+1)*0.1}s;cursor:pointer" onclick="navigate('${c.page}')">
      <div class="kpi-top">
        <div class="kpi-icon kpi-icon-${c.color}"><span>${c.icon}</span></div>
        <div class="kpi-trend ${c.trend}">
          ${c.trend === 'up' ? '↑' : '↓'} ${c.isCurrency ? 'KES ' + fmt(c.trendVal, 0) : c.trendVal}
        </div>
      </div>
      <div class="kpi-value" id="${c.id}-val" style="color:var(--${c.color === 'orange' ? 'orange' : c.color})">
        ${c.isCurrency ? 'KES 0' : '0'}
      </div>
      <div class="kpi-label">${c.label}</div>
      <div style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:8px">${c.sub}</div>
      <div class="kpi-sparkline">${c.sparkData ? makeSparkline(c.sparkData, c.sparkColor) : ''}</div>
    </div>
  `).join('');

  // Animate counts
  setTimeout(() => {
    cards.forEach(c => {
      const el = document.getElementById(c.id + '-val');
      if (!el) return;
      animateCount(el, c.value, c.isCurrency ? 'KES ' : '', '', 1200, c.isCurrency);
    });
  }, 100);
}

function renderQuickActions() {
  const user = Auth.getUser();
  const role = user.role;
  const actions = [
    { icon: '👤', label: 'Add employee', page: 'employees', action: () => { navigate('employees'); setTimeout(openAddEmployee, 300); }, perm: 'employees.create' },
    { icon: '💰', label: 'Run payroll',  page: 'payroll',   action: () => navigate('payroll'),  perm: 'payroll.process' },
    { icon: '📋', label: 'Attendance',   page: 'attendance', action: () => navigate('attendance'), perm: 'attendance.view' },
    { icon: '📈', label: 'Reports',      page: 'reports',    action: () => navigate('reports'),   perm: 'reports.payroll' },
  ];
  const visible = actions.filter(a => role === 'ADMIN' || Auth.hasPermission(a.perm));
  const el = document.getElementById('quick-actions');
  if (!el || !visible.length) return;
  el.innerHTML = visible.map((a, i) => `
    <div class="quick-action" onclick="(${a.action.toString()})()" style="animation:fadeInUp 0.4s ease ${i*0.08}s both">
      <div class="qa-icon">${a.icon}</div>
      <div class="qa-label">${a.label}</div>
    </div>
  `).join('');
}

function renderRecentPeriods(periods) {
  const el = document.getElementById('dash-periods-table');
  if (!el || !periods) return;
  if (!periods.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">💼</div><div class="empty-sub">No payroll periods yet</div></div>'; return; }
  el.innerHTML = `<table><thead><tr><th>Period</th><th>Status</th><th>Gross</th><th>Net pay</th><th>Pay date</th></tr></thead>
    <tbody>${periods.map(p => `<tr onclick="navigate('payroll')" style="cursor:pointer">
      <td class="font-bold">${p.period_name}</td>
      <td>${statusBadge(p.status)}</td>
      <td class="td-mono">KES ${fmt(p.total_gross, 0)}</td>
      <td class="td-mono" style="color:var(--gold-light)">KES ${fmt(p.total_net, 0)}</td>
      <td class="text-muted">${fmtDate(p.pay_date)}</td>
    </tr>`).join('')}</tbody></table>`;
}

function renderDepartments(depts) {
  const el = document.getElementById('dash-depts');
  if (!el || !depts) return;
  const max = Math.max(...depts.map(d => d.headcount), 1);
  el.innerHTML = depts.map((d, i) => `
    <div class="dept-bar">
      <div class="dept-name text-sm">${d.dept_name}</div>
      <div class="dept-bar-track">
        <div class="dept-bar-fill" style="width:0;transition:width 1s ease ${i*0.1}s" data-target="${(d.headcount/max)*100}%"></div>
      </div>
      <div class="dept-count">${d.headcount}</div>
    </div>
  `).join('');
  setTimeout(() => {
    document.querySelectorAll('.dept-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.target;
    });
  }, 200);
}

function renderActivity(activity) {
  const el = document.getElementById('dash-activity');
  if (!el || !activity) return;
  if (!activity.length) { el.innerHTML = '<div class="empty-state"><div class="empty-sub">No recent activity</div></div>'; return; }
  const icons = { CREATE:'✚', UPDATE:'✎', DELETE:'✕', LOGIN:'→', LOGOUT:'←', PROCESS:'⚙', APPROVE:'✓', MARK_PAID:'💵', RECORD:'📋', DOWNLOAD:'↓', TERMINATE:'⊗' };
  const isRecent = (d) => (Date.now() - new Date(d)) < 3600000;
  el.innerHTML = activity.map(a => `
    <div class="activity-item">
      <div class="activity-dot ${isRecent(a.created_at) ? 'recent' : ''}"></div>
      <div class="activity-text">
        <span style="color:var(--text-gold)">${icons[a.action] || '●'}</span>
        ${a.description}
        <div class="activity-meta">by ${a.username || 'system'}</div>
      </div>
      <div class="activity-time">${timeAgo(a.created_at)}</div>
    </div>
  `).join('');
}

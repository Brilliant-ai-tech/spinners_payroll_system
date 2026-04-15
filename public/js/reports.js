'use strict';

let _reportData = [];
let _currentReport = null;
let _periods = [];

const REPORTS = {
  payroll: {
    title: '💰 Payroll reports', color: 'gold',
    items: [
      { id: 'payroll-summary', name: 'Payroll summary',        icon: '📊', desc: 'Period-level gross/net totals', needsPeriod: false },
      { id: 'dept-cost',       name: 'Department cost',         icon: '🏢', desc: 'Labour cost by department',    needsPeriod: true },
      { id: 'bank-transfer',   name: 'Bank transfer schedule',  icon: '🏦', desc: 'Employee net pay per bank',    needsPeriod: true },
    ]
  },
  statutory: {
    title: '🏛 Statutory reports', color: 'teal',
    items: [
      { id: 'paye-p10',      name: 'PAYE P10',             icon: '📋', desc: 'KRA monthly PAYE return',     needsPeriod: true },
      { id: 'nssf',          name: 'NSSF contributions',   icon: '📦', desc: 'NSSF employee & employer',    needsPeriod: true },
      { id: 'nhif',          name: 'NHIF contributions',   icon: '🏥', desc: 'NHIF deductions list',        needsPeriod: true },
      { id: 'housing-levy',  name: 'Housing levy',         icon: '🏠', desc: 'Housing levy schedule',       needsPeriod: true },
    ]
  },
  hr: {
    title: '👥 HR reports', color: 'blue',
    items: [
      { id: 'employee-register',  name: 'Employee register',      icon: '👤', desc: 'Full employee listing',       needsPeriod: false },
      { id: 'headcount',          name: 'Headcount by department', icon: '📊', desc: 'Staff count per department',  needsPeriod: false },
      { id: 'leave-balances',     name: 'Leave balances',          icon: '🏖',  desc: 'Leave taken vs entitled',    needsPeriod: false },
      { id: 'attendance-summary', name: 'Attendance summary',      icon: '📋', desc: 'Monthly attendance stats',   needsPeriod: false },
    ]
  },
  annual: {
    title: '📅 Annual & audit', color: 'purple',
    items: [
      { id: 'p9',    name: 'P9 annual certificate', icon: '📄', desc: 'Annual tax certificate per employee', needsPeriod: false },
      { id: 'audit', name: 'Audit trail',            icon: '🔍', desc: 'Complete system audit log',          needsPeriod: false },
    ]
  }
};

const REPORT_COLS = {
  'payroll-summary': [
    { key: 'period_name', label: 'Period' }, { key: 'status', label: 'Status', render: v => statusBadge(v) },
    { key: 'total_gross', label: 'Gross (KES)', render: v => fmt(v) }, { key: 'total_paye', label: 'PAYE', render: v => fmt(v) },
    { key: 'total_nssf', label: 'NSSF', render: v => fmt(v) }, { key: 'total_nhif', label: 'NHIF', render: v => fmt(v) },
    { key: 'total_net', label: 'Net pay (KES)', render: v => `<span class="td-mono" style="color:var(--gold-light)">${fmt(v)}</span>` }
  ],
  'dept-cost': [
    { key: 'dept_name', label: 'Department' }, { key: 'headcount', label: 'Employees' },
    { key: 'total_gross', label: 'Gross (KES)', render: v => fmt(v) },
    { key: 'total_paye', label: 'PAYE (KES)', render: v => fmt(v) },
    { key: 'total_net', label: 'Net (KES)', render: v => `<span class="td-mono" style="color:var(--gold-light)">${fmt(v)}</span>` }
  ],
  'bank-transfer': [
    { key: 'emp_number', label: 'Emp #' }, { key: 'full_name', label: 'Name' },
    { key: 'bank_name', label: 'Bank' }, { key: 'bank_account', label: 'Account' },
    { key: 'net_pay', label: 'Net pay (KES)', render: v => `<span class="td-mono" style="color:var(--gold-light)">${fmt(v)}</span>` }
  ],
  'paye-p10': [
    { key: 'emp_number', label: 'Emp #' }, { key: 'full_name', label: 'Name' }, { key: 'kra_pin', label: 'KRA PIN' },
    { key: 'gross_pay', label: 'Gross', render: v => fmt(v) }, { key: 'taxable_income', label: 'Taxable', render: v => fmt(v) },
    { key: 'personal_relief', label: 'Relief', render: v => fmt(v) },
    { key: 'paye_payable', label: 'PAYE (KES)', render: v => `<span class="td-mono" style="color:var(--orange)">${fmt(v)}</span>` }
  ],
  'nssf': [
    { key: 'emp_number', label: 'Emp #' }, { key: 'full_name', label: 'Name' }, { key: 'nssf_number', label: 'NSSF #' },
    { key: 'gross_pay', label: 'Gross', render: v => fmt(v) },
    { key: 'nssf_employee', label: 'Employee (KES)', render: v => fmt(v) },
    { key: 'nssf_employer', label: 'Employer (KES)', render: v => fmt(v) }
  ],
  'nhif': [
    { key: 'emp_number', label: 'Emp #' }, { key: 'full_name', label: 'Name' }, { key: 'nhif_number', label: 'NHIF #' },
    { key: 'gross_pay', label: 'Gross', render: v => fmt(v) },
    { key: 'nhif', label: 'NHIF (KES)', render: v => fmt(v) }
  ],
  'housing-levy': [
    { key: 'emp_number', label: 'Emp #' }, { key: 'full_name', label: 'Name' },
    { key: 'gross_pay', label: 'Gross', render: v => fmt(v) },
    { key: 'housing_levy_employee', label: 'Employee (KES)', render: v => fmt(v) },
    { key: 'housing_levy_employer', label: 'Employer (KES)', render: v => fmt(v) }
  ],
  'employee-register': [
    { key: 'emp_number', label: 'Emp #' }, { key: 'full_name', label: 'Full name' }, { key: 'gender', label: 'Gender' },
    { key: 'dept_name', label: 'Department' }, { key: 'desig_name', label: 'Designation' },
    { key: 'employment_type', label: 'Type' }, { key: 'hire_date', label: 'Hire date', render: v => fmtDate(v) },
    { key: 'basic_salary', label: 'Basic salary', render: v => fmt(v) },
    { key: 'status', label: 'Status', render: v => statusBadge(v) }
  ],
  'headcount': [
    { key: 'dept_name', label: 'Department' }, { key: 'total', label: 'Total' },
    { key: 'active', label: 'Active' }, { key: 'terminated', label: 'Terminated' },
    { key: 'permanent', label: 'Permanent' }, { key: 'contract', label: 'Contract' }
  ],
  'leave-balances': [
    { key: 'emp_number', label: 'Emp #' }, { key: 'full_name', label: 'Name' }, { key: 'dept_name', label: 'Dept' },
    { key: 'type_name', label: 'Leave type' }, { key: 'entitled_days', label: 'Entitled' },
    { key: 'taken_days', label: 'Taken' }, { key: 'pending_days', label: 'Pending' },
    { key: 'balance', label: 'Balance', render: (v) => {
      const color = v > 5 ? 'var(--green)' : v > 0 ? 'var(--gold)' : 'var(--red)';
      return `<span style="color:${color};font-weight:700">${v}</span>`;
    } }
  ],
  'attendance-summary': [
    { key: 'emp_number', label: 'Emp #' }, { key: 'full_name', label: 'Name' }, { key: 'dept_name', label: 'Dept' },
    { key: 'working_days', label: 'Working days' }, { key: 'days_present', label: 'Present' },
    { key: 'days_absent', label: 'Absent' }, { key: 'days_leave', label: 'Leave' },
    { key: 'attendance_pct', label: 'Attendance %', render: v => {
      const color = v >= 90 ? 'green' : v >= 80 ? 'gold' : 'orange';
      return `<div style="display:flex;align-items:center;gap:8px"><div class="progress" style="width:60px;height:6px"><div class="progress-bar ${color}" style="width:${v}%"></div></div><span>${v}%</span></div>`;
    }}
  ],
  'p9': [
    { key: 'emp_number', label: 'Emp #' }, { key: 'full_name', label: 'Name' }, { key: 'kra_pin', label: 'KRA PIN' },
    { key: 'annual_gross', label: 'Annual gross', render: v => fmt(v) },
    { key: 'annual_paye', label: 'Annual PAYE', render: v => fmt(v) },
    { key: 'annual_nssf', label: 'NSSF', render: v => fmt(v) },
    { key: 'annual_nhif', label: 'NHIF', render: v => fmt(v) },
    { key: 'annual_hl', label: 'Housing levy', render: v => fmt(v) }
  ],
  'audit': [
    { key: 'created_at', label: 'Date/time', render: v => fmtDateTime(v) },
    { key: 'username', label: 'User' }, { key: 'action', label: 'Action' },
    { key: 'module', label: 'Module' }, { key: 'description', label: 'Description' },
    { key: 'status', label: 'Status', render: v => statusBadge(v || 'SUCCESS') }
  ]
};

async function initReports() {
  renderReportsCatalog();
  // Pre-load periods for period-selector
  try {
    _periods = await API.get('/payroll/periods') || [];
  } catch {}
}

function renderReportsCatalog() {
  const el = document.getElementById('reports-catalog');
  if (!el) return;
  el.innerHTML = Object.entries(REPORTS).map(([key, cat]) => `
    <div class="card card-${cat.color}">
      <div class="card-header"><span class="card-title">${cat.title}</span></div>
      <div class="card-body">
        <div class="report-btns">
          ${cat.items.map(r => `
            <button class="report-btn" onclick="openReport('${r.id}', ${r.needsPeriod})" title="${r.desc}">
              <span>${r.icon}</span> ${r.name}
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `).join('');
}

async function openReport(reportId, needsPeriod) {
  _currentReport = reportId;
  let params = '';
  if (needsPeriod) {
    if (!_periods.length) {
      toast('warning', 'No periods', 'No payroll periods available.');
      return;
    }
    const periodId = await selectPeriodDialog();
    if (!periodId) return;
    params = `?period_id=${periodId}`;
  } else if (reportId === 'p9' || reportId === 'leave-balances' || reportId === 'attendance-summary') {
    const year = await selectYearDialog();
    if (!year) return;
    params = `?year=${year}`;
    if (reportId === 'attendance-summary') {
      const month = await selectMonthDialog();
      if (!month) return;
      params += `&month=${month}`;
    }
  }
  showReportViewer(reportId, params);
}

function selectPeriodDialog() {
  return new Promise(resolve => {
    const options = _periods.map(p => `<option value="${p.period_id}">${p.period_name} (${p.status})</option>`).join('');
    const sel = document.createElement('select');
    sel.className = 'form-control';
    sel.innerHTML = options;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9000;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `<div style="background:var(--card-elevated);border:1px solid var(--border-light);border-radius:var(--radius-xl);padding:28px;min-width:340px;box-shadow:var(--shadow-lg)">
      <h3 style="margin-bottom:16px">Select payroll period</h3>
      <select class="form-control" id="period-picker-sel">${options}</select>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">
        <button class="btn btn-ghost" id="period-cancel">Cancel</button>
        <button class="btn btn-primary" id="period-ok">Load report</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    document.getElementById('period-ok').onclick = () => { overlay.remove(); resolve(document.getElementById('period-picker-sel').value); };
    document.getElementById('period-cancel').onclick = () => { overlay.remove(); resolve(null); };
  });
}

function selectYearDialog() {
  return new Promise(resolve => {
    const now = new Date().getFullYear();
    const opts = [now, now-1, now-2, now-3].map(y => `<option value="${y}">${y}</option>`).join('');
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9000;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `<div style="background:var(--card-elevated);border:1px solid var(--border-light);border-radius:var(--radius-xl);padding:28px;min-width:300px;box-shadow:var(--shadow-lg)">
      <h3 style="margin-bottom:16px">Select year</h3>
      <select class="form-control" id="year-picker-sel">${opts}</select>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">
        <button class="btn btn-ghost" id="year-cancel">Cancel</button>
        <button class="btn btn-primary" id="year-ok">Load report</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    document.getElementById('year-ok').onclick = () => { overlay.remove(); resolve(document.getElementById('year-picker-sel').value); };
    document.getElementById('year-cancel').onclick = () => { overlay.remove(); resolve(null); };
  });
}

function selectMonthDialog() {
  return new Promise(resolve => {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const opts = months.map((m, i) => `<option value="${i+1}" ${i+1===new Date().getMonth()+1?'selected':''}>${m}</option>`).join('');
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9000;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `<div style="background:var(--card-elevated);border:1px solid var(--border-light);border-radius:var(--radius-xl);padding:28px;min-width:300px;box-shadow:var(--shadow-lg)">
      <h3 style="margin-bottom:16px">Select month</h3>
      <select class="form-control" id="month-picker-sel">${opts}</select>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">
        <button class="btn btn-ghost" id="month-cancel">Cancel</button>
        <button class="btn btn-primary" id="month-ok">Load report</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    document.getElementById('month-ok').onclick = () => { overlay.remove(); resolve(document.getElementById('month-picker-sel').value); };
    document.getElementById('month-cancel').onclick = () => { overlay.remove(); resolve(null); };
  });
}

async function showReportViewer(reportId, params = '') {
  document.getElementById('reports-catalog-view').style.display = 'none';
  document.getElementById('reports-viewer-view').style.display = '';
  // Find report name
  let reportName = reportId;
  for (const cat of Object.values(REPORTS)) {
    const r = cat.items.find(i => i.id === reportId);
    if (r) { reportName = r.name; break; }
  }
  document.getElementById('report-viewer-title').textContent = reportName;

  const cols = REPORT_COLS[reportId] || [];
  const thead = document.getElementById('report-thead');
  const tbody = document.getElementById('report-tbody');
  thead.innerHTML = `<tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr>`;
  buildSkeletonRows('report-tbody', cols.length, 6);

  try {
    _reportData = await API.get(`/reports/${reportId}${params}`);
    if (!_reportData) return;
    document.getElementById('report-count').textContent = `${_reportData.length} rows`;
    if (!_reportData.length) {
      tbody.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center;padding:50px;color:var(--text-muted)">No data for the selected filters.</td></tr>`;
      return;
    }
    tbody.innerHTML = _reportData.map(row => `<tr>${cols.map(c => {
      const val = row[c.key];
      const rendered = typeof c.render === 'function' ? c.render(val, row) : (val ?? '—');
      return `<td>${rendered}</td>`;
    }).join('')}</tr>`).join('');
  } catch (e) {
    toast('error', 'Load failed', e.message);
    tbody.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center;padding:30px;color:var(--red-light)">Failed to load report: ${e.message}</td></tr>`;
  }
}

function backToReports() {
  document.getElementById('reports-viewer-view').style.display = 'none';
  document.getElementById('reports-catalog-view').style.display = '';
  _currentReport = null;
  _reportData = [];
}

function exportReportCSV() {
  if (!_reportData || !_reportData.length) { toast('warning', 'No data', 'Nothing to export.'); return; }
  downloadCSV(`${_currentReport || 'report'}.csv`, _reportData);
}

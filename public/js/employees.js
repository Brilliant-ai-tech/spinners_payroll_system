'use strict';

let _empData = [];
let _empDepts = [];
let _empDesigs = [];
let _pendingSignups = [];
const empSearchDebounce = debounce(loadEmployees, 300);

function canManageEmployeeSalary() {
  return Auth.getUser().role === 'PAYROLL';
}

function canApproveEmployees() {
  return Auth.getUser().role === 'HR';
}

function syncEmployeeFormAccess(isEditing = false) {
  const salaryInput = document.getElementById('emp-salary');
  const salaryNote = document.getElementById('emp-salary-note');
  if (!salaryInput || !salaryNote) return;
  const nonSalaryFields = [
    'emp-firstname','emp-middlename','emp-lastname','emp-gender','emp-dob','emp-marital',
    'emp-id','emp-kra','emp-email','emp-phone','emp-nssf','emp-nhif',
    'emp-dept','emp-desig','emp-type','emp-hiredate','emp-bank-name','emp-bank-acc','emp-bank-holder'
  ];
  const isPayroll = canManageEmployeeSalary();
  const canEditSalary = canManageEmployeeSalary();
  salaryInput.disabled = !canEditSalary;
  if (!canEditSalary) salaryInput.value = '';
  salaryNote.style.display = canEditSalary ? 'none' : 'block';
  nonSalaryFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = isPayroll && isEditing;
  });
}

async function initEmployees() {
  const addEmployeeBtn = document.getElementById('add-employee-btn');
  if (addEmployeeBtn) addEmployeeBtn.style.display = canManageEmployeeSalary() ? 'none' : '';
  await Promise.all([loadDeptFilter(), loadDesigDropdown()]);
  await Promise.all([loadEmployees(), loadPendingSignups()]);
}

async function loadDeptFilter() {
  try {
    _empDepts = await API.get('/departments');
    const sel = document.getElementById('emp-dept-filter');
    if (!sel) return;
    sel.innerHTML = '<option value="">All departments</option>' +
      (_empDepts || []).map(d => `<option value="${d.dept_id}">${d.dept_name}</option>`).join('');
    // Also fill modal dropdown
    const mSel = document.getElementById('emp-dept');
    if (mSel) mSel.innerHTML = '<option value="">Select department</option>' +
      (_empDepts || []).map(d => `<option value="${d.dept_id}">${d.dept_name}</option>`).join('');
  } catch {}
}

async function loadDesigDropdown() {
  try {
    _empDesigs = await API.get('/designations');
    const sel = document.getElementById('emp-desig');
    if (sel) sel.innerHTML = '<option value="">Select designation</option>' +
      (_empDesigs || []).map(d => `<option value="${d.desig_id}">${d.desig_name}</option>`).join('');
  } catch {}
}

async function loadEmployees() {
  const search = document.getElementById('emp-search')?.value || '';
  const dept   = document.getElementById('emp-dept-filter')?.value || '';
  const status = document.getElementById('emp-status-filter')?.value || 'All';
  const tbody  = document.getElementById('emp-tbody');
  buildSkeletonRows('emp-tbody', 9, 6);
  try {
    const params = new URLSearchParams({ search, dept, status });
    _empData = await API.get(`/employees?${params}`);
    if (!_empData) return;
    document.getElementById('emp-count').textContent = `${_empData.length} record${_empData.length !== 1 ? 's' : ''}`;
    if (!_empData.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:50px;color:var(--text-muted)">
        <div style="font-size:2rem;margin-bottom:8px">👥</div>No employees found.</td></tr>`;
      return;
    }
    tbody.innerHTML = _empData.map(e => `
      <tr onclick="viewEmployee(${e.employee_id})" ondblclick="openEditEmployee(${e.employee_id})"
          oncontextmenu="showEmpContextMenu(event,${e.employee_id},'${escHtml(e.first_name + ' ' + e.last_name)}')">
        <td class="td-mono text-gold">${e.emp_number}</td>
        <td class="font-bold">${e.first_name} ${e.middle_name ? e.middle_name + ' ' : ''}${e.last_name}</td>
        <td>${e.dept_name || '—'}</td>
        <td>${e.desig_name || '—'}</td>
        <td>${statusBadge(e.employment_type || 'Permanent')}</td>
        <td class="text-muted">${fmtDate(e.hire_date)}</td>
        <td class="td-amount">KES ${fmt(e.basic_salary, 0)}</td>
        <td>${statusBadge(e.status)}</td>
        <td class="td-actions" onclick="event.stopPropagation()">
          <button class="action-btn" onclick="viewEmployee(${e.employee_id})" title="View">👁</button>
          <button class="action-btn" onclick="openEditEmployee(${e.employee_id})" title="Edit">✏</button>
          ${canApproveEmployees() && e.status === 'Pending' ? `<button class="action-btn" onclick="approveEmployee(${e.employee_id})" title="Approve">Approve</button>` : ''}
          ${e.status === 'Active' ? `<button class="action-btn danger" onclick="openTerminate(${e.employee_id},'${escHtml(e.first_name + ' ' + e.last_name)}')" title="Terminate">✗</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (e) {
    toast('error', 'Load failed', e.message);
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--red-light)">Failed to load employees</td></tr>`;
  }
}

async function loadPendingSignups() {
  const tbody = document.getElementById('pending-signups-tbody');
  const countEl = document.getElementById('pending-signup-count');
  if (!tbody || !countEl) return;
  buildSkeletonRows('pending-signups-tbody', 8, 4);
  try {
    _pendingSignups = await API.get('/employee-signups?status=All');
    if (!_pendingSignups) return;
    countEl.textContent = `${_pendingSignups.length} record${_pendingSignups.length !== 1 ? 's' : ''}`;
    if (!_pendingSignups.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">No signup requests yet.</td></tr>`;
      return;
    }
    const canReview = Auth.getUser().role === 'HR';
    tbody.innerHTML = _pendingSignups.map(s => `
      <tr onclick="viewPendingSignup(${s.signup_id})" style="cursor:pointer">
        <td class="font-bold">${s.first_name} ${s.middle_name ? `${s.middle_name} ` : ''}${s.last_name}</td>
        <td class="text-muted">${s.email}</td>
        <td>${s.phone_primary || '—'}</td>
        <td>${s.dept_name || '—'}</td>
        <td>${s.desig_name || '—'}</td>
        <td>${fmtDateTime(s.created_at)}</td>
        <td>${statusBadge(s.approval_status)}</td>
        <td class="td-actions" onclick="event.stopPropagation()">
          <button class="action-btn" onclick="viewPendingSignup(${s.signup_id})" title="View">View</button>
          ${canReview && s.approval_status === 'Pending' ? `<button class="action-btn" onclick="approvePendingSignup(${s.signup_id})" title="Approve">Approve</button>` : ''}
          ${canReview && s.approval_status === 'Pending' ? `<button class="action-btn danger" onclick="rejectPendingSignup(${s.signup_id})" title="Reject">Reject</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--red-light)">Failed to load signup requests</td></tr>`;
  }
}

function viewPendingSignup(id) {
  const signup = _pendingSignups.find(s => s.signup_id === id);
  if (!signup) return;
  document.getElementById('emp-detail-title').textContent = `Pending signup — ${signup.first_name} ${signup.last_name}`;
  document.getElementById('emp-detail-personal').innerHTML = `
    <div class="form-grid-3" style="gap:16px;padding:4px 0">
      ${detailField('Full name', `${signup.first_name} ${signup.middle_name || ''} ${signup.last_name}`)}
      ${detailField('Email', signup.email)}
      ${detailField('Phone', signup.phone_primary)}
      ${detailField('Gender', signup.gender)}
      ${detailField('Date of birth', fmtDate(signup.date_of_birth))}
      ${detailField('Marital status', signup.marital_status)}
      ${detailField('National ID', signup.national_id)}
      ${detailField('KRA PIN', signup.kra_pin)}
      ${detailField('NSSF #', signup.nssf_number)}
      ${detailField('NHIF #', signup.nhif_number)}
      ${detailField('Signup status', statusBadge(signup.approval_status), false, true)}
      ${detailField('Submitted', fmtDateTime(signup.created_at))}
    </div>`;
  document.getElementById('emp-detail-employment').innerHTML = `
    <div class="form-grid-3" style="gap:16px;padding:4px 0">
      ${detailField('Department', signup.dept_name)}
      ${detailField('Designation', signup.desig_name)}
      ${detailField('Employment type', signup.employment_type)}
      ${detailField('Hire date', fmtDate(signup.hire_date))}
    </div>`;
  document.getElementById('emp-detail-bank').innerHTML = '<div class="empty-state"><div class="empty-sub">Bank details are not collected during signup.</div></div>';
  document.getElementById('emp-detail-leave').innerHTML = '<div class="empty-state"><div class="empty-sub">Leave balances will be available after HR approval.</div></div>';
  document.getElementById('emp-detail-payroll').innerHTML = '<div class="empty-state"><div class="empty-sub">Payroll history will appear after HR approval.</div></div>';
  switchEmpDetailTab('personal', document.querySelector('#modal-emp-detail .tab'));
  openModal('modal-emp-detail');
}

async function approvePendingSignup(id) {
  try {
    const result = await API.patch(`/employee-signups/${id}/approve`, {});
    toast('success', 'Approved', `${result.empNumber} was created and the employee can now log in.`);
    await Promise.all([loadEmployees(), loadPendingSignups()]);
  } catch (e) {
    toast('error', 'Approval failed', e.message);
  }
}

async function rejectPendingSignup(id) {
  try {
    await API.patch(`/employee-signups/${id}/reject`, {});
    toast('success', 'Rejected', 'Signup request rejected.');
    loadPendingSignups();
  } catch (e) {
    toast('error', 'Rejection failed', e.message);
  }
}

async function approveEmployee(id) {
  try {
    await API.patch(`/employees/${id}/approve`, {});
    toast('success', 'Approved', 'Employee record has been approved by HR.');
    await loadEmployees();
  } catch (e) {
    toast('error', 'Approval failed', e.message);
  }
}

function clearEmpSearch() {
  document.getElementById('emp-search').value = '';
  loadEmployees();
}

// ── CONTEXT MENU ──────────────────────────────────────────────────
let _ctxMenu = null;
function showEmpContextMenu(e, id, name) {
  e.preventDefault();
  hideContextMenu();
  _ctxMenu = document.createElement('div');
  _ctxMenu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:var(--card-elevated);border:1px solid var(--border-light);border-radius:var(--radius-md);box-shadow:var(--shadow-lg);z-index:5000;min-width:180px;overflow:hidden`;
  const menuItems = [
    { label: '👁 View details',      fn: () => viewEmployee(id) },
    { label: '✏ Edit employee',      fn: () => openEditEmployee(id) },
    { label: '✗ Terminate',          fn: () => openTerminate(id, name), danger: true },
  ];
  _ctxMenu.innerHTML = menuItems.map(m => `
    <div style="padding:9px 16px;cursor:pointer;font-size:var(--text-sm);color:${m.danger ? 'var(--red-light)' : 'var(--text-secondary)'};transition:background 0.15s"
      onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background=''"
      onclick="hideContextMenu();(${m.fn.toString()})()">
      ${m.label}
    </div>
  `).join('<div style="height:1px;background:var(--border);margin:2px 0"></div>');
  document.body.appendChild(_ctxMenu);
  setTimeout(() => document.addEventListener('click', hideContextMenu, { once: true }), 0);
}
function hideContextMenu() { if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null; } }

// ── VIEW EMPLOYEE DETAIL ──────────────────────────────────────────
async function viewEmployee(id) {
  try {
    const emp = await API.get(`/employees/${id}`);
    if (!emp) return;
    document.getElementById('emp-detail-title').textContent = `${emp.emp_number} — ${emp.first_name} ${emp.last_name}`;

    // Tab 1: Personal
    document.getElementById('emp-detail-personal').innerHTML = `
      <div class="form-grid-3" style="gap:16px;padding:4px 0">
        ${detailField('Employee #', emp.emp_number, true)}
        ${detailField('Full name', `${emp.first_name} ${emp.middle_name||''} ${emp.last_name}`)}
        ${detailField('Gender', emp.gender)}
        ${detailField('Date of birth', fmtDate(emp.date_of_birth))}
        ${detailField('Marital status', emp.marital_status)}
        ${detailField('National ID', emp.national_id)}
        ${detailField('KRA PIN', emp.kra_pin)}
        ${detailField('NSSF #', emp.nssf_number)}
        ${detailField('NHIF #', emp.nhif_number)}
        ${detailField('Email', emp.email)}
        ${detailField('Phone', emp.phone_primary)}
        ${detailField('Status', statusBadge(emp.status), false, true)}
      </div>`;

    // Tab 2: Employment
    document.getElementById('emp-detail-employment').innerHTML = `
      <div class="form-grid-3" style="gap:16px;padding:4px 0">
        ${detailField('Department', emp.dept_name)}
        ${detailField('Designation', emp.desig_name)}
        ${detailField('Branch', emp.branch_name)}
        ${detailField('Employment type', emp.employment_type)}
        ${detailField('Hire date', fmtDate(emp.hire_date))}
        ${detailField('Salary grade', emp.grade_name)}
        ${detailField('Basic salary', 'KES ' + fmt(emp.basic_salary, 0), true)}
        ${detailField('Effective from', fmtDate(emp.effective_from))}
      </div>
      <div class="divider"></div>
      <div class="form-section-title">📜 Salary history</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Effective from</th><th>Basic salary</th><th>Current</th></tr></thead>
        <tbody>${(emp.salHistory || []).map(s => `<tr>
          <td>${fmtDate(s.effective_from)}</td>
          <td class="td-amount">KES ${fmt(s.basic_salary, 0)}</td>
          <td>${s.is_current ? '<span class="badge badge-active">Current</span>' : ''}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;

    // Tab 3: Bank
    document.getElementById('emp-detail-bank').innerHTML = (emp.banks || []).length
      ? (emp.banks || []).map(b => `<div class="card mb-4" style="padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span class="font-bold">${b.bank_name}</span>
            ${b.is_primary ? '<span class="badge badge-approved">Primary</span>' : ''}
          </div>
          <div style="font-family:monospace;font-size:1.1rem;color:var(--gold-light);letter-spacing:2px">${b.account_number}</div>
          <div class="text-muted text-sm">${b.account_name}</div>
        </div>`).join('')
      : '<div class="empty-state"><div class="empty-icon">🏦</div><div class="empty-sub">No bank accounts on file</div></div>';

    // Tab 4: Leave
    document.getElementById('emp-detail-leave').innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Leave type</th><th>Entitled</th><th>Taken</th><th>Pending</th><th>Balance</th><th>Usage</th></tr></thead>
      <tbody>${(emp.leaveBalances || []).map(lb => {
        const balance = lb.entitled_days - lb.taken_days - lb.pending_days;
        const pct = lb.entitled_days ? ((lb.taken_days / lb.entitled_days) * 100).toFixed(0) : 0;
        const color = balance > 5 ? 'green' : balance > 0 ? 'amber' : 'red';
        return `<tr>
          <td>${lb.type_name}</td>
          <td>${lb.entitled_days || lb.annual_days}</td>
          <td>${lb.taken_days}</td>
          <td>${lb.pending_days}</td>
          <td style="color:var(--${color === 'amber' ? 'gold' : color});font-weight:700">${balance}</td>
          <td style="width:120px"><div class="progress"><div class="progress-bar ${color}" style="width:${pct}%"></div></div></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;

    // Tab 5: Payroll
    document.getElementById('emp-detail-payroll').innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Period</th><th>Gross</th><th>Deductions</th><th>Net pay</th><th>Status</th><th></th></tr></thead>
      <tbody>${(emp.payslips || []).map(ps => `<tr>
        <td>${ps.period_name}</td>
        <td class="td-mono">KES ${fmt(ps.gross_pay, 0)}</td>
        <td class="td-mono">KES ${fmt((ps.gross_pay - ps.net_pay), 0)}</td>
        <td class="td-amount">KES ${fmt(ps.net_pay, 0)}</td>
        <td>${statusBadge(ps.status)}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="viewPayslip(${ps.run_id})">View</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;

    switchEmpDetailTab('personal', document.querySelector('#modal-emp-detail .tab'));
    openModal('modal-emp-detail');
  } catch (e) {
    toast('error', 'Error', e.message);
  }
}

function detailField(label, value, gold = false, raw = false) {
  return `<div>
    <div style="font-size:var(--text-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">${label}</div>
    <div style="font-size:var(--text-sm);font-weight:500;${gold?'color:var(--gold-light);font-family:JetBrains Mono,monospace':''}">${raw ? value : (value || '—')}</div>
  </div>`;
}

function switchEmpDetailTab(tab, clickedEl) {
  document.querySelectorAll('#modal-emp-detail .tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#modal-emp-detail .tab').forEach(t => t.classList.remove('active'));
  const panel = document.getElementById('emp-detail-' + tab);
  if (panel) panel.classList.add('active');
  if (clickedEl) clickedEl.classList.add('active');
}

// ── ADD EMPLOYEE ──────────────────────────────────────────────────
function openAddEmployee() {
  if (canManageEmployeeSalary()) {
    toast('warning', 'Not allowed', 'Payroll can update salary for existing employees only.');
    return;
  }
  clearEmpForm();
  document.getElementById('emp-modal-title').textContent = 'Add employee';
  document.getElementById('emp-edit-id').value = '';
  document.getElementById('emp-hiredate').value = new Date().toISOString().split('T')[0];
  syncEmployeeFormAccess(false);
  loadDeptFilter();
  loadDesigDropdown();
  openModal('modal-employee');
}

async function openEditEmployee(id) {
  try {
    const emp = await API.get(`/employees/${id}`);
    if (!emp) return;
    clearEmpForm();
    document.getElementById('emp-modal-title').textContent = canManageEmployeeSalary() ? 'Update salary' : 'Edit employee';
    document.getElementById('emp-edit-id').value = id;
    document.getElementById('emp-firstname').value   = emp.first_name || '';
    document.getElementById('emp-middlename').value  = emp.middle_name || '';
    document.getElementById('emp-lastname').value    = emp.last_name || '';
    document.getElementById('emp-gender').value      = emp.gender || '';
    document.getElementById('emp-dob').value         = emp.date_of_birth ? emp.date_of_birth.split('T')[0] : '';
    document.getElementById('emp-marital').value     = emp.marital_status || '';
    document.getElementById('emp-id').value          = emp.national_id || '';
    document.getElementById('emp-kra').value         = emp.kra_pin || '';
    document.getElementById('emp-email').value       = emp.email || '';
    document.getElementById('emp-phone').value       = emp.phone_primary || '';
    document.getElementById('emp-nssf').value        = emp.nssf_number || '';
    document.getElementById('emp-nhif').value        = emp.nhif_number || '';
    document.getElementById('emp-dept').value        = emp.dept_id || '';
    document.getElementById('emp-desig').value       = emp.desig_id || '';
    document.getElementById('emp-type').value        = emp.employment_type || 'Permanent';
    document.getElementById('emp-hiredate').value    = emp.hire_date ? emp.hire_date.split('T')[0] : '';
    syncEmployeeFormAccess(true);
    if (canManageEmployeeSalary()) {
      document.getElementById('emp-salary').value = emp.basic_salary || '';
    }
    if (emp.banks && emp.banks[0]) {
      document.getElementById('emp-bank-name').value   = emp.banks[0].bank_name || '';
      document.getElementById('emp-bank-acc').value    = emp.banks[0].account_number || '';
      document.getElementById('emp-bank-holder').value = emp.banks[0].account_name || '';
    }
    openModal('modal-employee');
  } catch (e) {
    toast('error', 'Error', e.message);
  }
}

function clearEmpForm() {
  ['emp-firstname','emp-middlename','emp-lastname','emp-gender','emp-dob','emp-marital',
   'emp-id','emp-kra','emp-email','emp-phone','emp-nssf','emp-nhif',
   'emp-dept','emp-desig','emp-type','emp-hiredate','emp-salary',
   'emp-bank-name','emp-bank-acc','emp-bank-holder'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.remove('error'); }
  });
  syncEmployeeFormAccess(false);
}

async function saveEmployee() {
  const id = document.getElementById('emp-edit-id').value;
  const data = {
    first_name: document.getElementById('emp-firstname').value.trim(),
    middle_name: document.getElementById('emp-middlename').value.trim(),
    last_name: document.getElementById('emp-lastname').value.trim(),
    gender: document.getElementById('emp-gender').value,
    date_of_birth: document.getElementById('emp-dob').value,
    marital_status: document.getElementById('emp-marital').value,
    national_id: document.getElementById('emp-id').value.trim(),
    kra_pin: document.getElementById('emp-kra').value.trim(),
    email: document.getElementById('emp-email').value.trim(),
    phone_primary: document.getElementById('emp-phone').value.trim(),
    nssf_number: document.getElementById('emp-nssf').value.trim(),
    nhif_number: document.getElementById('emp-nhif').value.trim(),
    dept_id: document.getElementById('emp-dept').value,
    desig_id: document.getElementById('emp-desig').value,
    employment_type: document.getElementById('emp-type').value,
    hire_date: document.getElementById('emp-hiredate').value,
    bank_name: document.getElementById('emp-bank-name').value.trim(),
    account_number: document.getElementById('emp-bank-acc').value.trim(),
    account_name: document.getElementById('emp-bank-holder').value.trim(),
  };
  if (canManageEmployeeSalary()) {
    data.basic_salary = document.getElementById('emp-salary').value;
  }

  let valid = true;
  if (!data.first_name) { document.getElementById('emp-firstname').classList.add('error'); valid = false; }
  if (!data.last_name) { document.getElementById('emp-lastname').classList.add('error'); valid = false; }
  if (!data.hire_date) { document.getElementById('emp-hiredate').classList.add('error'); valid = false; }
  if (canManageEmployeeSalary() && !document.getElementById('emp-salary').value) {
    document.getElementById('emp-salary').classList.add('error');
    valid = false;
  }
  if (!valid) { toast('warning', 'Validation', 'Please fill required fields.'); return; }

  const btn = document.getElementById('emp-save-btn');
  btn.classList.add('btn-loading'); btn.disabled = true;
  try {
    if (canManageEmployeeSalary()) {
      if (!id) throw new Error('Payroll can only update salary for an existing employee.');
      await API.patch(`/employees/${id}/salary`, {
        basic_salary: document.getElementById('emp-salary').value,
        effective_from: document.getElementById('emp-hiredate').value || ''
      });
      toast('success', 'Salary updated', `${data.first_name} ${data.last_name}'s salary has been updated.`);
    } else if (id) {
      await API.put(`/employees/${id}`, data);
      toast('success', 'Employee updated', `${data.first_name} ${data.last_name} has been updated.`);
    } else {
      const result = await API.post('/employees', data);
      const statusFilter = document.getElementById('emp-status-filter');
      if (statusFilter && !['All', 'Pending'].includes(statusFilter.value)) {
        statusFilter.value = 'Pending';
      }
      toast('success', 'Employee added', `${result.empNumber} created and is pending HR approval.`);
    }
    closeModal('modal-employee');
    loadEmployees();
  } catch (e) {
    toast('error', 'Save failed', e.message);
  } finally {
    btn.classList.remove('btn-loading'); btn.disabled = false;
  }
}

// ── TERMINATE ─────────────────────────────────────────────────────
function openTerminate(id, name) {
  document.getElementById('terminate-emp-id').value = id;
  document.getElementById('terminate-emp-name').textContent = name;
  document.getElementById('terminate-reason').value = '';
  openModal('modal-terminate');
}

async function confirmTerminate() {
  const id = document.getElementById('terminate-emp-id').value;
  const reason = document.getElementById('terminate-reason').value.trim();
  if (!reason) { toast('warning', 'Required', 'Please enter a termination reason.'); return; }
  const btn = document.querySelector('#modal-terminate .btn-danger');
  btn.classList.add('btn-loading'); btn.disabled = true;
  try {
    await API.patch(`/employees/${id}/terminate`, { reason });
    toast('success', 'Employee terminated', 'The employee has been terminated.');
    closeModal('modal-terminate');
    loadEmployees();
  } catch (e) {
    toast('error', 'Error', e.message);
  } finally {
    btn.classList.remove('btn-loading'); btn.disabled = false;
  }
}

// ── CSV EXPORT ────────────────────────────────────────────────────
function exportEmployeesCSV() {
  const rows = _empData.map(e => ({
    'Emp #': e.emp_number,
    'First name': e.first_name,
    'Last name': e.last_name,
    'Department': e.dept_name,
    'Designation': e.desig_name,
    'Type': e.employment_type,
    'Hire date': fmtDate(e.hire_date),
    'Basic salary': e.basic_salary,
    'Status': e.status
  }));
  downloadCSV('employees.csv', rows);
}

function escHtml(s) { return (s || '').replace(/'/g, "\\'").replace(/"/g, '\\"'); }

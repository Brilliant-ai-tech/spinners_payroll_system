'use strict';

let _leaveTypes = [];
let _leaveRequests = [];
let _reviewingId = null;

function refreshEmployeeLeavePortal() {
  if (Auth.getUser().role !== 'EMPLOYEE') return;
  if (typeof loadSSLeaveRequests === 'function') loadSSLeaveRequests();
  if (typeof loadSSLeave === 'function') loadSSLeave();
}

async function initLeave() {
  await loadLeaveTypes();
  loadLeaveRequests();
  const yearSel = document.getElementById('leave-bal-year');
  const now = new Date();
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) {
    yearSel.innerHTML += `<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}</option>`;
  }

  // Show apply button only for employees and HR staff with leave.apply permission
  const applyBtn = document.querySelector('.toolbar .btn-primary');
  if (applyBtn) {
    applyBtn.style.display = (Auth.getUser().role === 'EMPLOYEE' || Auth.hasPermission('leave.apply')) ? '' : 'none';
  }
  
  // Show status filter for users who can view leave requests (HR, Payroll, Admin)
  const statusFilter = document.getElementById('leave-status-filter');
  if (statusFilter) {
    statusFilter.style.display = (Auth.hasPermission('leave.view') || Auth.getUser().role === 'ADMIN') ? '' : 'none';
  }
}

async function loadLeaveTypes() {
  try {
    _leaveTypes = await API.get('/leave/types');
    const sel = document.getElementById('leave-type-sel');
    if (sel && _leaveTypes) {
      sel.innerHTML = '<option value="">Select leave type</option>' +
        _leaveTypes.map(lt => `<option value="${lt.leave_type_id}">${lt.type_name} (${lt.annual_days} days/yr)</option>`).join('');
    }
  } catch {}
}

function switchLeaveTab(tab, el) {
  document.querySelectorAll('[id^="leave-tab-"]').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  document.getElementById('leave-tab-' + tab).classList.add('active');
  if (el) el.classList.add('active');
  if (tab === 'balances') loadLeaveBalances();
}

// ── REQUESTS ──────────────────────────────────────────────────────
async function loadLeaveRequests() {
  const status = document.getElementById('leave-status-filter')?.value || 'Pending';
  buildSkeletonRows('leave-tbody', 9, 5);
  try {
    _leaveRequests = await API.get(`/leave/requests?status=${status}`);
    if (!_leaveRequests) return;
    const tbody = document.getElementById('leave-tbody');
    if (!_leaveRequests.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:50px;color:var(--text-muted)">
        <div style="font-size:2rem;margin-bottom:8px">🏖</div>No ${status.toLowerCase()} leave requests.</td></tr>`;
      return;
    }
    const canReview = Auth.hasPermission('leave.approve');
    tbody.innerHTML = _leaveRequests.map(r => `
      <tr ondblclick="${canReview && r.status==='Pending' ? `openLeaveReview(${r.request_id})` : ''}"
          style="cursor:${canReview && r.status==='Pending'?'pointer':'default'};transition:background 0.3s" id="lr-row-${r.request_id}">
        <td class="td-mono text-gold">${r.emp_number}</td>
        <td class="font-bold">${r.full_name}</td>
        <td class="text-muted text-sm">${r.dept_name || '—'}</td>
        <td>${r.type_name}</td>
        <td>${fmtDate(r.start_date)}</td>
        <td>${fmtDate(r.end_date)}</td>
        <td class="td-mono font-bold">${r.num_days}</td>
        <td>${statusBadge(r.status)}</td>
        <td class="td-actions">
          ${canReview && r.status === 'Pending' ? `<button class="action-btn" onclick="openLeaveReview(${r.request_id})" title="Review">📋</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (e) {
    toast('error', 'Load failed', e.message);
  }
}

// ── REVIEW ────────────────────────────────────────────────────────
function openLeaveReview(id) {
  const req = _leaveRequests.find(r => r.request_id === id);
  if (!req) return;
  _reviewingId = id;
  document.getElementById('leave-review-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div>${detailItem('Employee', req.full_name)}</div>
      <div>${detailItem('Emp #', req.emp_number)}</div>
      <div>${detailItem('Leave type', req.type_name)}</div>
      <div>${detailItem('Days requested', req.num_days)}</div>
      <div>${detailItem('Start date', fmtDate(req.start_date))}</div>
      <div>${detailItem('End date', fmtDate(req.end_date))}</div>
    </div>
    ${req.reason ? `<div class="form-group"><div class="form-label">Reason</div>
      <div style="background:var(--bg-secondary);padding:12px;border-radius:var(--radius-md);font-size:var(--text-sm);color:var(--text-secondary)">${req.reason}</div>
    </div>` : ''}
  `;
  openModal('modal-leave-review');
}

function detailItem(label, value) {
  return `<div>
    <div style="font-size:var(--text-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">${label}</div>
    <div style="font-size:var(--text-sm);font-weight:500">${value || '—'}</div>
  </div>`;
}

async function reviewLeave(decision) {
  if (!_reviewingId) return;
  const btns = document.querySelectorAll('#modal-leave-review .modal-footer .btn');
  btns.forEach(b => { b.classList.add('btn-loading'); b.disabled = true; });
  try {
    await API.patch(`/leave/requests/${_reviewingId}/review`, { decision });
    const row = document.getElementById(`lr-row-${_reviewingId}`);
    if (row) {
      row.style.background = decision === 'approve' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)';
      setTimeout(() => loadLeaveRequests(), 800);
    }
    toast('success', decision === 'approve' ? 'Approved' : 'Rejected', 'Leave request has been updated.');
    closeModal('modal-leave-review');
  } catch (e) {
    toast('error', 'Error', e.message);
  } finally {
    btns.forEach(b => { b.classList.remove('btn-loading'); b.disabled = false; });
  }
}

// ── APPLY LEAVE ───────────────────────────────────────────────────
function openApplyLeave() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('leave-start').value = today;
  document.getElementById('leave-end').value = today;
  document.getElementById('leave-reason').value = '';
  document.getElementById('leave-days-calc').textContent = '';

  // Handle employee vs HR
  const empField = document.getElementById('leave-emp');
  const empLabel = empField.previousElementSibling;
  if (Auth.getUser().role === 'EMPLOYEE') {
    empField.value = Auth.getUser().employeeId;
    empField.style.display = 'none';
    empLabel.style.display = 'none';
  } else {
    empField.value = '';
    empField.style.display = '';
    empLabel.style.display = '';
  }

  document.getElementById('leave-start').addEventListener('change', calcLeaveDays);
  document.getElementById('leave-end').addEventListener('change', calcLeaveDays);

  openModal('modal-leave');
}

function calcLeaveDays() {
  const s = document.getElementById('leave-start').value;
  const e = document.getElementById('leave-end').value;
  if (!s || !e) return;
  const start = new Date(s), end = new Date(e);
  if (end < start) { document.getElementById('leave-days-calc').textContent = 'End date must be after start date.'; return; }
  let days = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) days++;
  }
  document.getElementById('leave-days-calc').textContent = `📅 ${days} working day${days !== 1 ? 's' : ''} requested.`;
}

async function submitLeave() {
  const typeId  = document.getElementById('leave-type-sel').value;
  const start   = document.getElementById('leave-start').value;
  const end     = document.getElementById('leave-end').value;
  const reason  = document.getElementById('leave-reason').value.trim();

  if (!typeId || !start || !end) { toast('warning', 'Required', 'Please fill all required fields.'); return; }

  let empId;
  if (Auth.getUser().role === 'EMPLOYEE') {
    empId = Auth.getUser().employeeId;
  } else {
    if (!Auth.hasPermission('leave.apply')) {
      toast('error', 'Access denied', 'You do not have permission to apply for leave.');
      return;
    }
    const empNum = document.getElementById('leave-emp').value.trim();
    if (!empNum) { toast('warning', 'Required', 'Please enter employee number.'); return; }

    // Resolve emp number if needed
    if (/^\d+$/.test(empNum)) {
      empId = empNum;
    } else {
      const found = _empData?.find(e => e.emp_number.toUpperCase() === empNum.toUpperCase());
      if (!found) {
        // Try to find from API
        try {
          const emps = await API.get('/employees?search=' + empNum);
          const match = emps?.find(e => e.emp_number.toUpperCase() === empNum.toUpperCase());
          if (!match) { toast('error', 'Not found', `Employee ${empNum} not found.`); return; }
          empId = match.employee_id;
        } catch { toast('error', 'Error', 'Could not find employee.'); return; }
      } else {
        empId = found.employee_id;
      }
    }
  }

  const btn = document.querySelector('#modal-leave .btn-primary');
  btn.classList.add('btn-loading'); btn.disabled = true;
  try {
    await API.post('/leave/requests', { employee_id: empId, leave_type_id: typeId, start_date: start, end_date: end, reason });
    toast('success', 'Submitted', 'Leave request has been submitted.');
    closeModal('modal-leave');
    loadLeaveRequests();
    refreshEmployeeLeavePortal();
  } catch (e) {
    toast('error', 'Error', e.message);
  } finally {
    btn.classList.remove('btn-loading'); btn.disabled = false;
  }
}

// ── BALANCES ──────────────────────────────────────────────────────
async function loadLeaveBalances() {
  const year = document.getElementById('leave-bal-year')?.value || new Date().getFullYear();
  buildSkeletonRows('leave-bal-tbody', 9, 5);
  try {
    const data = await API.get(`/leave/balances?year=${year}`);
    if (!data) return;
    const tbody = document.getElementById('leave-bal-tbody');
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:50px;color:var(--text-muted)">No leave balance data for ${year}.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map(lb => {
      const balance = lb.entitled_days - lb.taken_days - lb.pending_days;
      const entitled = lb.entitled_days || lb.annual_days || 1;
      const pct = Math.min(100, ((lb.taken_days / entitled) * 100)).toFixed(0);
      const balColor = balance > 5 ? 'green' : balance > 0 ? 'amber' : 'red';
      return `<tr>
        <td class="td-mono text-gold">${lb.emp_number}</td>
        <td class="font-bold">${lb.full_name}</td>
        <td class="text-muted text-sm">${lb.dept_name || '—'}</td>
        <td>${lb.type_name}</td>
        <td class="td-mono">${entitled}</td>
        <td class="td-mono" style="color:var(--red)">${lb.taken_days}</td>
        <td class="td-mono" style="color:var(--gold)">${lb.pending_days}</td>
        <td class="td-mono font-bold" style="color:var(--${balColor === 'amber' ? 'gold' : balColor})">${balance}</td>
        <td style="min-width:100px">
          <div class="progress" style="height:6px"><div class="progress-bar ${balColor}" style="width:${pct}%"></div></div>
        </td>
      </tr>`;
    }).join('');
  } catch (e) {
    toast('error', 'Load failed', e.message);
  }
}

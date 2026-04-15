'use strict';

// ─── MODAL HELPER FOR DYNAMIC MODALS ─────────────────────────────
async function initSelfservice() {
  try {
    await Promise.all([loadSSProfile(), loadSSLeave(), loadSSLeaveRequests(), loadSSOvertime(), loadSSPayslips()]);
  } catch (e) {
    toast('error', 'Portal error', e.message);
  }
}

async function loadSSProfile() {
  try {
    const emp = await API.get('/selfservice/profile');
    if (!emp) return;
    const initials = `${emp.first_name?.[0] || ''}${emp.last_name?.[0] || ''}`.toUpperCase();
    document.getElementById('ss-profile').innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--grad-gold);display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;color:#0A0F1E;flex-shrink:0">${initials}</div>
        <div>
          <div style="font-size:var(--text-lg);font-weight:700">${emp.first_name} ${emp.middle_name ? emp.middle_name + ' ' : ''}${emp.last_name}</div>
          <div style="font-family:'JetBrains Mono',monospace;color:var(--gold);font-size:var(--text-sm)">${emp.emp_number}</div>
          <div style="margin-top:4px">${statusBadge(emp.status)}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        ${ssField('Department', emp.dept_name)}
        ${ssField('Designation', emp.desig_name)}
        ${ssField('Employment type', emp.employment_type)}
        ${ssField('Hire date', fmtDate(emp.hire_date))}
        ${ssField('Basic salary', 'KES ' + fmt(emp.basic_salary, 0), true)}
        ${ssField('Email', emp.email)}
        ${ssField('Phone', emp.phone_primary)}
        ${ssField('National ID', emp.national_id)}
      </div>
    `;
  } catch (e) {
    document.getElementById('ss-profile').innerHTML = `<div class="empty-state"><div class="empty-icon">👤</div><div class="empty-sub">${e.message}</div></div>`;
  }
}

function ssField(label, value, gold = false) {
  return `<div style="background:var(--bg-secondary);padding:10px 14px;border-radius:var(--radius-md);border:1px solid var(--border)">
    <div style="font-size:var(--text-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">${label}</div>
    <div style="font-size:var(--text-sm);font-weight:600;${gold ? 'color:var(--gold-light);font-family:JetBrains Mono,monospace' : ''}">${value || '—'}</div>
  </div>`;
}

async function loadSSLeave() {
  try {
    const balances = await API.get('/selfservice/leave-balances');
    if (!balances) return;
    const el = document.getElementById('ss-leave-rings');
    if (!balances.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-sub">No leave balances found.</div></div>';
      return;
    }
    el.innerHTML = balances.map(lb => {
      const entitled = lb.entitled_days || lb.annual_days || 1;
      const taken = lb.taken_days || 0;
      const balance = entitled - taken - (lb.pending_days || 0);
      const pct = Math.min(100, (taken / entitled) * 100);
      const color = balance > 5 ? '#10B981' : balance > 0 ? '#F59E0B' : '#EF4444';
      const deg = (pct / 100) * 360;
      return `
        <div class="leave-ring">
          <div class="ring-chart" style="background:conic-gradient(${color} ${deg}deg, var(--border) ${deg}deg)">
            <div style="position:absolute;inset:8px;background:var(--card-elevated);border-radius:50%;display:flex;align-items:center;justify-content:center">
              <span style="font-size:var(--text-md);font-weight:700;color:${color}">${balance}</span>
            </div>
          </div>
          <div class="ring-label">
            <div style="font-weight:600;font-size:var(--text-xs)">${lb.type_name}</div>
            <div style="color:var(--text-muted);font-size:var(--text-xs)">${taken}/${entitled} used</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    document.getElementById('ss-leave-rings').innerHTML = `<div class="empty-state"><div class="empty-sub">${e.message}</div></div>`;
  }
}

async function loadSSLeaveRequests() {
  const tbody = document.getElementById('ss-leave-requests-tbody');
  buildSkeletonRows('ss-leave-requests-tbody', 5, 6);
  try {
    const requests = await API.get('/selfservice/leave-requests');
    if (!requests) return;
    if (!requests.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">
        <div style="font-size:2rem;margin-bottom:8px">🏖</div>No leave requests found.</td></tr>`;
      return;
    }
    tbody.innerHTML = requests.map(r => `
      <tr>
        <td>${r.type_name}</td>
        <td>${fmtDate(r.start_date)}</td>
        <td>${fmtDate(r.end_date)}</td>
        <td class="td-mono">${r.num_days}</td>
        <td>${statusBadge(r.status)}</td>
        <td class="text-muted text-sm">${r.reason || '—'}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">Error loading leave requests: ${e.message}</td></tr>`;
  }
}

async function loadSSPayslips() {
  const tbody = document.getElementById('ss-payslips-tbody');
  buildSkeletonRows('ss-payslips-tbody', 6, 4);
  try {
    const payslips = await API.get('/selfservice/payslips');
    if (!payslips) return;
    if (!payslips.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">
        <div style="font-size:2rem;margin-bottom:8px">💰</div>No payslips available yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = payslips.map(ps => `
      <tr ondblclick="viewSSPayslip(${ps.run_id})" style="cursor:pointer">
        <td class="font-bold">${ps.period_name}</td>
        <td class="text-muted text-sm">${fmtDate(ps.pay_date)}</td>
        <td class="td-mono">KES ${fmt(ps.gross_pay, 0)}</td>
        <td class="td-amount" style="font-size:var(--text-md)">KES ${fmt(ps.net_pay, 0)}</td>
        <td>${statusBadge(ps.status)}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="viewSSPayslip(${ps.run_id})">
            View payslip
          </button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    toast('error', 'Load failed', e.message);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--red-light)">Failed to load payslips</td></tr>`;
  }
}

async function viewSSPayslip(runId) {
  try {
    const run = await API.get(`/selfservice/payslip/${runId}`);
    if (!run) return;
    // Reuse the payroll module's payslip renderer
    if (typeof renderPayslip === 'function') {
      renderPayslip(run);
      openModal('modal-payslip');
    } else {
      toast('error', 'Error', 'Payslip viewer not available.');
    }
  } catch (e) {
    toast('error', 'Error', e.message);
  }
}

// ─── OVERTIME FUNCTIONS ───────────────────────────────────────────────────

async function loadSSOvertime() {
  const tbody = document.getElementById('ss-overtime-tbody');
  buildSkeletonRows('ss-overtime-tbody', 3, 6);
  try {
    const status = document.getElementById('ss-ot-filter')?.value || 'All';
    const submissions = await API.get(`/overtime/my-submissions?status=${encodeURIComponent(status)}`);
    if (!submissions) return;
    if (!submissions.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">
        <div style="font-size:2rem;margin-bottom:8px">⏰</div>No overtime submissions yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = submissions.map(ot => `
      <tr>
        <td>${fmtDate(ot.work_date)}</td>
        <td class="td-mono">${fmt(ot.hours_worked)} hrs</td>
        <td class="text-muted text-sm">${ot.reason || '—'}</td>
        <td>${statusBadge(ot.status)}</td>
        <td class="text-muted text-sm">${fmtDateTime(ot.submitted_at)}</td>
        <td>
          ${ot.status === 'Pending' ? `<button class="btn btn-ghost btn-sm" onclick="deleteSSOvertime(${ot.overtime_id})" title="Delete">🗑</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="viewSSOvertimeDetail(${ot.overtime_id})" title="View">👁</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">Error loading overtime: ${e.message}</td></tr>`;
  }
}

function openSSOvertimeModal() {
  showDynamicModal(`
    <div class="modal-overlay" onclick="closeDynamicModal()"></div>
    <div class="modal-dialog">
      <div class="modal-header">
        <h3>⏰ Submit Overtime</h3>
        <button class="modal-close" onclick="closeDynamicModal()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label required">Work date</label>
          <input type="date" class="form-control" id="ss-ot-work-date" value="${new Date().toISOString().split('T')[0]}" oninput="toggleSSOvertimeSubmitState()">
        </div>
        <div class="form-group">
          <label class="form-label required">Hours worked</label>
          <input type="number" class="form-control" id="ss-ot-hours" placeholder="e.g. 2.5" min="0.5" max="24" step="0.5" oninput="toggleSSOvertimeSubmitState()">
        </div>
        <div class="form-group">
          <label class="form-label required">Reason</label>
          <textarea class="form-control" id="ss-ot-reason" placeholder="What was the overtime for?" rows="3" oninput="toggleSSOvertimeSubmitState()"></textarea>
        </div>
        <div class="form-info">
          <strong>Note:</strong> Your overtime will be submitted as pending and require approval from HR.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeDynamicModal()">Cancel</button>
        <button class="btn btn-primary" id="ss-ot-submit-btn" onclick="submitSSOvertime()" disabled>Submit overtime</button>
      </div>
    </div>
  `);
  toggleSSOvertimeSubmitState();
}

function toggleSSOvertimeSubmitState() {
  const submitBtn = document.getElementById('ss-ot-submit-btn');
  const workDate = document.getElementById('ss-ot-work-date')?.value || '';
  const hoursInput = document.getElementById('ss-ot-hours')?.value || '';
  const reason = document.getElementById('ss-ot-reason')?.value.trim() || '';
  const hoursWorked = parseFloat(hoursInput);
  const isValid = !!workDate && hoursInput !== '' && !Number.isNaN(hoursWorked) && hoursWorked >= 0.1 && hoursWorked <= 24 && !!reason;

  if (submitBtn) {
    submitBtn.disabled = !isValid;
  }
}

async function submitSSOvertime() {
  try {
    const workDate = document.getElementById('ss-ot-work-date').value;
    const hoursInput = document.getElementById('ss-ot-hours').value;
    const hoursWorked = parseFloat(hoursInput);
    const reason = document.getElementById('ss-ot-reason').value.trim();
    
    if (!workDate || hoursInput === '' || isNaN(hoursWorked) || !reason) {
      return toast('error', 'Validation error', 'Please fill in all required fields');
    }

    if (hoursWorked < 0.1 || hoursWorked > 24) {
      return toast('error', 'Invalid hours', 'Hours must be between 0.1 and 24 hours');
    }
    
    const result = await API.post('/overtime/submit', {
      work_date: workDate,
      hours_worked: hoursWorked,
      reason: reason
    });
    
    closeDynamicModal();
    toast('success', 'Success', 'Overtime submitted and pending HR approval');
    loadSSOvertime();
  } catch (e) {
    toast('error', 'Error submitting overtime', e.message);
  }
}

async function deleteSSOvertime(overtimeId) {
  try {
    if (!confirm('Delete this overtime submission? This cannot be undone.')) return;
    
    // Note: You may need to add a DELETE endpoint in server.js
    toast('info', 'Info', 'Contact your administrator to delete submissions');
  } catch (e) {
    toast('error', 'Error deleting overtime', e.message);
  }
}

function viewSSOvertimeDetail(overtimeId) {
  // Get the overtime record from the current submissions
  const tbody = document.getElementById('ss-overtime-tbody');
  const rows = tbody.querySelectorAll('tr');
  let overtimeRecord = null;
  
  // This is a simple approach - in a real app, you'd fetch from API
  // For now, we'll show a basic detail view
  showDynamicModal(`
    <div class="modal-overlay" onclick="closeDynamicModal()"></div>
    <div class="modal-dialog" style="max-width:500px">
      <div class="modal-header">
        <h3>⏰ Overtime Details</h3>
        <button class="modal-close" onclick="closeDynamicModal()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-info">
          <p>Detailed overtime information will be displayed here.</p>
          <p><strong>Note:</strong> This is a placeholder. Full detail view can be implemented by fetching the specific record from the API.</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeDynamicModal()">Close</button>
      </div>
    </div>
  `);
}

'use strict';

// ═══════════════════════════════════════════════════════════════════
// OVERTIME MANAGEMENT MODULE
// ═══════════════════════════════════════════════════════════════════

let overtimeState = {
  mySubmissions: [],
  pendingApprovals: [],
  history: [],
  rates: [],
  currentFilter: 'All'
};

// ─── PAGE INIT ───────────────────────────────────────────────────────
async function initOvertime() {
  loadOvertime();
}

// ─── LOAD OVERTIME ───────────────────────────────────────────────────
async function loadOvertime() {
  try {
    const u = Auth.getUser();
    
    if (u.role === 'EMPLOYEE') {
      await loadMyOvertimeSubmissions();
    } else if (u.role === 'HR') {
      await loadPendingApprovals();
      // Also fetch history for HR to view
      await loadOvertimeHistory();
    } else {
      // Admin and payroll can only view history
      await loadOvertimeHistory();
    }
  } catch (e) {
    toast('error', 'Error loading overtime', e.message);
  }
}

async function loadMyOvertimeSubmissions() {
  try {
    const filter = document.getElementById('ot-filter')?.value || 'All';
    const status = filter === 'All' ? 'All' : filter;
    const url = `/overtime/my-submissions?status=${status}`;
    const data = await API.get(url);
    
    overtimeState.mySubmissions = data;
    renderMyOvertimeSubmissions();
  } catch (e) {
    console.error(e);
    toast('error', 'Error loading submissions', e.message);
  }
}

async function loadPendingApprovals() {
  try {
    const data = await API.get('/overtime/pending-approvals');
    overtimeState.pendingApprovals = data;
    renderPendingApprovals();
  } catch (e) {
    console.error(e);
    toast('error', 'Error loading pending approvals', e.message);
  }
}

async function loadOvertimeHistory() {
  try {
    const year = new Date().getFullYear();
    const url = `/overtime/history?year=${year}`;
    const data = await API.get(url);
    
    overtimeState.history = data;
    renderOvertimeHistory();
  } catch (e) {
    console.error(e);
    toast('error', 'Error loading history', e.message);
  }
}

// ─── RENDER FUNCTIONS ────────────────────────────────────────────────

function renderMyOvertimeSubmissions() {
  const tbody = document.getElementById('ot-tbody') || document.getElementById('overtime-tbody');
  if (!tbody) return;
  
  if (overtimeState.mySubmissions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No overtime submissions</td></tr>';
    return;
  }
  
  // Check if this is the employee page (overtime-tbody) or admin page (ot-tbody)
  const isEmployeePage = tbody.id === 'overtime-tbody';
  
  tbody.innerHTML = overtimeState.mySubmissions.map(ot => `
    <tr>
      ${!isEmployeePage ? `<td>${ot.emp_number || '—'}</td><td>${ot.full_name || '—'}</td>` : ''}
      <td>${fmtDate(ot.work_date)}</td>
      <td>${fmt(ot.hours_worked)} hrs</td>
      <td>${ot.reason || '—'}</td>
      <td>${statusBadge(ot.status)}</td>
      ${!isEmployeePage ? `<td>${ot.rejection_reason ? `<span class="text-muted" title="${ot.rejection_reason}">📌</span>` : '—'}</td>` : ''}
      <td>${fmtDateTime(ot.submitted_at)}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="viewOvertimeDetail(${ot.overtime_id})" title="View">👁</button>
        ${ot.status === 'Pending' ? `<button class="btn btn-ghost btn-sm" onclick="deleteOvertimeSubmission(${ot.overtime_id})" title="Delete">🗑</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function renderPendingApprovals() {
  const tbody = document.getElementById('ot-tbody');
  if (!tbody) return;
  
  if (overtimeState.pendingApprovals.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:20px">No pending approvals</td></tr>';
    return;
  }
  
  tbody.innerHTML = overtimeState.pendingApprovals.map(ot => `
    <tr>
      <td>${ot.emp_number || '—'}</td>
      <td>${ot.full_name || '—'}</td>
      <td>${ot.dept_name || '—'}</td>
      <td>${fmtDate(ot.work_date)}</td>
      <td>Standard</td>
      <td>${fmt(ot.hours_worked)}</td>
      <td>1.5x</td>
      <td>${statusBadge(ot.status)}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-primary btn-sm" onclick="approveOvertime(${ot.overtime_id})">✓</button>
          <button class="btn btn-danger btn-sm" onclick="rejectOvertimeModal(${ot.overtime_id})">✗</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderOvertimeHistory() {
  const tbody = document.getElementById('ot-tbody');
  if (!tbody) return;
  
  if (overtimeState.history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:20px">No overtime records</td></tr>';
    return;
  }
  
  tbody.innerHTML = overtimeState.history.map(ot => `
    <tr>
      <td>${ot.emp_number || '—'}</td>
      <td>${ot.full_name || '—'}</td>
      <td>${ot.dept_name || '—'}</td>
      <td>${fmtDate(ot.work_date)}</td>
      <td>Standard</td>
      <td>${fmt(ot.hours_worked)}</td>
      <td>1.5x</td>
      <td>${statusBadge(ot.status)}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="viewOvertimeDetail(${ot.overtime_id})">👁</button>
      </td>
    </tr>
  `).join('');
}

// ─── MODAL: ADD OVERTIME ─────────────────────────────────────────────

function openAddOvertime() {
  showDynamicModal(`
    <div class="modal-overlay" onclick="closeDynamicModal()"></div>
    <div class="modal-dialog">
      <div class="modal-header">
        <h3>📝 Submit Overtime</h3>
        <button class="modal-close" onclick="closeDynamicModal()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label required">Work date</label>
          <input type="date" class="form-control" id="ot-submit-work-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label class="form-label required">Hours worked</label>
          <input type="number" class="form-control" id="ot-submit-hours" placeholder="e.g. 2.5" min="0.5" max="24" step="0.5">
        </div>
        <div class="form-group">
          <label class="form-label">Reason</label>
          <textarea class="form-control" id="ot-submit-reason" placeholder="What was the overtime for?" rows="3"></textarea>
        </div>
        <div class="form-info">
          <strong>Note:</strong> Your overtime will be submitted as pending and require approval from HR.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeDynamicModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitOvertime()">Submit overtime</button>
      </div>
    </div>
  `);
}

async function submitOvertime() {
  try {
    const workDate = document.getElementById('ot-submit-work-date').value;
    const hoursInput = document.getElementById('ot-submit-hours').value;
    const hoursWorked = parseFloat(hoursInput);
    const reason = document.getElementById('ot-submit-reason').value;
    
    if (!workDate || hoursInput === '' || isNaN(hoursWorked)) {
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
    loadMyOvertimeSubmissions();
  } catch (e) {
    toast('error', 'Error submitting overtime', e.message);
  }
}

// ─── MODAL: REJECT OVERTIME ─────────────────────────────────────────

function rejectOvertimeModal(overtimeId) {
  showDynamicModal(`
    <div class="modal-overlay" onclick="closeDynamicModal()"></div>
    <div class="modal-dialog">
      <div class="modal-header">
        <h3>Reject Overtime</h3>
        <button class="modal-close" onclick="closeDynamicModal()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label required">Rejection reason</label>
          <textarea class="form-control" id="reject-reason" placeholder="Why are you rejecting this?" rows="4"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeDynamicModal()">Cancel</button>
        <button class="btn btn-danger" onclick="rejectOvertimeConfirm(${overtimeId})">Reject</button>
      </div>
    </div>
  `);
}

async function rejectOvertimeConfirm(overtimeId) {
  try {
    const rejectionReason = document.getElementById('reject-reason').value;
    
    if (!rejectionReason) {
      return toast('error', 'Required', 'Please provide a rejection reason');
    }
    
    await API.patch(`/overtime/${overtimeId}/reject`, {
      rejection_reason: rejectionReason
    });
    
    closeDynamicModal();
    toast('success', 'Success', 'Overtime rejected');
    loadPendingApprovals();
  } catch (e) {
    toast('error', 'Error rejecting overtime', e.message);
  }
}

// ─── APPROVE/REJECT ACTIONS ─────────────────────────────────────────

async function approveOvertime(overtimeId) {
  try {
    if (!confirm('Approve this overtime submission?')) return;
    
    await API.patch(`/overtime/${overtimeId}/approve`, {});
    
    toast('success', 'Success', 'Overtime approved');
    loadPendingApprovals();
  } catch (e) {
    toast('error', 'Error approving overtime', e.message);
  }
}

async function deleteOvertimeSubmission(overtimeId) {
  try {
    if (!confirm('Delete this overtime submission? This cannot be undone.')) return;
    
    // Note: You may need to add a DELETE endpoint in server.js
    toast('info', 'Info', 'Contact your administrator to delete submissions');
  } catch (e) {
    toast('error', 'Error deleting overtime', e.message);
  }
}

// ─── DETAIL VIEW ─────────────────────────────────────────────────────

function viewOvertimeDetail(overtimeId) {
  const ot = [...overtimeState.mySubmissions, ...overtimeState.pendingApprovals, ...overtimeState.history]
    .find(o => o.overtime_id === overtimeId);
  
  if (!ot) return toast('error', 'Not found', 'Overtime record not found');
  
  showDynamicModal(`
    <div class="modal-overlay" onclick="closeDynamicModal()"></div>
    <div class="modal-dialog" style="max-width:500px">
      <div class="modal-header">
        <h3>📋 Overtime Details</h3>
        <button class="modal-close" onclick="closeDynamicModal()">×</button>
      </div>
      <div class="modal-body">
        <div class="detail-group">
          <label>Employee</label>
          <div class="detail-value">${ot.full_name} (${ot.emp_number})</div>
        </div>
        <div class="detail-group">
          <label>Work date</label>
          <div class="detail-value">${fmtDate(ot.work_date)}</div>
        </div>
        <div class="detail-group">
          <label>Hours worked</label>
          <div class="detail-value">${fmt(ot.hours_worked)} hours</div>
        </div>
        <div class="detail-group">
          <label>Reason</label>
          <div class="detail-value">${ot.reason || '—'}</div>
        </div>
        <div class="detail-group">
          <label>Status</label>
          <div class="detail-value">${statusBadge(ot.status)}</div>
        </div>
        ${ot.rejection_reason ? `
          <div class="detail-group">
            <label>Rejection reason</label>
            <div class="detail-value" style="color:var(--red-light)">${ot.rejection_reason}</div>
          </div>
        ` : ''}
        <div class="detail-group">
          <label>Submitted</label>
          <div class="detail-value">${fmtDateTime(ot.submitted_at)}</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeDynamicModal()">Close</button>
      </div>
    </div>
  `);
}

// ─── SIDEBAR NAVIGATION ──────────────────────────────────────────────

function getOvertimeSidebarItems() {
  const u = Auth.getUser();
  
  if (u.role === 'EMPLOYEE') {
    return [
      { label: '📝 My submissions', onclick: 'initOvertimePage(); switchAttTab("overtime",event.target)' },
      { label: '⏳ Submit new', onclick: 'openAddOvertime()' }
    ];
  } else if (u.role === 'HR') {
    return [
      { label: '⏳ Pending approvals', onclick: 'initOvertimePage(); switchAttTab("overtime",event.target)' },
      { label: '📊 Overtime history', onclick: 'loadOvertimeHistory()' }
    ];
  }
  
  return [];
}

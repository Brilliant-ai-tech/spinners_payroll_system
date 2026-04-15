'use strict';

let _attRecords = [];
let _otData = [];

function initAttendance() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('att-date').value = today;

  // Populate year/month selectors
  const yearSel = document.getElementById('sum-year');
  const now = new Date();
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) {
    yearSel.innerHTML += `<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}</option>`;
  }
  document.getElementById('sum-month').value = now.getMonth() + 1;

  loadAttendance();
}

function switchAttTab(tab, el) {
  document.querySelectorAll('[id^="att-tab-"]').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  document.getElementById('att-tab-' + tab).classList.add('active');
  if (el) el.classList.add('active');
  if (tab === 'overtime') loadOvertime();
  if (tab === 'summary') loadAttSummary();
}

// ── DAILY ATTENDANCE ──────────────────────────────────────────────
async function loadAttendance() {
  const date = document.getElementById('att-date').value;
  if (!date) return;
  buildSkeletonRows('att-tbody', 7, 5);
  try {
    const data = await API.get(`/attendance?date=${date}`);
    if (!data) return;
    _attRecords = data.records || [];
    renderAttTable(_attRecords);
  } catch (e) {
    toast('error', 'Load failed', e.message);
  }
}

function renderAttTable(records) {
  const tbody = document.getElementById('att-tbody');
  if (!records.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">No employees found for this date.</td></tr>`;
    return;
  }
  tbody.innerHTML = records.map((r, i) => {
    const rowColor = r.status === 'Present' ? 'rgba(16,185,129,0.06)' : r.status === 'Absent' ? 'rgba(239,68,68,0.06)' : r.status === 'Leave' ? 'rgba(59,130,246,0.06)' : '';
    return `<tr style="background:${rowColor}" id="att-row-${i}">
      <td class="td-mono text-gold">${r.emp_number}</td>
      <td class="font-bold">${r.full_name}</td>
      <td class="text-muted text-sm">${r.dept_name || '—'}</td>
      <td>
        <select class="toolbar-select" style="padding:4px 8px;font-size:var(--text-xs)"
          onchange="updateAttStatus(${i},this.value,this.closest('tr'))">
          ${['Present','Absent','Leave','Half Day','Holiday'].map(s =>
            `<option value="${s}" ${r.status === s ? 'selected' : ''}>${s}</option>`
          ).join('')}
        </select>
      </td>
      <td><input type="time" class="form-control" style="padding:4px 8px;font-size:var(--text-xs);width:110px"
        value="${r.time_in || ''}" onchange="updateAttField(${i},'time_in',this.value)"></td>
      <td><input type="time" class="form-control" style="padding:4px 8px;font-size:var(--text-xs);width:110px"
        value="${r.time_out || ''}" onchange="updateAttField(${i},'time_out',this.value)"></td>
      <td><input type="number" class="form-control" style="padding:4px 8px;font-size:var(--text-xs);width:70px" min="0"
        value="${r.late_minutes || 0}" onchange="updateAttField(${i},'late_minutes',this.value)"></td>
    </tr>`;
  }).join('');
}

function updateAttStatus(idx, status, row) {
  _attRecords[idx].status = status;
  const colors = { Present: 'rgba(16,185,129,0.06)', Absent: 'rgba(239,68,68,0.06)', Leave: 'rgba(59,130,246,0.06)', 'Half Day': 'rgba(245,158,11,0.06)', Holiday: 'rgba(139,92,246,0.06)' };
  row.style.background = colors[status] || '';
}
function updateAttField(idx, field, val) { _attRecords[idx][field] = val; }

function markAllPresent() {
  _attRecords.forEach((r, i) => {
    r.status = 'Present';
    const sel = document.querySelector(`#att-row-${i} select`);
    if (sel) sel.value = 'Present';
    const row = document.getElementById('att-row-' + i);
    if (row) row.style.background = 'rgba(16,185,129,0.06)';
  });
  toast('info', 'Marked', 'All employees set to Present.');
}

async function saveAttendance() {
  const date = document.getElementById('att-date').value;
  if (!date || !_attRecords.length) return;
  const btn = document.querySelector('#att-tab-daily .btn-primary');
  btn.classList.add('btn-loading'); btn.disabled = true;
  try {
    await API.post('/attendance', { date, records: _attRecords });
    toast('success', 'Saved', `Attendance for ${fmtDate(date)} saved.`);
  } catch (e) {
    toast('error', 'Save failed', e.message);
  } finally {
    btn.classList.remove('btn-loading'); btn.disabled = false;
  }
}

function exportAttCSV() {
  const rows = _attRecords.map(r => ({
    'Date': document.getElementById('att-date').value,
    'Emp #': r.emp_number,
    'Name': r.full_name,
    'Department': r.dept_name,
    'Status': r.status,
    'Time in': r.time_in || '',
    'Time out': r.time_out || '',
    'Late (min)': r.late_minutes || 0
  }));
  downloadCSV('attendance.csv', rows);
}

// ── OVERTIME ──────────────────────────────────────────────────────
async function loadOvertime() {
  const status = document.getElementById('ot-filter')?.value || 'All';
  buildSkeletonRows('ot-tbody', 9, 5);
  try {
    _otData = await API.get(`/overtime?status=${status}`);
    if (!_otData) return;
    const tbody = document.getElementById('ot-tbody');
    if (!_otData.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">No overtime records.</td></tr>`;
      return;
    }
    tbody.innerHTML = _otData.map(ot => {
      const approvedHighlight = ot.status === 'Approved' ? 'background:rgba(245,158,11,0.04)' : '';
      return `<tr style="${approvedHighlight}" ondblclick="${ot.status==='Pending' ? `approveOvertime(${ot.ot_id})` : ''}">
        <td class="td-mono text-gold">${ot.emp_number}</td>
        <td>${ot.full_name}</td>
        <td class="text-muted text-sm">${ot.dept_name || '—'}</td>
        <td>${fmtDate(ot.ot_date)}</td>
        <td>${ot.ot_type}</td>
        <td class="td-mono">${ot.approved_hours}</td>
        <td class="td-mono">×${ot.rate_multiplier}</td>
        <td>${statusBadge(ot.status)}</td>
        <td class="td-actions">
          ${ot.status === 'Pending' ? `<button class="action-btn" onclick="approveOvertime(${ot.ot_id})" title="Approve">✓</button>` : ''}
        </td>
      </tr>`;
    }).join('');
  } catch (e) {
    toast('error', 'Load failed', e.message);
  }
}

async function approveOvertime(id) {
  if (!confirm('Approve this overtime entry?')) return;
  try {
    await API.patch(`/overtime/${id}/approve`, {});
    toast('success', 'Approved', 'Overtime has been approved.');
    loadOvertime();
  } catch (e) {
    toast('error', 'Error', e.message);
  }
}

function openAddOvertime() {
  document.getElementById('ot-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('ot-hours').value = '';
  document.getElementById('ot-emp').value = '';
  openModal('modal-overtime');
}

async function saveOvertime() {
  const empNum = document.getElementById('ot-emp').value.trim();
  const date   = document.getElementById('ot-date').value;
  const type   = document.getElementById('ot-type').value;
  const hours  = document.getElementById('ot-hours').value;
  const rate   = document.getElementById('ot-rate').value || 1.5;

  if (!empNum || !date || !hours) { toast('warning', 'Required', 'Please fill all required fields.'); return; }

  // Resolve emp number to ID
  const emp = _empData.find(e => e.emp_number.toUpperCase() === empNum.toUpperCase());
  if (!emp) { toast('error', 'Not found', `Employee ${empNum} not found. Load employee list first.`); return; }

  const btn = document.querySelector('#modal-overtime .btn-primary');
  btn.classList.add('btn-loading'); btn.disabled = true;
  try {
    await API.post('/overtime', { employee_id: emp.employee_id, ot_date: date, ot_type: type, hours, rate_multiplier: rate });
    toast('success', 'Added', 'Overtime entry added.');
    closeModal('modal-overtime');
    loadOvertime();
  } catch (e) {
    toast('error', 'Error', e.message);
  } finally {
    btn.classList.remove('btn-loading'); btn.disabled = false;
  }
}

// ── MONTHLY SUMMARY ───────────────────────────────────────────────
async function loadAttSummary() {
  const year  = document.getElementById('sum-year')?.value;
  const month = document.getElementById('sum-month')?.value;
  buildSkeletonRows('sum-tbody', 9, 5);
  try {
    const data = await API.get(`/attendance/summary?year=${year}&month=${month}`);
    if (!data) return;
    const tbody = document.getElementById('sum-tbody');
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">No summary data. Run attendance generation first.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map(r => {
      const pct = r.working_days ? ((r.days_present / r.working_days) * 100).toFixed(1) : 0;
      const barColor = pct >= 90 ? 'green' : pct >= 80 ? 'gold' : 'orange';
      const rowStyle = pct < 80 ? 'color:var(--orange-light)' : '';
      return `<tr style="${rowStyle}">
        <td class="td-mono">${r.emp_number}</td>
        <td class="font-bold">${r.full_name}</td>
        <td class="text-muted text-sm">${r.dept_name}</td>
        <td class="td-mono">${r.working_days}</td>
        <td class="td-mono" style="color:var(--green)">${r.days_present}</td>
        <td class="td-mono" style="color:var(--red)">${r.days_absent}</td>
        <td class="td-mono" style="color:var(--blue)">${r.days_leave}</td>
        <td class="td-mono">${r.total_late_mins || 0}</td>
        <td style="min-width:120px">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="progress" style="flex:1;height:6px"><div class="progress-bar ${barColor}" style="width:${pct}%"></div></div>
            <span style="font-size:var(--text-xs);min-width:35px">${pct}%</span>
          </div>
        </td>
      </tr>`;
    }).join('');
  } catch (e) {
    toast('error', 'Load failed', e.message);
  }
}

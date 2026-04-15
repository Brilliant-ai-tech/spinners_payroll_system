'use strict';

let _periods = [];
let _selectedPeriodId = null;

function canManagePayroll() {
  return Auth.getUser().role === 'PAYROLL';
}

async function initPayroll() {
  const addBtn = document.querySelector('#period-list > button');
  if (addBtn) addBtn.style.display = canManagePayroll() ? '' : 'none';
  await loadPeriods();
}

async function loadPeriods() {
  try {
    _periods = await API.get('/payroll/periods');
    if (!_periods) return;
    renderPeriodList();
    // Auto-select first period
    if (_periods.length) {
      const targetId = _periods.some(p => p.period_id === _selectedPeriodId) ? _selectedPeriodId : _periods[0].period_id;
      await selectPeriod(targetId);
    } else {
      _selectedPeriodId = null;
      window._currentRuns = [];
      window._currentPeriod = null;
      document.getElementById('period-detail').innerHTML = `<div class="empty-state"><div class="empty-icon">💼</div><div class="empty-title">No payroll periods yet</div><div class="empty-sub">${canManagePayroll() ? 'Create a payroll period to calculate salaries, deductions, and payslips.' : 'No payroll periods have been created yet.'}</div></div>`;
    }
  } catch (e) {
    toast('error', 'Load failed', e.message);
  }
}

function renderPeriodList() {
  const list = document.getElementById('period-list');
  const existingCards = list.querySelectorAll('.period-card');
  existingCards.forEach(c => c.remove());

  _periods.forEach(p => {
    const card = document.createElement('div');
    card.className = `period-card${p.period_id === _selectedPeriodId ? ' selected' : ''}`;
    card.id = `period-card-${p.period_id}`;
    card.onclick = () => selectPeriod(p.period_id);
    card.innerHTML = `
      <div class="period-card-name">${p.period_name}</div>
      <div class="period-card-meta">
        ${statusBadge(p.status)}
        <span class="period-card-net">KES ${fmt(p.total_net, 0)}</span>
      </div>
    `;
    list.appendChild(card);
  });
}

async function selectPeriod(id) {
  _selectedPeriodId = id;
  document.querySelectorAll('.period-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById(`period-card-${id}`);
  if (card) card.classList.add('selected');
  await loadPeriodDetail(id);
}

async function loadPeriodDetail(id) {
  const panel = document.getElementById('period-detail');
  panel.innerHTML = `<div style="padding:40px;text-align:center"><div class="skeleton skeleton-card" style="height:80px;margin-bottom:16px"></div>${Array(5).fill('<div class="skeleton skeleton-row"></div>').join('')}</div>`;
  try {
    const data = await API.get(`/payroll/periods/${id}/runs`);
    if (!data) return;
    const { period, runs } = data;
    const actionBtns = getPeriodActions(period);
    panel.innerHTML = `
      <div class="card mb-4">
        <div class="card-body">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
            <div>
              <h2 style="font-size:var(--text-xl);margin-bottom:4px">${period.period_name}</h2>
              <div style="display:flex;align-items:center;gap:10px">
                ${statusBadge(period.status)}
                <span class="text-muted text-sm">Pay date: ${fmtDate(period.pay_date)}</span>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">${actionBtns}</div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
            ${kpiMini('Gross pay', 'KES ' + fmt(period.total_gross, 0), 'teal')}
            ${kpiMini('PAYE', 'KES ' + fmt(period.total_paye, 0), 'orange')}
            ${kpiMini('Deductions', 'KES ' + fmt(period.total_deductions, 0), 'red')}
            ${kpiMini('Net pay', 'KES ' + fmt(period.total_net, 0), 'gold')}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">📋 Payroll runs — ${runs.length} employees</span>
          <button class="btn btn-ghost btn-sm" onclick="exportRunsCSV()">↓ CSV</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Emp #</th><th>Name</th><th>Department</th>
              <th>Gross pay</th><th>PAYE</th><th>NSSF</th><th>NHIF</th><th>Housing levy</th>
              <th>Total ded.</th><th>Net pay</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${!runs.length
                ? `<tr><td colspan="11" style="text-align:center;padding:50px;color:var(--text-muted)">
                    <div style="font-size:2rem;margin-bottom:8px">💼</div>
                    No runs yet. ${period.status === 'Open' ? 'Create or process the payroll period to generate the latest employee payslips.' : ''}
                   </td></tr>`
                : runs.map(r => `
                  <tr ondblclick="viewPayslip(${r.run_id})" style="cursor:pointer">
                    <td class="td-mono text-gold">${r.emp_number}</td>
                    <td class="font-bold">${r.full_name}</td>
                    <td class="text-muted text-sm">${r.dept_name}</td>
                    <td class="td-mono">KES ${fmt(r.gross_pay, 0)}</td>
                    <td class="td-mono" style="color:var(--orange)">KES ${fmt(r.paye_payable, 0)}</td>
                    <td class="td-mono">KES ${fmt(r.nssf_employee, 0)}</td>
                    <td class="td-mono">KES ${fmt(r.nhif, 0)}</td>
                    <td class="td-mono">KES ${fmt(r.housing_levy_employee, 0)}</td>
                    <td class="td-mono" style="color:var(--red)">KES ${fmt(r.total_deductions, 0)}</td>
                    <td class="td-amount" style="font-size:var(--text-md)">KES ${fmt(r.net_pay, 0)}</td>
                    <td>${statusBadge(r.status)}</td>
                  </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    window._currentRuns = runs;
    window._currentPeriod = period;
  } catch (e) {
    toast('error', 'Load failed', e.message);
    panel.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Failed to load period</div><div class="empty-sub">${e.message}</div></div>`;
  }
}

function kpiMini(label, value, color) {
  return `<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;text-align:center">
    <div style="font-size:var(--text-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">${label}</div>
    <div style="font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--${color});font-size:var(--text-md)">${value}</div>
  </div>`;
}

function getPeriodActions(period) {
  if (!canManagePayroll()) return '';
  const btns = [];
  if (period.status === 'Open') {
    btns.push(`<button class="btn btn-secondary" onclick="showProcessConfirm(${period.period_id},'${period.period_name}')">⚙ Process payroll</button>`);
  }
  if (period.status === 'Under Review') {
    btns.push(`<button class="btn btn-primary" onclick="doApprovePeriod(${period.period_id})">✓ Approve payroll</button>`);
  }
  if (period.status === 'Approved') {
    btns.push(`<button class="btn btn-secondary" onclick="doMarkPaid(${period.period_id})">💵 Mark as paid</button>`);
  }
  if (period.status === 'Paid' || period.status === 'Approved') {
    btns.push(`<button class="btn btn-ghost btn-sm" onclick="exportRunsCSV()">↓ Export</button>`);
  }
  return btns.join('');
}

// ── PERIOD ACTIONS ────────────────────────────────────────────────
function showProcessConfirm(periodId, periodName) {
  document.getElementById('confirm-period-name').textContent = periodName;
  document.getElementById('confirm-process-btn').onclick = () => doProcessPeriod(periodId);
  openModal('modal-confirm-process');
}

async function doProcessPeriod(id) {
  const btn = document.getElementById('confirm-process-btn');
  btn.classList.add('btn-loading'); btn.disabled = true;
  try {
    await API.post(`/payroll/periods/${id}/process`, {});
    toast('success', 'Processed!', 'Payroll has been calculated for all active employees.');
    closeModal('modal-confirm-process');
    await loadPeriods();
    selectPeriod(id);
  } catch (e) {
    toast('error', 'Process failed', e.message);
  } finally {
    btn.classList.remove('btn-loading'); btn.disabled = false;
  }
}

async function doApprovePeriod(id) {
  if (!confirm('Approve this payroll period? This will generate payslips.')) return;
  try {
    await API.post(`/payroll/periods/${id}/approve`, {});
    toast('success', 'Approved!', 'Payroll period has been approved and payslips generated.');
    await loadPeriods();
    selectPeriod(id);
  } catch (e) {
    toast('error', 'Approve failed', e.message);
  }
}

async function doMarkPaid(id) {
  if (!confirm('Mark this payroll as Paid? Loan balances will be reduced.')) return;
  try {
    await API.post(`/payroll/periods/${id}/mark-paid`, {});
    toast('success', 'Marked as Paid!', 'Payroll status updated to Paid.');
    await loadPeriods();
    selectPeriod(id);
  } catch (e) {
    toast('error', 'Error', e.message);
  }
}

// ── NEW PERIOD ────────────────────────────────────────────────────
function openNewPeriod() {
  if (!canManagePayroll()) {
    toast('error', 'Access denied', 'Only the Payroll officer can create payroll periods.');
    return;
  }
  const now = new Date();
  document.getElementById('period-year').value = now.getFullYear();
  document.getElementById('period-month').value = now.getMonth() + 1;
  autofillPeriodDates();
  openModal('modal-new-period');
  document.getElementById('period-year').onchange = autofillPeriodDates;
  document.getElementById('period-month').onchange = autofillPeriodDates;
}

function autofillPeriodDates() {
  const y = parseInt(document.getElementById('period-year').value);
  const m = parseInt(document.getElementById('period-month').value);
  if (!y || !m) return;
  const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('period-name').value = `${monthNames[m]} ${y}`;
  const startDate = new Date(y, m - 1, 1);
  const endDate   = new Date(y, m, 0);
  document.getElementById('period-start').value = startDate.toISOString().split('T')[0];
  document.getElementById('period-end').value   = endDate.toISOString().split('T')[0];
  // Last working day of month as pay date
  let payDay = new Date(endDate);
  while (payDay.getDay() === 0 || payDay.getDay() === 6) payDay.setDate(payDay.getDate() - 1);
  document.getElementById('period-paydate').value = payDay.toISOString().split('T')[0];
  // Calculate working days
  let wd = 0;
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) wd++;
  }
  document.getElementById('period-wdays').value = wd;
}

async function createPeriod() {
  if (!canManagePayroll()) {
    toast('error', 'Access denied', 'Only the Payroll officer can create payroll periods.');
    return;
  }
  const name  = document.getElementById('period-name').value.trim();
  const year  = document.getElementById('period-year').value;
  const month = document.getElementById('period-month').value;
  const start = document.getElementById('period-start').value;
  const end   = document.getElementById('period-end').value;
  const pay   = document.getElementById('period-paydate').value;
  const wdays = document.getElementById('period-wdays').value;
  if (!name || !year || !month || !start || !end || !pay) { toast('warning', 'Required', 'Please fill all fields.'); return; }
  if (new Date(start) > new Date(end)) { toast('warning', 'Invalid dates', 'Start date cannot be later than end date.'); return; }
  if (new Date(pay) < new Date(start)) { toast('warning', 'Invalid pay date', 'Pay date cannot be before the period starts.'); return; }
  const btn = document.querySelector('#modal-new-period .btn-primary');
  btn.classList.add('btn-loading'); btn.disabled = true;
  try {
    const result = await API.post('/payroll/periods', { period_name: name, period_year: year, period_month: month, pay_date: pay, start_date: start, end_date: end, working_days: wdays });
    toast('success', 'Payroll updated', result?.message || `${name} period has been created and processed for all active employees.`);
    closeModal('modal-new-period');
    _selectedPeriodId = result?.periodId || _selectedPeriodId;
    await loadPeriods();
  } catch (e) {
    toast('error', 'Error', e.message);
  } finally {
    btn.classList.remove('btn-loading'); btn.disabled = false;
  }
}

// ── PAYSLIP VIEWER ────────────────────────────────────────────────
async function viewPayslip(runId) {
  try {
    const run = await API.get(`/payroll/payslip/${runId}`);
    if (!run) return;
    renderPayslip(run);
    openModal('modal-payslip');
  } catch (e) {
    toast('error', 'Error', e.message);
  }
}

function renderPayslip(run) {
  const co = 'SPINNERS MATTRESS COMPANY';
  const watermark = run.status === 'Paid' ? 'PAID' : 'APPROVED';
  document.getElementById('payslip-body').innerHTML = `
    <div class="payslip-doc">
      <div class="payslip-watermark">${watermark}</div>
      <div class="payslip-content">
        <div class="payslip-header">
          <div>
            <div class="payslip-company">${co}</div>
            <div style="font-size:12px;opacity:0.8">Payroll Department</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:16px;font-weight:700">PAYSLIP</div>
            <div class="payslip-period">${run.period_name}</div>
            <div style="font-size:12px;opacity:0.8">Pay date: ${fmtDate(run.pay_date)}</div>
          </div>
        </div>
        <div class="payslip-emp-row">
          <div class="payslip-emp-item"><label>Employee #</label><span>${run.emp_number}</span></div>
          <div class="payslip-emp-item"><label>Full name</label><span>${run.full_name}</span></div>
          <div class="payslip-emp-item"><label>Department</label><span>${run.dept_name}</span></div>
          <div class="payslip-emp-item"><label>Designation</label><span>${run.designation}</span></div>
          <div class="payslip-emp-item"><label>Days worked</label><span>${run.days_worked} / ${run.working_days}</span></div>
          <div class="payslip-emp-item"><label>Bank</label><span>${run.bank_name || '—'}</span></div>
        </div>
        <div class="payslip-earnings-deductions">
          <div class="payslip-col">
            <h4>Earnings</h4>
            ${psRow('Basic salary', run.prorated_basic)}
            ${run.house_allowance ? psRow('House allowance', run.house_allowance) : ''}
            ${run.transport_allowance ? psRow('Transport allowance', run.transport_allowance) : ''}
            ${run.medical_allowance ? psRow('Medical allowance', run.medical_allowance) : ''}
            ${run.other_allowances ? psRow('Other allowances', run.other_allowances) : ''}
            ${run.overtime_pay ? psRow('Overtime pay', run.overtime_pay) : ''}
            <div class="payslip-total"><span>GROSS PAY</span><span>KES ${fmt(run.gross_pay)}</span></div>
          </div>
          <div class="payslip-col">
            <h4>Deductions</h4>
            ${psRow('PAYE', run.paye_payable)}
            ${psRow('NSSF (employee)', run.nssf_employee)}
            ${psRow('NHIF', run.nhif)}
            ${psRow('Housing levy', run.housing_levy_employee)}
            ${run.loan_deduction ? psRow('Loan repayment', run.loan_deduction) : ''}
            <div class="payslip-total"><span>TOTAL DEDUCTIONS</span><span>KES ${fmt(run.total_deductions)}</span></div>
          </div>
        </div>
        <div class="payslip-net">
          <div class="payslip-net-label">Net pay</div>
          <div class="payslip-net-amount">KES ${fmt(run.net_pay)}</div>
          <div style="font-size:11px;opacity:0.85;margin-top:4px">Account: ${run.bank_account || '—'}</div>
        </div>
        <div style="margin-top:16px;padding:12px;background:#f8f9fa;border-radius:8px;font-size:12px;color:#666">
          <strong>PAYE computation:</strong>
          Taxable income: KES ${fmt(run.taxable_income)} |
          Gross PAYE before relief: see KRA rates |
          Personal relief: KES ${fmt(run.personal_relief)} |
          Net PAYE: KES ${fmt(run.paye_payable)}
        </div>
        <div style="margin-top:10px;padding:12px;background:#f0faf5;border-radius:8px;font-size:12px;color:#666">
          <strong>Employer contributions (for information only):</strong>
          NSSF employer: KES ${fmt(run.nssf_employer)} |
          Housing levy employer: KES ${fmt(run.housing_levy_employer)}
        </div>
        <div style="margin-top:16px;text-align:center;font-size:11px;color:#999">
          This is a computer-generated payslip and requires no signature. Queries: payroll@spinners.co.ke
        </div>
      </div>
    </div>
  `;
}

function psRow(label, value) {
  if (!value || value == 0) return '';
  return `<div class="payslip-row"><span>${label}</span><span>KES ${fmt(value)}</span></div>`;
}

function exportRunsCSV() {
  if (!window._currentRuns || !window._currentRuns.length) return;
  const rows = window._currentRuns.map(r => ({
    'Emp #': r.emp_number, 'Name': r.full_name, 'Department': r.dept_name,
    'Basic salary': r.basic_salary, 'Gross pay': r.gross_pay,
    'PAYE': r.paye_payable, 'NSSF': r.nssf_employee, 'NHIF': r.nhif,
    'Housing levy': r.housing_levy_employee, 'Total deductions': r.total_deductions,
    'Net pay': r.net_pay, 'Bank': r.bank_name, 'Account': r.bank_account
  }));
  downloadCSV(`payroll-${window._currentPeriod?.period_name || 'export'}.csv`, rows);
}

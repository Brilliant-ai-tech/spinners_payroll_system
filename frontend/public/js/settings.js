'use strict';

let _roles = [];
let _settingsData = [];

async function initSettings() {
  configureSettingsForRole();
  await loadRoles();
  loadUsers();
}

function switchSettingsTab(tab, el) {
  document.querySelectorAll('[id^="settings-tab-"]').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  document.getElementById('settings-tab-' + tab).classList.add('active');
  if (el) el.classList.add('active');
  if (tab === 'system') loadSystemSettings();
  if (tab === 'tax') loadTaxTables();
  if (tab === 'company') loadCompanySettings();
}

function configureSettingsForRole() {
  const role = Auth.getUser().role;
  const addUserBtn = document.getElementById('add-user-btn');
  const approvalNote = document.getElementById('user-approval-note');
  const statusField = document.getElementById('user-status')?.closest('.form-group');
  const tabButtons = document.querySelectorAll('#page-settings .tabs .tab');
  const nonUserTabs = ['system', 'tax', 'company'];

  if (role === 'HR') {
    if (addUserBtn) addUserBtn.style.display = 'none';
    if (statusField) statusField.style.display = 'none';
    if (approvalNote) approvalNote.style.display = 'none';
    tabButtons.forEach(btn => {
      const isUsersTab = btn.textContent.toLowerCase().includes('users');
      btn.style.display = isUsersTab ? '' : 'none';
    });
    nonUserTabs.forEach(tab => {
      const panel = document.getElementById('settings-tab-' + tab);
      if (panel) panel.style.display = 'none';
    });
  } else {
    if (addUserBtn) addUserBtn.style.display = '';
    if (statusField) statusField.style.display = '';
    tabButtons.forEach(btn => btn.style.display = '');
    nonUserTabs.forEach(tab => {
      const panel = document.getElementById('settings-tab-' + tab);
      if (panel) panel.style.display = '';
    });
  }
}

function userStatusBadge(user) {
  if (user.approval_status === 'Pending') return statusBadge('Pending');
  if (user.approval_status === 'Rejected') return statusBadge('Rejected');
  return user.is_active ? statusBadge('Active') : statusBadge('Inactive');
}

async function loadRoles() {
  if (Auth.getUser().role !== 'ADMIN') return;
  try {
    _roles = await API.get('/roles') || [];
    const sel = document.getElementById('user-role');
    if (sel) {
      sel.innerHTML = _roles.map(r => `<option value="${r.role_id}">${r.role_name} (${r.role_code})</option>`).join('');
    }
  } catch {}
}

async function loadUsers() {
  buildSkeletonRows('users-tbody', 7, 5);
  try {
    const role = Auth.getUser().role;
    const users = await API.get('/users');
    if (!users) return;
    const tbody = document.getElementById('users-tbody');
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">No users found.</td></tr>`;
      return;
    }
    tbody.innerHTML = users.map(u => {
      const rowAttrs = role === 'ADMIN' ? `onclick="openEditUser(${u.user_id})" style="cursor:pointer"` : '';
      const actions = [];
      if (role === 'ADMIN') {
        actions.push(`<button class="action-btn" onclick="openEditUser(${u.user_id})" title="Edit">Edit</button>`);
      }
      if (role === 'HR' && u.approval_status === 'Pending') {
        actions.push(`<button class="action-btn" onclick="approveUser(${u.user_id})" title="Approve">✓</button>`);
        actions.push(`<button class="action-btn" onclick="rejectUser(${u.user_id})" title="Reject">✕</button>`);
      }
      return `
      <tr ${rowAttrs}>
        <td class="td-mono">${u.user_id}</td>
        <td class="font-bold">${u.username}</td>
        <td class="text-muted">${u.email}</td>
        <td><span class="role-badge ${u.role_code}">${u.role_name}</span></td>
        <td>${userStatusBadge(u)}</td>
        <td class="text-muted text-sm">${u.last_login ? fmtDateTime(u.last_login) : 'Never'}</td>
        <td class="td-actions" onclick="event.stopPropagation()">${actions.join('')}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    toast('error', 'Load failed', e.message);
  }
}

function openAddUser() {
  if (Auth.getUser().role !== 'ADMIN') return;
  document.getElementById('user-modal-title').textContent = 'Add user';
  document.getElementById('user-edit-id').value = '';
  ['user-username', 'user-email', 'user-password', 'user-emp-id'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('user-status').value = '0';
  document.getElementById('user-status').disabled = true;
  document.getElementById('user-approval-note').style.display = '';
  if (_roles.length) document.getElementById('user-role').value = _roles[0].role_id;
  openModal('modal-user');
}

async function openEditUser(id) {
  if (Auth.getUser().role !== 'ADMIN') return;
  try {
    const users = await API.get('/users');
    const user = users?.find(u => u.user_id === id);
    if (!user) return;
    document.getElementById('user-modal-title').textContent = 'Edit user';
    document.getElementById('user-edit-id').value = id;
    document.getElementById('user-username').value = user.username;
    document.getElementById('user-email').value = user.email;
    document.getElementById('user-password').value = '';
    document.getElementById('user-emp-id').value = user.employee_id || '';
    document.getElementById('user-status').value = user.is_active ? '1' : '0';
    document.getElementById('user-status').disabled = false;
    document.getElementById('user-approval-note').style.display = 'none';
    const roleMatch = _roles.find(r => r.role_code === user.role_code);
    if (roleMatch) document.getElementById('user-role').value = roleMatch.role_id;
    openModal('modal-user');
  } catch (e) {
    toast('error', 'Error', e.message);
  }
}

async function saveUser() {
  if (Auth.getUser().role !== 'ADMIN') return;
  const id = document.getElementById('user-edit-id').value;
  const username = document.getElementById('user-username').value.trim();
  const email = document.getElementById('user-email').value.trim();
  const password = document.getElementById('user-password').value;
  const roleId = document.getElementById('user-role').value;
  const empId = document.getElementById('user-emp-id').value.trim();
  const isActive = document.getElementById('user-status').value;
  if (!username || !email) {
    toast('warning', 'Required', 'Username and email are required.');
    return;
  }
  if (!id && !password) {
    toast('warning', 'Required', 'Password is required for new users.');
    return;
  }
  const btn = document.querySelector('#modal-user .btn-primary');
  btn.classList.add('btn-loading');
  btn.disabled = true;
  try {
    const body = { username, email, role_id: roleId, employee_id: empId || null, is_active: parseInt(isActive, 10) };
    if (password) body.password = password;
    if (id) {
      body.approval_status = parseInt(isActive, 10) ? 'Approved' : 'Rejected';
      await API.put(`/users/${id}`, body);
      toast('success', 'Updated', `User ${username} updated.`);
    } else {
      await API.post('/users', body);
      toast('success', 'Created', `User ${username} created and sent to HR for approval.`);
    }
    closeModal('modal-user');
    loadUsers();
  } catch (e) {
    toast('error', 'Save failed', e.message);
  } finally {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

async function approveUser(userId) {
  try {
    await API.patch(`/users/${userId}/approve`, {});
    toast('success', 'Approved', 'User account approved.');
    loadUsers();
  } catch (e) {
    toast('error', 'Approval failed', e.message);
  }
}

async function rejectUser(userId) {
  try {
    await API.patch(`/users/${userId}/reject`, {});
    toast('success', 'Rejected', 'User account rejected.');
    loadUsers();
  } catch (e) {
    toast('error', 'Rejection failed', e.message);
  }
}

async function loadSystemSettings() {
  buildSkeletonRows('settings-tbody', 5, 4);
  try {
    _settingsData = await API.get('/settings');
    if (!_settingsData) return;
    renderSettingsTable();
  } catch (e) {
    toast('error', 'Load failed', e.message);
  }
}

function renderSettingsTable() {
  const tbody = document.getElementById('settings-tbody');
  if (!_settingsData.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">No settings found.</td></tr>`;
    return;
  }
  tbody.innerHTML = _settingsData.map(s => `
    <tr id="setting-row-${s.setting_id}">
      <td class="td-mono text-gold">${s.setting_key}</td>
      <td><span class="badge badge-draft">${s.setting_group || 'general'}</span></td>
      <td id="setting-val-${s.setting_id}" class="text-sm">${s.setting_value || '—'}</td>
      <td class="text-muted text-sm">${s.description || ''}</td>
      <td><button class="action-btn" onclick="editSettingInline(${s.setting_id},'${s.setting_key}','${escSettingVal(s.setting_value)}')" title="Edit">Edit</button></td>
    </tr>
  `).join('');
}

function escSettingVal(v) {
  return (v || '').replace(/'/g, "\\'");
}

function editSettingInline(id, key, currentVal) {
  const cell = document.getElementById(`setting-val-${id}`);
  if (!cell) return;
  cell.innerHTML = `
    <div style="display:flex;gap:6px;align-items:center">
      <input class="form-control" id="setting-inp-${id}" value="${currentVal}" style="padding:4px 8px;font-size:var(--text-xs)">
      <button class="btn btn-primary btn-sm" onclick="saveSettingInline(${id},'${key}')">✓</button>
      <button class="btn btn-ghost btn-sm" onclick="cancelSettingEdit(${id},'${currentVal}')">✕</button>
    </div>
  `;
  document.getElementById(`setting-inp-${id}`)?.focus();
}

function cancelSettingEdit(id, val) {
  const cell = document.getElementById(`setting-val-${id}`);
  if (cell) cell.textContent = val;
}

async function saveSettingInline(id, key) {
  const inp = document.getElementById(`setting-inp-${id}`);
  if (!inp) return;
  const value = inp.value.trim();
  try {
    await API.put(`/settings/${key}`, { value });
    const cell = document.getElementById(`setting-val-${id}`);
    if (cell) cell.textContent = value || '—';
    toast('success', 'Saved', `Setting "${key}" updated.`);
  } catch (e) {
    toast('error', 'Save failed', e.message);
  }
}

async function loadTaxTables() {
  try {
    const data = await API.get('/settings/tax-tables');
    if (!data) return;
    document.getElementById('paye-tbody').innerHTML = data.paye.map(b => `
      <tr>
        <td class="td-mono">KES ${fmt(b.lower_limit, 0)}</td>
        <td class="td-mono">${b.upper_limit ? 'KES ' + fmt(b.upper_limit, 0) : 'Above'}</td>
        <td class="td-mono font-bold" style="color:var(--gold)">${b.tax_rate}%</td>
        <td style="width:180px">
          <div class="progress" style="height:8px">
            <div class="progress-bar gold" style="width:${b.tax_rate}%"></div>
          </div>
        </td>
      </tr>
    `).join('');
    document.getElementById('nssf-tbody').innerHTML = (data.nssf || []).map(t => `
      <tr>
        <td>${t.tier_name}</td>
        <td class="td-mono">KES ${fmt(t.lower_limit, 0)}</td>
        <td class="td-mono">${t.upper_limit ? 'KES ' + fmt(t.upper_limit, 0) : 'Above'}</td>
        <td class="td-mono">${t.employee_rate}%</td>
        <td class="td-mono">${t.employer_rate}%</td>
        <td class="td-mono text-gold">KES ${fmt(t.max_employee, 0)}</td>
      </tr>
    `).join('');
    document.getElementById('nhif-tbody').innerHTML = (data.nhif || []).map(b => `
      <tr>
        <td class="td-mono">KES ${fmt(b.lower_limit, 0)}</td>
        <td class="td-mono">${b.upper_limit ? 'KES ' + fmt(b.upper_limit, 0) : 'Above'}</td>
        <td class="td-mono text-gold font-bold">KES ${fmt(b.employee_contribution, 0)}</td>
      </tr>
    `).join('');
  } catch (e) {
    toast('error', 'Load failed', e.message);
  }
}

async function loadCompanySettings() {
  try {
    const settings = await API.get('/settings');
    if (!settings) return;
    const get = key => settings.find(s => s.setting_key === key)?.setting_value || '';
    document.getElementById('co-name').value = get('company_name');
    document.getElementById('co-email').value = get('company_email');
    document.getElementById('co-phone').value = get('company_phone');
    document.getElementById('co-kra').value = get('company_kra_pin');
    document.getElementById('co-address').value = get('company_address');
  } catch {}
}

function previewCompanyName() {
  const name = document.getElementById('co-name').value;
  const el = document.getElementById('sidebar-company-name');
  if (el && name) el.textContent = name;
}

async function saveCompanySettings() {
  const fields = [
    { key: 'company_name', id: 'co-name' },
    { key: 'company_email', id: 'co-email' },
    { key: 'company_phone', id: 'co-phone' },
    { key: 'company_kra_pin', id: 'co-kra' },
    { key: 'company_address', id: 'co-address' }
  ];
  const btn = document.querySelector('#settings-tab-company .btn-primary');
  btn.classList.add('btn-loading');
  btn.disabled = true;
  try {
    await Promise.all(fields.map(f => {
      const val = document.getElementById(f.id)?.value.trim();
      if (val !== undefined) return API.put(`/settings/${f.key}`, { value: val });
      return null;
    }));
    toast('success', 'Saved', 'Company settings updated successfully.');
  } catch (e) {
    toast('error', 'Save failed', e.message);
  } finally {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

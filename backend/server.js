'use strict';
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();
const publicDir = path.join(__dirname, '..', 'public');

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(express.json());
app.use(express.static(publicDir));

function buildMySqlSslConfig() {
  if (process.env.DB_SSL !== 'true') return undefined;

  const ssl = {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
  };

  if (process.env.DB_SSL_CA) {
    ssl.ca = process.env.DB_SSL_CA.replace(/\\n/g, '\n');
  } else if (process.env.DB_SSL_CA_PATH) {
    ssl.ca = fs.readFileSync(path.resolve(process.env.DB_SSL_CA_PATH), 'utf8');
  }

  return ssl;
}

//  DB POOL 
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  ssl: buildMySqlSslConfig()
});

// ─── RATE LIMITERS ──────────────────────────────────────────────────────────
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many login attempts' } });
const apiLimiter  = rateLimit({ windowMs: 60 * 1000, max: 200 });
app.use('/api/', apiLimiter);
app.use('/api/auth/login', loginLimiter);

// ─── EMAIL ──────────────────────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

const COMPANY_EMAIL_DOMAIN = (process.env.COMPANY_EMAIL_DOMAIN || 'spinners.co.ke').toLowerCase();

async function sendOTP(email, otp, purpose) {
  if (process.env.EMAIL_DEMO_MODE === 'true') {
    console.log(`\n╔══════════════════════════════╗`);
    console.log(`║  OTP for ${email}`);
    console.log(`║  Purpose: ${purpose}`);
    console.log(`║  Code: ${otp}`);
    console.log(`╚══════════════════════════════╝\n`);
    return;
  }
  const subject = purpose === 'LOGIN' ? 'Spinners Payroll — Login OTP' : 'Spinners Payroll — Password Reset OTP';
  await mailer.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0A0F1E;color:#F1F5F9;border-radius:12px">
      <h2 style="color:#F59E0B;margin:0 0 16px">Spinners Mattress Payroll</h2>
      <p>Your verification code is:</p>
      <div style="font-size:36px;font-weight:700;letter-spacing:12px;color:#F59E0B;padding:20px;background:#111827;border-radius:8px;text-align:center;margin:16px 0">${otp}</div>
      <p style="color:#94A3B8">This code expires in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes. Do not share it.</p>
    </div>`
  });
}

function generateOTP() {
  return String(crypto.randomInt(100000, 999999));
}

function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function isCompanyEmail(email = '') {
  return email.toLowerCase().endsWith(`@${COMPANY_EMAIL_DOMAIN}`);
}

function normalizeEmploymentType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Permanent';

  const aliases = {
    'full_time': 'Permanent',
    'full time': 'Permanent',
    'permanent': 'Permanent',
    'part_time': 'Part Time',
    'part time': 'Part Time',
    'contract': 'Contract',
    'casual': 'Casual',
    'intern': 'Intern'
  };

  return aliases[normalized] || 'Permanent';
}

async function getRoleIdByCode(roleCode) {
  const [[role]] = await pool.execute('SELECT role_id FROM roles WHERE role_code=?', [roleCode]);
  return role?.role_id || null;
}

async function getNextEmployeeNumber(conn = pool) {
  const [existing] = await conn.execute('SELECT emp_number FROM employees ORDER BY employee_id DESC LIMIT 1');
  let nextNum = 1;
  if (existing.length && existing[0].emp_number) {
    nextNum = parseInt(String(existing[0].emp_number).replace('EMP', ''), 10) + 1;
  }
  return `EMP${String(nextNum).padStart(3, '0')}`;
}

async function generateUniqueUsername(baseUsername, conn = pool) {
  const sanitizedBase = String(baseUsername || 'employee')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 40) || 'employee';

  let candidate = sanitizedBase;
  let suffix = 1;
  while (true) {
    const [rows] = await conn.execute('SELECT user_id FROM users WHERE username=? LIMIT 1', [candidate]);
    if (!rows.length) return candidate;
    suffix += 1;
    candidate = `${sanitizedBase.slice(0, Math.max(1, 40 - String(suffix).length))}${suffix}`;
  }
}

async function ensureEmployeeSignupSchema() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS employee_signups (
      signup_id INT PRIMARY KEY AUTO_INCREMENT,
      first_name VARCHAR(50) NOT NULL,
      middle_name VARCHAR(50) NULL,
      last_name VARCHAR(50) NOT NULL,
      gender VARCHAR(20) NULL,
      date_of_birth DATE NULL,
      national_id VARCHAR(20) NULL,
      kra_pin VARCHAR(20) NULL,
      nssf_number VARCHAR(30) NULL,
      nhif_number VARCHAR(30) NULL,
      email VARCHAR(100) NOT NULL UNIQUE,
      phone_primary VARCHAR(20) NULL,
      marital_status VARCHAR(20) NULL,
      dept_id INT NULL,
      desig_id INT NULL,
      employment_type VARCHAR(30) NULL,
      hire_date DATE NULL,
      password_hash VARCHAR(255) NOT NULL,
      approval_status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
      reviewed_by INT NULL,
      reviewed_at DATETIME NULL,
      created_employee_id INT NULL,
      created_user_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (dept_id) REFERENCES departments(dept_id),
      FOREIGN KEY (desig_id) REFERENCES designations(desig_id),
      FOREIGN KEY (reviewed_by) REFERENCES users(user_id),
      FOREIGN KEY (created_employee_id) REFERENCES employees(employee_id),
      FOREIGN KEY (created_user_id) REFERENCES users(user_id)
    )
  `);
}

async function ensureUsersApprovalSchema() {
  const [columns] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'approval_status'
     LIMIT 1`
  );

  if (!columns.length) {
    await pool.execute(`
      ALTER TABLE users
      ADD COLUMN approval_status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Approved'
      AFTER is_active
    `);
  }
}

async function ensureEmployeeStatusSchema() {
  const [columns] = await pool.execute(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'employees'
       AND COLUMN_NAME = 'status'
     LIMIT 1`
  );

  if (!columns.length) return;

  const columnType = String(columns[0].COLUMN_TYPE || '').toLowerCase();
  const desiredEnum = "enum('Pending','Active','Terminated')";
  if (columnType === desiredEnum.toLowerCase()) return;

  // Relax to VARCHAR first so legacy enum values can be normalized safely.
  await pool.execute(`ALTER TABLE employees MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'Pending'`);
  await pool.execute(`
    UPDATE employees
    SET status = CASE UPPER(status)
      WHEN 'ACTIVE' THEN 'Active'
      WHEN 'TERMINATED' THEN 'Terminated'
      WHEN 'PENDING' THEN 'Pending'
      ELSE 'Pending'
    END
  `);
  await pool.execute(`ALTER TABLE employees MODIFY COLUMN status ${desiredEnum} NOT NULL DEFAULT 'Pending'`);
}

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────────────────
async function ensureEmploymentTypeSchema() {
  const tables = ['employees', 'employee_signups'];

  for (const tableName of tables) {
    const [columns] = await pool.execute(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = 'employment_type'
       LIMIT 1`,
      [tableName]
    );

    if (!columns.length) continue;

    await pool.execute(`ALTER TABLE ${tableName} MODIFY COLUMN employment_type VARCHAR(30) NULL`);
    await pool.execute(`
      UPDATE ${tableName}
      SET employment_type = CASE LOWER(TRIM(COALESCE(employment_type, '')))
        WHEN '' THEN 'Permanent'
        WHEN 'full_time' THEN 'Permanent'
        WHEN 'full time' THEN 'Permanent'
        WHEN 'permanent' THEN 'Permanent'
        WHEN 'part_time' THEN 'Part Time'
        WHEN 'part time' THEN 'Part Time'
        WHEN 'contract' THEN 'Contract'
        WHEN 'casual' THEN 'Casual'
        WHEN 'intern' THEN 'Intern'
        ELSE 'Permanent'
      END
    `);
    await pool.execute(`ALTER TABLE ${tableName} MODIFY COLUMN employment_type VARCHAR(30) NOT NULL DEFAULT 'Permanent'`);
  }
}

const PERMISSION_DEFINITIONS = [
  ['leave.view', 'leave'],
  ['leave.apply', 'leave'],
  ['leave.approve', 'leave'],
  ['attendance.view', 'attendance'],
  ['attendance.record', 'attendance'],
  ['payroll.view', 'payroll'],
  ['payroll.process', 'payroll'],
  ['payroll.approve', 'payroll'],
  ['payroll.markpaid', 'payroll'],
  ['employees.view', 'employees'],
  ['employees.create', 'employees'],
  ['employees.edit', 'employees'],
  ['employees.delete', 'employees'],
  ['admin.users', 'admin'],
  ['admin.settings', 'admin'],
  ['reports.view', 'reports'],
  ['reports.payroll', 'reports'],
  ['reports.statutory', 'reports'],
  ['reports.p9', 'reports'],
  ['reports.audit', 'reports'],
  ['overtime.submit', 'overtime'],
  ['overtime.view', 'overtime'],
  ['overtime.approve', 'overtime']
];

const ROLE_PERMISSION_MAP = {
  ADMIN: [
    'leave.view', 'leave.apply', 'leave.approve',
    'attendance.view', 'attendance.record',
    'employees.view', 'employees.create', 'employees.edit', 'employees.delete',
    'admin.users', 'admin.settings',
    'reports.view', 'reports.audit'
  ],
  HR: [
    'leave.view', 'leave.apply', 'leave.approve',
    'attendance.view',
    'employees.view', 'employees.create', 'employees.edit', 'employees.delete',
    'reports.view',
    'overtime.view', 'overtime.approve'
  ],
  PAYROLL: [
    'attendance.view',
    'employees.view',
    'leave.view',
    'payroll.view', 'payroll.process', 'payroll.approve', 'payroll.markpaid',
    'reports.view', 'reports.payroll', 'reports.statutory', 'reports.p9',
    'overtime.view'
  ],
  EMPLOYEE: [
    'leave.apply',
    'overtime.submit'
  ]
};

async function ensurePermissionSchema() {
  for (const [permCode, module] of PERMISSION_DEFINITIONS) {
    await pool.execute(
      'INSERT INTO permissions (perm_code, module) VALUES (?, ?) ON DUPLICATE KEY UPDATE module=VALUES(module)',
      [permCode, module]
    );
  }

  for (const [roleCode, permCodes] of Object.entries(ROLE_PERMISSION_MAP)) {
    const roleId = await getRoleIdByCode(roleCode);
    if (!roleId) continue;

    const placeholders = PERMISSION_DEFINITIONS.map(() => '?').join(',');
    await pool.execute(
      `DELETE rp
       FROM role_permissions rp
       JOIN permissions p ON p.perm_id=rp.perm_id
       WHERE rp.role_id=?
         AND p.perm_code IN (${placeholders})
         AND p.perm_code NOT IN (${permCodes.map(() => '?').join(',')})`,
      [roleId, ...PERMISSION_DEFINITIONS.map(([permCode]) => permCode), ...permCodes]
    );

    for (const permCode of permCodes) {
      await pool.execute(
        `INSERT IGNORE INTO role_permissions (role_id, perm_id)
         SELECT ?, perm_id FROM permissions WHERE perm_code=?`,
        [roleId, permCode]
      );
    }
  }
}

let initPromise;
function initApp() {
  if (!initPromise) {
    initPromise = (async () => {
      await ensureEmployeeSignupSchema();
      await ensureUsersApprovalSchema();
      await ensureEmployeeStatusSchema();
      await ensureEmploymentTypeSchema();
      await ensurePermissionSchema();
    })();
  }
  return initPromise;
}

app.use(async (req, res, next) => {
  try {
    await initApp();
    next();
  } catch (error) {
    next(error);
  }
});

function authenticate(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requirePerm(perm) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const perms = req.user.permissions || [];
    if (perms.includes(perm)) return next();
    res.status(403).json({ error: 'Access denied' });
  };
}

function requireAdminOrHR(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.role === 'ADMIN' || req.user.role === 'HR') return next();
  res.status(403).json({ error: 'Access denied' });
}

function requireAdminOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.role === 'ADMIN') return next();
  res.status(403).json({ error: 'Only Admin can perform this action' });
}

function requireHROnly(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.role !== 'HR') {
    return res.status(403).json({ error: 'Only HR can perform this action' });
  }
  next();
}

function requirePayrollOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.role !== 'PAYROLL') {
    return res.status(403).json({ error: 'Only Payroll can perform this action' });
  }
  next();
}

function requireHROvertimeApproval(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.role !== 'HR') {
    return res.status(403).json({ error: 'Only HR can approve overtime' });
  }
  next();
}

async function logAudit(userId, username, action, module, recordId, recordRef, description, status = 'SUCCESS') {
  try {
    await pool.execute(
      'INSERT INTO audit_log (user_id,username,action,module,record_id,record_ref,description,status) VALUES (?,?,?,?,?,?,?,?)',
      [userId, username, action, module, recordId || null, recordRef || null, description, status]
    );
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const [users] = await pool.execute(
      `SELECT u.*, r.role_code FROM users u JOIN roles r ON u.role_id=r.role_id WHERE u.email=? AND u.is_active=1`,
      [email]
    );
    if (!users.length) {
      const [[pendingUser]] = await pool.execute(
        'SELECT approval_status FROM users WHERE email=? LIMIT 1',
        [email]
      );
      if (pendingUser?.approval_status === 'Pending') {
        return res.status(403).json({ error: 'Your signup is still pending HR approval.' });
      }
      if (pendingUser?.approval_status === 'Rejected') {
        return res.status(403).json({ error: 'Your signup was rejected. Please contact HR.' });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = users[0];

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 1000);
      return res.status(403).json({ error: 'Account locked', remaining });
    }

    let valid = false;
    if (user.password_hash && user.password_hash.startsWith('$2')) {
      valid = await bcrypt.compare(password, user.password_hash);
    } else {
      valid = user.password_hash === crypto.createHash('sha256').update(password).digest('hex');
    }

    if (!valid) {
      const fails = (user.failed_logins || 0) + 1;
      const lockUntil = fails >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await pool.execute('UPDATE users SET failed_logins=?,locked_until=? WHERE user_id=?', [fails, lockUntil, user.user_id]);
      return res.status(401).json({ error: 'Invalid credentials', attempts: fails });
    }

    await pool.execute('UPDATE users SET failed_logins=0,locked_until=NULL WHERE user_id=?', [user.user_id]);

    if (user.must_change_pw) {
      const tempToken = jwt.sign({ userId: user.user_id, tempOnly: true }, process.env.JWT_SECRET, { expiresIn: '15m' });
      return res.json({ step: 3, tempToken, userId: user.user_id });
    }

    const [perms] = await pool.execute(
      'SELECT p.perm_code FROM permissions p JOIN role_permissions rp ON p.perm_id=rp.perm_id WHERE rp.role_id=?',
      [user.role_id]
    );
    const permissions = perms.map(p => p.perm_code);
    const token = jwt.sign({
      userId: user.user_id, username: user.username, email: user.email,
      role: user.role_code, roleId: user.role_id, employeeId: user.employee_id,
      permissions
    }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

    await pool.execute('UPDATE users SET last_login=NOW() WHERE user_id=?', [user.user_id]);
    await logAudit(user.user_id, user.username, 'LOGIN', 'AUTH', null, null, 'User logged in');

    res.json({ step: 'dashboard', token, user: { id: user.user_id, username: user.username, email: user.email, role: user.role_code, employeeId: user.employee_id, permissions } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/signup-employee', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const d = req.body || {};
    const email = String(d.email || '').trim().toLowerCase();
    const password = String(d.password || '');
    if (!email || !password || !d.first_name || !d.last_name || !d.phone_primary || !d.national_id || !d.gender || !d.hire_date || !d.dept_id || !d.desig_id) {
      return res.status(400).json({ error: 'Please fill in all required signup details.' });
    }
    if (!isCompanyEmail(email)) {
      return res.status(400).json({ error: `Use your company email ending with @${COMPANY_EMAIL_DOMAIN}.` });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const [emailUsers] = await conn.execute('SELECT user_id FROM users WHERE email=? LIMIT 1', [email]);
    if (emailUsers.length) return res.status(409).json({ error: 'An account with this email already exists.' });

    const [emailEmployees] = await conn.execute('SELECT employee_id FROM employees WHERE email=? LIMIT 1', [email]);
    if (emailEmployees.length) return res.status(409).json({ error: 'An employee with this email already exists.' });

    const [existingSignup] = await conn.execute('SELECT approval_status FROM employee_signups WHERE email=? LIMIT 1', [email]);
    if (existingSignup.length) {
      const status = existingSignup[0].approval_status;
      if (status === 'Pending') return res.status(409).json({ error: 'A signup request for this email is already pending HR approval.' });
      if (status === 'Approved') return res.status(409).json({ error: 'This signup request was already approved. Try logging in.' });
      return res.status(409).json({ error: 'This signup request was rejected. Please contact HR.' });
    }

    const hash = await bcrypt.hash(password, 10);
    await conn.execute(
      `INSERT INTO employee_signups
      (first_name,middle_name,last_name,gender,date_of_birth,national_id,kra_pin,nssf_number,nhif_number,email,phone_primary,marital_status,dept_id,desig_id,employment_type,hire_date,password_hash,approval_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Pending')`,
      [
        String(d.first_name).trim(),
        d.middle_name ? String(d.middle_name).trim() : null,
        String(d.last_name).trim(),
        d.gender,
        d.date_of_birth || null,
        String(d.national_id).trim(),
        d.kra_pin ? String(d.kra_pin).trim() : null,
        d.nssf_number ? String(d.nssf_number).trim() : null,
        d.nhif_number ? String(d.nhif_number).trim() : null,
        email,
        String(d.phone_primary).trim(),
        d.marital_status || null,
        d.dept_id || null,
        d.desig_id || null,
        d.employment_type || 'Permanent',
        d.hire_date,
        hash
      ]
    );

    res.json({ success: true, message: 'Signup submitted and pending HR approval.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const { userId, otp, purpose = 'LOGIN' } = req.body;
  if (!userId || !otp) return res.status(400).json({ error: 'userId and otp required' });
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM otp_verifications WHERE user_id=? AND purpose=? AND is_used=0 ORDER BY created_at DESC LIMIT 1',
      [userId, purpose]
    );
    if (!rows.length) return res.status(400).json({ error: 'No active OTP' });
    const record = rows[0];

    if (new Date(record.expires_at) < new Date()) return res.status(400).json({ error: 'OTP expired' });
    if (record.attempts >= (process.env.OTP_MAX_ATTEMPTS || 5)) {
      await pool.execute('UPDATE otp_verifications SET is_used=1 WHERE otp_id=?', [record.otp_id]);
      return res.status(400).json({ error: 'Too many attempts' });
    }

    if (record.otp_hash !== hashOTP(otp)) {
      await pool.execute('UPDATE otp_verifications SET attempts=attempts+1 WHERE otp_id=?', [record.otp_id]);
      return res.status(400).json({ error: 'Invalid OTP', attempts: record.attempts + 1 });
    }

    await pool.execute('UPDATE otp_verifications SET is_used=1,verified_at=NOW() WHERE otp_id=?', [record.otp_id]);

    const [users] = await pool.execute(
      'SELECT u.*,r.role_code FROM users u JOIN roles r ON u.role_id=r.role_id WHERE u.user_id=?',
      [userId]
    );
    const user = users[0];

    if (user.must_change_pw) {
      const tempToken = jwt.sign({ userId, tempOnly: true }, process.env.JWT_SECRET, { expiresIn: '15m' });
      return res.json({ step: 3, tempToken, userId });
    }

    const [perms] = await pool.execute(
      'SELECT p.perm_code FROM permissions p JOIN role_permissions rp ON p.perm_id=rp.perm_id WHERE rp.role_id=?',
      [user.role_id]
    );
    const token = jwt.sign({
      userId: user.user_id, username: user.username, email: user.email,
      role: user.role_code, roleId: user.role_id, employeeId: user.employee_id,
      permissions: perms.map(p => p.perm_code)
    }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

    await pool.execute('UPDATE users SET last_login=NOW() WHERE user_id=?', [userId]);
    await logAudit(user.user_id, user.username, 'LOGIN', 'AUTH', null, null, 'User logged in');

    res.json({ step: 'dashboard', token, user: { id: user.user_id, username: user.username, email: user.email, role: user.role_code, employeeId: user.employee_id } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/change-password', async (req, res) => {
  const { newPassword } = req.body;
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }

  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password too short' });
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.execute('UPDATE users SET password_hash=?,must_change_pw=0 WHERE user_id=?', [hash, payload.userId]);

    const [users] = await pool.execute('SELECT u.*,r.role_code FROM users u JOIN roles r ON u.role_id=r.role_id WHERE u.user_id=?', [payload.userId]);
    const user = users[0];
    const [perms] = await pool.execute('SELECT p.perm_code FROM permissions p JOIN role_permissions rp ON p.perm_id=rp.perm_id WHERE rp.role_id=?', [user.role_id]);
    const newToken = jwt.sign({
      userId: user.user_id, username: user.username, email: user.email,
      role: user.role_code, roleId: user.role_id, employeeId: user.employee_id,
      permissions: perms.map(p => p.perm_code)
    }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

    await pool.execute('UPDATE users SET last_login=NOW() WHERE user_id=?', [user.user_id]);
    res.json({ step: 'dashboard', token: newToken, user: { id: user.user_id, username: user.username, email: user.email, role: user.role_code, employeeId: user.employee_id } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const [users] = await pool.execute('SELECT * FROM users WHERE email=? AND is_active=1', [email]);
    if (!users.length) return res.json({ message: 'If the email exists, an OTP has been sent.' });
    const user = users[0];
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + (process.env.OTP_EXPIRY_MINUTES || 10) * 60 * 1000);
    await pool.execute('UPDATE otp_verifications SET is_used=1 WHERE user_id=? AND purpose="PASSWORD_RESET" AND is_used=0', [user.user_id]);
    await pool.execute('INSERT INTO otp_verifications (user_id,email,otp_hash,purpose,expires_at) VALUES (?,?,?,"PASSWORD_RESET",?)', [user.user_id, email, hashOTP(otp), expiresAt]);
    await sendOTP(email, otp, 'PASSWORD_RESET');
    res.json({ message: 'OTP sent', userId: user.user_id, email: email.replace(/(.{2}).+(@.+)/, '$1***$2') });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/verify-reset-otp', async (req, res) => {
  const { userId, otp } = req.body;
  try {
    const [rows] = await pool.execute('SELECT * FROM otp_verifications WHERE user_id=? AND purpose="PASSWORD_RESET" AND is_used=0 ORDER BY created_at DESC LIMIT 1', [userId]);
    if (!rows.length || new Date(rows[0].expires_at) < new Date()) return res.status(400).json({ error: 'Invalid or expired OTP' });
    if (rows[0].otp_hash !== hashOTP(otp)) {
      await pool.execute('UPDATE otp_verifications SET attempts=attempts+1 WHERE otp_id=?', [rows[0].otp_id]);
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    await pool.execute('UPDATE otp_verifications SET is_used=1,verified_at=NOW() WHERE otp_id=?', [rows[0].otp_id]);
    const tempToken = jwt.sign({ userId, tempOnly: true }, process.env.JWT_SECRET, { expiresIn: '15m' });
    res.json({ step: 3, tempToken, userId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════

app.get('/api/dashboard/stats', authenticate, async (req, res) => {
  try {
    const [[empRow]] = await pool.execute("SELECT COUNT(*) as cnt FROM employees WHERE status='Active'");
    const [[prevEmpRow]] = await pool.execute("SELECT COUNT(*) as cnt FROM employees WHERE status='Active' AND hire_date < DATE_SUB(NOW(), INTERVAL 1 MONTH)");
    const [[payRow]] = await pool.execute("SELECT pp.period_name, pp.total_net FROM payroll_periods pp WHERE pp.status IN ('Paid','Approved') ORDER BY pp.period_year DESC, pp.period_month DESC LIMIT 1");
    const [[prevPayRow]] = await pool.execute("SELECT total_net FROM payroll_periods WHERE status IN ('Paid','Approved') ORDER BY period_year DESC, period_month DESC LIMIT 1 OFFSET 1");
    const [[leaveRow]] = await pool.execute("SELECT COUNT(*) as cnt FROM leave_requests WHERE status='Pending'");
    const [[otRow]] = await pool.execute("SELECT COUNT(*) as cnt FROM overtime WHERE status='Pending'");
    const [periods] = await pool.execute("SELECT period_id,period_name,period_year,period_month,status,total_gross,total_net,pay_date FROM payroll_periods ORDER BY period_year DESC,period_month DESC LIMIT 6");
    const [depts] = await pool.execute("SELECT d.dept_name, COUNT(e.employee_id) as headcount FROM departments d LEFT JOIN employees e ON e.dept_id=d.dept_id AND e.status='Active' GROUP BY d.dept_id,d.dept_name ORDER BY headcount DESC");
    const [activity] = await pool.execute("SELECT al.*,u.email FROM audit_log al LEFT JOIN users u ON al.user_id=u.user_id ORDER BY al.created_at DESC LIMIT 5");
    const [payTrend] = await pool.execute("SELECT period_name,total_net FROM payroll_periods WHERE status IN ('Paid','Approved') ORDER BY period_year ASC,period_month ASC LIMIT 7");

    res.json({
      kpis: {
        employees: { current: empRow.cnt, previous: prevEmpRow.cnt },
        lastPayroll: { amount: payRow?.total_net || 0, period: payRow?.period_name || 'N/A', previous: prevPayRow?.total_net || 0 },
        pendingLeave: leaveRow.cnt,
        pendingOvertime: otRow.cnt
      },
      recentPeriods: periods,
      departments: depts,
      activity,
      payTrend
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});


// EMPLOYEES


app.get('/api/departments', authenticate, async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM departments ORDER BY dept_name');
  res.json(rows);
});

app.get('/api/public/departments', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM departments ORDER BY dept_name');
  res.json(rows);
});

app.get('/api/designations', authenticate, async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM designations ORDER BY desig_name');
  res.json(rows);
});

app.get('/api/public/designations', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM designations ORDER BY desig_name');
  res.json(rows);
});

app.get('/api/employees', authenticate, requirePerm('employees.view'), async (req, res) => {
  try {
    const { search = '', dept = '', status = 'Active' } = req.query;
    let sql = `SELECT e.employee_id,e.emp_number,e.first_name,e.middle_name,e.last_name,
      e.email,e.phone_primary,e.hire_date,e.status,e.employment_type,
      d.dept_name,des.desig_name,
      es.basic_salary
      FROM employees e
      LEFT JOIN departments d ON e.dept_id=d.dept_id
      LEFT JOIN designations des ON e.desig_id=des.desig_id
      LEFT JOIN employee_salary es ON es.employee_id=e.employee_id AND es.is_current=1
      WHERE 1=1`;
    const params = [];
    if (search) { sql += ' AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.emp_number LIKE ? OR e.email LIKE ?)'; const s = `%${search}%`; params.push(s,s,s,s); }
    if (dept) { sql += ' AND e.dept_id=?'; params.push(dept); }
    if (status && status !== 'All') { sql += ' AND e.status=?'; params.push(status); }
    sql += ' ORDER BY e.emp_number';
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/employees/:id', authenticate, requirePerm('employees.view'), async (req, res) => {
  try {
    const { id } = req.params;
    const [[emp]] = await pool.execute(
      `SELECT e.*,d.dept_name,des.desig_name,b.branch_name,es.basic_salary,es.effective_from,
        sg.grade_name FROM employees e
        LEFT JOIN departments d ON e.dept_id=d.dept_id
        LEFT JOIN designations des ON e.desig_id=des.desig_id
        LEFT JOIN branches b ON e.branch_id=b.branch_id
        LEFT JOIN employee_salary es ON es.employee_id=e.employee_id AND es.is_current=1
        LEFT JOIN salary_grades sg ON es.grade_id=sg.grade_id
        WHERE e.employee_id=?`, [id]);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const [banks] = await pool.execute('SELECT * FROM employee_bank_accounts WHERE employee_id=?', [id]);
    const [salHistory] = await pool.execute('SELECT * FROM employee_salary WHERE employee_id=? ORDER BY effective_from DESC', [id]);
    const [leaveBalances] = await pool.execute(
      `SELECT lb.*,lt.type_name,lt.annual_days FROM leave_balances lb JOIN leave_types lt ON lb.leave_type_id=lt.leave_type_id WHERE lb.employee_id=? AND lb.year=YEAR(NOW())`, [id]);
    const [payslips] = await pool.execute(
      `SELECT pr.run_id,pp.period_name,pr.gross_pay,pr.net_pay,pr.status,pp.pay_date FROM payroll_runs pr JOIN payroll_periods pp ON pr.period_id=pp.period_id WHERE pr.employee_id=? ORDER BY pp.period_year DESC,pp.period_month DESC LIMIT 12`, [id]);
    res.json({ ...emp, banks, salHistory, leaveBalances, payslips });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/employees', authenticate, requirePerm('employees.create'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const d = req.body;
    const empNumber = await getNextEmployeeNumber(conn);
    const [result] = await conn.execute(
      `INSERT INTO employees (emp_number,first_name,middle_name,last_name,gender,date_of_birth,national_id,kra_pin,nssf_number,nhif_number,email,phone_primary,marital_status,dept_id,desig_id,branch_id,employment_type,hire_date,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Pending')`,
      [empNumber,d.first_name,d.middle_name||null,d.last_name,d.gender,d.date_of_birth||null,d.national_id||null,d.kra_pin||null,d.nssf_number||null,d.nhif_number||null,d.email||null,d.phone_primary||null,d.marital_status||null,d.dept_id||null,d.desig_id||null,d.branch_id||null,normalizeEmploymentType(d.employment_type),d.hire_date]
    );
    const empId = result.insertId;
    if (d.basic_salary && req.user.role === 'PAYROLL') {
      await conn.execute('INSERT INTO employee_salary (employee_id,basic_salary,effective_from,is_current) VALUES (?,?,?,1)', [empId, d.basic_salary, d.hire_date]);
    }
    if (d.bank_name && d.account_number) {
      await conn.execute('INSERT INTO employee_bank_accounts (employee_id,bank_name,account_number,account_name,is_primary) VALUES (?,?,?,?,1)', [empId,d.bank_name,d.account_number,d.account_name||d.first_name+' '+d.last_name]);
    }
    await conn.commit();
    await logAudit(req.user.userId, req.user.username, 'CREATE', 'EMPLOYEES', empId, empNumber, `Created pending employee ${empNumber}`);
    res.json({ success: true, empId, empNumber, status: 'Pending' });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

app.get('/api/employee-signups', authenticate, requirePerm('employees.view'), async (req, res) => {
  try {
    const { status = 'Pending' } = req.query;
    let sql = `
      SELECT s.signup_id,s.first_name,s.middle_name,s.last_name,s.gender,s.date_of_birth,s.national_id,s.kra_pin,
        s.nssf_number,s.nhif_number,s.email,s.phone_primary,s.marital_status,s.dept_id,s.desig_id,s.employment_type,
        s.hire_date,s.approval_status,s.created_at,s.created_employee_id,s.created_user_id,
        d.dept_name,des.desig_name
      FROM employee_signups s
      LEFT JOIN departments d ON s.dept_id=d.dept_id
      LEFT JOIN designations des ON s.desig_id=des.desig_id
      WHERE 1=1`;
    const params = [];
    if (status && status !== 'All') {
      sql += ' AND s.approval_status=?';
      params.push(status);
    }
    sql += ' ORDER BY s.created_at DESC';
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/employee-signups/:id/approve', authenticate, requireHROnly, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[signup]] = await conn.execute('SELECT * FROM employee_signups WHERE signup_id=? FOR UPDATE', [req.params.id]);
    if (!signup) return res.status(404).json({ error: 'Signup request not found' });
    if (signup.approval_status !== 'Pending') return res.status(400).json({ error: `Signup is already ${signup.approval_status.toLowerCase()}.` });

    const employeeRoleId = await getRoleIdByCode('EMPLOYEE');
    if (!employeeRoleId) return res.status(500).json({ error: 'Employee role is not configured.' });

    const empNumber = await getNextEmployeeNumber(conn);
    const [employeeResult] = await conn.execute(
      `INSERT INTO employees (emp_number,first_name,middle_name,last_name,gender,date_of_birth,national_id,kra_pin,nssf_number,nhif_number,email,phone_primary,marital_status,dept_id,desig_id,employment_type,hire_date,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Active')`,
      [
        empNumber,
        signup.first_name,
        signup.middle_name || null,
        signup.last_name,
        signup.gender || null,
        signup.date_of_birth || null,
        signup.national_id || null,
        signup.kra_pin || null,
        signup.nssf_number || null,
        signup.nhif_number || null,
        signup.email,
        signup.phone_primary || null,
        signup.marital_status || null,
        signup.dept_id || null,
        signup.desig_id || null,
        normalizeEmploymentType(signup.employment_type),
        signup.hire_date || null
      ]
    );

    const employeeId = employeeResult.insertId;
    const username = await generateUniqueUsername(signup.email.split('@')[0], conn);
    const [userResult] = await conn.execute(
      `INSERT INTO users (username,email,password_hash,role_id,employee_id,is_active,must_change_pw,approval_status)
       VALUES (?,?,?,?,?,1,0,'Approved')`,
      [username, signup.email, signup.password_hash, employeeRoleId, employeeId]
    );

    await conn.execute(
      `UPDATE employee_signups
       SET approval_status='Approved', reviewed_by=?, reviewed_at=NOW(), created_employee_id=?, created_user_id=?
       WHERE signup_id=?`,
      [req.user.userId, employeeId, userResult.insertId, req.params.id]
    );

    await conn.commit();
    await logAudit(req.user.userId, req.user.username, 'APPROVE', 'EMPLOYEE_SIGNUPS', req.params.id, signup.email, `Approved employee signup for ${signup.email}`);
    res.json({ success: true, employeeId, userId: userResult.insertId, empNumber });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message || 'Server error' });
  } finally {
    conn.release();
  }
});

app.patch('/api/employee-signups/:id/reject', authenticate, requireHROnly, async (req, res) => {
  try {
    const [[signup]] = await pool.execute('SELECT signup_id,approval_status,email FROM employee_signups WHERE signup_id=?', [req.params.id]);
    if (!signup) return res.status(404).json({ error: 'Signup request not found' });
    if (signup.approval_status !== 'Pending') return res.status(400).json({ error: `Signup is already ${signup.approval_status.toLowerCase()}.` });

    await pool.execute(
      `UPDATE employee_signups
       SET approval_status='Rejected', reviewed_by=?, reviewed_at=NOW()
       WHERE signup_id=?`,
      [req.user.userId, req.params.id]
    );
    await logAudit(req.user.userId, req.user.username, 'REJECT', 'EMPLOYEE_SIGNUPS', req.params.id, signup.email, `Rejected employee signup for ${signup.email}`);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

app.put('/api/employees/:id', authenticate, requirePerm('employees.edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;
    if (d.basic_salary && req.user.role !== 'PAYROLL') {
      return res.status(403).json({ error: 'Only Payroll can update salary.' });
    }
    await pool.execute(
      `UPDATE employees SET first_name=?,middle_name=?,last_name=?,gender=?,date_of_birth=?,national_id=?,kra_pin=?,nssf_number=?,nhif_number=?,email=?,phone_primary=?,marital_status=?,dept_id=?,desig_id=?,branch_id=?,employment_type=?,hire_date=? WHERE employee_id=?`,
      [d.first_name,d.middle_name||null,d.last_name,d.gender,d.date_of_birth||null,d.national_id||null,d.kra_pin||null,d.nssf_number||null,d.nhif_number||null,d.email||null,d.phone_primary||null,d.marital_status||null,d.dept_id||null,d.desig_id||null,d.branch_id||null,normalizeEmploymentType(d.employment_type),d.hire_date,id]
    );
    if (d.basic_salary && req.user.role === 'PAYROLL') {
      await pool.execute('UPDATE employee_salary SET is_current=0 WHERE employee_id=?', [id]);
      await pool.execute('INSERT INTO employee_salary (employee_id,basic_salary,effective_from,is_current) VALUES (?,?,NOW(),1)', [id, d.basic_salary]);
    }
    await logAudit(req.user.userId, req.user.username, 'UPDATE', 'EMPLOYEES', id, null, `Updated employee ${id}`);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/employees/:id/approve', authenticate, requireHROnly, async (req, res) => {
  try {
    const [[employee]] = await pool.execute('SELECT employee_id,emp_number,status FROM employees WHERE employee_id=?', [req.params.id]);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    if (employee.status === 'Active') return res.status(400).json({ error: 'Employee is already approved.' });
    if (employee.status === 'Terminated') return res.status(400).json({ error: 'Terminated employees cannot be approved.' });

    await pool.execute("UPDATE employees SET status='Active' WHERE employee_id=?", [req.params.id]);
    await logAudit(req.user.userId, req.user.username, 'APPROVE', 'EMPLOYEES', req.params.id, employee.emp_number, `Approved employee ${employee.emp_number}`);
    res.json({ success: true, message: 'Employee approved' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

app.patch('/api/employees/:id/salary', authenticate, requirePayrollOnly, async (req, res) => {
  try {
    const { basic_salary, effective_from } = req.body;
    if (!basic_salary) return res.status(400).json({ error: 'Basic salary is required.' });

    const [[employee]] = await pool.execute('SELECT employee_id,emp_number FROM employees WHERE employee_id=?', [req.params.id]);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    await pool.execute('UPDATE employee_salary SET is_current=0 WHERE employee_id=?', [req.params.id]);
    await pool.execute(
      'INSERT INTO employee_salary (employee_id,basic_salary,effective_from,is_current) VALUES (?,?,?,1)',
      [req.params.id, basic_salary, effective_from || new Date().toISOString().slice(0, 10)]
    );
    await logAudit(req.user.userId, req.user.username, 'UPDATE', 'EMPLOYEE_SALARY', req.params.id, employee.emp_number, `Updated salary for ${employee.emp_number}`);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

app.patch('/api/employees/:id/terminate', authenticate, requirePerm('employees.delete'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    await pool.execute("UPDATE employees SET status='Terminated' WHERE employee_id=?", [id]);
    await logAudit(req.user.userId, req.user.username, 'TERMINATE', 'EMPLOYEES', id, null, `Terminated employee: ${reason}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ATTENDANCE
// ═══════════════════════════════════════════════════════════════════

app.get('/api/attendance', authenticate, requirePerm('attendance.view'), async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const [employees] = await pool.execute(
      `SELECT e.employee_id,e.emp_number,CONCAT(e.first_name,' ',e.last_name) as full_name,d.dept_name,
        a.att_id,a.status,a.time_in,a.time_out,a.late_minutes
        FROM employees e LEFT JOIN departments d ON e.dept_id=d.dept_id
        LEFT JOIN attendance a ON a.employee_id=e.employee_id AND a.att_date=?
        WHERE e.status='Active' ORDER BY e.emp_number`, [targetDate]);
    res.json({ date: targetDate, records: employees });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/attendance', authenticate, requirePerm('attendance.record'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { date, records } = req.body;
    for (const r of records) {
      await conn.execute(
        `INSERT INTO attendance (employee_id,att_date,status,time_in,time_out,late_minutes,day_type)
         VALUES (?,?,?,?,?,?,'Regular')
         ON DUPLICATE KEY UPDATE status=VALUES(status),time_in=VALUES(time_in),time_out=VALUES(time_out),late_minutes=VALUES(late_minutes)`,
        [r.employee_id, date, r.status, r.time_in||null, r.time_out||null, r.late_minutes||0]
      );
    }
    await conn.commit();
    await logAudit(req.user.userId, req.user.username, 'RECORD', 'ATTENDANCE', null, date, `Recorded attendance for ${date}`);
    res.json({ success: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

app.get('/api/attendance/summary', authenticate, requirePerm('attendance.view'), async (req, res) => {
  try {
    const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = req.query;
    const [rows] = await pool.execute(
      `SELECT e.emp_number,CONCAT(e.first_name,' ',e.last_name) as full_name,d.dept_name,
        s.working_days,s.days_present,s.days_absent,s.days_leave,s.total_late_mins,s.ot_hours_normal
        FROM attendance_summary s JOIN employees e ON s.employee_id=e.employee_id
        LEFT JOIN departments d ON e.dept_id=d.dept_id
        WHERE s.period_year=? AND s.period_month=? ORDER BY e.emp_number`, [year, month]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// LEAVE
// ═══════════════════════════════════════════════════════════════════

app.get('/api/leave/types', authenticate, async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM leave_types WHERE 1=1 ORDER BY type_name');
  res.json(rows);
});

app.get('/api/leave/requests', authenticate, async (req, res) => {
  try {
    // Allow access if user is ADMIN, or has leave.view permission, or is EMPLOYEE (filtered to own requests)
    const hasLeaveView = req.user.permissions?.includes('leave.view');
    if (req.user.role !== 'EMPLOYEE' && req.user.role !== 'ADMIN' && !hasLeaveView) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { status = 'Pending' } = req.query;
    let sql = `SELECT lr.*,CONCAT(e.first_name,' ',e.last_name) as full_name,e.emp_number,d.dept_name,lt.type_name
      FROM leave_requests lr JOIN employees e ON lr.employee_id=e.employee_id
      LEFT JOIN departments d ON e.dept_id=d.dept_id
      LEFT JOIN leave_types lt ON lr.leave_type_id=lt.leave_type_id WHERE 1=1`;
    const params = [];
    if (req.user.role === 'EMPLOYEE') {
      sql += ' AND lr.employee_id=?';
      params.push(req.user.employeeId);
    }
    if (status !== 'All') { sql += ' AND lr.status=?'; params.push(status); }
    sql += ' ORDER BY lr.start_date DESC';
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/leave/requests', authenticate, async (req, res) => {
  // Allow employees to apply for leave, or users with leave.apply permission
  if (req.user.role !== 'EMPLOYEE' && !req.user.permissions?.includes('leave.apply')) {
    return res.status(403).json({ error: 'Access denied' });
  }
  try {
    const d = req.body;
    const employeeId = req.user.role === 'EMPLOYEE' ? req.user.employeeId : d.employee_id;
    if (!employeeId) return res.status(400).json({ error: 'Employee ID required' });
    const start = new Date(d.start_date), end = new Date(d.end_date);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid leave dates' });
    }
    if (end < start) {
      return res.status(400).json({ error: 'End date cannot be before start date' });
    }
    await pool.execute(
      "INSERT INTO leave_requests (employee_id,leave_type_id,start_date,end_date,num_days,status,reason) VALUES (?,?,?,?,?,'Pending',?)",
      [employeeId, d.leave_type_id, d.start_date, d.end_date, days, d.reason || '']
    );
    const year = start.getFullYear();
    await pool.execute(
      `INSERT INTO leave_balances (employee_id,leave_type_id,year,entitled_days,taken_days,pending_days)
       VALUES (?,?,?,0,0,?)
       ON DUPLICATE KEY UPDATE pending_days=pending_days+VALUES(pending_days)`,
      [employeeId, d.leave_type_id, year, days]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/leave/balances', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'EMPLOYEE' && req.user.role !== 'ADMIN' && !req.user.permissions?.includes('leave.view')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { year = new Date().getFullYear() } = req.query;
    let sql = `SELECT lb.*,CONCAT(e.first_name,' ',e.last_name) as full_name,e.emp_number,d.dept_name,lt.type_name,lt.annual_days
       FROM leave_balances lb JOIN employees e ON lb.employee_id=e.employee_id
       LEFT JOIN departments d ON e.dept_id=d.dept_id
       JOIN leave_types lt ON lb.leave_type_id=lt.leave_type_id
       WHERE lb.year=?`;
    const params = [year];
    if (req.user.role === 'EMPLOYEE') {
      sql += ' AND lb.employee_id=?';
      params.push(req.user.employeeId);
    }
    sql += ' ORDER BY e.emp_number,lt.type_name';
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/leave/requests/:id/review', authenticate, requirePerm('leave.approve'), async (req, res) => {
  try {
    const { decision, comment } = req.body;
    const status = decision === 'approve' ? 'Approved' : 'Rejected';
    const [[lr]] = await pool.execute('SELECT * FROM leave_requests WHERE request_id=?', [req.params.id]);
    if (!lr) return res.status(404).json({ error: 'Leave request not found' });
    if (lr.status !== 'Pending') {
      return res.status(400).json({ error: `Leave request already ${lr.status.toLowerCase()}` });
    }
    await pool.execute(
      'UPDATE leave_requests SET status=?,reviewed_by=? WHERE request_id=?',
      [status, req.user.userId, req.params.id]
    );
    const year = new Date(lr.start_date).getFullYear();
    if (status === 'Approved') {
      await pool.execute(
        `INSERT INTO leave_balances (employee_id,leave_type_id,year,entitled_days,taken_days,pending_days)
         VALUES (?,?,?,0,?,0)
         ON DUPLICATE KEY UPDATE taken_days=taken_days+VALUES(taken_days),pending_days=GREATEST(0,pending_days-?)`,
        [lr.employee_id, lr.leave_type_id, year, lr.num_days, lr.num_days]
      );
    } else {
      await pool.execute(
        `INSERT INTO leave_balances (employee_id,leave_type_id,year,entitled_days,taken_days,pending_days)
         VALUES (?,?,?,0,0,0)
         ON DUPLICATE KEY UPDATE pending_days=GREATEST(0,pending_days-?)`,
        [lr.employee_id, lr.leave_type_id, year, lr.num_days]
      );
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// OVERTIME
// ═══════════════════════════════════════════════════════════════════

let overtimeSchemaCache = null;
let leaveRequestSchemaCache = null;

async function getOvertimeSchema() {
  if (overtimeSchemaCache) return overtimeSchemaCache;
  const [rows] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'overtime'`
  );
  const columns = new Set(rows.map(r => r.COLUMN_NAME));
  overtimeSchemaCache = {
    idColumn: columns.has('overtime_id') ? 'overtime_id' : (columns.has('ot_id') ? 'ot_id' : null),
    dateColumn: columns.has('work_date') ? 'work_date' : (columns.has('ot_date') ? 'ot_date' : null),
    hoursColumn: columns.has('hours_worked') ? 'hours_worked' : (columns.has('hours') ? 'hours' : (columns.has('approved_hours') ? 'approved_hours' : null)),
    approvedHoursColumn: columns.has('approved_hours') ? 'approved_hours' : null,
    reasonColumn: columns.has('reason') ? 'reason' : (columns.has('notes') ? 'notes' : null),
    statusColumn: columns.has('status') ? 'status' : null,
    submittedAtColumn: columns.has('submitted_at') ? 'submitted_at' : (columns.has('created_at') ? 'created_at' : null),
    reviewedByColumn: columns.has('reviewed_by') ? 'reviewed_by' : (columns.has('approved_by') ? 'approved_by' : null),
    reviewedAtColumn: columns.has('reviewed_at') ? 'reviewed_at' : (columns.has('approved_at') ? 'approved_at' : null),
    rejectionReasonColumn: columns.has('rejection_reason') ? 'rejection_reason' : null
  };
  return overtimeSchemaCache;
}

function requireOvertimeColumn(schema, key, label) {
  const value = schema[key];
  if (!value) {
    const err = new Error(`Overtime table is missing the ${label} column`);
    err.statusCode = 500;
    throw err;
  }
  return value;
}

async function getLeaveRequestSchema() {
  if (leaveRequestSchemaCache) return leaveRequestSchemaCache;
  const [rows] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests'`
  );
  const columns = new Set(rows.map(r => r.COLUMN_NAME));
  leaveRequestSchemaCache = {
    idColumn: columns.has('request_id') ? 'request_id' : (columns.has('leave_request_id') ? 'leave_request_id' : null),
    employeeIdColumn: columns.has('employee_id') ? 'employee_id' : null,
    leaveTypeIdColumn: columns.has('leave_type_id') ? 'leave_type_id' : null,
    startDateColumn: columns.has('start_date') ? 'start_date' : null,
    endDateColumn: columns.has('end_date') ? 'end_date' : null,
    numDaysColumn: columns.has('num_days') ? 'num_days' : (columns.has('days') ? 'days' : null),
    statusColumn: columns.has('status') ? 'status' : null,
    reasonColumn: columns.has('reason') ? 'reason' : (columns.has('notes') ? 'notes' : null),
    requestedAtColumn: columns.has('requested_at') ? 'requested_at' : (columns.has('created_at') ? 'created_at' : null),
    reviewedByColumn: columns.has('reviewed_by') ? 'reviewed_by' : (columns.has('approved_by') ? 'approved_by' : null),
    reviewedAtColumn: columns.has('reviewed_at') ? 'reviewed_at' : (columns.has('approved_at') ? 'approved_at' : null)
  };
  return leaveRequestSchemaCache;
}

function requireLeaveRequestColumn(schema, key, label) {
  const value = schema[key];
  if (!value) {
    const err = new Error(`Leave requests table is missing the ${label} column`);
    err.statusCode = 500;
    throw err;
  }
  return value;
}

app.post('/api/overtime/submit', authenticate, async (req, res) => {
  try {
    // Allow employees to submit overtime
    if (req.user.role !== 'EMPLOYEE' && !req.user.permissions?.includes('overtime.submit')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { work_date, hours_worked, reason } = req.body;
    const employeeId = req.user.employeeId;
    
    if (!work_date || !hours_worked) {
      return res.status(400).json({ error: 'Work date and hours are required' });
    }
    if (hours_worked <= 0 || hours_worked > 24) {
      return res.status(400).json({ error: 'Hours worked must be between 0 and 24' });
    }

    const schema = await getOvertimeSchema();
    const dateColumn = requireOvertimeColumn(schema, 'dateColumn', 'date');
    const hoursColumn = requireOvertimeColumn(schema, 'hoursColumn', 'hours');
    const insertColumns = ['employee_id', dateColumn, hoursColumn];
    const insertValues = [employeeId, work_date, hours_worked];
    const placeholders = ['?', '?', '?'];

    if (schema.approvedHoursColumn && schema.approvedHoursColumn !== hoursColumn) {
      insertColumns.push(schema.approvedHoursColumn);
      insertValues.push(hours_worked);
      placeholders.push('?');
    }
    if (schema.reasonColumn) {
      insertColumns.push(schema.reasonColumn);
      insertValues.push(reason || '');
      placeholders.push('?');
    }
    if (schema.statusColumn) {
      insertColumns.push(schema.statusColumn);
      insertValues.push('Pending');
      placeholders.push('?');
    }
    
    await pool.execute(
      `INSERT INTO overtime (${insertColumns.join(', ')}) VALUES (${placeholders.join(', ')})`,
      insertValues
    );
    
    await logAudit(req.user.userId, req.user.username, 'SUBMIT', 'OVERTIME', null, `${work_date}`, `Submitted ${hours_worked} hours overtime for ${work_date}`);
    
    res.json({ success: true, message: 'Overtime submitted and pending HR approval' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Overtime already submitted for this date' });
    }
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/overtime/my-submissions', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'EMPLOYEE') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const { status = 'All' } = req.query;
    const schema = await getOvertimeSchema();
    const dateColumn = requireOvertimeColumn(schema, 'dateColumn', 'date');
    const hoursColumn = requireOvertimeColumn(schema, 'hoursColumn', 'hours');
    const submittedAtSelect = schema.submittedAtColumn ? `o.${schema.submittedAtColumn} as submitted_at` : 'NULL as submitted_at';
    const reasonSelect = schema.reasonColumn ? `o.${schema.reasonColumn} as reason` : "'' as reason";
    const rejectionReasonSelect = schema.rejectionReasonColumn ? `o.${schema.rejectionReasonColumn} as rejection_reason` : 'NULL as rejection_reason';
    let sql = `SELECT o.*, o.${requireOvertimeColumn(schema, 'idColumn', 'ID')} as overtime_id, o.${dateColumn} as work_date, o.${hoursColumn} as hours_worked,
      ${reasonSelect}, ${submittedAtSelect}, ${rejectionReasonSelect},
      CONCAT(e.first_name, ' ', e.last_name) as full_name, e.emp_number
      FROM overtime o
      JOIN employees e ON o.employee_id = e.employee_id
      WHERE o.employee_id = ?`;
    const params = [req.user.employeeId];
    
    if (status !== 'All') {
      const statusColumn = requireOvertimeColumn(schema, 'statusColumn', 'status');
      sql += ` AND o.${statusColumn} = ?`;
      params.push(status);
    }
    
    sql += ` ORDER BY o.${dateColumn} DESC`;
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

app.get('/api/overtime/pending-approvals', authenticate, requireHROvertimeApproval, async (req, res) => {
  try {
    const schema = await getOvertimeSchema();
    const idColumn = requireOvertimeColumn(schema, 'idColumn', 'ID');
    const dateColumn = requireOvertimeColumn(schema, 'dateColumn', 'date');
    const hoursColumn = requireOvertimeColumn(schema, 'hoursColumn', 'hours');
    const statusColumn = requireOvertimeColumn(schema, 'statusColumn', 'status');
    const submittedAtSelect = schema.submittedAtColumn ? `o.${schema.submittedAtColumn} as submitted_at` : 'NULL as submitted_at';
    const reasonSelect = schema.reasonColumn ? `o.${schema.reasonColumn} as reason` : "'' as reason";
    const rejectionReasonSelect = schema.rejectionReasonColumn ? `o.${schema.rejectionReasonColumn} as rejection_reason` : 'NULL as rejection_reason';
    const employeeSubmittedFilter = schema.reasonColumn ? ` AND COALESCE(NULLIF(TRIM(o.${schema.reasonColumn}), ''), NULL) IS NOT NULL` : '';
    const [rows] = await pool.execute(
      `SELECT o.*, o.${idColumn} as overtime_id, o.${dateColumn} as work_date, o.${hoursColumn} as hours_worked,
              ${reasonSelect}, ${submittedAtSelect}, ${rejectionReasonSelect},
              CONCAT(e.first_name, ' ', e.last_name) as full_name, e.emp_number, 
              d.dept_name
       FROM overtime o
       JOIN employees e ON o.employee_id = e.employee_id
       LEFT JOIN departments d ON e.dept_id = d.dept_id
       WHERE o.${statusColumn} = 'Pending'${employeeSubmittedFilter}
       ORDER BY ${schema.submittedAtColumn ? `o.${schema.submittedAtColumn}` : `o.${dateColumn}`} ASC`
    );
    res.json(rows);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

app.get('/api/overtime/history', authenticate, requirePerm('overtime.view'), async (req, res) => {
  try {
    const { employee_id, status = 'All', year = new Date().getFullYear() } = req.query;
    const schema = await getOvertimeSchema();
    const dateColumn = requireOvertimeColumn(schema, 'dateColumn', 'date');
    const hoursColumn = requireOvertimeColumn(schema, 'hoursColumn', 'hours');
    const submittedAtSelect = schema.submittedAtColumn ? `o.${schema.submittedAtColumn} as submitted_at` : 'NULL as submitted_at';
    const reasonSelect = schema.reasonColumn ? `o.${schema.reasonColumn} as reason` : "'' as reason";
    const rejectionReasonSelect = schema.rejectionReasonColumn ? `o.${schema.rejectionReasonColumn} as rejection_reason` : 'NULL as rejection_reason';
    let sql = `SELECT o.*, o.${requireOvertimeColumn(schema, 'idColumn', 'ID')} as overtime_id, o.${dateColumn} as work_date, o.${hoursColumn} as hours_worked,
      ${reasonSelect}, ${submittedAtSelect}, ${rejectionReasonSelect},
      CONCAT(e.first_name, ' ', e.last_name) as full_name, e.emp_number, d.dept_name
      FROM overtime o
      JOIN employees e ON o.employee_id = e.employee_id
      LEFT JOIN departments d ON e.dept_id = d.dept_id
      WHERE YEAR(o.${dateColumn}) = ?`;
    const params = [year];
    
    if (employee_id) {
      sql += ' AND o.employee_id = ?';
      params.push(employee_id);
    }
    
    if (status !== 'All') {
      const statusColumn = requireOvertimeColumn(schema, 'statusColumn', 'status');
      sql += ` AND o.${statusColumn} = ?`;
      params.push(status);
    }
    
    sql += ` ORDER BY o.${dateColumn} DESC`;
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

app.patch('/api/overtime/:id/approve', authenticate, requireHROvertimeApproval, async (req, res) => {
  try {
    const schema = await getOvertimeSchema();
    const idColumn = requireOvertimeColumn(schema, 'idColumn', 'ID');
    const dateColumn = requireOvertimeColumn(schema, 'dateColumn', 'date');
    const hoursColumn = requireOvertimeColumn(schema, 'hoursColumn', 'hours');
    const statusColumn = requireOvertimeColumn(schema, 'statusColumn', 'status');
    const reviewedByColumn = requireOvertimeColumn(schema, 'reviewedByColumn', 'reviewed by');
    const reviewedAtColumn = requireOvertimeColumn(schema, 'reviewedAtColumn', 'reviewed at');
    const [[overtime]] = await pool.execute(
      `SELECT *, ${dateColumn} as work_date, ${hoursColumn} as hours_worked FROM overtime WHERE ${idColumn} = ?`,
      [req.params.id]
    );
    
    if (!overtime) {
      return res.status(404).json({ error: 'Overtime record not found' });
    }
    
    await pool.execute(
      `UPDATE overtime SET ${statusColumn} = ?, ${reviewedByColumn} = ?, ${reviewedAtColumn} = NOW() WHERE ${idColumn} = ?`,
      ['Approved', req.user.userId, req.params.id]
    );
    
    const [[emp]] = await pool.execute('SELECT * FROM employees WHERE employee_id = ?', [overtime.employee_id]);
    await logAudit(req.user.userId, req.user.username, 'APPROVE', 'OVERTIME', req.params.id, emp.emp_number, `Approved ${overtime.hours_worked} hours overtime for ${emp.emp_number} on ${overtime.work_date}`);
    
    res.json({ success: true, message: 'Overtime approved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/overtime/:id/reject', authenticate, requireHROvertimeApproval, async (req, res) => {
  try {
    const { rejection_reason } = req.body;
    const schema = await getOvertimeSchema();
    const idColumn = requireOvertimeColumn(schema, 'idColumn', 'ID');
    const dateColumn = requireOvertimeColumn(schema, 'dateColumn', 'date');
    const hoursColumn = requireOvertimeColumn(schema, 'hoursColumn', 'hours');
    const statusColumn = requireOvertimeColumn(schema, 'statusColumn', 'status');
    const reviewedByColumn = requireOvertimeColumn(schema, 'reviewedByColumn', 'reviewed by');
    const reviewedAtColumn = requireOvertimeColumn(schema, 'reviewedAtColumn', 'reviewed at');
    const [[overtime]] = await pool.execute(
      `SELECT *, ${dateColumn} as work_date, ${hoursColumn} as hours_worked FROM overtime WHERE ${idColumn} = ?`,
      [req.params.id]
    );
    
    if (!overtime) {
      return res.status(404).json({ error: 'Overtime record not found' });
    }

    const updateParts = [
      `${statusColumn} = ?`,
      `${reviewedByColumn} = ?`,
      `${reviewedAtColumn} = NOW()`
    ];
    const updateParams = ['Rejected', req.user.userId];
    if (schema.rejectionReasonColumn) {
      updateParts.push(`${schema.rejectionReasonColumn} = ?`);
      updateParams.push(rejection_reason || '');
    }
    await pool.execute(
      `UPDATE overtime SET ${updateParts.join(', ')} WHERE ${idColumn} = ?`,
      [...updateParams, req.params.id]
    );
    
    const [[emp]] = await pool.execute('SELECT * FROM employees WHERE employee_id = ?', [overtime.employee_id]);
    await logAudit(req.user.userId, req.user.username, 'REJECT', 'OVERTIME', req.params.id, emp.emp_number, `Rejected ${overtime.hours_worked} hours overtime for ${emp.emp_number} on ${overtime.work_date}`);
    
    res.json({ success: true, message: 'Overtime rejected' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/overtime/rates', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM overtime_rates WHERE is_active = TRUE ORDER BY rate_name');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PAYROLL
// ═══════════════════════════════════════════════════════════════════

app.get('/api/payroll/periods', authenticate, requirePerm('payroll.view'), async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM payroll_periods ORDER BY period_year DESC,period_month DESC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/payroll/periods', authenticate, requirePayrollOnly, requirePerm('payroll.process'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { period_name, period_year, period_month, pay_date, start_date, end_date, working_days } = req.body;
    if (!period_name || !period_year || !period_month || !pay_date || !start_date || !end_date) {
      return res.status(400).json({ error: 'All payroll period fields are required.' });
    }
    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ error: 'Start date cannot be later than end date.' });
    }
    if (new Date(pay_date) < new Date(start_date)) {
      return res.status(400).json({ error: 'Pay date cannot be before the period start date.' });
    }
    const [[existingPeriod]] = await conn.execute(
      'SELECT period_id FROM payroll_periods WHERE period_year=? AND period_month=? LIMIT 1',
      [period_year, period_month]
    );
    if (existingPeriod) {
      return res.status(409).json({ error: 'A payroll period for that month already exists.' });
    }
    await conn.beginTransaction();
    const [result] = await conn.execute(
      "INSERT INTO payroll_periods (period_name,period_year,period_month,pay_date,start_date,end_date,working_days,status) VALUES (?,?,?,?,?,?,?, 'Open')",
      [period_name, period_year, period_month, pay_date, start_date, end_date, working_days || 22]
    );
    await conn.execute('CALL sp_process_period(?,?)', [result.insertId, req.user.userId]);
    await conn.commit();
    await logAudit(req.user.userId, req.user.username, 'CREATE', 'PAYROLL', result.insertId, null, `Created and processed payroll period ${period_name}`);
    res.json({ success: true, periodId: result.insertId, message: 'Payroll period created and processed for all active employees.' });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

app.get('/api/payroll/periods/:id/runs', authenticate, requirePerm('payroll.view'), async (req, res) => {
  try {
    const [[period]] = await pool.execute('SELECT * FROM payroll_periods WHERE period_id=?', [req.params.id]);
    const [runs] = await pool.execute('SELECT * FROM payroll_runs WHERE period_id=? ORDER BY emp_number', [req.params.id]);
    res.json({ period, runs });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/payroll/periods/:id/process', authenticate, requirePayrollOnly, requirePerm('payroll.process'), async (req, res) => {
  try {
    await pool.execute('CALL sp_process_period(?,?)', [req.params.id, req.user.userId]);
    await logAudit(req.user.userId, req.user.username, 'PROCESS', 'PAYROLL', req.params.id, null, `Processed payroll period ${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/payroll/periods/:id/approve', authenticate, requirePayrollOnly, requirePerm('payroll.approve'), async (req, res) => {
  try {
    await pool.execute('CALL sp_approve_period(?,?)', [req.params.id, req.user.userId]);
    await logAudit(req.user.userId, req.user.username, 'APPROVE', 'PAYROLL', req.params.id, null, `Approved payroll period ${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/payroll/periods/:id/mark-paid', authenticate, requirePayrollOnly, requirePerm('payroll.markpaid'), async (req, res) => {
  try {
    await pool.execute('CALL sp_mark_period_paid(?,?)', [req.params.id, req.user.userId]);
    await logAudit(req.user.userId, req.user.username, 'MARK_PAID', 'PAYROLL', req.params.id, null, `Marked payroll period ${req.params.id} as paid`);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/payroll/payslip/:runId', authenticate, requirePerm('payroll.view'), async (req, res) => {
  try {
    const [[run]] = await pool.execute(
      `SELECT pr.*,pp.period_name,pp.pay_date,pp.period_year,pp.period_month FROM payroll_runs pr JOIN payroll_periods pp ON pr.period_id=pp.period_id WHERE pr.run_id=?`,
      [req.params.runId]);
    if (!run) return res.status(404).json({ error: 'Not found' });
    res.json(run);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════

app.get('/api/reports/payroll-summary', authenticate, requirePerm('reports.payroll'), async (req, res) => {
  try {
    const { period_id } = req.query;
    let sql = 'SELECT * FROM v_payroll_summary';
    const params = [];
    if (period_id) { sql += ' WHERE period_id=?'; params.push(period_id); }
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (e) {
    const [rows] = await pool.execute(`SELECT pp.period_name,pp.period_year,pp.period_month,pp.status,pp.total_gross,pp.total_paye,pp.total_nssf,pp.total_nhif,pp.total_housing_levy,pp.total_net FROM payroll_periods pp ORDER BY pp.period_year DESC,pp.period_month DESC`);
    res.json(rows);
  }
});

app.get('/api/reports/dept-cost', authenticate, requirePerm('reports.payroll'), async (req, res) => {
  try {
    const { period_id } = req.query;
    let sql = `SELECT d.dept_name,COUNT(pr.run_id) as headcount,SUM(pr.gross_pay) as total_gross,SUM(pr.net_pay) as total_net,SUM(pr.paye_payable) as total_paye FROM payroll_runs pr JOIN employees e ON pr.employee_id=e.employee_id JOIN departments d ON e.dept_id=d.dept_id WHERE 1=1`;
    const params = [];
    if (period_id) { sql += ' AND pr.period_id=?'; params.push(period_id); }
    sql += ' GROUP BY d.dept_id,d.dept_name ORDER BY total_gross DESC';
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/reports/bank-transfer', authenticate, requirePerm('reports.payroll'), async (req, res) => {
  try {
    const { period_id } = req.query;
    const [rows] = await pool.execute(
      `SELECT pr.emp_number,pr.full_name,pr.bank_name,pr.bank_account,pr.net_pay FROM payroll_runs pr WHERE pr.period_id=? ORDER BY pr.bank_name,pr.emp_number`, [period_id]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/reports/paye-p10', authenticate, requirePerm('reports.statutory'), async (req, res) => {
  try {
    const { period_id } = req.query;
    const [rows] = await pool.execute(
      `SELECT pr.emp_number,pr.full_name,e.kra_pin,pr.gross_pay,pr.taxable_income,pr.paye_payable,pr.personal_relief FROM payroll_runs pr JOIN employees e ON pr.employee_id=e.employee_id WHERE pr.period_id=? ORDER BY pr.emp_number`, [period_id]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/reports/nssf', authenticate, requirePerm('reports.statutory'), async (req, res) => {
  try {
    const { period_id } = req.query;
    const [rows] = await pool.execute(
      `SELECT pr.emp_number,pr.full_name,e.nssf_number,pr.gross_pay,pr.nssf_employee,pr.nssf_employer FROM payroll_runs pr JOIN employees e ON pr.employee_id=e.employee_id WHERE pr.period_id=? ORDER BY pr.emp_number`, [period_id]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/reports/nhif', authenticate, requirePerm('reports.statutory'), async (req, res) => {
  try {
    const { period_id } = req.query;
    const [rows] = await pool.execute(
      `SELECT pr.emp_number,pr.full_name,e.nhif_number,pr.gross_pay,pr.nhif FROM payroll_runs pr JOIN employees e ON pr.employee_id=e.employee_id WHERE pr.period_id=? ORDER BY pr.emp_number`, [period_id]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/reports/housing-levy', authenticate, requirePerm('reports.statutory'), async (req, res) => {
  try {
    const { period_id } = req.query;
    const [rows] = await pool.execute(
      `SELECT pr.emp_number,pr.full_name,pr.gross_pay,pr.housing_levy_employee,pr.housing_levy_employer FROM payroll_runs pr WHERE pr.period_id=? ORDER BY pr.emp_number`, [period_id]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/reports/employee-register', authenticate, requirePerm('reports.payroll'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT e.emp_number,CONCAT(e.first_name,' ',COALESCE(e.middle_name,''),' ',e.last_name) as full_name,e.gender,e.hire_date,e.status,e.employment_type,e.national_id,e.kra_pin,e.email,d.dept_name,des.desig_name,es.basic_salary FROM employees e LEFT JOIN departments d ON e.dept_id=d.dept_id LEFT JOIN designations des ON e.desig_id=des.desig_id LEFT JOIN employee_salary es ON es.employee_id=e.employee_id AND es.is_current=1 ORDER BY e.emp_number`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/reports/headcount', authenticate, requirePerm('reports.payroll'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT d.dept_name,COUNT(e.employee_id) as total,SUM(e.status='Active') as active,SUM(e.status='Terminated') as terminated,SUM(e.employment_type='Permanent') as permanent,SUM(e.employment_type='Contract') as contract FROM departments d LEFT JOIN employees e ON e.dept_id=d.dept_id GROUP BY d.dept_id,d.dept_name ORDER BY active DESC`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/reports/leave-balances', authenticate, requirePerm('reports.payroll'), async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const [rows] = await pool.execute(
      `SELECT e.emp_number,CONCAT(e.first_name,' ',e.last_name) as full_name,d.dept_name,lt.type_name,lb.entitled_days,lb.taken_days,lb.pending_days,(lb.entitled_days-lb.taken_days-lb.pending_days) as balance FROM leave_balances lb JOIN employees e ON lb.employee_id=e.employee_id LEFT JOIN departments d ON e.dept_id=d.dept_id JOIN leave_types lt ON lb.leave_type_id=lt.leave_type_id WHERE lb.year=? ORDER BY e.emp_number,lt.type_name`, [year]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/reports/attendance-summary', authenticate, requirePerm('reports.payroll'), async (req, res) => {
  try {
    const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = req.query;
    const [rows] = await pool.execute(
      `SELECT e.emp_number,CONCAT(e.first_name,' ',e.last_name) as full_name,d.dept_name,s.working_days,s.days_present,s.days_absent,s.days_leave,s.total_late_mins,ROUND(s.days_present/s.working_days*100,1) as attendance_pct FROM attendance_summary s JOIN employees e ON s.employee_id=e.employee_id LEFT JOIN departments d ON e.dept_id=d.dept_id WHERE s.period_year=? AND s.period_month=? ORDER BY attendance_pct ASC`, [year, month]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/reports/p9', authenticate, requirePerm('reports.p9'), async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const [rows] = await pool.execute(
      `SELECT e.emp_number,CONCAT(e.first_name,' ',e.last_name) as full_name,e.kra_pin,SUM(pr.gross_pay) as annual_gross,SUM(pr.paye_payable) as annual_paye,SUM(pr.nssf_employee) as annual_nssf,SUM(pr.nhif) as annual_nhif,SUM(pr.housing_levy_employee) as annual_hl,SUM(pr.personal_relief) as annual_relief FROM payroll_runs pr JOIN employees e ON pr.employee_id=e.employee_id JOIN payroll_periods pp ON pr.period_id=pp.period_id WHERE pp.period_year=? AND pp.status IN ('Approved','Paid') GROUP BY e.employee_id,e.emp_number,e.first_name,e.last_name,e.kra_pin ORDER BY e.emp_number`, [year]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/reports/audit', authenticate, requirePerm('reports.audit'), async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT al.*,u.email FROM audit_log al LEFT JOIN users u ON al.user_id=u.user_id ORDER BY al.created_at DESC LIMIT 500');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════

app.get('/api/settings', authenticate, requirePerm('admin.settings'), async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM system_settings ORDER BY setting_group,setting_key');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/settings/:key', authenticate, requirePerm('admin.settings'), async (req, res) => {
  try {
    const { value } = req.body;
    await pool.execute('UPDATE system_settings SET setting_value=? WHERE setting_key=?', [value, req.params.key]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/settings/tax-tables', authenticate, requirePerm('admin.settings'), async (req, res) => {
  try {
    const [paye] = await pool.execute('SELECT * FROM paye_bands ORDER BY lower_limit');
    const [nssf] = await pool.execute('SELECT * FROM nssf_tiers ORDER BY lower_limit');
    const [nhif] = await pool.execute('SELECT * FROM nhif_bands ORDER BY lower_limit');
    const [hl] = await pool.execute('SELECT * FROM housing_levy_rates');
    const [reliefs] = await pool.execute('SELECT * FROM tax_reliefs');
    res.json({ paye, nssf, nhif, housingLevy: hl, reliefs });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/users', authenticate, requireAdminOrHR, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.user_id,u.username,u.email,u.is_active,u.last_login,u.must_change_pw,u.approval_status,u.employee_id,r.role_name,r.role_code,e.emp_number,CONCAT(e.first_name,' ',e.last_name) as emp_name FROM users u JOIN roles r ON u.role_id=r.role_id LEFT JOIN employees e ON u.employee_id=e.employee_id ORDER BY u.user_id`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/roles', authenticate, requireAdminOnly, async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM roles ORDER BY role_name');
  res.json(rows);
});

app.post('/api/users', authenticate, requireAdminOnly, async (req, res) => {
  try {
    const d = req.body;
    const hash = await bcrypt.hash(d.password, 10);
    await pool.execute(
      'INSERT INTO users (username,email,password_hash,role_id,employee_id,is_active,must_change_pw,approval_status) VALUES (?,?,?,?,?,0,1,?)',
      [d.username, d.email, hash, d.role_id, d.employee_id || null, 'Pending']
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/users/:id', authenticate, requireAdminOnly, async (req, res) => {
  try {
    const d = req.body;
    if (d.password) {
      const hash = await bcrypt.hash(d.password, 10);
      await pool.execute('UPDATE users SET username=?,email=?,password_hash=?,role_id=?,employee_id=?,is_active=?,approval_status=? WHERE user_id=?',
        [d.username, d.email, hash, d.role_id, d.employee_id || null, d.is_active, d.approval_status || 'Approved', req.params.id]);
    } else {
      await pool.execute('UPDATE users SET username=?,email=?,role_id=?,employee_id=?,is_active=?,approval_status=? WHERE user_id=?',
        [d.username, d.email, d.role_id, d.employee_id || null, d.is_active, d.approval_status || 'Approved', req.params.id]);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/users/:id/approve', authenticate, requireHROnly, async (req, res) => {
  try {
    const [[user]] = await pool.execute('SELECT * FROM users WHERE user_id=?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await pool.execute('UPDATE users SET approval_status=?, is_active=1 WHERE user_id=?', ['Approved', req.params.id]);
    res.json({ success: true, message: 'User approved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/users/:id/reject', authenticate, requireHROnly, async (req, res) => {
  try {
    const [[user]] = await pool.execute('SELECT * FROM users WHERE user_id=?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await pool.execute('UPDATE users SET approval_status=?, is_active=0 WHERE user_id=?', ['Rejected', req.params.id]);
    res.json({ success: true, message: 'User rejected' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SELF-SERVICE (employee portal)
// ═══════════════════════════════════════════════════════════════════

app.get('/api/selfservice/profile', authenticate, async (req, res) => {
  try {
    const empId = req.user.employeeId;
    if (!empId) return res.status(403).json({ error: 'No employee linked' });
    const [[emp]] = await pool.execute(
      `SELECT e.*,d.dept_name,des.desig_name,es.basic_salary FROM employees e LEFT JOIN departments d ON e.dept_id=d.dept_id LEFT JOIN designations des ON e.desig_id=des.desig_id LEFT JOIN employee_salary es ON es.employee_id=e.employee_id AND es.is_current=1 WHERE e.employee_id=?`, [empId]);
    res.json(emp);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/selfservice/payslips', authenticate, async (req, res) => {
  try {
    const empId = req.user.employeeId;
    if (!empId) return res.status(403).json({ error: 'No employee linked' });
    const [rows] = await pool.execute(
      `SELECT pr.run_id,pp.period_name,pp.pay_date,pr.gross_pay,pr.net_pay,pr.status FROM payroll_runs pr JOIN payroll_periods pp ON pr.period_id=pp.period_id WHERE pr.employee_id=? AND pp.status IN ('Approved','Paid') ORDER BY pp.period_year DESC,pp.period_month DESC LIMIT 12`, [empId]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/selfservice/payslip/:runId', authenticate, async (req, res) => {
  try {
    const empId = req.user.employeeId;
    const [[run]] = await pool.execute(
      `SELECT pr.*,pp.period_name,pp.pay_date FROM payroll_runs pr JOIN payroll_periods pp ON pr.period_id=pp.period_id WHERE pr.run_id=? AND pr.employee_id=?`, [req.params.runId, empId]);
    if (!run) return res.status(403).json({ error: 'Access denied' });
    await logAudit(req.user.userId, req.user.username, 'DOWNLOAD', 'SELFSERVICE', run.run_id, run.emp_number, `Downloaded payslip ${req.params.runId}`);
    res.json(run);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/selfservice/leave-balances', authenticate, async (req, res) => {
  try {
    const empId = req.user.employeeId;
    if (!empId) return res.status(403).json({ error: 'No employee linked' });
    const year = new Date().getFullYear();
    const [rows] = await pool.execute(
      `SELECT lb.*,lt.type_name,lt.annual_days FROM leave_balances lb JOIN leave_types lt ON lb.leave_type_id=lt.leave_type_id WHERE lb.employee_id=? AND lb.year=?`, [empId, year]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/selfservice/leave-requests', authenticate, async (req, res) => {
  try {
    const empId = req.user.employeeId;
    if (!empId) return res.status(403).json({ error: 'No employee linked' });
    const schema = await getLeaveRequestSchema();
    const employeeIdColumn = requireLeaveRequestColumn(schema, 'employeeIdColumn', 'employee ID');
    const leaveTypeIdColumn = requireLeaveRequestColumn(schema, 'leaveTypeIdColumn', 'leave type');
    const startDateColumn = requireLeaveRequestColumn(schema, 'startDateColumn', 'start date');
    const endDateColumn = requireLeaveRequestColumn(schema, 'endDateColumn', 'end date');
    const numDaysSelect = schema.numDaysColumn ? `lr.${schema.numDaysColumn} as num_days` : 'NULL as num_days';
    const statusSelect = schema.statusColumn ? `lr.${schema.statusColumn} as status` : "'Pending' as status";
    const reasonSelect = schema.reasonColumn ? `lr.${schema.reasonColumn} as reason` : "'' as reason";
    const requestedAtSelect = schema.requestedAtColumn ? `lr.${schema.requestedAtColumn}` : `lr.${startDateColumn}`;
    const [rows] = await pool.execute(
      `SELECT
        lr.${requireLeaveRequestColumn(schema, 'idColumn', 'ID')} as request_id,
        lr.${startDateColumn} as start_date,
        lr.${endDateColumn} as end_date,
        ${numDaysSelect},
        ${statusSelect},
        ${reasonSelect},
        lt.type_name
      FROM leave_requests lr
      JOIN leave_types lt ON lr.${leaveTypeIdColumn}=lt.leave_type_id
      WHERE lr.${employeeIdColumn}=?
      ORDER BY ${requestedAtSelect} DESC, lr.${startDateColumn} DESC`,
      [empId]
    );
    res.json(rows);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message || 'Server error' });
  }
});

// ─── SPA CATCH-ALL ──────────────────────────────────────────────────────────
// ─── START ──────────────────────────────────────────────────────────────────
app.use('/api', (err, req, res, next) => {
  console.error('API error:', err);
  if (res.headersSent) return next(err);
  res.status(err.statusCode || 500).json({
    error: err.message || 'Server error'
  });
});

app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 3001;

if (require.main === module) {
  (async () => {
    try {
      await initApp();
      app.listen(PORT, () => {
        console.log('Spinners Payroll Server');
        console.log(`http://localhost:${PORT}`);
        console.log(`Mode: ${process.env.EMAIL_DEMO_MODE === 'true' ? 'DEMO (OTPs in console)' : 'LIVE email'}`);
        console.log('');
      });
    } catch (e) {
      console.error('Failed to start server:', e);
      process.exit(1);
    }
  })();
}

module.exports = app;

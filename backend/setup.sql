-- Basic schema for Spinners Payroll

CREATE TABLE IF NOT EXISTS roles (
  role_id INT PRIMARY KEY AUTO_INCREMENT,
  role_code VARCHAR(20) UNIQUE NOT NULL,
  role_name VARCHAR(50) NOT NULL
);

INSERT IGNORE INTO roles (role_code, role_name) VALUES
('ADMIN', 'Administrator'),
('HR', 'HR Manager'),
('PAYROLL', 'Payroll Officer'),
('EMPLOYEE', 'Employee');

CREATE TABLE IF NOT EXISTS employees (
  employee_id INT PRIMARY KEY AUTO_INCREMENT,
  emp_number VARCHAR(20) UNIQUE,
  first_name VARCHAR(50),
  last_name VARCHAR(50),
  hire_date DATE,
  basic_salary DECIMAL(10,2),
  department VARCHAR(50),
  designation VARCHAR(50),
  status ENUM('Pending', 'Active', 'Terminated') DEFAULT 'Pending'
);

CREATE TABLE IF NOT EXISTS users (
  user_id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  approval_status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Approved',
  role_id INT,
  employee_id INT,
  must_change_pw BOOLEAN DEFAULT FALSE,
  failed_logins INT DEFAULT 0,
  locked_until DATETIME,
  last_login DATETIME,
  FOREIGN KEY (role_id) REFERENCES roles(role_id),
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
);

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
  approval_status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
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
);

-- Insert default users
INSERT IGNORE INTO users (username, email, password_hash, role_id) VALUES
('admin', 'amosbaraka15@gmail.com', '$2a$10$iwKUowQQVNeN72qXZ5T40.zilWUDxb.SzBVeeGCy2OlUgXPpsxdT2', 1),
('hr', 'hr@spinners.co.ke', '$2a$10$c4k0lA9Iz4RzuA8qY53AieFPJoknZR5xNkb6S8ptP8LEmgT8xx8N.', 2),
('payroll', 'payroll@spinners.co.ke', '$2a$10$osvyQZETEY.x1Lg5JZAERe0LZCahXsofDrpJMQDCmdLAtfyji01ku', 3),
('employee', 'c.mutua@spinners.co.ke', '$2a$10$uAZZkC6XUkab8WPP8cjyZ.pNmk6HScun1qDNJZ8RAqcBppKDudn4q', 4);

CREATE TABLE IF NOT EXISTS otp_verifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  email VARCHAR(100),
  otp_hash VARCHAR(255),
  purpose VARCHAR(20),
  expires_at DATETIME,
  is_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Add more tables as needed for full functionality

-- Permissions system
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
SET FOREIGN_KEY_CHECKS = 1;
CREATE TABLE permissions (
  perm_id INT PRIMARY KEY AUTO_INCREMENT,
  perm_code VARCHAR(50) UNIQUE NOT NULL,
  module VARCHAR(50)
);

INSERT INTO permissions (perm_code, module) VALUES
('leave.view', 'leave'),
('leave.apply', 'leave'),
('leave.approve', 'leave'),
('attendance.view', 'attendance'),
('payroll.view', 'payroll'),
('payroll.process', 'payroll'),
('employees.view', 'employees'),
('employees.create', 'employees'),
('employees.edit', 'employees'),
('employees.delete', 'employees'),
('admin.users', 'admin'),
('reports.view', 'reports'),
('overtime.submit', 'overtime'),
('overtime.view', 'overtime'),
('overtime.approve', 'overtime');

CREATE TABLE role_permissions (
  role_id INT,
  perm_id INT,
  PRIMARY KEY (role_id, perm_id),
  FOREIGN KEY (role_id) REFERENCES roles(role_id),
  FOREIGN KEY (perm_id) REFERENCES permissions(perm_id)
);

-- Assign permissions to roles
INSERT INTO role_permissions (role_id, perm_id)
SELECT r.role_id, p.perm_id
FROM roles r, permissions p
WHERE (r.role_code = 'ADMIN' AND p.perm_code <> 'overtime.approve') OR
      (r.role_code = 'HR' AND p.perm_code IN ('leave.view', 'leave.apply', 'leave.approve', 'attendance.view', 'employees.view', 'reports.view', 'overtime.view', 'overtime.approve')) OR
      (r.role_code = 'PAYROLL' AND p.perm_code IN ('payroll.view', 'payroll.process', 'attendance.view', 'employees.view', 'leave.view', 'reports.view', 'overtime.view')) OR
      (r.role_code = 'EMPLOYEE' AND p.perm_code IN ('leave.apply', 'overtime.submit'));

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  dept_id INT PRIMARY KEY AUTO_INCREMENT,
  dept_name VARCHAR(100) UNIQUE NOT NULL,
  dept_code VARCHAR(20) UNIQUE
);

INSERT IGNORE INTO departments (dept_name, dept_code) VALUES
('Human Resources', 'HR'),
('Finance', 'FIN'),
('Operations', 'OPS'),
('Sales', 'SAL'),
('IT', 'IT');

-- Designations
CREATE TABLE IF NOT EXISTS designations (
  desig_id INT PRIMARY KEY AUTO_INCREMENT,
  desig_name VARCHAR(100) UNIQUE NOT NULL,
  dept_id INT,
  FOREIGN KEY (dept_id) REFERENCES departments(dept_id)
);

INSERT IGNORE INTO designations (desig_name, dept_id) VALUES
('HR Manager', 1),
('Payroll Officer', 2),
('Operations Manager', 3),
('Sales Representative', 4),
('IT Support', 5);

-- Update employees table with additional fields
ALTER TABLE employees ADD COLUMN IF NOT EXISTS dept_id INT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS desig_id INT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS middle_name VARCHAR(50);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone_primary VARCHAR(20);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS national_id VARCHAR(20);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT') DEFAULT 'FULL_TIME';
ALTER TABLE employees ADD FOREIGN KEY IF NOT EXISTS (dept_id) REFERENCES departments(dept_id);
ALTER TABLE employees ADD FOREIGN KEY IF NOT EXISTS (desig_id) REFERENCES designations(desig_id);

-- Insert sample employees
INSERT IGNORE INTO employees (emp_number, first_name, middle_name, last_name, hire_date, basic_salary, dept_id, desig_id, email, phone_primary, national_id) VALUES
('EMP001', 'Charles', 'M', 'Mutua', '2023-01-15', 45000.00, 1, 1, 'c.mutua@spinners.co.ke', '+254712345678', '12345678'),
('EMP002', 'Grace', 'W', 'Wanjiku', '2023-02-01', 35000.00, 2, 2, 'g.wanjiku@spinners.co.ke', '+254723456789', '23456789'),
('EMP003', 'David', 'K', 'Kiprop', '2023-03-10', 40000.00, 3, 3, 'd.kiprop@spinners.co.ke', '+254734567890', '34567890');

-- Link users to employees
UPDATE users SET employee_id = (SELECT employee_id FROM employees WHERE emp_number = 'EMP001') WHERE username = 'employee';
UPDATE users SET employee_id = (SELECT employee_id FROM employees WHERE emp_number = 'EMP001') WHERE username = 'hr';

-- Leave types
CREATE TABLE IF NOT EXISTS leave_types (
  leave_type_id INT PRIMARY KEY AUTO_INCREMENT,
  type_name VARCHAR(50) UNIQUE NOT NULL,
  annual_days INT NOT NULL DEFAULT 21,
  description TEXT
);

INSERT IGNORE INTO leave_types (type_name, annual_days, description) VALUES
('Annual Leave', 21, 'Standard annual leave entitlement'),
('Sick Leave', 10, 'Medical leave for illness'),
('Maternity Leave', 90, 'Leave for new mothers'),
('Paternity Leave', 14, 'Leave for new fathers'),
('Emergency Leave', 5, 'Unplanned emergency situations');

-- Leave requests
CREATE TABLE IF NOT EXISTS leave_requests (
  request_id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  leave_type_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  num_days INT NOT NULL,
  status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
  reason TEXT,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_by INT,
  reviewed_at TIMESTAMP NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(leave_type_id),
  FOREIGN KEY (reviewed_by) REFERENCES users(user_id)
);

-- Leave balances
CREATE TABLE IF NOT EXISTS leave_balances (
  balance_id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  leave_type_id INT NOT NULL,
  year YEAR NOT NULL,
  entitled_days DECIMAL(5,1) DEFAULT 0,
  taken_days DECIMAL(5,1) DEFAULT 0,
  pending_days DECIMAL(5,1) DEFAULT 0,
  UNIQUE KEY unique_emp_type_year (employee_id, leave_type_id, year),
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(leave_type_id)
);

-- Insert initial leave balances for employees
INSERT IGNORE INTO leave_balances (employee_id, leave_type_id, year, entitled_days)
SELECT e.employee_id, lt.leave_type_id, YEAR(NOW()), lt.annual_days
FROM employees e
CROSS JOIN leave_types lt;

-- Overtime tracking
CREATE TABLE IF NOT EXISTS overtime (
  overtime_id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  work_date DATE NOT NULL,
  hours_worked DECIMAL(5,2) NOT NULL,
  reason TEXT,
  status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_by INT,
  reviewed_at TIMESTAMP NULL,
  rejection_reason TEXT,
  UNIQUE KEY unique_emp_date (employee_id, work_date),
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (reviewed_by) REFERENCES users(user_id)
);

-- Overtime rate configurations
CREATE TABLE IF NOT EXISTS overtime_rates (
  rate_id INT PRIMARY KEY AUTO_INCREMENT,
  rate_name VARCHAR(100) NOT NULL,
  multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.50,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE
);

INSERT IGNORE INTO overtime_rates (rate_name, multiplier, description) VALUES
('Weekday Overtime', 1.50, 'Standard overtime - 1.5 times normal rate'),
('Weekend Overtime', 2.00, 'Weekend work - 2 times normal rate'),
('Holiday Overtime', 2.50, 'Public holiday work - 2.5 times normal rate');

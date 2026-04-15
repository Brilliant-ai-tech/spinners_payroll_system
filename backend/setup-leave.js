const mysql = require('mysql2/promise');

async function setupLeaveTables() {
  const pool = await mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Brilliantbaraka1.',
    database: 'spinners_payroll'
  });

  try {
    // Drop existing tables if they exist
    await pool.execute('DROP TABLE IF EXISTS leave_requests');
    await pool.execute('DROP TABLE IF EXISTS leave_balances');
    await pool.execute('DROP TABLE IF EXISTS leave_types');

    // Create leave_types table
    await pool.execute(`
      CREATE TABLE leave_types (
        leave_type_id INT PRIMARY KEY AUTO_INCREMENT,
        type_name VARCHAR(50) UNIQUE NOT NULL,
        annual_days INT NOT NULL DEFAULT 21,
        description TEXT
      )
    `);

    // Insert leave types
    await pool.execute(`
      INSERT INTO leave_types (type_name, annual_days, description) VALUES
      ('Annual Leave', 21, 'Standard annual leave entitlement'),
      ('Sick Leave', 10, 'Medical leave for illness'),
      ('Maternity Leave', 90, 'Leave for new mothers'),
      ('Paternity Leave', 14, 'Leave for new fathers'),
      ('Emergency Leave', 5, 'Unplanned emergency situations')
    `);

    // Create leave_requests table
    await pool.execute(`
      CREATE TABLE leave_requests (
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
      )
    `);

    // Create leave_balances table
    await pool.execute(`
      CREATE TABLE leave_balances (
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
      )
    `);

    // Insert initial leave balances
    await pool.execute(`
      INSERT INTO leave_balances (employee_id, leave_type_id, year, entitled_days)
      SELECT e.employee_id, lt.leave_type_id, YEAR(NOW()), lt.annual_days
      FROM employees e
      CROSS JOIN leave_types lt
    `);

    console.log('Leave tables created successfully');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}

setupLeaveTables();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function setup() {
  // First, connect without database to create it
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Brilliantbaraka1.'
  });

  await connection.execute('CREATE DATABASE IF NOT EXISTS spinners_payroll');
  await connection.end();

  // Now connect to the database
  const dbConnection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Brilliantbaraka1.',
    database: 'spinners_payroll'
  });

  const sql = fs.readFileSync(path.join(__dirname, 'setup.sql'), 'utf8');
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

  for (const statement of statements) {
    if (statement.startsWith('--')) continue;
    await dbConnection.execute(statement);
  }

  console.log('Database setup complete');
  dbConnection.end();
}

setup().catch(console.error);

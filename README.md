# Spinners Mattress Payroll Management System

A full-stack payroll management system for Spinners Mattress Company (Kenya).

## Tech Stack
- **Backend**: Node.js + Express.js
- **Database**: MySQL 8.0
- **Frontend**: Vanilla HTML/CSS/JS (SPA)
- **Auth**: JWT + OTP email verification

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Edit `.env` with your credentials:
```
DB_HOST=localhost
DB_USER=root
DB_PASS=your_password
DB_NAME=spinners_payroll
JWT_SECRET=change_this_in_production
EMAIL_DEMO_MODE=true   # OTPs print to console - no SMTP needed
```

### 3. Set up the database
```bash
mysql -u root -p < backend/setup.sql
```

### 4. Run the server
```bash
node backend/server.js  # production
npm run dev             # development (with nodemon auto-reload)
```

### 5. Open the app
```
http://localhost:3001
```

## Default Login Credentials

Email                  Password   Role
admin@spinners.co.ke   admin123   Admin (full access)
hr@spinners.co.ke      hr1234     HR Manager
payroll@spinners.co.ke pay1234    Payroll Officer
c.mutua@spinners.co.ke emp1234    Employee (self-service)

> **OTP Note**: With `EMAIL_DEMO_MODE=true`, OTP codes print to the server console. No SMTP setup required.

## Features

### Modules
- **Dashboard** - KPI cards with animated counters, sparklines, activity feed
- **Employees** - Full CRUD with 5-tab detail view, termination workflow
- **Attendance** - Daily recording, overtime approval, monthly summary
- **Leave** - Request submission, approve/reject workflow, balance tracking
- **Payroll** - Period management, processing via stored procedures, payslip viewer
- **Reports** - 13 reports including PAYE P10, NSSF, NHIF, P9 Annual
- **Settings** - User management, system config, tax rate tables
- **Self-Service** - Employee portal: profile, leave balances, payslips

### Kenya Statutory Compliance
- PAYE (2024/25 bands): 10% to 35%
- NSSF (2013 Act): Tier I and II
- NHIF (17 income bands)
- Housing Levy (1.5% employee + employer)
- Personal relief: KES 2,400/month

## File Structure
```text
spinners-payroll/
  package.json
  package-lock.json
  .env
  backend/
    server.js
    setup.js
    setup-leave.js
    setup.sql
  frontend/
    public/
      index.html
      css/
        style.css
      js/
        app.js
        login.js
        dashboard.js
        employees.js
        attendance.js
        leave.js
        payroll.js
        reports.js
        settings.js
        selfservice.js
      images/
```

## Design System
- Deep space navy dark theme (`#0A0F1E`)
- Electric gold accent (`#F59E0B`)
- Cyber teal secondary (`#06B6D4`)
- Space Grotesk + Inter + JetBrains Mono typography
- Glassmorphism login card with particle canvas
- Animated KPI counters, sparklines, skeleton loaders

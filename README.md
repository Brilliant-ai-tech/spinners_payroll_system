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

For hosted MySQL services that require TLS/SSL, also set:
```
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_SSL_CA_PATH=path/to/ca.pem
```

On Windows, an example `DB_SSL_CA_PATH` would look like:
```
C:\Users\Administrator\Downloads\ca.pem
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
  api/
    index.js
    [...path].js
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

## Deploy to Vercel

### 1. Push the repo to GitHub
Commit your current code and push it to a GitHub repository.

### 2. Import the project into Vercel
- Open Vercel dashboard
- Click `Add New Project`
- Import the GitHub repository
- Keep the project root as the repository root

### 3. Add environment variables
Copy the keys from `.env.example` into Vercel Project Settings -> Environment Variables.

Important values:
- `CORS_ORIGIN` should be your Vercel production URL, for example `https://your-project.vercel.app`
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` must point to a MySQL database reachable from Vercel
- If you want live OTP emails, set the SMTP variables and `EMAIL_DEMO_MODE=false`

### 4. Deploy
After saving the environment variables, trigger a production deployment from Vercel.

### Notes
- Static files are served from the root `public/` folder
- Express API routes are served through the Vercel `api/` entrypoints
- Local development still runs with `node backend/server.js`
```

## Design System
- Deep space navy dark theme (`#0A0F1E`)
- Electric gold accent (`#F59E0B`)
- Cyber teal secondary (`#06B6D4`)
- Space Grotesk + Inter + JetBrains Mono typography
- Glassmorphism login card with particle canvas
- Animated KPI counters, sparklines, skeleton loaders

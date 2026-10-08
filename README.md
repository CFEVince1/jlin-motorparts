# JLIN Motorparts - Sales & Inventory Management System

A high-density Sales, Inventory, and Point of Sale (POS) management system tailored for motorcycle parts retail with barcode scanning, platform compatibility management, and thermal receipt printing.

---

## Quick Start Credentials

| Role | Username | Password |
| :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` |
| **Staff** | `staff` | `staff123` |

---

## 1-Click Startup (Recommended)

Double-click **`start.bat`** (or `run.bat`) in this directory. It will:
1. Start the Backend API (`node server.js` on port 5000)
2. Start the Frontend (`npm run dev` on port 5173)
3. Automatically launch your default browser to `http://localhost:5173`

---

## Manual Startup

### 1. Backend (Port 5000)
```powershell
cd c:\Inventory\backend
node server.js
```

### 2. Frontend (Port 5173)
```powershell
cd c:\Inventory\frontend
npm run dev
```

### 3. Open Application
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Instant Database Reset for Defense / Rehearsals

Double-click **`reset_demo.bat`** (or run `npm run reset-demo` in `backend`) to restore the database to the clean pre-defense state with zero stock, opening balance ledgers, and compatibility matrices in under 2 seconds.

---

For detailed configuration and features, see [RUN_INSTRUCTIONS.md](file:///c:/Inventory/RUN_INSTRUCTIONS.md).

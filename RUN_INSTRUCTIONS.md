# JLIN Motorparts - Setup & Run Instructions

A desktop-optimized Sales, Inventory, and Point of Sale (POS) management system with barcode scanning, compatibility group tracking, and thermal receipt printing.

---

## 1. System Credentials

The system provides two standard role tiers:

| Role | Username | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin` | *(Configured during setup / `.env`)* | Full access: Dashboard, POS, Products Directory, Manage Compatibility, Inventory, Business Reports, User Management |
| **Staff / Cashier** | `staff` | *(Configured during setup / `.env`)* | Operational access: Point of Sale (POS), Inventory Stock In/Out, Transaction History |

> **Security Note:** Passwords must be at least 8 characters. Set `INITIAL_ADMIN_PASSWORD` and `INITIAL_STAFF_PASSWORD` in `backend/.env` before running database initialization, or use the randomly generated passwords printed to the console during setup. Passwords can also be changed or added under **System Users** (`/users`) when logged in as `admin`.

---

## 2. Prerequisites

Make sure the following software is running on your machine:
* **Node.js** (v18 or higher)
* **MySQL Server** (Running on port `3306`)
* **Web Browser** (Google Chrome, Edge, or Brave recommended)

---

## 3. How to Run the System

### Option A: 1-Click Automatic Startup (Recommended)

Simply double-click the **`start.bat`** (or `run.bat`) file in the root folder (`c:\Inventory\start.bat`):
* Automatically launches the **Backend API Server** (Port 5000)
* Automatically launches the **Frontend Dev Server** (Port 5173)
* Automatically opens your default web browser to **`http://localhost:5173`**
* Displays login credentials and server logs in dedicated console windows

---

### Option B: Manual Terminal Startup

#### Step 1: Ensure MySQL is Running
Confirm MySQL is active on port `3306`:
* **Database Name:** `jlin_inventory_db`
* **Default User:** `root`
* **Default Password:** *(empty by default in XAMPP/WAMP, or configure in `backend/.env`)*

### Step 2: Start the Backend API Server
Open a terminal in the project directory:

```powershell
cd c:\Inventory\backend
npm install
node server.js
```

* **Backend URL:** `http://localhost:5000`
* **Health Check:** `http://localhost:5000/api/products`

### Step 3: Start the Frontend Application
Open a second terminal window:

```powershell
cd c:\Inventory\frontend
npm install
npm run dev
```

* **Frontend URL:** `http://localhost:5173`

---

## 4. Accessing the Application

1. Open your browser and navigate to:
   ```
   http://localhost:5173
   ```
2. Enter your credentials on the Login screen:
   * **Admin:** Username `admin` | Password `<your_configured_admin_password>`
   * **Staff:** Username `staff` | Password `<your_configured_staff_password>`
3. Click **Sign In**.

---

## 5. Environment Configuration

If your MySQL credentials differ, update [`backend/.env`](file:///c:/Inventory/backend/.env):

```env
PORT=5000

# Local MySQL Database Settings
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=jlin_inventory_db

# Security (Must be 32+ characters / 256-bit key in production)
# Generate a secret: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=<your_secure_random_jwt_secret_here>

# Initial Setup Passwords (Optional: used only if users table is empty during db:setup)
# INITIAL_ADMIN_PASSWORD=your_secure_admin_password_min_8_chars
# INITIAL_STAFF_PASSWORD=your_secure_staff_password_min_8_chars
```

---

## 6. Key Features Quick Guide

* **Point of Sale (POS):**
  * Type or scan part numbers directly into the search bar.
  * Hitting **Enter** on an exact match or barcode automatically adds it to the active order.
  * For serialized items (e.g. ECUs), select required serial numbers before completing checkout.
* **Thermal Receipt Printing:**
  * Completed transactions open a print-ready 80mm thermal receipt dialog.
  * Press **Print Receipt** (Ctrl+P) to print crisp black-on-white text with ink conservation styling.
* **Theme Switching:**
  * Toggle between Dark Mode and Light Mode using the Sun/Moon button on the sidebar.
  * Design tokens adapt automatically across all screens.

---

## 7. Defense Rehearsal & Live Panel Reset Strategy

To ensure every dry-run rehearsal and the live panel defense start from an identical clean state:

### 1-Click Instant Reset (Recommended)
Double-click **`reset_demo.bat`** (or run `npm run reset-demo` in `backend`):
* Instantly restores the baseline clean database state (`jlin_demo_clean.sql`) in ~1 second.
* Automatically resets inventory stock to 0, verifies ledger opening balances, and restores the canonical product compatibility matrix from the baseline snapshot.

### Re-running Migrations & Demo Seeds
```powershell
# 1. Run Comprehensive Migration
node backend/migrations/20261007_comprehensive_inventory_pos.js

# 2. Run Defense Demo Seed
node backend/seeds/01_defense_demo_seed.js
```

### Capturing a New Clean Snapshot
Double-click **`snapshot.bat`** (or run `npm run snapshot` in `backend`):
* Exports the entire schema, triggers, and tables to `jlin_demo_clean.sql` with automated credential stripping.

---

## 8. Live Defense Walkthrough Script (`JLR-BP-AEROX`)

Execute this sequential script during system defense using **Aerox Front Brake Pad Set (`JLR-BP-AEROX`)** to demonstrate that every panel comment has been addressed:

```text
=================================================================================================
DEMONSTRATION ITEM: Aerox Front Brake Pad Set (SKU: JLR-BP-AEROX)
INITIAL STATE: Stock = 0 | Reference: OPENING-<CURRENT_DATE>
=================================================================================================

1. Opening Balance Baseline Verification:
   - Open Item Ledger Drawer for JLR-BP-AEROX.
   - Point out baseline record: OPENING_BALANCE | Qty: +0 | Balance: 0 | Ref: OPENING-<CURRENT_DATE>.

2. Multi-Item Stock Receiving:
   - Navigate to Stock Receiving Screen (/stock-receive).
   - Select Supplier: "Yamaha Motor Philippines", Reference No: "OR-2026-001", Courier: "Logistics".
   - Line Item 1: JLR-BP-AEROX (Qty: 10).
   - Line Item 2: JLR-OF-AEROX (Qty: 15).
   - Submit Delivery -> Both stock levels update atomically.
   - Show Ledger: STOCK_IN | Qty: +10 | Balance: 10 | Ref: OR-2026-001.

3. Parts Compatibility Engine Lookup:
   - Navigate to Parts Compatibility Page (/compatibility-search).
   - Select: Yamaha -> Aerox 155 -> V1.
   - Result: JLR-BP-AEROX appears in COMPATIBLE table (Stock: 10).
   - Select: Yamaha -> Aerox 155 -> V3.
   - Result: JLR-BP-AEROX appears in NOT_COMPATIBLE table ("Incompatible caliper bolt spacing").

4. POS Sale via GCash & Thermal Printing:
   - Ring up 2 units of JLR-BP-AEROX in POS (/pos) (Total: ₱900.00).
   - Select Payment Method: GCASH.
   - Enter Ref: "102938472910". Amount Paid locks to ₱900.00 (Change: ₱0.00).
   - Complete Checkout -> Native print dialog opens showing 58mm/80mm receipt with GCash reference.
   - Show Ledger: SALE | Qty: -2 | Balance: 8 | Ref: SO-2026-0001 (or auto-generated SO-YYYY-NNNN).

5. Damage Write-Off:
   - Open Adjustment Modal for JLR-BP-AEROX.
   - Select Type: DAMAGE | Qty: 1 | Ref: "DM-2026-001" | Remarks: "Cracked friction lining".
   - Submit -> Stock drops to 7.
   - Show Ledger: DAMAGE | Qty: -1 | Balance: 7 | Ref: DM-2026-001.

6. Return to Supplier Write-Off:
   - Open Adjustment Modal for JLR-BP-AEROX.
   - Select Type: RETURN_TO_SUPPLIER | Qty: 1 | Ref: "RTS-2026-001" | Remarks: "Defective batch return".
   - Submit -> Stock drops to 6.
   - Show Ledger: RETURN_TO_SUPPLIER | Qty: -1 | Balance: 6 | Ref: RTS-2026-001.

7. Physical Loss & Restoration (Found Item):
   - Physical count reveals 5 units on shelf (1 missing).
   - Record Adjustment: LOSS | Qty: 1 | Ref: "LS-2026-001" | Remarks: "Missing during count".
   - Stock drops to 5. Ledger records: LOSS | Qty: -1 | Balance: 5.
   - Simulate finding unit behind shelf.
   - Record Adjustment: FOUND | Qty: 1 | Ref: "FD-2026-001".
   - Select Linked Loss: Selects LS-2026-001 from dropdown | Remarks: "Restored from LS-2026-001".
   - Submit -> Stock returns to 6. Ledger records: FOUND | Qty: +1 | Balance: 6.

8. Discrepancy & Adjustments Report Verification:
   - Open Adjustments Report view (/reports/adjustments).
   - Filter by date range.
   - Point out summary metrics: Damage (1), Supplier Return (1), Loss (1), Found (1).
   - Display chronological entries complete with references, reasons, and responsible staff.

9. Final Ledger Audit Inspection:
   - Open Ledger Drawer for JLR-BP-AEROX to demonstrate the complete audit trail:
     --------------------------------------------------------------------------------------------
     ID  TYPE                QTY    BALANCE  REFERENCE       RECORDED BY  REMARKS
     --------------------------------------------------------------------------------------------
     1   OPENING_BALANCE     +0        0     OPENING-DATE    Admin        Baseline balance init
     2   STOCK_IN           +10       10     OR-2026-001     Staff        Stock receiving ref: OR-2026-001
     3   SALE                -2        8     SO-2026-0001    Staff        POS Sale: SO-2026-0001
     4   DAMAGE              -1        7     DM-2026-001     Staff        Cracked friction lining
     5   RETURN_TO_SUPPLIER  -1        6     RTS-2026-001    Staff        Defective batch return
     6   LOSS                -1        5     LS-2026-001     Staff        Missing during count
     7   FOUND               +1        6     FD-2026-001     Staff        Restored from LS-2026-001
     --------------------------------------------------------------------------------------------

10. Security & Metadata CRUD Verification:
    - Open Staff Profile (/profile) -> Change staff password -> Re-authenticate with new credentials.
    - Open Product Edit Modal for JLR-BP-AEROX -> Update product name/price.
    - Demonstrate that stock input is non-editable and remains locked at 6.
    - (Optional panel demonstration in MySQL client): Attempt raw SQL `DELETE FROM inventory_transactions;` or `UPDATE` to show the database trigger blocking the command.
=================================================================================================
```

---

## 7. Defense Week Operating Guidelines & Render Cloud Warmup

> [!IMPORTANT]
> **Render Free Plan Cold-Start Notice**: Render's free tier spins down (sleeps) web services after 15 minutes of inactivity. When asleep, an incoming request can take **50–90 seconds** to wake up the server.

### 1. Pre-Defense Warmup (Do This 5–10 Minutes Before Presentation)
Before beginning your panel presentation or live demo, send a ping request to wake up the Render backend service:
* **Option A (Browser)**: Open `https://jlin-motorparts.onrender.com/health` (or `https://jlin-inventory-api.onrender.com/health`) in your browser tab. Wait until it returns `{"status":"ok"}`.
* **Option B (PowerShell / Terminal)**:
  ```powershell
  curl https://jlin-motorparts.onrender.com/health
  ```
Once awake, subsequent POS transactions, searches, and barcode scans respond with immediate sub-second latency.

### 2. Defense Week Deployment Freeze
* Render has **Auto-Deploy on Push** enabled for the `main` branch.
* Any commit pushed to `origin/main` automatically triggers a cloud rebuild and redeploy, causing temporary service downtime or unexpected state shifts.
* **Strict Rule**: Do **NOT** push commits to `main` during defense week or while rehearsing right before the defense panel. Use local testing (`localhost:5000` / `localhost:5173`) for any dry runs.



# JLIN Motorparts — System Design & UI/UX Architecture

## 1. Product Vision & Operational Context

**JLIN Motorparts** is a specialized Sales, Inventory, and Point-of-Sale (POS) management system purpose-built for motorcycle parts retail shops and repair centers in the Philippines. 

### Operational Context
- **Counter Environment:** High-tempo front counter with rapid customer turnover, walk-in mechanics, and counter inquiries requiring sub-second parts compatibility checks.
- **Physical Environment:** Retail shop floor and garage settings with bright fluorescent lighting, counter barcode scanners, and compact thermal receipt printers.
- **Core Business Goal:** Eliminate stock discrepancies, prevent stockouts of high-velocity motorcycle consumables (bolts, spark plugs, brake pads), enforce immutable auditability on inventory adjustments, provide instant fitment verification across motorcycle models, and support flexible checkout tenders including split payments.

---

## 2. Visual Theme & Aesthetic Principles

The design language conveys **industrial precision, operational efficiency, and technical reliability**. It avoids decorative fluff in favor of high-density information architecture and instantaneous visual recognition.

### Color Palette & Design Tokens

| Token | Hex Value | Purpose / Usage |
| :--- | :--- | :--- |
| **Canvas Background** | `#0F172A` (Slate 900) | Primary dark application canvas minimizing eye fatigue in shop environments. |
| **Card Surface** | `#1E293B` (Slate 800) | Elevated panels, tables, form containers, and modals. |
| **Subsurface / Input** | `#334155` (Slate 700) | Search bars, form inputs, table headers, and borders (`#475569`). |
| **Primary Brand Accent** | `#10B981` (Emerald 500) | Primary interactive actions, checkout buttons, active navigation pills. |
| **Secondary Accent / GCash** | `#0284C7` (Sky 600) | GCash digital wallet payments, references, and balance indicators. |
| **Split Tender Accent** | `#A855F7` (Purple 500) | Split payment badges, dual-tender indicators (`#C084FC`). |
| **Warning / Reorder** | `#F59E0B` (Amber 500) | Low stock warnings, reorder thresholds, `CONDITIONAL` fitment notes. |
| **Negative / Outflow** | `#EF4444` (Red 500) | Damages, losses, returns to supplier, `NOT_COMPATIBLE` badges, void alerts. |
| **Text Primary** | `#F8FAFC` (Slate 50) | High-contrast data values, item titles, prices, and header text. |
| **Text Muted** | `#94A3B8` (Slate 400) | Secondary metadata, SKUs, timestamps, column labels, table captions. |

---

## 3. Typography & Numerical Formatting

1. **Interface Typography:**
   - **Font Family:** `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`.
   - **Scale:** 
     - Page Headers: `1.5rem` (`24px`), font-weight 700.
     - Section Headers & KPIs: `1.125rem` (`18px`) to `1.75rem` (`28px`), font-weight 600.
     - Body & Form Controls: `0.875rem` (`14px`), font-weight 400/500.
     - Table Data & Badges: `0.75rem` (`12px`) to `0.8125rem` (`13px`), font-weight 500.

2. **Numerical & Tabular Data:**
   - **Font Family:** `JetBrains Mono`, `ui-monospace`, `Menlo`, `monospace`.
   - **Application:** SKUs, Part Numbers, Quantities, Currency (`₱`), Barcodes, Transaction UUIDs.
   - **Currency Rule:** Strictly format Philippine Peso as `₱#,##0.00` (e.g. `₱450.00`, `₱1,250.00`). Monospace styling prevents numerical jitter across table rows.

---

## 4. Core Subsystems & UX Flows

### 4.1. Point of Sale (POS) Counter Terminal (`/pos`)
- **Single-Screen Ergonomics:** Split layout with product catalog / fast-picker on the left and sticky transaction receipt ticket on the right.
- **Barcode & Fast Search:** Immediate autofocus on the search input for hands-free USB barcode scanner input. Typing or scanning automatically increments cart quantity for existing items.
- **Triple Payment Modalities:**
  - **Cash:** Real-time tendered amount keypad with instant change calculation. Prevents checkout if tendered < total.
  - **GCash (E-Wallet):** Tendered amount automatically locks to exact cart total. Enforces a non-empty alphanumeric GCash Reference Number (`gcash_reference_no` $\ge$ 6 characters) before completing payment.
  - **Split Payment (Cash + GCash):** Accommodates customers with insufficient cash and insufficient GCash balances to pay the bill with two tenders:
    - User inputs the cash portion (e.g., ₱500); remaining GCash portion auto-calculates (e.g., ₱1,000).
    - If customer tenders a larger bill (e.g., ₱1,000 for a ₱500 cash portion), cash change is calculated accurately.
    - Mandatory GCash reference number verified and stored with unique constraint.
- **Cart Protection & Exit Modality:**
  - Cashiers can safely close the checkout modal via `Esc` key, clicking the backdrop overlay, or clicking **"← Back to Cart"**.
  - All items in the cart remain 100% preserved so forgotten products can be added without losing work.
- **Thermal Receipt Printing:**
  - Dual-width support for standard 58mm and 80mm ESC/POS receipt rolls.
  - Explicitly details dual-tender breakdowns when split payments are utilized.

### 4.2. Consolidated Motorcycle Compatibility & Fitment (`/profile?tab=fitment`)
- **Streamlined Navigation:** Fitment Search and Compatibility Rules are consolidated into **Account & Security (`/profile`)**, keeping the main sidebar uncluttered for primary sales operations.
- **Vehicle Hierarchy:** 3-tier cascade: `Brand` $\rightarrow$ `Model` $\rightarrow$ `Year / Generation`.
- **Instant Fitment Matrix:**
  - **COMPATIBLE:** Guaranteed direct OEM or aftermarket bolt-on fitment.
  - **CONDITIONAL:** Requires specific adaptations or brackets (annotated with technical notes).
  - **NOT_COMPATIBLE:** Explicitly verified non-fitment (annotated with technical differences).

### 4.3. Append-Only Inventory Ledger & Audit Trail (`/inventory`, `/reports/adjustments`)
- **Immutable Ledger Rule:** Stock is never manually overwritten or directly edited in the database. Stock count is strictly a read-only projection backed by `SUM(quantity_change)`.
- **Database Trigger Protection:** MySQL triggers (`trg_block_inventory_transactions_update`, `trg_block_inventory_transactions_delete`) unconditionally block raw `UPDATE` and `DELETE` queries on the ledger.
- **Sentinel Lock Table:** `inventory_transactions_lock` holds a foreign key reference preventing table `TRUNCATE`.
- **Discrepancy Audit Navigation:** Uses strict `end` route matching on `/reports/adjustments` to prevent dual-highlighting alongside `/reports`.

### 4.4. Security, Credentials & Password Recovery (`/forgot-password`, `/profile`)
- **Live Password Complexity Checklist:**
  - `8+ characters` with real-time green check / gray X.
  - `Uppercase, lowercase, number & special char` with real-time regex feedback.
  - Password mismatch alert highlighting confirmation field in red.
- **Show/Hide Password & OTP Eye Toggles:** Elevated z-index eye/eye-off toggle buttons across OTP and password inputs.
- **Resend HTTPS Gateway:** Outbound 6-digit OTP delivery runs via Resend REST API over port 443, eliminating cloud provider SMTP egress timeouts.

---

## 5. Component Design Standards

### Tables
- Compact padding (`py-2.5 px-3`) for maximum row density.
- Sticky column headers with subtle border separator (`#334155`).
- Alternating row zebra striping or subtle hover highlight (`#1E293B` to `#334155`).
- Right-aligned monetary values and quantities for tabular readability.

### Modals & Dialogs
- Centered backdrop overlay with blur (`bg-black/60 backdrop-blur-sm`).
- Dismissible via backdrop click, `Esc` keyboard shortcut, or cancel button.
- Form inputs default to autofocus on the primary field.

### Badges & Status Indicators
- Rounded-full pill tags (`px-2.5 py-0.5 text-xs font-semibold`).
- `Split (Cash + GCash)`: Purple pill badge (`bg-purple-950 text-purple-300 border border-purple-700`).
- `COMPATIBLE`: Green background (`bg-emerald-950 text-emerald-300 border border-emerald-700`).
- `NOT_COMPATIBLE`: Red background (`bg-rose-950 text-rose-300 border border-rose-700`).
- `CONDITIONAL`: Amber background (`bg-amber-950 text-amber-300 border border-amber-700`).
- `Low Stock`: Crimson alert badge (`bg-red-500/20 text-red-400 border border-red-500/30`).

---

## 6. Architecture Do's and Don'ts

### Do's
- ✅ **DO** ensure every inventory change originates from an audited business transaction (`PURCHASE_RECEIPT`, `SALE`, or signed `ADJUSTMENT`).
- ✅ **DO** display the Philippine Peso symbol (`₱`) with all monetary values.
- ✅ **DO** support multi-tender split payments (Cash + GCash) with exact dual-amount recording.
- ✅ **DO** preserve cart state when cashiers close the payment modal to retrieve forgotten items.
- ✅ **DO** use monospace fonts for SKUs, part numbers, quantities, prices, and references.
- ✅ **DO** send OTP emails over HTTPS REST (port 443) rather than blocking SMTP ports on cloud hosts.

### Don'ts
- ❌ **DON'T** allow direct manual edits to `products.stock` or `products.current_stock` via CRUD forms.
- ❌ **DON'T** clear cart items prematurely before payment confirmation is fully processed.
- ❌ **DON'T** use prefix route matching on parent paths like `/reports` when child routes `/reports/adjustments` exist.
- ❌ **DON'T** store raw user passwords or credentials in SQL snapshot files or seed dumps.
- ❌ **DON'T** write non-deterministic transaction numbers; use collision-proof database IDs or UUIDs.

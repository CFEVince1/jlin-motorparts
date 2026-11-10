const db = require('../config/db');

async function runMigration() {
  console.log('[Migration] Starting Sections 9 & 10 Migration...');

  try {
    // 1. Enrich users table with is_active, role as varchar, pin
    console.log('Updating users table columns...');
    
    // Check if is_active exists
    const [cols] = await db.query("SHOW COLUMNS FROM users LIKE 'is_active'");
    if (cols.length === 0) {
      await db.query("ALTER TABLE users ADD COLUMN is_active TINYINT(1) DEFAULT 1 AFTER role");
      console.log('Added is_active column to users');
    }

    // Modify role column to VARCHAR(50) so supervisor and inventory_clerk are supported
    await db.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(50) NOT NULL DEFAULT 'cashier'");
    console.log('Modified role column to VARCHAR(50)');

    // Ensure pin exists
    const [pinCol] = await db.query("SHOW COLUMNS FROM users LIKE 'pin'");
    if (pinCol.length === 0) {
      await db.query("ALTER TABLE users ADD COLUMN pin VARCHAR(20) DEFAULT '1234' AFTER email_verified_at");
      console.log('Added pin column to users');
    }

    // Set sample staff accounts if needed
    await db.query("UPDATE users SET full_name = 'Store Supervisor', role = 'supervisor', pin = '2468' WHERE username = 'staff'");
    await db.query("UPDATE users SET full_name = 'Elena Cashier', role = 'cashier', pin = '1122' WHERE username = 'pasaraba'");

    // Check if an inventory clerk user exists; if not, create one
    const [clerkRows] = await db.query("SELECT id FROM users WHERE username = 'clerk'");
    if (clerkRows.length === 0) {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('clerk1234!', 10);
      await db.query(
        "INSERT INTO users (username, full_name, password, password_hash, role, pin, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)",
        ['clerk', 'Mark Inventory Clerk', hash, hash, 'inventory_clerk', '5566']
      );
      console.log('Created sample inventory clerk user: clerk / clerk1234!');
    }

    // 2. Create role_permissions table
    console.log('Creating role_permissions table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        role VARCHAR(50) NOT NULL,
        module VARCHAR(60) NOT NULL,
        module_name VARCHAR(100) NOT NULL,
        can_view TINYINT(1) DEFAULT 1,
        can_create TINYINT(1) DEFAULT 0,
        can_edit TINYINT(1) DEFAULT 0,
        can_delete TINYINT(1) DEFAULT 0,
        can_approve TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_role_module (role, module)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Standard modules list across the 11 modules:
    const modules = [
      { id: 'dashboard', name: '1. Dashboard (Command Center)' },
      { id: 'pos', name: '2. POS (Cashier Selling & Cart)' },
      { id: 'sales_history', name: '3. Sales History & Receipts' },
      { id: 'approvals', name: '4. Approvals (Void, Refund, Discount, Overrides)' },
      { id: 'inventory', name: '5. Inventory (Catalog & Stock Count Audits)' },
      { id: 'purchasing', name: '6. Purchasing & Delivery Gate' },
      { id: 'suppliers', name: '7. Facebook Suppliers & Ledger' },
      { id: 'customers', name: '8. Customers & Warranty Returns' },
      { id: 'shifts', name: '9. Shifts & Blind Cash Drawer' },
      { id: 'reports', name: '10. Reports & Financial Income Statement' },
      { id: 'users', name: '11. Users & Staff Management' }
    ];

    // Default permissions setup:
    // admin: everything allowed
    // supervisor: view/create/edit/approve on operations, view on reports, no users admin
    // cashier: view/create POS & customer return request, shifts open/close blind count, view dashboard; no approvals, no purchasing, no reports, no user management
    // inventory_clerk: view/create/edit inventory & purchasing delivery gate; no financial reports, no POS, no approvals

    for (const m of modules) {
      // Admin
      await db.query(`
        INSERT INTO role_permissions (role, module, module_name, can_view, can_create, can_edit, can_delete, can_approve)
        VALUES ('admin', ?, ?, 1, 1, 1, 1, 1)
        ON DUPLICATE KEY UPDATE module_name = VALUES(module_name)
      `, [m.id, m.name]);

      // Supervisor
      const supCanApprove = ['approvals', 'pos', 'customers', 'shifts'].includes(m.id) ? 1 : 0;
      const supCanEdit = ['pos', 'sales_history', 'inventory', 'purchasing', 'suppliers', 'customers', 'shifts'].includes(m.id) ? 1 : 0;
      const supCanCreate = ['pos', 'sales_history', 'inventory', 'purchasing', 'suppliers', 'customers', 'shifts'].includes(m.id) ? 1 : 0;
      const supCanDelete = ['inventory'].includes(m.id) ? 1 : 0;
      const supCanView = m.id !== 'users' ? 1 : 0;
      await db.query(`
        INSERT INTO role_permissions (role, module, module_name, can_view, can_create, can_edit, can_delete, can_approve)
        VALUES ('supervisor', ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE module_name = VALUES(module_name)
      `, [m.id, m.name, supCanView, supCanCreate, supCanEdit, supCanDelete, supCanApprove]);

      // Cashier
      const casCanView = ['dashboard', 'pos', 'sales_history', 'customers', 'shifts'].includes(m.id) ? 1 : 0;
      const casCanCreate = ['pos', 'sales_history', 'customers', 'shifts'].includes(m.id) ? 1 : 0;
      await db.query(`
        INSERT INTO role_permissions (role, module, module_name, can_view, can_create, can_edit, can_delete, can_approve)
        VALUES ('cashier', ?, ?, ?, ?, 0, 0, 0)
        ON DUPLICATE KEY UPDATE module_name = VALUES(module_name)
      `, [m.id, m.name, casCanView, casCanCreate]);

      // Inventory Clerk
      const clkCanView = ['dashboard', 'inventory', 'purchasing', 'suppliers'].includes(m.id) ? 1 : 0;
      const clkCanCreate = ['inventory', 'purchasing'].includes(m.id) ? 1 : 0;
      const clkCanEdit = ['inventory', 'purchasing'].includes(m.id) ? 1 : 0;
      await db.query(`
        INSERT INTO role_permissions (role, module, module_name, can_view, can_create, can_edit, can_delete, can_approve)
        VALUES ('inventory_clerk', ?, ?, ?, ?, ?, 0, 0)
        ON DUPLICATE KEY UPDATE module_name = VALUES(module_name)
      `, [m.id, m.name, clkCanView, clkCanCreate, clkCanEdit]);
    }
    console.log('Seeded standard role permissions matrix for admin, supervisor, cashier, and inventory_clerk');

    // 3. Create store_operating_expenses table
    console.log('Creating store_operating_expenses table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS store_operating_expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        expense_date DATE NOT NULL,
        category VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        payment_source ENUM('cash_drawer', 'gcash_bank') DEFAULT 'cash_drawer',
        recorded_by_id INT NULL,
        recorded_by_name VARCHAR(100) NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_expense_date (expense_date),
        INDEX idx_category (category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Seed sample operating expenses if empty
    const [expCount] = await db.query("SELECT COUNT(*) AS cnt FROM store_operating_expenses");
    if (expCount[0].cnt === 0) {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const sampleExpenses = [
        [today, 'Shop Rent', 'Motorparts Shop Monthly Space Lease (Prorated)', 4500.00, 'cash_drawer', 1, 'Admin User', 'Monthly store lease allocation'],
        [today, 'Electricity / Utilities', 'Meralco Shop Commercial Electricity Bill', 1850.00, 'gcash_bank', 1, 'Admin User', 'Aircon and display sign lights'],
        [today, 'Shipping & Courier Fees', 'J&T & Lalamove Restock Parcel Shipping Fees', 680.00, 'cash_drawer', 1, 'Admin User', 'Delivery shipping for 2 Facebook orders'],
        [today, 'Packaging & Bags', 'Heavy Duty Plastic Bags & Bubble Wrap Rolls', 320.00, 'cash_drawer', 1, 'Admin User', 'Customer checkout bags'],
        [yesterday, 'Staff Snacks / Allowances', 'Cashier & Mechanic Drinking Water & Lunch Allowance', 250.00, 'cash_drawer', 1, 'Admin User', 'Staff water dispenser refill and snack allowance'],
        [yesterday, 'Store Maintenance', 'Shop Shelf Cleaning Materials & WD40 Spray', 190.00, 'cash_drawer', 1, 'Admin User', 'Display shelf upkeep']
      ];

      for (const exp of sampleExpenses) {
        await db.query(`
          INSERT INTO store_operating_expenses 
          (expense_date, category, title, amount, payment_source, recorded_by_id, recorded_by_name, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, exp);
      }
      console.log('Seeded sample store operating expenses');
    }

    console.log('[Migration] Migration for Sections 9 & 10 completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('[Migration] Failed:', err);
    process.exit(1);
  }
}

runMigration();

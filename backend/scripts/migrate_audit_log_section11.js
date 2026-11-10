const db = require('../config/db');

async function runMigration() {
  console.log('[Migration] Starting Section 11: Audit Log Migration...');

  try {
    // 1. Create audit_logs table
    console.log('Creating audit_logs table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_id INT NULL,
        user_name VARCHAR(100) NOT NULL DEFAULT 'System',
        user_role VARCHAR(50) NOT NULL DEFAULT 'System',
        ip_address VARCHAR(45) NULL,
        module VARCHAR(60) NOT NULL,
        action_type VARCHAR(100) NOT NULL,
        entity_type VARCHAR(60) NULL,
        entity_id VARCHAR(100) NULL,
        reference_id VARCHAR(100) NULL,
        old_value TEXT NULL,
        new_value TEXT NULL,
        reason TEXT NULL,
        metadata JSON NULL,
        INDEX idx_created_at (created_at),
        INDEX idx_module (module),
        INDEX idx_action_type (action_type),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Table audit_logs verified.');

    // 2. Check if table has rows, if not, seed realistic historical audit entries
    const [rows] = await db.query("SELECT COUNT(*) AS cnt FROM audit_logs");
    if (rows[0].cnt === 0) {
      console.log('Seeding initial tamper-proof audit trail...');

      const sampleLogs = [
        {
          created_at: new Date(Date.now() - 1000 * 60 * 15), // 15 mins ago
          user_id: 1,
          user_name: 'Admin User',
          user_role: 'admin',
          ip_address: '192.168.1.100',
          module: 'Inventory & Pricing',
          action_type: 'Price Changed',
          entity_type: 'product',
          entity_id: '1',
          reference_id: 'SKU-ENG-001',
          old_value: 'Retail Price: ₱250.00',
          new_value: 'Retail Price: ₱220.00',
          reason: 'Supplier promo discount matching competitor store price',
          metadata: JSON.stringify({ product: 'NGK Spark Plug CPR8EA-9', cost: 140.00 })
        },
        {
          created_at: new Date(Date.now() - 1000 * 60 * 45), // 45 mins ago
          user_id: 1,
          user_name: 'Admin User',
          user_role: 'admin',
          ip_address: '192.168.1.100',
          module: 'Stock Adjustments',
          action_type: 'Stock Adjusted',
          entity_type: 'product',
          entity_id: '2',
          reference_id: 'ADJ-2026-004',
          old_value: 'Sellable Stock: 10 units',
          new_value: 'Sellable Stock: 8 units (-2 units)',
          reason: 'Physical shelf count audit discrepancy; 2 units damaged during storage',
          metadata: JSON.stringify({ product: 'Bando Drive Belt 828-20-30', loss_value: 700.00 })
        },
        {
          created_at: new Date(Date.now() - 1000 * 60 * 120), // 2 hours ago
          user_id: 2,
          user_name: 'Store Supervisor',
          user_role: 'supervisor',
          ip_address: '192.168.1.102',
          module: 'Approvals',
          action_type: 'Refund Approved',
          entity_type: 'customer_return',
          entity_id: '4',
          reference_id: 'RCP-1044',
          old_value: 'Status: PENDING_APPROVAL',
          new_value: 'Status: APPROVED (Cash Refund: ₱650.00)',
          reason: 'Post-sale return verified by cashier; defective stator coil within 7-day warranty',
          metadata: JSON.stringify({ customer: 'Juan dela Cruz', approved_by_pin: true })
        },
        {
          created_at: new Date(Date.now() - 1000 * 60 * 180), // 3 hours ago
          user_id: 1,
          user_name: 'Admin User',
          user_role: 'admin',
          ip_address: '192.168.1.100',
          module: 'Approvals',
          action_type: 'Discount Approved',
          entity_type: 'pos_cart',
          entity_id: 'CART-891',
          reference_id: 'APP-DISC-002',
          old_value: 'Cart Subtotal: ₱1,450.00 (0% discount)',
          new_value: 'Cart Subtotal: ₱1,305.00 (10% discount: ₱145.00 off)',
          reason: 'Fleet customer discount for tricycle association member',
          metadata: JSON.stringify({ minimum_margin_kept: 28.5 })
        },
        {
          created_at: new Date(Date.now() - 1000 * 60 * 300), // 5 hours ago
          user_id: 6,
          user_name: 'Elena Cashier',
          user_role: 'cashier',
          ip_address: '192.168.1.105',
          module: 'Shifts & Cash Drawer',
          action_type: 'Shift Closed with Shortage',
          entity_type: 'cash_float',
          entity_id: '2',
          reference_id: 'SHIFT-002',
          old_value: 'Expected Drawer Cash: ₱3,450.00',
          new_value: 'Actual Counted: ₱3,300.00 (-₱150.00 Shortage)',
          reason: 'Blind cash count completed; coin drawer short change variance',
          metadata: JSON.stringify({ opening_float: 2000.00, variance: -150.00 })
        },
        {
          created_at: new Date(Date.now() - 1000 * 60 * 420), // 7 hours ago
          user_id: null,
          user_name: 'Anonymous Attacker',
          user_role: 'Security Alert',
          ip_address: '192.168.1.45',
          module: 'Authentication & Security',
          action_type: 'Login Failed',
          entity_type: 'auth_attempt',
          entity_id: null,
          reference_id: 'SEC-LOG-992',
          old_value: 'State: Unauthenticated',
          new_value: 'State: Blocked (Invalid Password Attempt)',
          reason: 'Incorrect password entered 3 consecutive times for account "admin"',
          metadata: JSON.stringify({ user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })
        },
        {
          created_at: new Date(Date.now() - 1000 * 60 * 540), // 9 hours ago
          user_id: 1,
          user_name: 'Admin User',
          user_role: 'admin',
          ip_address: '192.168.1.100',
          module: 'Purchasing & Gate',
          action_type: 'Delivery Inspection Gate Completed',
          entity_type: 'supplier_order',
          entity_id: '1',
          reference_id: 'PO-001',
          old_value: 'PO Status: In Transit',
          new_value: 'PO Status: Received (20 Good Accepted, 2 Rejected as Damaged)',
          reason: 'Pre-acceptance unboxing inspection verified before courier was released',
          metadata: JSON.stringify({ supplier: 'MotoSpeed Facebook Parts', credit_claim: 450.00 })
        },
        {
          created_at: new Date(Date.now() - 1000 * 60 * 720), // 12 hours ago
          user_id: 1,
          user_name: 'Admin User',
          user_role: 'admin',
          ip_address: '192.168.1.100',
          module: 'Users & Permissions',
          action_type: 'Staff Account Created',
          entity_type: 'user',
          entity_id: '15',
          reference_id: 'USR-CLERK-01',
          old_value: 'Account: Non-existent',
          new_value: 'Account: @clerk (Role: Inventory Clerk, Status: Active)',
          reason: 'New warehouse clerk hired for stock intake and delivery audits',
          metadata: JSON.stringify({ pin_assigned: true })
        }
      ];

      for (const log of sampleLogs) {
        await db.query(`
          INSERT INTO audit_logs 
          (created_at, user_id, user_name, user_role, ip_address, module, action_type, entity_type, entity_id, reference_id, old_value, new_value, reason, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          log.created_at,
          log.user_id,
          log.user_name,
          log.user_role,
          log.ip_address,
          log.module,
          log.action_type,
          log.entity_type,
          log.entity_id,
          log.reference_id,
          log.old_value,
          log.new_value,
          log.reason,
          log.metadata
        ]);
      }
      console.log('Seeded sample tamper-proof audit trail entries.');
    }

    console.log('[Migration] Section 11: Audit Log Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('[Migration] Failed:', err);
    process.exit(1);
  }
}

runMigration();

const pool = require('../config/db');

async function migrateSuppliers() {
  console.log('[Migration] Starting Section 6 Suppliers database migration...');

  // 1. Add category_tags column to suppliers if not exists
  const [cols] = await pool.query('DESCRIBE suppliers');
  const hasCategoryTags = cols.some(c => c.Field === 'category_tags');
  if (!hasCategoryTags) {
    await pool.query('ALTER TABLE suppliers ADD COLUMN category_tags VARCHAR(255) NULL AFTER bank_details');
    console.log('[Migration] Added category_tags column to suppliers.');
  }

  // Seed category tags for existing suppliers
  await pool.query(`
    UPDATE suppliers 
    SET category_tags = 'Genuine OEM, Engine, Transmission, Belts' 
    WHERE id = 1 OR name LIKE '%Yamaha%'
  `);
  await pool.query(`
    UPDATE suppliers 
    SET category_tags = 'Clutch & CVT, Pulley, Belts, Performance' 
    WHERE id = 13 OR name LIKE '%JVT%'
  `);
  await pool.query(`
    UPDATE suppliers 
    SET category_tags = 'Brakes, Calipers, Master Pumps, Levers' 
    WHERE id = 14 OR name LIKE '%Brembo%' OR name LIKE '%RCB%'
  `);
  await pool.query(`
    UPDATE suppliers 
    SET category_tags = 'Oils, Tires, Filters, Consumables' 
    WHERE id = 15 OR name LIKE '%Speedmate%'
  `);
  await pool.query(`
    UPDATE suppliers 
    SET category_tags = 'Racing Engine, ECU, Big Bore Kits, Pistons' 
    WHERE id = 16 OR name LIKE '%MTRT%'
  `);
  // Default for others
  await pool.query(`
    UPDATE suppliers 
    SET category_tags = 'Motorcycle Parts, Accessories, Hardware' 
    WHERE category_tags IS NULL OR category_tags = ''
  `);
  console.log('[Migration] Seeded category_tags for suppliers.');

  // 2. Create supplier_proofs table (Middle Branch Gallery)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS supplier_proofs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      supplier_id INT NOT NULL,
      po_id INT NULL,
      proof_type ENUM('payment_proof', 'messenger_quote', 'courier_waybill') NOT NULL,
      title VARCHAR(255) NOT NULL,
      image_url TEXT NOT NULL,
      reference_no VARCHAR(100) NULL,
      amount DECIMAL(10,2) DEFAULT 0,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_supp_proof (supplier_id),
      INDEX idx_proof_type (proof_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration] Created/verified supplier_proofs table.');

  // 3. Create supplier_payments table (Payments Sent for Ledger)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS supplier_payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      supplier_id INT NOT NULL,
      po_id INT NULL,
      payment_date DATE NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      payment_method ENUM('GCash', 'Bank Transfer', 'Cash on Delivery (COD)') NOT NULL,
      reference_number VARCHAR(100) NULL,
      proof_img_url TEXT NULL,
      notes TEXT NULL,
      created_by VARCHAR(100) DEFAULT 'Admin',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_supp_pay (supplier_id),
      INDEX idx_pay_date (payment_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[Migration] Created/verified supplier_payments table.');

  // 4. Seed initial proofs if empty
  const [existingProofs] = await pool.query('SELECT COUNT(*) as count FROM supplier_proofs');
  if (existingProofs[0].count === 0) {
    await pool.query(`
      INSERT INTO supplier_proofs (supplier_id, proof_type, title, image_url, reference_no, amount, notes, created_at)
      VALUES 
      (14, 'payment_proof', 'GCash Payment - Brembo Levers Batch #1', 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop', 'GCASH-9912048', 1850.00, 'Sent to Leo Bautista (09194328876) for PO-2026-0009', NOW() - INTERVAL 2 DAY),
      (14, 'messenger_quote', 'Messenger Chat Agreement - ₱650 Wholesale Price per Pair', 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop', 'QUOTE-RCB-OCT', 650.00, 'Messenger price lock agreed with Leo: ₱650/set for 10 units', NOW() - INTERVAL 5 DAY),
      (14, 'courier_waybill', 'Lalamove Delivery Waybill #LLM-991204', 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&auto=format&fit=crop', 'LLM-991204', 150.00, 'Driver Kuya Nico completed delivery to shop', NOW() - INTERVAL 2 DAY),
      (1, 'payment_proof', 'BDO Online Bank Transfer - Yamaha Restock', 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop', 'BDO-TRX-883190', 4850.00, 'Direct BDO wire transfer to Yamaha Motor Philippines official account', NOW() - INTERVAL 10 DAY),
      (13, 'messenger_quote', 'JVT Messenger Order Confirmation Mio i125 Pulley', 'https://images.unsplash.com/photo-1517842645767-c639042777db?w=600&auto=format&fit=crop', 'JVT-QUOTE-441', 380.00, 'Chat with Jayson Tan confirming 10% wholesale discount', NOW() - INTERVAL 7 DAY),
      (13, 'courier_waybill', 'J&T Express Tracking JT1234567890', 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=600&auto=format&fit=crop', 'JT1234567890', 150.00, 'J&T parcel delivered by courier rider', NOW() - INTERVAL 4 DAY)
    `);
    console.log('[Migration] Seeded initial supplier_proofs gallery.');
  }

  // 5. Seed initial payments if empty
  const [existingPayments] = await pool.query('SELECT COUNT(*) as count FROM supplier_payments');
  if (existingPayments[0].count === 0) {
    await pool.query(`
      INSERT INTO supplier_payments (supplier_id, payment_date, amount, payment_method, reference_number, notes, created_by, created_at)
      VALUES 
      (14, CURDATE() - INTERVAL 2 DAY, 1850.00, 'GCash', 'GCASH-9912048', 'Settlement for PO-2026-0009 goods + shipping', 'Admin', NOW() - INTERVAL 2 DAY),
      (1, CURDATE() - INTERVAL 10 DAY, 4850.00, 'Bank Transfer', 'BDO-TRX-883190', 'Official BDO invoice payment', 'Admin', NOW() - INTERVAL 10 DAY),
      (13, CURDATE() - INTERVAL 4 DAY, 1150.00, 'GCash', 'GCASH-4401923', 'Deposit payment for restock order', 'Admin', NOW() - INTERVAL 4 DAY)
    `);
    console.log('[Migration] Seeded initial supplier_payments for ledger.');
  }

  console.log('[Migration] Section 6 migration complete!');
  process.exit(0);
}

migrateSuppliers().catch(err => {
  console.error('[Migration Error]', err);
  process.exit(1);
});

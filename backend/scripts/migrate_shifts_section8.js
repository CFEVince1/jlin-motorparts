const db = require('../config/db');

async function migrate() {
    console.log('--- Starting Section 8 Shifts Migration ---');

    // 1. Add Section 8 columns to cash_floats table
    const [cols] = await db.query('DESCRIBE cash_floats');
    const colNames = cols.map(c => c.Field);

    const additions = [
        { name: 'shift_code', sql: 'ALTER TABLE cash_floats ADD COLUMN shift_code VARCHAR(50) NULL AFTER id' },
        { name: 'gcash_sales', sql: 'ALTER TABLE cash_floats ADD COLUMN gcash_sales DECIMAL(12,2) DEFAULT 0.00 AFTER cash_sales' },
        { name: 'petty_cash_expenses', sql: 'ALTER TABLE cash_floats ADD COLUMN petty_cash_expenses DECIMAL(12,2) DEFAULT 0.00 AFTER cash_refunds' },
        { name: 'blind_count_entered', sql: 'ALTER TABLE cash_floats ADD COLUMN blind_count_entered DECIMAL(12,2) NULL AFTER actual_cash' },
        { name: 'admin_signed_off', sql: 'ALTER TABLE cash_floats ADD COLUMN admin_signed_off TINYINT(1) DEFAULT 0 AFTER status' },
        { name: 'signed_off_by_id', sql: 'ALTER TABLE cash_floats ADD COLUMN signed_off_by_id INT NULL AFTER admin_signed_off' },
        { name: 'signed_off_by_name', sql: 'ALTER TABLE cash_floats ADD COLUMN signed_off_by_name VARCHAR(100) NULL AFTER signed_off_by_id' },
        { name: 'signed_off_at', sql: 'ALTER TABLE cash_floats ADD COLUMN signed_off_at DATETIME NULL AFTER signed_off_by_name' }
    ];

    for (const add of additions) {
        if (!colNames.includes(add.name)) {
            await db.query(add.sql);
            console.log(`Added column: cash_floats.${add.name}`);
        }
    }

    // 2. Populate shift_code for any existing rows
    const [existingRows] = await db.query('SELECT id, shift_code FROM cash_floats ORDER BY id ASC');
    for (let i = 0; i < existingRows.length; i++) {
        const row = existingRows[i];
        if (!row.shift_code) {
            const code = `SHIFT-${String(row.id).padStart(3, '0')}`;
            await db.query('UPDATE cash_floats SET shift_code = ? WHERE id = ?', [code, row.id]);
        }
    }

    // 3. Seed sample shift history if table is empty or has few rows
    if (existingRows.length < 3) {
        const sampleShifts = [
            {
                code: 'SHIFT-001',
                staff_id: 1,
                staff_username: 'admin',
                starting_cash: 2000.00,
                cash_sales: 15420.00,
                gcash_sales: 4200.00,
                cash_refunds: 0.00,
                petty_cash_expenses: 150.00,
                expected_cash: 17270.00,
                actual_cash: 17270.00,
                shortage_overage: 0.00,
                status: 'COMPLETED',
                admin_signed_off: 1,
                signed_off_by_name: 'admin',
                notes: 'Morning shift opening register 1. Clean handover.'
            },
            {
                code: 'SHIFT-002',
                staff_id: 1,
                staff_username: 'admin',
                starting_cash: 2000.00,
                cash_sales: 8350.00,
                gcash_sales: 2100.00,
                cash_refunds: 220.00,
                petty_cash_expenses: 80.00,
                expected_cash: 10050.00,
                actual_cash: 10000.00,
                shortage_overage: -50.00,
                status: 'COMPLETED',
                admin_signed_off: 1,
                signed_off_by_name: 'admin',
                notes: 'Shortage of ₱50.00 noted from missing coins in drawer.'
            }
        ];

        for (const s of sampleShifts) {
            const [chk] = await db.query('SELECT id FROM cash_floats WHERE shift_code = ?', [s.code]);
            if (chk.length === 0) {
                await db.query(`
                    INSERT INTO cash_floats (
                        shift_code, staff_id, staff_username, assigned_by_id, assigned_by_username,
                        starting_cash, total_amount, current_cash_balance, cash_sales, gcash_sales,
                        change_given, cash_refunds, petty_cash_expenses, expected_cash, actual_cash,
                        blind_count_entered, shortage_overage, sales_count, status, admin_signed_off,
                        signed_off_by_id, signed_off_by_name, signed_off_at, notes, assigned_at,
                        completed_at, returned_at
                    ) VALUES (
                        ?, ?, ?, 1, 'admin', ?, ?, ?, ?, ?, 0.00, ?, ?, ?, ?, ?, ?, 6, ?, ?, 1, ?, NOW(),
                        ?, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 18 HOUR), DATE_SUB(NOW(), INTERVAL 18 HOUR)
                    )
                `, [
                    s.code, s.staff_id, s.staff_username, s.starting_cash, s.starting_cash,
                    s.expected_cash, s.cash_sales, s.gcash_sales, s.cash_refunds, s.petty_cash_expenses,
                    s.expected_cash, s.actual_cash, s.actual_cash, s.shortage_overage, s.status,
                    s.admin_signed_off, s.signed_off_by_name, s.notes
                ]);
                console.log(`Seeded past shift: ${s.code}`);
            }
        }
    }

    console.log('--- Section 8 Shifts Migration Completed Successfully ---');
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});

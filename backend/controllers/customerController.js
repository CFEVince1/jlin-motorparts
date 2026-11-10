const db = require('../config/db');
const { applyMovement } = require('../services/inventoryService');
const bcrypt = require('bcryptjs');

// 1. GET ALL REGISTERED CUSTOMERS
exports.getCustomers = async (req, res, next) => {
    try {
        const { search } = req.query;

        let query = `
            SELECT c.*,
                   COALESCE(s_stat.total_orders, 0) as total_purchases,
                   COALESCE(s_stat.total_spend, 0) as total_spent,
                   COALESCE(r_stat.total_returns, 0) as total_returns
            FROM customers c
            LEFT JOIN (
                SELECT customer_id, COUNT(*) as total_orders, SUM(total_amount) as total_spend
                FROM sales
                WHERE status != 'VOIDED' AND customer_id IS NOT NULL
                GROUP BY customer_id
            ) s_stat ON c.id = s_stat.customer_id
            LEFT JOIN (
                SELECT customer_id, COUNT(*) as total_returns
                FROM customer_returns
                WHERE customer_id IS NOT NULL
                GROUP BY customer_id
            ) r_stat ON c.id = r_stat.customer_id
            WHERE 1=1
        `;
        const params = [];

        if (search && search.trim()) {
            const q = `%${search.trim()}%`;
            query += ' AND (c.name LIKE ? OR c.customer_code LIKE ? OR c.phone_number LIKE ? OR c.vehicle_model LIKE ?)';
            params.push(q, q, q, q);
        }

        query += ' ORDER BY c.created_at DESC';

        const [customers] = await db.query(query, params);

        return res.json({
            success: true,
            count: customers.length,
            data: customers
        });
    } catch (err) {
        console.error('Error fetching customers:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch customer list' });
    }
};

// 2. GET CUSTOMER BY ID
exports.getCustomerById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query('SELECT * FROM customers WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }
        return res.json({ success: true, customer: rows[0] });
    } catch (err) {
        console.error('Error fetching customer:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch customer details' });
    }
};

// 3. CREATE NEW CUSTOMER
exports.createCustomer = async (req, res, next) => {
    try {
        const { customer_code, name, phone_number, vehicle_model, address, notes } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Customer name is required' });
        }
        if (!phone_number || !phone_number.trim()) {
            return res.status(400).json({ success: false, message: 'Customer phone number is required' });
        }

        let code = customer_code?.trim();
        if (!code) {
            const [maxId] = await db.query('SELECT MAX(id) as max_id FROM customers');
            const nextNum = (maxId[0]?.max_id || 0) + 1;
            code = `CUST-${String(nextNum).padStart(3, '0')}`;
        }

        const [result] = await db.query(`
            INSERT INTO customers (customer_code, name, phone_number, vehicle_model, address, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [code, name.trim(), phone_number.trim(), vehicle_model?.trim() || null, address?.trim() || null, notes?.trim() || null]);

        return res.status(201).json({
            success: true,
            message: `Customer ${name.trim()} (${code}) registered successfully!`,
            customerId: result.insertId,
            customerCode: code
        });
    } catch (err) {
        console.error('Error creating customer:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Customer code already exists' });
        }
        return res.status(500).json({ success: false, message: 'Failed to create customer' });
    }
};

// 4. UPDATE CUSTOMER
exports.updateCustomer = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, phone_number, vehicle_model, address, notes } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Customer name is required' });
        }
        if (!phone_number || !phone_number.trim()) {
            return res.status(400).json({ success: false, message: 'Customer phone number is required' });
        }

        await db.query(`
            UPDATE customers
            SET name = ?, phone_number = ?, vehicle_model = ?, address = ?, notes = ?
            WHERE id = ?
        `, [name.trim(), phone_number.trim(), vehicle_model?.trim() || null, address?.trim() || null, notes?.trim() || null, id]);

        return res.json({
            success: true,
            message: 'Customer information updated successfully!'
        });
    } catch (err) {
        console.error('Error updating customer:', err);
        return res.status(500).json({ success: false, message: 'Failed to update customer' });
    }
};

// 5. DELETE CUSTOMER
exports.deleteCustomer = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [sales] = await db.query('SELECT id FROM sales WHERE customer_id = ? LIMIT 1', [id]);
        if (sales.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete customer with existing purchase history receipts.'
            });
        }
        await db.query('DELETE FROM customers WHERE id = ?', [id]);
        return res.json({ success: true, message: 'Customer removed successfully' });
    } catch (err) {
        console.error('Error deleting customer:', err);
        return res.status(500).json({ success: false, message: 'Failed to delete customer' });
    }
};

// 6. CUSTOMER PURCHASE HISTORY (MIDDLE BRANCH)
exports.getCustomerPurchaseHistory = async (req, res, next) => {
    try {
        const { id } = req.params;
        let customer = null;

        if (id === 'walk-in' || id === '0') {
            customer = {
                id: 0,
                customer_code: 'WALK-IN',
                name: 'Walk-In Customer',
                phone_number: 'N/A',
                vehicle_model: 'Unspecified',
                notes: 'Standard walk-in buyers without saved warranty registration.'
            };
        } else {
            const [custRows] = await db.query('SELECT * FROM customers WHERE id = ?', [id]);
            if (custRows.length === 0) {
                return res.status(404).json({ success: false, message: 'Customer not found' });
            }
            customer = custRows[0];
        }

        // Fetch all sales for this customer
        let salesQuery = `
            SELECT s.id, s.order_number, s.receipt_no, s.sale_date, s.payment_method, s.total_amount,
                   s.status, s.refund_amount, s.customer_name, s.customer_phone,
                   u.username as cashier_name
            FROM sales s
            LEFT JOIN users u ON s.cashier_id = u.id
            WHERE 1=1
        `;
        const salesParams = [];

        if (customer.id === 0) {
            salesQuery += " AND (s.customer_id IS NULL OR s.customer_name = 'Walk-in Customer')";
        } else {
            salesQuery += ' AND (s.customer_id = ? OR s.customer_name = ?)';
            salesParams.push(customer.id, customer.name);
        }

        salesQuery += ' ORDER BY s.sale_date DESC LIMIT 50';

        const [sales] = await db.query(salesQuery, salesParams);

        // Fetch line items for each sale
        const saleIds = sales.map(s => s.id);
        let itemsBySale = {};

        if (saleIds.length > 0) {
            const [items] = await db.query(`
                SELECT si.id as sale_item_id, si.sale_id, si.product_id, si.part_number, si.product_name,
                       si.brand, si.size, si.quantity as sold_quantity, si.price, si.cost_price, si.subtotal,
                       COALESCE(si.returned_quantity, 0) as returned_quantity,
                       GREATEST(0, si.quantity - COALESCE(si.returned_quantity, 0)) as remaining_returnable_qty,
                       p.stock as current_sellable_stock, p.damaged_stock as current_damaged_stock
                FROM sale_items si
                LEFT JOIN products p ON si.product_id = p.id
                WHERE si.sale_id IN (?)
            `, [saleIds]);

            for (const item of items) {
                if (!itemsBySale[item.sale_id]) {
                    itemsBySale[item.sale_id] = [];
                }
                itemsBySale[item.sale_id].push(item);
            }
        }

        const salesWithItems = sales.map(s => ({
            ...s,
            items: itemsBySale[s.id] || []
        }));

        // Fetch past return records linked to this customer
        let returnsQuery = `
            SELECT cr.*, u.username as processed_by_user
            FROM customer_returns cr
            LEFT JOIN users u ON cr.processed_by = u.id
            WHERE 1=1
        `;
        const returnsParams = [];

        if (customer.id === 0) {
            returnsQuery += " AND (cr.customer_id IS NULL OR cr.customer_name = 'Walk-in Customer')";
        } else {
            returnsQuery += ' AND (cr.customer_id = ? OR cr.customer_name = ?)';
            returnsParams.push(customer.id, customer.name);
        }

        returnsQuery += ' ORDER BY cr.created_at DESC LIMIT 50';

        const [pastReturns] = await db.query(returnsQuery, returnsParams);

        return res.json({
            success: true,
            customer,
            sales: salesWithItems,
            pastReturns
        });
    } catch (err) {
        console.error('Error fetching customer history:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch customer purchase history' });
    }
};

// 7. RECEIPT LOOKUP & CAP CHECK
exports.lookupReceipt = async (req, res, next) => {
    try {
        const { receiptNo } = req.params;
        const q = String(receiptNo || '').trim();

        if (!q) {
            return res.status(400).json({ success: false, message: 'Receipt or Order Number is required' });
        }

        const [sales] = await db.query(`
            SELECT s.*, u.username as cashier_name
            FROM sales s
            LEFT JOIN users u ON s.cashier_id = u.id
            WHERE s.order_number = ? OR s.receipt_no = ? OR s.id = ?
            LIMIT 1
        `, [q, q, isNaN(q) ? -1 : Number(q)]);

        if (sales.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No receipt found matching "${q}". Please verify the receipt number.`
            });
        }

        const sale = sales[0];

        // Fetch items on this receipt with cap calculation
        const [items] = await db.query(`
            SELECT si.id as sale_item_id, si.sale_id, si.product_id, si.part_number, si.product_name,
                   si.brand, si.size, si.quantity as sold_quantity, si.price, si.cost_price, si.subtotal,
                   COALESCE(si.returned_quantity, 0) as returned_quantity,
                   GREATEST(0, si.quantity - COALESCE(si.returned_quantity, 0)) as remaining_returnable_qty,
                   p.stock as current_sellable_stock, p.damaged_stock as current_damaged_stock
            FROM sale_items si
            LEFT JOIN products p ON si.product_id = p.id
            WHERE si.sale_id = ?
        `, [sale.id]);

        return res.json({
            success: true,
            sale: {
                id: sale.id,
                order_number: sale.order_number,
                receipt_no: sale.receipt_no,
                sale_date: sale.sale_date,
                payment_method: sale.payment_method,
                total_amount: sale.total_amount,
                status: sale.status,
                customer_id: sale.customer_id,
                customer_name: sale.customer_name || 'Walk-in Customer',
                customer_phone: sale.customer_phone || 'N/A',
                cashier_name: sale.cashier_name || 'Cashier'
            },
            items
        });
    } catch (err) {
        console.error('Error looking up receipt:', err);
        return res.status(500).json({ success: false, message: 'Failed to look up receipt' });
    }
};

// 8. PROCESS WARRANTY AND RETURNS (SHOP-LIABILITY CUSTOMER RETURNS)
exports.processWarrantyReturn = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        const {
            sale_id,
            sale_item_id,
            quantity,
            resolution_type, // 'OPTION_A_REPLACEMENT' or 'OPTION_B_REFUND'
            refund_method = 'Cash', // 'Cash' | 'GCash' | 'None'
            damage_reason,
            admin_pin,
            notes
        } = req.body;

        const returnQty = parseInt(quantity, 10);
        if (!returnQty || returnQty <= 0) {
            return res.status(400).json({ success: false, message: 'Return quantity must be greater than 0' });
        }

        if (!resolution_type || !['OPTION_A_REPLACEMENT', 'OPTION_B_REFUND'].includes(resolution_type)) {
            return res.status(400).json({ success: false, message: 'Valid resolution type (Option A or Option B) is required' });
        }

        if (!damage_reason || !damage_reason.trim()) {
            return res.status(400).json({ success: false, message: 'Staff must record a mandatory damage reason' });
        }

        // Fetch sale and line item
        const [sales] = await connection.query('SELECT * FROM sales WHERE id = ? FOR UPDATE', [sale_id]);
        if (sales.length === 0) {
            return res.status(404).json({ success: false, message: 'Sale record not found' });
        }
        const sale = sales[0];

        const [items] = await connection.query('SELECT * FROM sale_items WHERE id = ? AND sale_id = ? FOR UPDATE', [sale_item_id, sale_id]);
        if (items.length === 0) {
            return res.status(404).json({ success: false, message: 'Sale line item not found' });
        }
        const item = items[0];

        // CAP CHECK: Remaining Returnable Quantity = Qty Sold − Qty Already Returned
        const soldQty = Number(item.quantity || 0);
        const returnedQty = Number(item.returned_quantity || 0);
        const remainingReturnable = Math.max(0, soldQty - returnedQty);

        if (remainingReturnable <= 0) {
            return res.status(400).json({
                success: false,
                message: `This item (${item.product_name}) has already been fully returned. Remaining returnable quantity is 0.`
            });
        }

        if (returnQty > remainingReturnable) {
            return res.status(400).json({
                success: false,
                message: `Return blocked by Cap Check! Requested: ${returnQty} pcs, but Remaining Returnable Quantity is only ${remainingReturnable} pc(s).`
            });
        }

        // Fetch product
        const [products] = await connection.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [item.product_id]);
        if (products.length === 0) {
            return res.status(404).json({ success: false, message: 'Product record not found in inventory' });
        }
        const product = products[0];

        const unitCost = Number(item.cost_price || product.cost_price || 0);
        const unitRetailPrice = Number(item.price || product.price || 0);
        const shopLoss = Math.round(unitCost * returnQty * 100) / 100;
        const retailRefund = Math.round(unitRetailPrice * returnQty * 100) / 100;

        // Check user authorization (Cashier vs Admin)
        const userRole = (req.user?.role || '').toLowerCase();
        let isAdminAuthorized = userRole === 'admin';

        // Check if Admin PIN override was provided by cashier
        if (!isAdminAuthorized && admin_pin) {
            const [admins] = await connection.query("SELECT id, pin, password, password_hash FROM users WHERE LOWER(role) = 'admin'");
            for (const admin of admins) {
                if (admin.pin && String(admin.pin).trim() === String(admin_pin).trim()) {
                    isAdminAuthorized = true;
                    break;
                }
                const hash = admin.password_hash || admin.password;
                if (hash) {
                    try {
                        if (await bcrypt.compare(String(admin_pin).trim(), hash)) {
                            isAdminAuthorized = true;
                            break;
                        }
                    } catch (e) {}
                }
            }
        }

        // If NOT Admin authorized, submit to Module 3 (Approvals)
        if (!isAdminAuthorized) {
            const cashierId = req.user?.id || 1;
            const cashierName = req.user?.username || 'Cashier';

            const [approvalResult] = await connection.query(`
                INSERT INTO approval_requests (
                    request_type, status, receipt_number, product_id, item_name, quantity,
                    original_price, cost_price, requested_value, remaining_profit, financial_impact,
                    reason, cashier_id, cashier_name, metadata
                ) VALUES ('VOID_REFUND', 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                sale.receipt_no || sale.order_number,
                item.product_id,
                item.product_name,
                returnQty,
                unitRetailPrice * returnQty,
                unitCost,
                resolution_type === 'OPTION_B_REFUND' ? retailRefund : 0,
                0 - (resolution_type === 'OPTION_B_REFUND' ? retailRefund : shopLoss),
                resolution_type === 'OPTION_B_REFUND' ? retailRefund : shopLoss,
                `[Customer Warranty Return] ${damage_reason.trim()}`,
                cashierId,
                cashierName,
                JSON.stringify({
                    warranty_return: true,
                    sale_id,
                    sale_item_id,
                    quantity: returnQty,
                    resolution_type,
                    refund_method,
                    damage_reason: damage_reason.trim(),
                    notes: notes || '',
                    customer_id: sale.customer_id,
                    customer_name: sale.customer_name || 'Walk-in Customer',
                    shop_loss: shopLoss,
                    sales_reversal: resolution_type === 'OPTION_B_REFUND' ? retailRefund : 0
                })
            ]);

            return res.status(202).json({
                success: true,
                pending_approval: true,
                message: 'Customer Warranty Return requires Admin authorization. Request sent to Module 3 (Approvals) queue.',
                requestId: approvalResult.insertId
            });
        }

        // ==========================================
        // ADMIN AUTHORIZED: EXECUTE RETURN IMMEDIATELY
        // ==========================================
        await connection.beginTransaction();

        // Generate return slip code
        const [retCount] = await connection.query('SELECT COUNT(*) as count FROM customer_returns WHERE sale_id = ?', [sale_id]);
        const returnSlipCode = `WAR-${sale.order_number || sale.id}-${String((retCount[0]?.count || 0) + 1).padStart(2, '0')}`;

        // Update returned quantity on sale_items
        await connection.query('UPDATE sale_items SET returned_quantity = returned_quantity + ? WHERE id = ?', [returnQty, sale_item_id]);

        let salesReversal = 0;
        let refundMethodRecorded = 'None';
        let resolutionLabel = '';

        if (resolution_type === 'OPTION_A_REPLACEMENT') {
            // OPTION A (1-to-1 REPLACEMENT):
            // 1. Deducts 1 new part from Sellable Stock (no new sale created)
            // 2. Moves returned broken part to Damaged Stock (+damaged_stock)
            // 3. Sales Reversal = ₱0.00
            // 4. Shop Loss = Supplier Unit Cost (Puhunan)
            resolutionLabel = 'Replacement';
            salesReversal = 0;
            refundMethodRecorded = 'None';

            if (product.stock < returnQty) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Cannot issue 1-to-1 Replacement: Only ${product.stock} good unit(s) left in Sellable Stock.`
                });
            }

            // Deduct from sellable stock for replacement given to buyer
            await applyMovement(connection, {
                itemId: item.product_id,
                transactionType: 'STOCK_OUT',
                quantityChange: -returnQty,
                referenceNo: `${returnSlipCode}-REPLACE-OUT`,
                referenceType: 'CUSTOMER_WARRANTY_RETURN',
                referenceId: sale_id,
                unitCost,
                remarks: `1-to-1 Replacement given to customer for ${damage_reason.trim()}`,
                createdBy: req.user?.id || 1
            });

            // Move broken returned item to Damaged Stock
            await connection.query('UPDATE products SET damaged_stock = damaged_stock + ? WHERE id = ?', [returnQty, item.product_id]);

        } else if (resolution_type === 'OPTION_B_REFUND') {
            // OPTION B (CASH / GCASH REFUND):
            // 1. Leaves Sellable Stock unchanged
            // 2. Moves returned broken part to Damaged Stock (+damaged_stock)
            // 3. Sales Reversal = Refunded Retail Price (reverses sale, removes original cost from active COGS)
            // 4. Shop Loss = Supplier Unit Cost (Puhunan)
            salesReversal = retailRefund;
            refundMethodRecorded = refund_method === 'GCash' ? 'GCash' : 'Cash';
            resolutionLabel = refundMethodRecorded === 'GCash' ? 'GCash Refund' : 'Cash Refund';

            // Move broken returned item to Damaged Stock (sellable stock unchanged)
            await connection.query('UPDATE products SET damaged_stock = damaged_stock + ? WHERE id = ?', [returnQty, item.product_id]);

            // Update sales refund tracking
            await connection.query(`
                UPDATE sales
                SET refund_amount = COALESCE(refund_amount, 0) + ?,
                    refunded_at = NOW(),
                    status = CASE WHEN (SELECT SUM(quantity - returned_quantity) FROM sale_items WHERE sale_id = ?) <= 0 THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END
                WHERE id = ?
            `, [retailRefund, sale_id, sale_id]);

            // If cash refund, deduct from active staff cash float drawer
            if (refundMethodRecorded === 'Cash') {
                const userId = req.user?.id || 1;
                const [floats] = await connection.query(`
                    SELECT id, current_cash_balance FROM cash_floats
                    WHERE staff_id = ? AND status = 'ACTIVE'
                    ORDER BY assigned_at DESC LIMIT 1 FOR UPDATE
                `, [userId]);

                if (floats.length > 0) {
                    const activeFloat = floats[0];
                    const prevBal = Number(activeFloat.current_cash_balance || 0);
                    const newBal = Math.round((prevBal - retailRefund) * 100) / 100;
                    await connection.query('UPDATE cash_floats SET current_cash_balance = ? WHERE id = ?', [newBal, activeFloat.id]);
                }
            }
        }

        // Record in customer_returns
        await connection.query(`
            INSERT INTO customer_returns (
                return_code, sale_id, customer_id, customer_name, sale_item_id, product_id,
                part_number, product_name, brand, size, return_type, resolution_type,
                condition_status, quantity, qty_returned, refund_amount, sales_reversal_amount,
                shop_loss_amount, supplier_cost, refund_method, reason, damage_reason,
                processed_by, return_date, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DAMAGED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [
            returnSlipCode,
            sale_id,
            sale.customer_id || null,
            sale.customer_name || 'Walk-in Customer',
            sale_item_id,
            item.product_id,
            item.part_number,
            item.product_name,
            item.brand,
            item.size,
            resolution_type,
            resolutionLabel,
            returnQty,
            returnQty,
            salesReversal,
            salesReversal,
            shopLoss,
            unitCost,
            refundMethodRecorded,
            damage_reason.trim(),
            damage_reason.trim(),
            req.user?.id || 1
        ]);

        // Record in return_refund_history audit log
        await connection.query(`
            INSERT INTO return_refund_history (
                reference_no, order_id, product_id, product_name, part_number,
                movement_type, flow_path, qty, target_bucket, effect_badge,
                refund_amount, status, remarks, processed_by, created_at
            ) VALUES (?, ?, ?, ?, ?, 'CUSTOMER_RETURN_DAMAGE', ?, ?, 'DAMAGE', ?, ?, 'COMPLETED', ?, ?, NOW())
        `, [
            returnSlipCode,
            sale_id,
            item.product_id,
            item.product_name,
            item.part_number,
            resolution_type === 'OPTION_A_REPLACEMENT' ? 'Warranty: 1-to-1 Replacement (Shop Loss)' : `Warranty: ${resolutionLabel} (Shop Loss)`,
            returnQty,
            `+${returnQty} Damaged Stock`,
            salesReversal,
            `Shop-Liability Return: ${damage_reason.trim()}. Loss: ₱${shopLoss.toFixed(2)}`,
            req.user?.username || 'admin'
        ]);

        await connection.commit();

        return res.json({
            success: true,
            pending_approval: false,
            message: resolution_type === 'OPTION_A_REPLACEMENT'
                ? `1-to-1 Replacement issued for ${item.product_name}! 1 piece deducted from Sellable Stock, broken piece stored in Damaged Stock. Shop Loss: ₱${shopLoss.toFixed(2)}.`
                : `Warranty Refund of ₱${retailRefund.toFixed(2)} (${refundMethodRecorded}) completed! Broken piece stored in Damaged Stock. Sales Reversal: ₱${salesReversal.toFixed(2)}, Shop Loss: ₱${shopLoss.toFixed(2)}.`,
            returnSlipCode,
            salesReversal,
            shopLoss,
            resolutionType: resolution_type
        });

    } catch (err) {
        await connection.rollback();
        console.error('Error processing customer warranty return:', err);
        return res.status(500).json({ success: false, message: err.message || 'Failed to process warranty return' });
    } finally {
        connection.release();
    }
};

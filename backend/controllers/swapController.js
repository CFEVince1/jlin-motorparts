const db = require('../config/db');
const { applyMovement } = require('../services/inventoryService');

/**
 * GET /api/swaps/lookup-order
 * Searches original sale by order_number, receipt_no, id, or customer name
 */
exports.lookupOrder = async (req, res) => {
    try {
        const rawQuery = (req.query.query || '').trim();
        if (!rawQuery) {
            return res.status(400).json({ success: false, message: 'Order number, receipt number, or customer name is required' });
        }

        const cleanQuery = rawQuery.replace(/^#/, '').trim();
        const numMatch = cleanQuery.match(/\d+/);
        const digits = numMatch ? numMatch[0] : '';
        const paddedDigits = digits ? digits.padStart(4, '0') : '';

        // Query sales using flexible matching
        const [sales] = await db.query(
            `SELECT id, order_number, receipt_no, customer_name, total_amount, payment_method, created_at, status
             FROM sales
             WHERE order_number = ?
                OR receipt_no = ?
                OR id = ?
                OR order_number LIKE ?
                OR receipt_no LIKE ?
                OR ( ? != '' AND (
                    order_number LIKE CONCAT('%-', ?)
                    OR order_number LIKE CONCAT('%-', ?)
                    OR id = ?
                ))
                OR customer_name LIKE ?
             ORDER BY id DESC
             LIMIT 10`,
            [
                cleanQuery,
                cleanQuery,
                isNaN(cleanQuery) ? -1 : Number(cleanQuery),
                `%${cleanQuery}%`,
                `%${cleanQuery}%`,
                digits,
                digits,
                paddedDigits,
                digits ? Number(digits) : -1,
                `%${cleanQuery}%`
            ]
        );

        if (sales.length === 0) {
            return res.status(404).json({ success: false, message: `No receipt found matching "${rawQuery}"` });
        }

        const primarySale = sales[0];

        // Fetch items for the primary sale
        const [items] = await db.query(
            `SELECT si.id as sale_item_id, si.product_id, si.product_name, si.part_number,
                    si.brand, si.quantity, si.price, si.subtotal,
                    p.stock, p.category, p.image_url
             FROM sale_items si
             LEFT JOIN products p ON si.product_id = p.id
             WHERE si.sale_id = ?`,
            [primarySale.id]
        );

        return res.json({
            success: true,
            sale: {
                ...primarySale,
                items
            },
            matches: sales.map(s => ({
                id: s.id,
                order_number: s.order_number,
                receipt_no: s.receipt_no,
                customer_name: s.customer_name,
                total_amount: s.total_amount,
                payment_method: s.payment_method,
                created_at: s.created_at
            }))
        });
    } catch (err) {
        console.error('Error looking up sale for swap:', err);
        return res.status(500).json({ success: false, message: 'Failed to look up sale transaction' });
    }
};

/**
 * GET /api/swaps/recent-sales
 * Returns recent sales for quick receipt selection
 */
exports.getRecentSales = async (req, res) => {
    try {
        const [sales] = await db.query(
            `SELECT id, order_number, receipt_no, customer_name, total_amount, payment_method, created_at, status
             FROM sales
             WHERE status != 'CANCELLED' AND status != 'VOIDED'
             ORDER BY id DESC
             LIMIT 15`
        );

        if (sales.length === 0) {
            return res.json({ success: true, sales: [] });
        }

        const saleIds = sales.map(s => s.id);
        const [items] = await db.query(
            `SELECT si.sale_id, si.id as sale_item_id, si.product_id, si.product_name, si.part_number,
                    si.brand, si.quantity, si.price, si.subtotal,
                    p.stock, p.category, p.image_url
             FROM sale_items si
             LEFT JOIN products p ON si.product_id = p.id
             WHERE si.sale_id IN (?)`,
            [saleIds]
        );

        const itemsBySale = {};
        items.forEach(it => {
            if (!itemsBySale[it.sale_id]) itemsBySale[it.sale_id] = [];
            itemsBySale[it.sale_id].push(it);
        });

        const result = sales.map(s => ({
            ...s,
            items: itemsBySale[s.id] || []
        }));

        return res.json({ success: true, sales: result });
    } catch (err) {
        console.error('Error fetching recent sales for swap:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch recent sales' });
    }
};

/**
 * GET /api/swaps
 * List swap records with search and pagination
 */
exports.getSwaps = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 15));
        const offset = (page - 1) * limit;

        const search = (req.query.search || '').trim();
        const startDate = (req.query.startDate || '').trim();
        const endDate = (req.query.endDate || '').trim();

        let whereClauses = [];
        let params = [];

        if (search) {
            whereClauses.push('(swap_code LIKE ? OR order_number LIKE ? OR customer_name LIKE ? OR returned_product_name LIKE ? OR new_product_name LIKE ?)');
            const s = `%${search}%`;
            params.push(s, s, s, s, s);
        }

        if (startDate) {
            whereClauses.push('DATE(created_at) >= ?');
            params.push(startDate);
        }

        if (endDate) {
            whereClauses.push('DATE(created_at) <= ?');
            params.push(endDate);
        }

        const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Count total
        const [countRows] = await db.query(`SELECT COUNT(*) as total FROM item_swaps ${whereSQL}`, params);
        const total = countRows[0]?.total || 0;

        // Fetch items
        const [rows] = await db.query(
            `SELECT * FROM item_swaps
             ${whereSQL}
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        // Fetch summary metrics
        const [metricRows] = await db.query(`
            SELECT 
                COUNT(*) as total_swaps,
                COALESCE(SUM(customer_top_up_paid), 0) as total_top_ups_collected,
                COALESCE(SUM(CASE WHEN returned_disposition = 'RESTOCK' THEN returned_qty ELSE 0 END), 0) as items_restocked,
                COALESCE(SUM(CASE WHEN returned_disposition = 'DAMAGED' THEN returned_qty ELSE 0 END), 0) as items_damaged
            FROM item_swaps
        `);

        const processedRows = rows.map(r => {
            let replacementItems = null;
            if (r.replacement_items_json) {
                try {
                    replacementItems = JSON.parse(r.replacement_items_json);
                } catch (e) {
                    replacementItems = null;
                }
            }
            return {
                ...r,
                replacement_items: replacementItems || [
                    {
                        product_id: r.new_product_id,
                        name: r.new_product_name,
                        part_number: r.new_part_number,
                        brand: r.new_brand,
                        qty: r.new_qty,
                        unit_price: r.new_unit_price,
                        subtotal: r.new_total_price
                    }
                ]
            };
        });

        return res.json({
            success: true,
            swaps: processedRows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            summary: {
                total_swaps: Number(metricRows[0]?.total_swaps || 0),
                total_top_ups_collected: Number(metricRows[0]?.total_top_ups_collected || 0),
                items_restocked: Number(metricRows[0]?.items_restocked || 0),
                items_damaged: Number(metricRows[0]?.items_damaged || 0)
            }
        });
    } catch (err) {
        console.error('Error fetching swaps:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch swap history' });
    }
};

/**
 * POST /api/swaps
 * Process an item swap
 * Rules:
 * - Supports 1 returned item for 1 or MULTIPLE replacement items ("they can add more")
 * - NO CASH REFUND ("it cannot exchange into money")
 * - If replacement total is more expensive, customer adds top-up ("they can add more for pricey product")
 */
exports.processSwap = async (req, res) => {
    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        const {
            sale_id,
            order_number,
            customer_name = 'Walk-in Customer',
            returned_product_id,
            returned_qty = 1,
            returned_unit_price,
            returned_disposition = 'RESTOCK', // 'RESTOCK' | 'DAMAGED'
            new_items, // Array of { product_id, qty, unit_price }
            new_product_id, // Backward compat fallback
            new_qty = 1,
            new_unit_price,
            payment_method = 'None', // 'Cash' | 'GCash' | 'None'
            amount_tendered = 0,
            reason = 'Wrong fitment / size',
            notes = ''
        } = req.body;

        const retQty = Math.max(1, parseInt(returned_qty, 10) || 1);

        if (!returned_product_id) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Returned product is required' });
        }

        // Build list of replacement items
        let itemsList = [];
        if (Array.isArray(new_items) && new_items.length > 0) {
            itemsList = new_items.map(it => ({
                product_id: Number(it.product_id || it.id),
                qty: Math.max(1, parseInt(it.qty || it.quantity, 10) || 1),
                unit_price: Number(it.unit_price ?? it.price ?? it.selling_price ?? 0)
            }));
        } else if (new_product_id) {
            itemsList = [{
                product_id: Number(new_product_id),
                qty: Math.max(1, parseInt(new_qty, 10) || 1),
                unit_price: Number(new_unit_price || 0)
            }];
        }

        if (itemsList.length === 0) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'At least one replacement product must be selected' });
        }

        // 1. Fetch returned product
        const [retProducts] = await conn.query(
            'SELECT id, name, part_number, brand, cost_price, selling_price, stock, damaged_stock FROM products WHERE id = ? FOR UPDATE',
            [returned_product_id]
        );
        if (retProducts.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Returned product not found' });
        }
        const returnedProduct = retProducts[0];

        // 2. Fetch all replacement products
        const replacementProductIds = itemsList.map(it => it.product_id);
        const [dbReplacements] = await conn.query(
            'SELECT id, name, part_number, brand, cost_price, selling_price, stock FROM products WHERE id IN (?) FOR UPDATE',
            [replacementProductIds]
        );

        const prodMap = new Map();
        dbReplacements.forEach(p => prodMap.set(p.id, p));

        // Validate stock and compute item totals
        let detailedNewItems = [];
        let newTotalPrice = 0;
        let totalNewQty = 0;

        for (const it of itemsList) {
            const p = prodMap.get(it.product_id);
            if (!p) {
                await conn.rollback();
                return res.status(404).json({ success: false, message: `Replacement product #${it.product_id} not found` });
            }
            if (Number(p.stock) < it.qty) {
                await conn.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for "${p.name}". Available: ${p.stock}, Requested: ${it.qty}`
                });
            }
            const unitPrice = it.unit_price > 0 ? it.unit_price : Number(p.selling_price || 0);
            const lineTotal = Math.round(unitPrice * it.qty * 100) / 100;
            newTotalPrice += lineTotal;
            totalNewQty += it.qty;

            detailedNewItems.push({
                product_id: p.id,
                name: p.name,
                part_number: p.part_number,
                brand: p.brand,
                qty: it.qty,
                unit_price: unitPrice,
                subtotal: lineTotal
            });
        }
        newTotalPrice = Math.round(newTotalPrice * 100) / 100;

        // 3. Price Calculations
        // Returned item trade-in credit:
        const unitCredit = returned_unit_price !== undefined && Number(returned_unit_price) >= 0
            ? Number(returned_unit_price)
            : Number(returnedProduct.selling_price || 0);
        const returnedCreditTotal = Math.round(unitCredit * retQty * 100) / 100;

        // Difference:
        const rawDiff = Math.round((newTotalPrice - returnedCreditTotal) * 100) / 100;
        let customerTopUpPaid = 0;
        let changeAmount = 0;
        let finalPaymentMethod = 'None';

        if (rawDiff > 0) {
            // New items cost MORE: Customer must add cash/GCash!
            customerTopUpPaid = rawDiff;
            finalPaymentMethod = (payment_method || 'Cash').trim();
            if (!['Cash', 'GCash'].includes(finalPaymentMethod)) {
                finalPaymentMethod = 'Cash';
            }

            if (finalPaymentMethod === 'Cash') {
                const tendered = Number(amount_tendered || 0);
                if (tendered < customerTopUpPaid) {
                    await conn.rollback();
                    return res.status(400).json({
                        success: false,
                        message: `Customer must add ₱${customerTopUpPaid.toFixed(2)}. Amount tendered (₱${tendered.toFixed(2)}) is insufficient.`
                    });
                }
                changeAmount = Math.max(0, Math.round((tendered - customerTopUpPaid) * 100) / 100);
            }
        } else {
            // New items cost SAME OR LESS:
            // STRICT STORE POLICY: "it cannot exchange into money" -> Cash refund is ALWAYS 0.00!
            customerTopUpPaid = 0.00;
            changeAmount = 0.00;
            finalPaymentMethod = 'None';
        }

        // 4. Generate unique swap code
        const phtNow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()).replace(/-/g, '');
        const [seqRows] = await conn.query("SELECT COUNT(*) as count FROM item_swaps WHERE swap_code LIKE CONCAT('SWAP-', ?, '%')", [phtNow]);
        const seq = (seqRows[0]?.count || 0) + 1;
        const swapCode = `SWAP-${phtNow}-${String(seq).padStart(3, '0')}`;

        // 5. Update Inventory for Returned Product
        const cleanDisposition = (returned_disposition || 'RESTOCK').trim().toUpperCase() === 'DAMAGED' ? 'DAMAGED' : 'RESTOCK';

        if (cleanDisposition === 'RESTOCK') {
            await applyMovement(conn, {
                itemId: returned_product_id,
                transactionType: 'RETURN',
                quantityChange: retQty,
                referenceNo: swapCode,
                remarks: `Item Swap Restock: Customer swapped for ${detailedNewItems[0].name}`,
                createdBy: req.user?.id || 1
            });
        } else {
            await applyMovement(conn, {
                itemId: returned_product_id,
                transactionType: 'RETURN',
                quantityChange: retQty,
                referenceNo: swapCode,
                remarks: `Item Swap Defective Return: ${swapCode}`,
                createdBy: req.user?.id || 1
            });
            await applyMovement(conn, {
                itemId: returned_product_id,
                transactionType: 'DAMAGE',
                quantityChange: -retQty,
                referenceNo: `${swapCode}-DMG`,
                remarks: `Item Swap Damaged Stock: ${reason}`,
                createdBy: req.user?.id || 1
            });
            await conn.query('UPDATE products SET damaged_stock = damaged_stock + ? WHERE id = ?', [retQty, returned_product_id]);
        }

        // 6. Update Inventory for ALL New Replacement Products
        for (const item of detailedNewItems) {
            await applyMovement(conn, {
                itemId: item.product_id,
                transactionType: 'SALE',
                quantityChange: -item.qty,
                referenceNo: swapCode,
                remarks: `Item Swap Replacement Issued: ${swapCode}`,
                createdBy: req.user?.id || 1
            });
        }

        // 7. Update Shift Cash Float if customer paid a top-up
        const currentUserId = req.user?.id || 1;
        if (customerTopUpPaid > 0) {
            try {
                if (finalPaymentMethod === 'Cash') {
                    await conn.query(
                        `UPDATE cash_floats 
                         SET cash_sales = cash_sales + ?, 
                             current_cash_balance = current_cash_balance + ?
                         WHERE status = 'OPEN' AND (user_id = ? OR id = (SELECT id FROM (SELECT id FROM cash_floats WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1) as t))
                         LIMIT 1`,
                        [customerTopUpPaid, customerTopUpPaid, currentUserId]
                    );
                } else if (finalPaymentMethod === 'GCash') {
                    await conn.query(
                        `UPDATE cash_floats 
                         SET gcash_sales = COALESCE(gcash_sales, 0) + ?
                         WHERE status = 'OPEN' AND (user_id = ? OR id = (SELECT id FROM (SELECT id FROM cash_floats WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1) as t))
                         LIMIT 1`,
                        [customerTopUpPaid, currentUserId]
                    );
                }
            } catch (floatErr) {
                console.warn('Failed to update cash_floats for swap top-up:', floatErr.message);
            }
        }

        // 8. Record in item_swaps
        const primaryNew = detailedNewItems[0];
        const newSummaryName = detailedNewItems.length === 1
            ? primaryNew.name
            : `${primaryNew.name} (+${detailedNewItems.length - 1} other item${detailedNewItems.length > 2 ? 's' : ''})`;

        const [insertResult] = await conn.query(
            `INSERT INTO item_swaps (
                swap_code, sale_id, order_number, customer_name,
                returned_product_id, returned_product_name, returned_part_number, returned_brand,
                returned_qty, returned_unit_price, returned_credit_total, returned_disposition,
                new_product_id, new_product_name, new_part_number, new_brand,
                new_qty, new_unit_price, new_total_price, replacement_items_json,
                price_difference, customer_top_up_paid, cash_refund_given,
                payment_method, amount_tendered, change_amount,
                reason, notes, processed_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                swapCode,
                sale_id || null,
                order_number || null,
                customer_name || 'Walk-in Customer',
                returned_product_id,
                returnedProduct.name,
                returnedProduct.part_number,
                returnedProduct.brand,
                retQty,
                unitCredit,
                returnedCreditTotal,
                cleanDisposition,
                primaryNew.product_id,
                newSummaryName,
                primaryNew.part_number,
                primaryNew.brand,
                totalNewQty,
                primaryNew.unit_price,
                newTotalPrice,
                JSON.stringify(detailedNewItems),
                rawDiff,
                customerTopUpPaid,
                finalPaymentMethod,
                Number(amount_tendered || 0),
                changeAmount,
                reason || 'Wrong fitment / size',
                notes || '',
                req.user?.username || 'Staff'
            ]
        );

        // 9. Write to audit_logs
        try {
            await conn.query(
                `INSERT INTO audit_logs (
                    user_id, username, action_type, module, details, created_at
                 ) VALUES (?, ?, 'ITEM_SWAP', 'SALES_RETURNS', ?, NOW())`,
                [
                    currentUserId,
                    req.user?.username || 'Staff',
                    `Swapped [${returnedProduct.name} x${retQty}] for [${detailedNewItems.map(i => `${i.name} x${i.qty}`).join(', ')}]. Top-up: ₱${customerTopUpPaid.toFixed(2)} (${finalPaymentMethod}). Ref: ${swapCode}`
                ]
            );
        } catch (auditErr) {
            console.warn('Failed to log swap audit:', auditErr.message);
        }

        await conn.commit();

        return res.json({
            success: true,
            message: customerTopUpPaid > 0
                ? `Item Swap successful! Customer added ₱${customerTopUpPaid.toFixed(2)} top-up for replacement items.`
                : 'Item Swap successful! 1-to-1 even swap processed with zero cash exchange.',
            swap: {
                id: insertResult.insertId,
                swap_code: swapCode,
                order_number: order_number || null,
                customer_name: customer_name || 'Walk-in Customer',
                returned_product_name: returnedProduct.name,
                returned_part_number: returnedProduct.part_number,
                returned_brand: returnedProduct.brand,
                returned_qty: retQty,
                returned_unit_price: unitCredit,
                returned_credit_total: returnedCreditTotal,
                returned_disposition: cleanDisposition,
                new_product_name: newSummaryName,
                new_part_number: primaryNew.part_number,
                new_brand: primaryNew.brand,
                new_qty: totalNewQty,
                new_unit_price: primaryNew.unit_price,
                new_total_price: newTotalPrice,
                replacement_items: detailedNewItems,
                price_difference: rawDiff,
                customer_top_up_paid: customerTopUpPaid,
                cash_refund_given: 0.00,
                payment_method: finalPaymentMethod,
                amount_tendered: Number(amount_tendered || 0),
                change_amount: changeAmount,
                reason,
                notes,
                processed_by: req.user?.username || 'Staff',
                created_at: new Date()
            }
        });

    } catch (err) {
        await conn.rollback();
        console.error('Error processing item swap:', err);
        return res.status(500).json({ success: false, message: err.message || 'Failed to process item swap' });
    } finally {
        conn.release();
    }
};

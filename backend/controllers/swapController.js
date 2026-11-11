const db = require('../config/db');
const { applyMovement } = require('../services/inventoryService');

/**
 * GET /api/swaps/lookup-order
 * Searches original sale by order_number, receipt_no, id, or customer name
 * Computes Swappable Cap (qty_sold - qty_swapped) for each line item
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
            `SELECT id, order_number, receipt_no, customer_name, total_amount, payment_method, COALESCE(sale_date, paid_at) as created_at, sale_date, status
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

        // Fetch items for the primary sale with swappable cap
        const [items] = await db.query(
            `SELECT si.id as sale_item_id, si.product_id, si.product_name, si.part_number,
                    si.brand, si.quantity, COALESCE(si.qty_sold, si.quantity, 1) as qty_sold, COALESCE(si.qty_swapped, 0) as qty_swapped,
                    si.price, si.cost_price, si.subtotal,
                    p.stock, p.category
             FROM sale_items si
             LEFT JOIN products p ON si.product_id = p.id
             WHERE si.sale_id = ?`,
            [primarySale.id]
        );

        const itemsWithCap = items.map(it => {
            const sold = Number(it.qty_sold ?? it.quantity ?? 1);
            const swapped = Number(it.qty_swapped || 0);
            const cap = Math.max(0, sold - swapped);
            return {
                ...it,
                qty_sold: sold,
                qty_swapped: swapped,
                swappable_cap: cap,
                is_locked: cap <= 0
            };
        });

        return res.json({
            success: true,
            sale: {
                ...primarySale,
                items: itemsWithCap
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
 * Returns recent sales for quick receipt selection with swappable cap
 */
exports.getRecentSales = async (req, res) => {
    try {
        const [sales] = await db.query(
            `SELECT id, order_number, receipt_no, customer_name, total_amount, payment_method, COALESCE(sale_date, paid_at) as created_at, sale_date, status
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
                    si.brand, si.quantity, COALESCE(si.qty_sold, si.quantity, 1) as qty_sold, COALESCE(si.qty_swapped, 0) as qty_swapped,
                    si.price, si.cost_price, si.subtotal,
                    p.stock, p.category
             FROM sale_items si
             LEFT JOIN products p ON si.product_id = p.id
             WHERE si.sale_id IN (?)`,
            [saleIds]
        );

        const itemsBySale = {};
        items.forEach(it => {
            if (!itemsBySale[it.sale_id]) itemsBySale[it.sale_id] = [];
            const sold = Number(it.qty_sold ?? it.quantity ?? 1);
            const swapped = Number(it.qty_swapped || 0);
            const cap = Math.max(0, sold - swapped);
            itemsBySale[it.sale_id].push({
                ...it,
                qty_sold: sold,
                qty_swapped: swapped,
                swappable_cap: cap,
                is_locked: cap <= 0
            });
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
                COALESCE(SUM(cogs_adjustment), 0) as total_cogs_adjustment
            FROM item_swaps
        `);

        return res.json({
            success: true,
            swaps: rows,
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
                total_cogs_adjustment: Number(metricRows[0]?.total_cogs_adjustment || 0)
            }
        });
    } catch (err) {
        console.error('Error fetching swaps:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch swap history' });
    }
};

/**
 * POST /api/swaps
 * Process an Item Swap strictly adhering to:
 * - Scenario A: Equal-Value Swap (New Price == Old Price) -> ₱0.00 cash/GCash paid
 * - Scenario B: Upgrade Swap (New Price > Old Price) -> +Top-Up Difference paid
 * - BLOCKS any replacement item where New Price < Old Price (Zero Cash Refund Policy)
 * - Updates Sellable Stock (+1 old item, -1 new item)
 * - Enforces per-line swappable cap (qty_sold - qty_swapped)
 * - Tracks COGS adjustment (New Unit Cost - Old Unit Cost)
 * - Adds top-up to active shift cash float
 */
exports.processSwap = async (req, res) => {
    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        const {
            sale_id,
            sale_item_id,
            order_number,
            customer_name = 'Walk-in Customer',
            returned_product_id,
            returned_qty = 1,
            returned_unit_price,
            counter_condition_verified, // Mandatory true!
            new_product_id,
            new_qty = 1,
            payment_method = 'None', // 'Cash' | 'GCash' | 'None'
            amount_tendered = 0,
            reason = 'Customer exchange',
            notes = ''
        } = req.body;

        // 1. Mandatory Counter Condition Check verification
        if (!counter_condition_verified) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: 'Counter Condition Verification is required: returned part must be confirmed unused, unmounted, and in original packaging.'
            });
        }

        // Gather all replacement items (supports both multiple items and single item)
        let itemsToReplace = [];
        if (Array.isArray(req.body.replacement_items) && req.body.replacement_items.length > 0) {
            itemsToReplace = req.body.replacement_items.map(it => ({
                product_id: Number(it.product_id || it.id),
                qty: Math.max(1, parseInt(it.qty, 10) || 1)
            }));
        } else if (Array.isArray(req.body.new_items) && req.body.new_items.length > 0) {
            itemsToReplace = req.body.new_items.map(it => ({
                product_id: Number(it.product_id || it.id),
                qty: Math.max(1, parseInt(it.qty, 10) || 1)
            }));
        } else if (new_product_id) {
            itemsToReplace = [{
                product_id: Number(new_product_id),
                qty: Math.max(1, parseInt(new_qty, 10) || 1)
            }];
        }

        if (itemsToReplace.length === 0) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Replacement product is required' });
        }

        const retQty = Math.max(1, parseInt(returned_qty, 10) || 1);

        if (!returned_product_id) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Returned product is required' });
        }

        // 2. Enforce Swappable Cap if sale_item_id is provided
        if (sale_item_id) {
            const [saleItemRows] = await conn.query(
                'SELECT id, quantity, qty_sold, COALESCE(qty_swapped, 0) as qty_swapped FROM sale_items WHERE id = ? FOR UPDATE',
                [sale_item_id]
            );
            if (saleItemRows.length === 0) {
                await conn.rollback();
                return res.status(404).json({ success: false, message: 'Receipt line item not found' });
            }
            const si = saleItemRows[0];
            const sold = Number(si.qty_sold ?? si.quantity ?? 1);
            const swapped = Number(si.qty_swapped || 0);
            const cap = Math.max(0, sold - swapped);

            if (cap <= 0) {
                await conn.rollback();
                return res.status(400).json({ success: false, message: 'This item has already been fully swapped (Cap: 0).' });
            }
            if (retQty > cap) {
                await conn.rollback();
                return res.status(400).json({ success: false, message: `Requested quantity (${retQty}) exceeds swappable cap (${cap}).` });
            }
        }

        // 3. Fetch Returned Product (Old Item)
        const [retProducts] = await conn.query(
            'SELECT id, name, part_number, brand, cost_price, selling_price, stock FROM products WHERE id = ? FOR UPDATE',
            [returned_product_id]
        );
        if (retProducts.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Returned product not found in catalog' });
        }
        const returnedProduct = retProducts[0];

        // 4. Fetch and Validate ALL Replacement Products (New Items)
        const validatedReplacements = [];
        let totalNewRetailPrice = 0;
        let totalNewCost = 0;

        for (const it of itemsToReplace) {
            const [newProducts] = await conn.query(
                'SELECT id, name, part_number, brand, cost_price, selling_price, stock FROM products WHERE id = ? FOR UPDATE',
                [it.product_id]
            );
            if (newProducts.length === 0) {
                await conn.rollback();
                return res.status(404).json({ success: false, message: `Replacement product (ID: ${it.product_id}) not found in catalog` });
            }
            const np = newProducts[0];
            if (Number(np.stock) < it.qty) {
                await conn.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for "${np.name}". Available: ${np.stock}, Requested: ${it.qty}`
                });
            }

            const unitPrice = Number(np.selling_price || 0);
            const subtotal = Math.round(unitPrice * it.qty * 100) / 100;
            const unitCost = Number(np.cost_price || 0);
            const costSubtotal = Math.round(unitCost * it.qty * 100) / 100;

            totalNewRetailPrice += subtotal;
            totalNewCost += costSubtotal;

            validatedReplacements.push({
                product_id: np.id,
                name: np.name,
                part_number: np.part_number,
                brand: np.brand,
                qty: it.qty,
                unit_price: unitPrice,
                total_price: subtotal,
                cost_price: unitCost
            });
        }

        totalNewRetailPrice = Math.round(totalNewRetailPrice * 100) / 100;
        totalNewCost = Math.round(totalNewCost * 100) / 100;

        // 5. Price Calculations & STRICT PRICE LOCK ENFORCEMENT
        // Old item unit credit:
        const unitCredit = returned_unit_price !== undefined && Number(returned_unit_price) >= 0
            ? Number(returned_unit_price)
            : Number(returnedProduct.selling_price || 0);
        const returnedCreditTotal = Math.round(unitCredit * retQty * 100) / 100;

        // STRICT POLICY: Total Replacement Cart Price MUST REACH OR EXCEED Returned Item Credit
        if (totalNewRetailPrice < returnedCreditTotal) {
            await conn.rollback();
            const needed = Math.round((returnedCreditTotal - totalNewRetailPrice) * 100) / 100;
            return res.status(400).json({
                success: false,
                message: `Lower Price Blocked: Total replacement items price (₱${totalNewRetailPrice.toFixed(2)}) is lower than returned item credit (₱${returnedCreditTotal.toFixed(2)}). Under our Zero Cash Refund Policy, cash cannot be refunded. Please add at least ₱${needed.toFixed(2)} more in replacement items.`
            });
        }

        // COGS & Profit Adjustment Calculation:
        const oldTotalCost = Math.round(Number(returnedProduct.cost_price || 0) * retQty * 100) / 100;
        const cogsAdjustment = Math.round((totalNewCost - oldTotalCost) * 100) / 100;

        // Top-Up Amount:
        const rawDiff = Math.round((totalNewRetailPrice - returnedCreditTotal) * 100) / 100;
        let customerTopUpPaid = 0;
        let changeAmount = 0;
        let finalPaymentMethod = 'None';

        if (rawDiff > 0) {
            // Scenario B: Upgrade Swap (New Price > Old Price)
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
                        message: `Customer must add ₱${customerTopUpPaid.toFixed(2)}. Tendered amount (₱${tendered.toFixed(2)}) is insufficient.`
                    });
                }
                changeAmount = Math.max(0, Math.round((tendered - customerTopUpPaid) * 100) / 100);
            }
        } else {
            // Scenario A: Equal-Value Swap (New Price == Old Price)
            customerTopUpPaid = 0.00;
            changeAmount = 0.00;
            finalPaymentMethod = 'None';
        }

        // 6. Generate unique swap code
        const phtNow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()).replace(/-/g, '');
        const [seqRows] = await conn.query("SELECT COUNT(*) as count FROM item_swaps WHERE swap_code LIKE CONCAT('SWAP-', ?, '%')", [phtNow]);
        const seq = (seqRows[0]?.count || 0) + 1;
        const swapCode = `SWAP-${phtNow}-${String(seq).padStart(3, '0')}`;

        // 7. Inventory Count Updates:
        // Old Item: +retQty to Sellable Stock (after counter verification)
        const replacementNamesSummary = validatedReplacements.map(r => `${r.name} x${r.qty}`).join(', ');
        await applyMovement(conn, {
            itemId: returned_product_id,
            transactionType: 'RETURN',
            quantityChange: retQty,
            referenceNo: swapCode,
            remarks: `Item Swap Restock: Customer swapped for ${replacementNamesSummary}`,
            createdBy: req.user?.id || 1
        });

        // Each Replacement Item: -qty from Sellable Stock
        for (const rep of validatedReplacements) {
            await applyMovement(conn, {
                itemId: rep.product_id,
                transactionType: 'SALE',
                quantityChange: -rep.qty,
                referenceNo: swapCode,
                remarks: `Item Swap Replacement Issued: ${swapCode}`,
                createdBy: req.user?.id || 1
            });
        }

        // 8. Update sale_items swappable cap
        if (sale_item_id) {
            await conn.query(
                'UPDATE sale_items SET qty_swapped = qty_swapped + ? WHERE id = ?',
                [retQty, sale_item_id]
            );
        }

        // 9. Update Active Shift Cash Float & Net Sales (if top-up paid)
        let activeShiftId = null;
        const currentUserId = req.user?.id || 1;

        const [activeShifts] = await conn.query(
            `SELECT id FROM cash_floats 
             WHERE status = 'OPEN' AND (user_id = ? OR id = (SELECT id FROM (SELECT id FROM cash_floats WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1) as t))
             ORDER BY id DESC LIMIT 1`,
            [currentUserId]
        );
        if (activeShifts.length > 0) {
            activeShiftId = activeShifts[0].id;
        }

        if (customerTopUpPaid > 0 && activeShiftId) {
            try {
                if (finalPaymentMethod === 'Cash') {
                    await conn.query(
                        `UPDATE cash_floats 
                         SET cash_sales = cash_sales + ?, 
                             current_cash_balance = current_cash_balance + ?
                         WHERE id = ?`,
                        [customerTopUpPaid, customerTopUpPaid, activeShiftId]
                    );
                } else if (finalPaymentMethod === 'GCash') {
                    await conn.query(
                        `UPDATE cash_floats 
                         SET gcash_sales = COALESCE(gcash_sales, 0) + ?
                         WHERE id = ?`,
                        [customerTopUpPaid, activeShiftId]
                    );
                }
            } catch (floatErr) {
                console.warn('Failed to update cash_floats for swap top-up:', floatErr.message);
            }
        }

        // Update sales table total_amount if top-up was paid
        if (customerTopUpPaid > 0 && sale_id) {
            try {
                await conn.query(
                    'UPDATE sales SET total_amount = total_amount + ? WHERE id = ?',
                    [customerTopUpPaid, sale_id]
                );
            } catch (salesErr) {
                console.warn('Failed to update sale total for swap top-up:', salesErr.message);
            }
        }

        // 10. Record in item_swaps
        const firstRep = validatedReplacements[0];
        const primaryNewName = validatedReplacements.length === 1
            ? firstRep.name
            : `${firstRep.name} (+${validatedReplacements.length - 1} more parts)`;
        const totalNewQty = validatedReplacements.reduce((sum, r) => sum + r.qty, 0);

        const [insertResult] = await conn.query(
            `INSERT INTO item_swaps (
                swap_code, sale_id, sale_item_id, order_number, customer_name,
                returned_product_id, returned_product_name, returned_part_number, returned_brand,
                returned_qty, returned_unit_price, returned_credit_total, old_cost_price, returned_disposition,
                new_product_id, new_product_name, new_part_number, new_brand,
                new_qty, new_unit_price, new_total_price, new_cost_price, cogs_adjustment,
                price_difference, customer_top_up_paid, cash_refund_given,
                payment_method, shift_id, cashier_id, amount_tendered, change_amount,
                reason, notes, processed_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RESTOCK', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                swapCode,
                sale_id || null,
                sale_item_id || null,
                order_number || null,
                customer_name || 'Walk-in Customer',
                returned_product_id,
                returnedProduct.name,
                returnedProduct.part_number,
                returnedProduct.brand,
                retQty,
                unitCredit,
                returnedCreditTotal,
                oldTotalCost,
                firstRep.product_id,
                primaryNewName,
                firstRep.part_number,
                firstRep.brand,
                totalNewQty,
                firstRep.unit_price,
                totalNewRetailPrice,
                firstRep.cost_price,
                cogsAdjustment,
                rawDiff,
                customerTopUpPaid,
                finalPaymentMethod,
                activeShiftId || null,
                currentUserId,
                Number(amount_tendered || 0),
                changeAmount,
                reason || 'Customer exchange',
                notes || '',
                req.user?.username || 'Staff'
            ]
        );

        // 11. Write to audit_logs
        try {
            await conn.query(
                `INSERT INTO audit_logs (
                    user_id, username, action_type, module, details, created_at
                 ) VALUES (?, ?, 'ITEM_SWAP', 'SALES_RETURNS', ?, NOW())`,
                [
                    currentUserId,
                    req.user?.username || 'Staff',
                    `Swapped [${returnedProduct.name} x${retQty}] for [${replacementNamesSummary}]. Top-up: ₱${customerTopUpPaid.toFixed(2)} (${finalPaymentMethod}). Puhunan shift: ₱${cogsAdjustment.toFixed(2)}. Ref: ${swapCode}`
                ]
            );
        } catch (auditErr) {
            console.warn('Failed to log swap audit:', auditErr.message);
        }

        await conn.commit();

        return res.json({
            success: true,
            message: customerTopUpPaid > 0
                ? `Upgrade Swap successful! Customer paid ₱${customerTopUpPaid.toFixed(2)} top-up.`
                : 'Even Swap successful! ₱0.00 exchanged, stock and puhunan ledger updated.',
            swap: {
                id: insertResult.insertId,
                swap_code: swapCode,
                sale_id: sale_id || null,
                sale_item_id: sale_item_id || null,
                order_number: order_number || null,
                customer_name: customer_name || 'Walk-in Customer',
                returned_product_name: returnedProduct.name,
                returned_part_number: returnedProduct.part_number,
                returned_brand: returnedProduct.brand,
                returned_qty: retQty,
                returned_unit_price: unitCredit,
                returned_credit_total: returnedCreditTotal,
                old_cost_price: oldTotalCost,
                returned_disposition: 'RESTOCK',
                new_product_name: primaryNewName,
                new_part_number: firstRep.part_number,
                new_brand: firstRep.brand,
                new_qty: totalNewQty,
                new_unit_price: firstRep.unit_price,
                new_total_price: totalNewRetailPrice,
                new_cost_price: firstRep.cost_price,
                replacement_items: validatedReplacements,
                cogs_adjustment: cogsAdjustment,
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

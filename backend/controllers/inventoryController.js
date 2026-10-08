const db = require('../config/db');
const { applyMovement } = require('../services/inventoryService');
const { AppValidationError, AppNotFoundError } = require('../utils/errors');

/**
 * GET /api/inventory
 */
exports.getInventory = async (req, res, next) => {
    try {
        const [products] = await db.query(`
            SELECT 
                p.id,
                p.id AS item_id,
                COALESCE(p.sku, p.part_number) AS sku,
                p.part_number,
                p.name AS product_name,
                p.name,
                p.brand,
                p.category,
                p.size,
                p.is_serialized,
                COALESCE(p.current_stock, p.stock) AS current_stock,
                p.stock,
                p.reorder_level,
                p.cost_price,
                COALESCE(p.retail_price, p.selling_price) AS retail_price,
                p.selling_price AS price,
                COALESCE(
                    GROUP_CONCAT(
                        DISTINCT TRIM(CONCAT(mu.model, ' ', COALESCE(mu.year_model, '')))
                        ORDER BY mu.model, mu.year_model
                        SEPARATOR ', '
                    ),
                    ''
                ) AS compatibility_display
            FROM products p
            LEFT JOIN product_compatibility pc ON pc.product_id = p.id
            LEFT JOIN motorcycle_units mu ON mu.id = pc.motorcycle_unit_id
            WHERE p.is_active = true
            GROUP BY 
                p.id,
                p.part_number,
                p.sku,
                p.name,
                p.brand,
                p.category,
                p.size,
                p.is_serialized,
                p.stock,
                p.current_stock,
                p.reorder_level,
                p.cost_price,
                p.selling_price,
                p.retail_price
            ORDER BY p.name ASC
        `);
        res.json(products);
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/inventory/receive
 * - Verify supplier
 * - Check (supplier_id, reference_no) uniqueness
 * - Create receiving_records
 * - Sort items by itemId to prevent deadlocks
 * - Insert receiving_record_items and call applyMovement (STOCK_IN) atomically
 */
exports.receiveStock = async (req, res, next) => {
    const { supplier_id, supplierId, reference_no, referenceNo, reference_number, deliveryPersonnel, notes, items } = req.body;
    const finalSupplierId = Number(supplier_id || supplierId);
    const refNo = (reference_no || referenceNo || reference_number || '').trim();
    const userId = req.user?.id || null;

    if (!finalSupplierId) {
        return res.status(422).json({ 
            message: 'Supplier ID is required',
            errors: [{ field: 'supplier_id', message: 'Supplier required' }]
        });
    }

    if (!refNo) {
        return res.status(422).json({ 
            message: 'Reference number is required and cannot be empty',
            errors: [{ field: 'reference_no', message: 'Reference number required' }]
        });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(422).json({ 
            message: 'Receiving record must contain at least one item',
            errors: [{ field: 'items', message: 'Items array cannot be empty' }]
        });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Verify supplier exists and is active
        const [suppliers] = await connection.query(
            'SELECT id, name, is_active FROM suppliers WHERE id = ?',
            [finalSupplierId]
        );
        if (suppliers.length === 0) {
            await connection.rollback();
            return res.status(422).json({ message: `Supplier with ID ${finalSupplierId} not found` });
        }
        if (!suppliers[0].is_active) {
            await connection.rollback();
            return res.status(422).json({ message: `Supplier "${suppliers[0].name}" is currently inactive` });
        }

        // 2. Check (supplier_id, reference_no) uniqueness
        const [existingRef] = await connection.query(
            'SELECT id FROM receiving_records WHERE supplier_id = ? AND (reference_no = ? OR reference_number = ?)',
            [finalSupplierId, refNo, refNo]
        );
        if (existingRef.length > 0) {
            await connection.rollback();
            return res.status(422).json({ 
                message: `Duplicate receiving reference "${refNo}" for supplier "${suppliers[0].name}"`,
                errors: [{ field: 'reference_no', message: 'Reference number already exists for this supplier' }]
            });
        }

        // 3. Sort items by itemId to prevent lock order deadlocks
        const sortedItems = [...items].sort((a, b) => {
            const idA = Number(a.itemId || a.item_id || a.product_id);
            const idB = Number(b.itemId || b.item_id || b.product_id);
            return idA - idB;
        });

        // 4. Calculate total cost and validate line items
        let totalCost = 0;
        for (const item of sortedItems) {
            const resolvedId = Number(item.itemId || item.item_id || item.product_id);
            const qty = Number(item.quantity);
            const costPrice = Number(item.cost_price ?? item.costPrice ?? 0);

            if (!resolvedId || !Number.isInteger(qty) || qty <= 0) {
                throw new AppValidationError(`Invalid item ID or quantity for receiving line: ${JSON.stringify(item)}`);
            }
            totalCost += costPrice * qty;
        }

        // 5. Create receiving_records header
        const [recResult] = await connection.query(
            `INSERT INTO receiving_records (
                supplier_id, reference_number, reference_no, received_by, total_cost, status, notes, received_at
            ) VALUES (?, ?, ?, ?, ?, 'received', ?, NOW())`,
            [finalSupplierId, refNo, refNo, userId, totalCost, notes || null]
        );
        const receivingRecordId = recResult.insertId;

        // 6. Insert receiving_record_items and call applyMovement (STOCK_IN) atomically
        const processedItems = [];
        for (const item of sortedItems) {
            const resolvedId = Number(item.itemId || item.item_id || item.product_id);
            const qty = Number(item.quantity);
            const costPrice = Number(item.cost_price ?? item.costPrice ?? 0);
            const subtotal = costPrice * qty;

            await connection.query(
                `INSERT INTO receiving_record_items (
                    receiving_record_id, product_id, item_id, quantity, cost_price, subtotal
                ) VALUES (?, ?, ?, ?, ?, ?)`,
                [receivingRecordId, resolvedId, resolvedId, qty, costPrice, subtotal]
            );

            const movement = await applyMovement(connection, {
                itemId: resolvedId,
                transactionType: 'STOCK_IN',
                quantityChange: qty,
                referenceNo: refNo,
                referenceType: 'RECEIVING_RECORD',
                referenceId: receivingRecordId,
                unitCost: costPrice,
                remarks: notes || `Stock receiving ref: ${refNo}`,
                createdBy: userId
            });

            processedItems.push(movement);
        }

        await connection.commit();

        res.status(201).json({
            message: 'Stock received and inventory ledger updated successfully',
            receiving_record: {
                id: receivingRecordId,
                supplier_id,
                supplier_name: suppliers[0].name,
                reference_no: refNo,
                total_cost: totalCost,
                status: 'received',
                items: processedItems
            }
        });

    } catch (err) {
        await connection.rollback();
        next(err);
    } finally {
        connection.release();
    }
};

/**
 * POST /api/inventory/adjustments
 * - Handles DAMAGE, LOSS, RETURN_TO_SUPPLIER, and FOUND
 * - Requires reference number and remarks for all adjustments
 * - Locks the item row before validating FOUND restorations against previous LOSS records
 */
exports.recordAdjustment = async (req, res, next) => {
    const {
        item_id,
        itemId,
        productId,
        transaction_type,
        transactionType,
        movement_type,
        movementType,
        quantity,
        reference_no,
        referenceNo,
        remarks,
        notes,
        loss_transaction_id,
        lossTransactionId,
        loss_reference_no,
        loss_reference,
        lossReferenceNo
    } = req.body;

    const resolvedId = Number(item_id || itemId || productId);
    const resolvedType = (movement_type || movementType || transaction_type || transactionType || '').trim().toUpperCase();
    const resolvedRef = (reference_no || referenceNo || '').trim();
    const resolvedRemarks = (remarks || notes || '').trim();
    let resolvedLossTxId = loss_transaction_id || lossTransactionId || null;
    const resolvedLossRef = (loss_reference_no || loss_reference || lossReferenceNo || '').trim();
    const qty = Number(quantity);
    const userId = req.user?.id || null;

    // Validate reference number and remarks
    if (!resolvedRef) {
        return res.status(422).json({
            message: 'Reference number is required for all adjustments',
            errors: [{ field: 'reference_no', message: 'Reference number required' }]
        });
    }

    if (!resolvedRemarks) {
        return res.status(422).json({
            message: 'Remarks are required for all adjustments',
            errors: [{ field: 'remarks', message: 'Remarks required' }]
        });
    }

    const ALLOWED_TYPES = ['DAMAGE', 'LOSS', 'RETURN_TO_SUPPLIER', 'FOUND'];
    if (!ALLOWED_TYPES.includes(resolvedType)) {
        return res.status(422).json({
            message: `Invalid adjustment type "${resolvedType}". Must be one of: ${ALLOWED_TYPES.join(', ')}`,
            errors: [{ field: 'transaction_type', message: 'Invalid adjustment type' }]
        });
    }

    if (!resolvedId || !Number.isInteger(qty) || qty <= 0) {
        return res.status(422).json({
            message: 'A valid item ID and positive quantity are required',
            errors: [{ field: 'quantity', message: 'Quantity must be a positive integer' }]
        });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Lock item row FIRST
        const [itemRows] = await connection.query(
            'SELECT id, name, sku, part_number, stock, current_stock, cost_price FROM products WHERE id = ? FOR UPDATE',
            [resolvedId]
        );
        if (itemRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Item ID ${resolvedId} not found` });
        }
        const item = itemRows[0];

        let quantityChange;

        // 2. FOUND Restorations Logic
        if (resolvedType === 'FOUND') {
            if (!resolvedLossTxId && resolvedLossRef) {
                const [lossLookup] = await connection.query(
                    'SELECT id FROM inventory_transactions WHERE transaction_type = "LOSS" AND product_id = ? AND reference_no = ? ORDER BY id DESC LIMIT 1',
                    [resolvedId, resolvedLossRef]
                );
                if (lossLookup.length > 0) {
                    resolvedLossTxId = lossLookup[0].id;
                }
            }

            if (!resolvedLossTxId) {
                await connection.rollback();
                return res.status(422).json({
                    message: 'loss_transaction_id or valid loss reference number is required when recording a FOUND restoration',
                    errors: [{ field: 'loss_transaction_id', message: 'Target loss transaction required' }]
                });
            }

            // Validate against targeted LOSS ledger record
            const [lossRows] = await connection.query(
                `SELECT 
                    it.id,
                    it.product_id,
                    it.reference_no,
                    it.transaction_type,
                    ABS(it.quantity_change) AS reported_lost,
                    COALESCE((
                        SELECT SUM(f.quantity_change)
                        FROM inventory_transactions f
                        WHERE f.transaction_type = 'FOUND' AND f.loss_transaction_id = it.id
                    ), 0) AS already_restored
                 FROM inventory_transactions it
                 WHERE it.id = ? AND it.transaction_type = 'LOSS'`,
                [resolvedLossTxId]
            );

            if (lossRows.length === 0) {
                await connection.rollback();
                return res.status(422).json({
                    message: `Target LOSS transaction with ID ${resolvedLossTxId} not found`,
                    errors: [{ field: 'loss_transaction_id', message: 'Loss transaction not found' }]
                });
            }

            const lossRecord = lossRows[0];
            if (lossRecord.product_id !== resolvedId) {
                await connection.rollback();
                return res.status(422).json({
                    message: `Target LOSS transaction belongs to product ID ${lossRecord.product_id}, not item ID ${resolvedId}`,
                    errors: [{ field: 'loss_transaction_id', message: 'Mismatched product ID for loss restoration' }]
                });
            }

            const reportedLost = Number(lossRecord.reported_lost);
            const alreadyRestored = Number(lossRecord.already_restored);
            const restorableBalance = reportedLost - alreadyRestored;

            if (restorableBalance <= 0) {
                await connection.rollback();
                return res.status(422).json({
                    message: `LOSS record ${resolvedLossTxId} has already been fully restored (Reported: ${reportedLost}, Restored: ${alreadyRestored})`
                });
            }

            if (qty > restorableBalance) {
                await connection.rollback();
                return res.status(422).json({
                    message: `Requested restoration quantity (${qty}) exceeds unresolved loss balance (${restorableBalance}) for LOSS record #${resolvedLossTxId}`,
                    errors: [{ field: 'quantity', message: `Maximum restorable quantity is ${restorableBalance}` }]
                });
            }

            // FOUND increases stock
            quantityChange = qty;
        } else {
            // Outflows: DAMAGE, LOSS, RETURN_TO_SUPPLIER decrease stock
            quantityChange = -qty;
        }

        // 3. Apply movement via inventoryService
        const movement = await applyMovement(connection, {
            itemId: resolvedId,
            transactionType: resolvedType,
            quantityChange,
            referenceNo: resolvedRef,
            remarks: resolvedRemarks,
            lossTransactionId: resolvedType === 'FOUND' ? resolvedLossTxId : null,
            createdBy: userId
        });

        await connection.commit();

        res.status(200).json({
            message: `Inventory adjustment (${resolvedType}) successfully recorded`,
            adjustment: movement,
            transaction: movement
        });

    } catch (err) {
        await connection.rollback();
        next(err);
    } finally {
        connection.release();
    }
};

/**
 * GET /api/items/:id/open-losses (and /api/inventory/items/:id/open-losses)
 * Return unresolved LOSS entries with restorable balances (reported_lost - already_restored)
 * to populate the FOUND modal dropdown.
 */
exports.getOpenLosses = async (req, res, next) => {
    try {
        const itemId = Number(req.params.id);
        if (!itemId) {
            return res.status(400).json({ message: 'Invalid item ID' });
        }

        const [losses] = await db.query(
            `SELECT 
                it.id AS loss_transaction_id,
                it.id,
                it.transaction_number,
                it.reference_no,
                ABS(it.quantity_change) AS reported_lost,
                COALESCE((
                    SELECT SUM(f.quantity_change) 
                    FROM inventory_transactions f 
                    WHERE f.transaction_type = 'FOUND' AND f.loss_transaction_id = it.id
                ), 0) AS already_restored,
                (ABS(it.quantity_change) - COALESCE((
                    SELECT SUM(f.quantity_change) 
                    FROM inventory_transactions f 
                    WHERE f.transaction_type = 'FOUND' AND f.loss_transaction_id = it.id
                ), 0)) AS restorable_balance,
                it.notes,
                it.remarks,
                it.created_at
             FROM inventory_transactions it
             WHERE it.product_id = ? AND it.transaction_type = 'LOSS'
             HAVING restorable_balance > 0
             ORDER BY it.id ASC`,
            [itemId]
        );

        res.json(losses);
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/items/:id/ledger (and /api/inventory/items/:id/ledger)
 * Return paginated ledger records for an item, sorted strictly by it.id ASC
 */
exports.getItemLedger = async (req, res, next) => {
    try {
        const itemId = Number(req.params.id);
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * limit;

        if (!itemId) {
            return res.status(400).json({ message: 'Invalid item ID' });
        }

        const [countResult] = await db.query(
            'SELECT COUNT(*) as total FROM inventory_transactions WHERE product_id = ?',
            [itemId]
        );
        const total = countResult[0].total;

        const [records] = await db.query(
            `SELECT 
                it.id,
                it.transaction_number,
                it.reference_no,
                it.product_id,
                it.product_id AS item_id,
                it.transaction_type,
                it.quantity,
                it.quantity_change,
                it.balance_before,
                it.balance_after,
                it.unit_cost,
                it.reference_type,
                it.reference_id,
                it.loss_transaction_id,
                it.notes,
                it.remarks,
                it.created_by,
                it.created_at,
                u.username AS created_by_username
             FROM inventory_transactions it
             LEFT JOIN users u ON u.id = it.created_by
             WHERE it.product_id = ?
             ORDER BY it.id ASC
             LIMIT ? OFFSET ?`,
            [itemId, limit, offset]
        );

        res.json({
            data: records,
            transactions: records,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * Legacy Stock In (Maintains backwards compatibility with previous endpoints)
 */
exports.stockIn = async (req, res, next) => {
    const { product_id, quantity } = req.body;
    if (!product_id || !quantity || quantity <= 0) {
        return res.status(400).json({ message: 'Invalid product or quantity' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await applyMovement(connection, {
            itemId: product_id,
            transactionType: 'STOCK_IN',
            quantityChange: Number(quantity),
            referenceNo: `STOCK-IN-${Date.now()}`,
            remarks: 'Direct stock in manual adjustment',
            createdBy: req.user?.id || null
        });
        await connection.commit();
        res.json({ message: 'Stock added successfully' });
    } catch (err) {
        await connection.rollback();
        next(err);
    } finally {
        connection.release();
    }
};

/**
 * Legacy Stock Out
 */
exports.stockOut = async (req, res, next) => {
    const { product_id, quantity } = req.body;
    if (!product_id || !quantity || quantity <= 0) {
        return res.status(400).json({ message: 'Invalid product or quantity' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await applyMovement(connection, {
            itemId: product_id,
            transactionType: 'STOCK_OUT',
            quantityChange: -Number(quantity),
            referenceNo: `STOCK-OUT-${Date.now()}`,
            remarks: 'Direct stock out manual adjustment',
            createdBy: req.user?.id || null
        });
        await connection.commit();
        res.json({ message: 'Stock deducted successfully' });
    } catch (err) {
        await connection.rollback();
        next(err);
    } finally {
        connection.release();
    }
};

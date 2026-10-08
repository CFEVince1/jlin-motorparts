const { AppValidationError, AppNotFoundError } = require('../utils/errors');

/**
 * Transaction type sign rules:
 * - Outflows MUST have negative quantity_change (< 0)
 * - Inflows MUST have positive quantity_change (> 0) (or >= 0 for OPENING_BALANCE)
 */
const OUTFLOW_TYPES = [
    'STOCK_OUT',
    'SALE',
    'DAMAGE',
    'LOSS',
    'RETURN_TO_SUPPLIER',
    'ADJUSTMENT_SUB'
];

const INFLOW_TYPES = [
    'OPENING_BALANCE',
    'STOCK_IN',
    'PURCHASE_RECEIPT',
    'FOUND',
    'RETURN',
    'ADJUSTMENT_ADD'
];

/**
 * Applies an atomic movement to inventory and appends an immutable transaction record.
 * 
 * @param {Object} trx - MySQL transaction connection
 * @param {Object} params
 * @param {number|string} params.itemId - ID of product / item
 * @param {number|string} [params.productId] - Optional alias for itemId
 * @param {string} params.transactionType - One of the ledger transaction types
 * @param {number} params.quantityChange - Signed change quantity (+/-)
 * @param {string} params.referenceNo - Non-empty audit reference string
 * @param {string} [params.referenceType] - Reference entity type
 * @param {number} [params.referenceId] - Reference entity ID
 * @param {number} [params.unitCost] - Item unit cost
 * @param {string} [params.remarks] - Adjustment remarks
 * @param {string} [params.notes] - Ledger notes
 * @param {number} [params.createdBy] - User ID responsible for movement
 * @param {number} [params.lossTransactionId] - Preceding loss ID (for FOUND adjustments)
 */
async function applyMovement(trx, {
    itemId,
    productId,
    type,
    transactionType,
    quantityChange,
    referenceNo,
    referenceType,
    referenceId,
    unitCost,
    remarks,
    notes,
    userId,
    createdBy,
    lossTransactionId,
    relatedTransactionId
}) {
    if (!trx) {
        throw new Error('Database transaction connection (trx) is required for applyMovement');
    }

    const resolvedId = itemId || productId;
    if (!resolvedId) {
        throw new AppValidationError('Item ID is required for inventory movement');
    }

    // 1. Enforce non-empty reference string
    if (!referenceNo || typeof referenceNo !== 'string' || !referenceNo.trim()) {
        throw new AppValidationError('Reference number is required and cannot be empty');
    }
    const cleanRefNo = referenceNo.trim();

    // 2. Validate transaction type and quantity_change sign invariants
    const rawType = type || transactionType;
    if (!rawType || typeof rawType !== 'string') {
        throw new AppValidationError('Invalid transaction type');
    }
    const normalizedType = rawType.trim().toUpperCase();
    const effectiveUserId = userId || createdBy || null;
    const effectiveLossTxId = lossTransactionId || relatedTransactionId || null;
    const qtyChange = Number(quantityChange);

    if (isNaN(qtyChange)) {
        throw new AppValidationError('quantity_change must be a valid number');
    }

    if (OUTFLOW_TYPES.includes(normalizedType)) {
        if (qtyChange >= 0) {
            throw new AppValidationError(
                `quantity_change for ${normalizedType} must be strictly negative (< 0). Received: ${qtyChange}`
            );
        }
    } else if (INFLOW_TYPES.includes(normalizedType)) {
        if (normalizedType === 'OPENING_BALANCE') {
            if (qtyChange < 0) {
                throw new AppValidationError(
                    `quantity_change for OPENING_BALANCE cannot be negative. Received: ${qtyChange}`
                );
            }
        } else {
            if (qtyChange <= 0) {
                throw new AppValidationError(
                    `quantity_change for ${normalizedType} must be strictly positive (> 0). Received: ${qtyChange}`
                );
            }
        }
    } else {
        throw new AppValidationError(`Unsupported transaction type: ${transactionType}`);
    }

    // 3. Acquire pessimistic row lock (FOR UPDATE) on item
    const [rows] = await trx.query(
        `SELECT id, part_number, sku, name, brand, stock, current_stock, cost_price 
         FROM products 
         WHERE id = ? 
         FOR UPDATE`,
        [resolvedId]
    );

    if (rows.length === 0) {
        throw new AppNotFoundError(`Item with ID ${resolvedId} not found`);
    }

    const item = rows[0];
    const currentStock = Number(item.current_stock ?? item.stock ?? 0);
    const newStock = currentStock + qtyChange;

    // 4. Prevent negative balances
    if (newStock < 0) {
        throw new AppValidationError(
            `Insufficient stock for item "${item.name}" (SKU: ${item.sku || item.part_number}). ` +
            `Current stock: ${currentStock}, Requested change: ${qtyChange}, Resulting balance would be: ${newStock}`
        );
    }

    // 5. Update items.current_stock and items.stock cache
    await trx.query(
        `UPDATE products SET current_stock = ?, stock = ? WHERE id = ?`,
        [newStock, newStock, resolvedId]
    );

    // 6. Append immutable row to inventory_transactions
    const finalRemarks = remarks || notes || `${normalizedType} movement (Ref: ${cleanRefNo})`;
    const txNumber = `TX-${cleanRefNo}-${resolvedId}-${Date.now().toString().slice(-6)}`;
    const effectiveCost = unitCost !== undefined && unitCost !== null 
        ? Number(unitCost) 
        : Number(item.cost_price || 0.00);

    const [insertResult] = await trx.query(
        `INSERT INTO inventory_transactions (
            transaction_number,
            reference_no,
            product_id,
            transaction_type,
            quantity,
            quantity_change,
            balance_before,
            balance_after,
            unit_cost,
            reference_type,
            reference_id,
            loss_transaction_id,
            notes,
            remarks,
            created_by,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
            txNumber,
            cleanRefNo,
            resolvedId,
            normalizedType,
            Math.abs(qtyChange),
            qtyChange,
            currentStock,
            newStock,
            effectiveCost,
            referenceType || normalizedType,
            referenceId || null,
            effectiveLossTxId,
            finalRemarks,
            finalRemarks,
            effectiveUserId
        ]
    );

    return {
        transactionId: insertResult.insertId,
        transactionNumber: txNumber,
        referenceNo: cleanRefNo,
        itemId: resolvedId,
        transactionType: normalizedType,
        quantityChange: qtyChange,
        balanceBefore: currentStock,
        balanceAfter: newStock,
        unitCost: effectiveCost
    };
}

module.exports = {
    applyMovement,
    OUTFLOW_TYPES,
    INFLOW_TYPES
};

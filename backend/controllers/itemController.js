const db = require('../config/db');
const { applyMovement } = require('../services/inventoryService');
const { AppValidationError, AppNotFoundError } = require('../utils/errors');
const inventoryController = require('./inventoryController');

/**
 * GET /api/items
 */
exports.getAllItems = async (req, res, next) => {
    try {
        const [items] = await db.query(`
            SELECT 
                p.id,
                p.id AS item_id,
                COALESCE(p.sku, p.part_number) AS sku,
                p.part_number,
                p.name,
                p.brand,
                p.category,
                p.size,
                p.measurement,
                p.thread_type,
                p.cost_price,
                COALESCE(p.retail_price, p.selling_price) AS retail_price,
                p.selling_price,
                COALESCE(p.current_stock, p.stock) AS current_stock,
                p.stock,
                p.reorder_level,
                p.is_serialized,
                p.is_active,
                p.created_at,
                p.updated_at
            FROM products p
            WHERE p.is_active = true
            ORDER BY p.name ASC
        `);
        res.json(items);
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/items/:id
 */
exports.getItemById = async (req, res, next) => {
    try {
        const itemId = Number(req.params.id);
        const [items] = await db.query(`
            SELECT 
                p.id,
                p.id AS item_id,
                COALESCE(p.sku, p.part_number) AS sku,
                p.part_number,
                p.name,
                p.brand,
                p.category,
                p.size,
                p.measurement,
                p.thread_type,
                p.cost_price,
                COALESCE(p.retail_price, p.selling_price) AS retail_price,
                p.selling_price,
                COALESCE(p.current_stock, p.stock) AS current_stock,
                p.stock,
                p.reorder_level,
                p.is_serialized,
                p.is_active,
                p.created_at,
                p.updated_at
            FROM products p
            WHERE p.id = ? AND p.is_active = true
        `, [itemId]);

        if (items.length === 0) {
            return res.status(404).json({ message: 'Item not found' });
        }
        res.json(items[0]);
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/items
 * - Force current_stock = 0 (and stock = 0)
 * - Insert initial OPENING_BALANCE ledger entry in the same transaction
 */
exports.createItem = async (req, res, next) => {
    const {
        sku,
        part_number,
        name,
        brand,
        category,
        size,
        measurement,
        thread_type,
        cost_price,
        retail_price,
        selling_price,
        reorder_level,
        is_serialized
    } = req.body;

    const resolvedSku = (sku || part_number || '').trim();
    const resolvedName = (name || '').trim();
    const resolvedBrand = (brand || '').trim();
    const resolvedCategory = (category || '').trim();
    const resolvedCost = Number(cost_price || 0.00);
    const resolvedPrice = Number(retail_price || selling_price || 0.00);
    const userId = req.user?.id || null;

    if (!resolvedSku) throw new AppValidationError('SKU / Part Number is required');
    if (!resolvedName) throw new AppValidationError('Item name is required');
    if (!resolvedBrand) throw new AppValidationError('Brand is required');
    if (!resolvedCategory) throw new AppValidationError('Category is required');

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Check duplicate SKU/brand
        const [existing] = await connection.query(
            'SELECT id FROM products WHERE (sku = ? OR part_number = ?) AND brand = ? LIMIT 1',
            [resolvedSku, resolvedSku, resolvedBrand]
        );
        if (existing.length > 0) {
            throw new AppValidationError(`An item with SKU "${resolvedSku}" and brand "${resolvedBrand}" already exists`);
        }

        // Force current_stock = 0
        const [insertResult] = await connection.query(
            `INSERT INTO products (
                part_number, sku, name, brand, category, size, measurement, thread_type,
                cost_price, selling_price, retail_price, stock, current_stock,
                reorder_level, is_serialized, is_active, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, TRUE, NOW())`,
            [
                resolvedSku,
                resolvedSku,
                resolvedName,
                resolvedBrand,
                resolvedCategory,
                size || 'Standard',
                measurement || null,
                thread_type || null,
                resolvedCost,
                resolvedPrice,
                resolvedPrice,
                reorder_level || 5,
                is_serialized ? 1 : 0
            ]
        );

        const newItemId = insertResult.insertId;

        // Fetch DB Date string for reference number
        const [dateRows] = await connection.query(`SELECT DATE_FORMAT(NOW(), '%Y%m%d') as db_date;`);
        const dbDate = dateRows[0].db_date;
        const refNo = `OPENING-${dbDate}`;

        // Insert initial OPENING_BALANCE ledger entry in the SAME transaction
        await applyMovement(connection, {
            itemId: newItemId,
            transactionType: 'OPENING_BALANCE',
            quantityChange: 0,
            referenceNo: refNo,
            unitCost: resolvedCost,
            remarks: `Initial baseline OPENING_BALANCE for new item ${resolvedName} (${resolvedSku})`,
            createdBy: userId
        });

        await connection.commit();

        res.status(201).json({
            message: 'Item created with baseline opening balance',
            item: {
                id: newItemId,
                item_id: newItemId,
                sku: resolvedSku,
                name: resolvedName,
                brand: resolvedBrand,
                category: resolvedCategory,
                cost_price: resolvedCost,
                retail_price: resolvedPrice,
                current_stock: 0,
                stock: 0
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
 * PUT /api/items/:id
 * - Whitelist update fields: sku, name, brand, category, retail_price
 * - IGNORE current_stock to prevent manual inventory tampering!
 */
exports.updateItem = async (req, res, next) => {
    const itemId = Number(req.params.id);
    if (!itemId) throw new AppValidationError('Invalid item ID');

    // Whitelist only editable product attributes — strictly ignore current_stock and stock!
    const {
        sku,
        part_number,
        name,
        brand,
        category,
        retail_price,
        selling_price,
        cost_price,
        size,
        measurement,
        thread_type,
        reorder_level
    } = req.body;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [existing] = await connection.query(
            'SELECT id, name FROM products WHERE id = ? AND is_active = true FOR UPDATE',
            [itemId]
        );
        if (existing.length === 0) {
            throw new AppNotFoundError('Item not found');
        }

        const updates = [];
        const values = [];

        if (sku !== undefined || part_number !== undefined) {
            const val = (sku || part_number || '').trim();
            updates.push('sku = ?', 'part_number = ?');
            values.push(val, val);
        }
        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name.trim());
        }
        if (brand !== undefined) {
            updates.push('brand = ?');
            values.push(brand.trim());
        }
        if (category !== undefined) {
            updates.push('category = ?');
            values.push(category.trim());
        }
        if (retail_price !== undefined || selling_price !== undefined) {
            const price = Number(retail_price ?? selling_price);
            updates.push('retail_price = ?', 'selling_price = ?');
            values.push(price, price);
        }
        if (cost_price !== undefined) {
            updates.push('cost_price = ?');
            values.push(Number(cost_price));
        }
        if (size !== undefined) {
            updates.push('size = ?');
            values.push(size);
        }
        if (measurement !== undefined) {
            updates.push('measurement = ?');
            values.push(measurement);
        }
        if (thread_type !== undefined) {
            updates.push('thread_type = ?');
            values.push(thread_type);
        }
        if (reorder_level !== undefined) {
            updates.push('reorder_level = ?');
            values.push(Number(reorder_level));
        }

        if (updates.length === 0) {
            await connection.rollback();
            return res.json({ message: 'No valid fields provided for update' });
        }

        values.push(itemId);
        await connection.query(
            `UPDATE products SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        await connection.commit();

        const [updatedRows] = await db.query('SELECT * FROM products WHERE id = ?', [itemId]);
        res.json({
            message: 'Item updated successfully (stock attributes preserved from ledger tampering)',
            item: updatedRows[0]
        });

    } catch (err) {
        await connection.rollback();
        next(err);
    } finally {
        connection.release();
    }
};

// Delegate audit & losses
exports.getItemLedger = inventoryController.getItemLedger;
exports.getOpenLosses = inventoryController.getOpenLosses;

const db = require('../config/db');
const { applyMovement } = require('../services/inventoryService');

const formatCompatibilityLabel = (unit) => `${unit.model}${unit.year_model ? ` ${unit.year_model}` : ''}`.trim();

const isMissing = (value) => value === undefined || value === null || value === '';

const normalizeBoolean = (value) => value === true || value === 1 || value === '1' || value === 'true';

const normalizeSerialNumbers = (serialNumbers) => {
    if (!serialNumbers) return [];
    const rawSerials = Array.isArray(serialNumbers)
        ? serialNumbers
        : String(serialNumbers).split(/[\n,]+/);

    return rawSerials
        .map(serial => String(serial).trim())
        .filter(serial => serial !== '');
};

const normalizeMotorcycleUnitIds = (ids) => {
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.map(id => Number(id)).filter(Number.isInteger))];
};

const normalizeCompatibilityGroupIds = (ids) => {
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.map(id => Number(id)).filter(Number.isInteger))];
};

// ==========================================
// GET ALL ACTIVE PRODUCTS
// ==========================================
exports.getAllProducts = async (req, res) => {
    try {
        const [products] = await db.query(`
            SELECT
                id, name AS product_name, part_number, brand, category,
                size, measurement, thread_type, cost_price, markup_percentage, selling_price, selling_price AS price,
                COALESCE(stock, current_stock, 0) AS stock,
                COALESCE(stock, current_stock, 0) AS current_stock,
                reorder_level, is_serialized
            FROM products
            WHERE is_active = 1
            ORDER BY created_at DESC
        `);

        if (products.length === 0) return res.json([]);

        const productIds = products.map(p => p.id);

        const [directUnits] = await db.query(`
            SELECT DISTINCT pc.product_id, mu.id AS motorcycle_id, mu.brand, mu.model, mu.year_model
            FROM product_compatibilities pc
            JOIN motorcycle_models mm ON pc.motorcycle_model_id = mm.id
            JOIN motorcycle_units mu ON mm.brand = mu.brand
                AND (mm.model = mu.model OR TRIM(REPLACE(mm.model, COALESCE(mm.year_model, ''), '')) = TRIM(REPLACE(mu.model, COALESCE(mu.year_model, ''), '')))
                AND ((mm.year_model IS NULL AND mu.year_model IS NULL) OR mm.year_model = mu.year_model)
            WHERE pc.product_id IN (?) AND pc.compatibility_status = 'COMPATIBLE'
            ORDER BY mu.brand ASC, mu.model ASC, mu.year_model ASC
        `, [productIds]);

        let groupUnits = [];
        try {
            const [rows] = await db.query(`
                SELECT pcg.product_id, cg.id AS group_id, cg.group_name, mu.id AS motorcycle_id, mu.brand, mu.model, mu.year_model
                FROM product_compatibility_groups pcg
                JOIN compatibility_groups cg ON pcg.compatibility_group_id = cg.id
                LEFT JOIN compatibility_group_units cgu ON cg.id = cgu.compatibility_group_id
                LEFT JOIN motorcycle_units mu ON cgu.motorcycle_unit_id = mu.id
                WHERE pcg.product_id IN (?)
            `, [productIds]);
            groupUnits = rows;
        } catch (groupQueryErr) {
            // Compatibility groups tables are retired; gracefully fallback to empty list
            groupUnits = [];
        }

        let availableSerials = [];
        try {
            const [serialsRows] = await db.query(`
                SELECT id, product_id, serial_number, quantity, status
                FROM product_serials
                WHERE product_id IN (?) AND (status = 'available' OR status IS NULL) AND quantity > 0
                ORDER BY id ASC
            `, [productIds]);
            availableSerials = serialsRows;
        } catch (serialErr) {
            availableSerials = [];
        }

        const result = products.map(p => {
            const dUnits = directUnits.filter(du => du.product_id === p.id);
            const gUnits = groupUnits.filter(gu => gu.product_id === p.id);
            const prodSerials = availableSerials.filter(s => s.product_id === p.id);
            const serialNumbers = prodSerials.map(s => s.serial_number);
            const isSerialized = Boolean(p.is_serialized);

            const compatibility_group_ids = [...new Set(gUnits.map(g => g.group_id))];
            const compatibility_groups = [...new Set(gUnits.map(g => g.group_name))];

            const directUnitIds = dUnits.map(u => u.motorcycle_id);
            const groupUnitIds = gUnits.filter(u => u.motorcycle_id).map(u => u.motorcycle_id);
            const effectiveMotorcycleUnitIds = [...new Set([...directUnitIds, ...groupUnitIds])];

            const directCompatibilityLabels = dUnits.map(u => formatCompatibilityLabel(u));
            const groupCompatibilityLabels = gUnits.filter(u => u.motorcycle_id).map(u => formatCompatibilityLabel(u));
            const effectiveCompatibility = [...new Set([...directCompatibilityLabels, ...groupCompatibilityLabels])];

            const compatibility = [...new Set([...compatibility_groups, ...directCompatibilityLabels])];
            const effectiveStock = isSerialized ? prodSerials.reduce((sum, s) => sum + Number(s.quantity || 0), 0) : Number(p.stock ?? p.current_stock ?? 0);

            return {
                ...p,
                stock: effectiveStock,
                current_stock: effectiveStock,
                is_serialized: isSerialized,
                serials: prodSerials,
                serial_numbers: serialNumbers,
                serial_display: isSerialized
                    ? (serialNumbers.length > 0 ? serialNumbers.join(', ') : 'No serials')
                    : '-',
                motorcycle_unit_ids: directUnitIds,
                compatibility_group_ids,
                compatibility_groups,
                effective_motorcycle_unit_ids: effectiveMotorcycleUnitIds,
                effective_compatibility: effectiveCompatibility,
                compatibility,
                compatibility_display: compatibility.join(', ')
            };
        });

        res.json(result);
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({ message: 'Error fetching products' });
    }
};

// ==========================================
// GET COMPATIBILITY GROUPS
// ==========================================
exports.getCompatibilityGroups = async (req, res) => {
    try {
        let groups = [];
        try {
            const [rows] = await db.query(`
                SELECT 
                    cg.id, 
                    cg.group_name, 
                    cg.description,
                    mu.id AS mu_id, mu.brand, mu.model, mu.year_model
                FROM compatibility_groups cg
                LEFT JOIN compatibility_group_units cgu ON cg.id = cgu.compatibility_group_id
                LEFT JOIN motorcycle_units mu ON mu.id = cgu.motorcycle_unit_id
                ORDER BY cg.group_name ASC, mu.brand ASC, mu.model ASC, mu.year_model ASC
            `);
            groups = rows;
        } catch (tableErr) {
            return res.json([]);
        }

        const groupMap = {};
        groups.forEach(row => {
            if (!groupMap[row.id]) {
                groupMap[row.id] = {
                    id: row.id,
                    group_name: row.group_name,
                    description: row.description,
                    member_units: []
                };
            }
            if (row.mu_id) {
                groupMap[row.id].member_units.push({
                    id: row.mu_id,
                    brand: row.brand,
                    model: row.model,
                    year_model: row.year_model
                });
            }
        });

        res.json(Object.values(groupMap));
    } catch (err) {
        console.error('Error fetching compatibility groups:', err);
        res.status(500).json({ message: 'Error fetching compatibility groups' });
    }
};

// ==========================================
// GET MOTORCYCLE UNITS (Used by Product Forms and Filters)
// ==========================================
exports.getMotorcycleUnits = async (req, res) => {
    try {
        const [units] = await db.query(`
            SELECT id, brand, model, year_model
            FROM motorcycle_units
            WHERE LOWER(brand) NOT LIKE '%test%'
              AND LOWER(model) NOT LIKE '%test%'
              AND LOWER(COALESCE(year_model, '')) NOT LIKE '%test%'
              AND LOWER(model) NOT LIKE '%werewe%'
              AND LOWER(COALESCE(year_model, '')) NOT LIKE '%werewe%'
              AND LOWER(model) NOT LIKE '%wampipti%'
              AND LOWER(brand) NOT LIKE '%susuki%'
            ORDER BY brand ASC, model ASC, year_model ASC
        `);
        res.json(units);
    } catch (err) {
        console.error('Error fetching motorcycle units:', err);
        res.status(500).json({ message: 'Error fetching motorcycle units' });
    }
};

// ==========================================
// CREATE PRODUCT (Handles Serialized & Non-Serialized)
// ==========================================
exports.createProduct = async (req, res) => {
    const {
        part_number,
        sku,
        name,
        brand,
        category,
        size,
        measurement,
        thread_type,
        cost_price,
        markup_percentage,
        selling_price,
        retail_price,
        reorder_level,
        is_serialized,
        stock,
        serial_numbers,
        motorcycle_unit_ids
    } = req.body;

    const connection = await db.getConnection();
    try {
        const resolvedPartNumber = String(part_number || sku || '').trim();
        if (isMissing(resolvedPartNumber)) throw new Error('Part number is required');
        if (isMissing(name)) throw new Error('Product name is required');
        if (isMissing(category)) throw new Error('Category is required');
        if (isMissing(cost_price)) throw new Error('Cost price is required');

        const rawPrice = selling_price !== undefined && selling_price !== null && selling_price !== ''
            ? selling_price
            : retail_price;
        if (isMissing(rawPrice) && isMissing(markup_percentage)) throw new Error('Selling price or markup percentage is required');
        if (isMissing(reorder_level)) throw new Error('Reorder level is required');
        if (is_serialized === undefined || is_serialized === null) throw new Error('Product type is required');

        const parsedCost = Number(cost_price);
        if (!Number.isFinite(parsedCost) || parsedCost < 0) {
            throw new Error('Cost price must be a valid non-negative number');
        }
        const parsedMarkup = markup_percentage !== undefined && markup_percentage !== null && markup_percentage !== ''
            ? Number(markup_percentage)
            : (parsedCost > 0 && Number(rawPrice) > parsedCost ? Math.round(((Number(rawPrice) - parsedCost) / parsedCost) * 10000) / 100 : 0);
        if (!Number.isFinite(parsedMarkup) || parsedMarkup < 0) {
            throw new Error('Markup percentage must be a valid non-negative number');
        }

        // Server recomputes selling price using formula: selling price = cost + (cost * percentage / 100)
        const computedSelling = Math.round(parsedCost * (1 + parsedMarkup / 100) * 100) / 100;
        const parsedReorder = Number(reorder_level);
        if (!Number.isFinite(parsedReorder) || parsedReorder < 0) {
            throw new Error('Reorder level must be a valid non-negative number');
        }

        const trimmedPartNumber = resolvedPartNumber;
        const trimmedBrand = String(brand || '').trim();

        const unitIds = normalizeMotorcycleUnitIds(motorcycle_unit_ids);
        const groupIds = normalizeCompatibilityGroupIds(req.body.compatibility_group_ids);

        const serialized = normalizeBoolean(is_serialized);

        // Invariants: Every stock-in needs a receipt from a supplier.
        // Catalog products strictly start with 0 stock. Stock must be received via Stock Receive.
        // Both write paths (/api/products and /api/items) force starting stock to 0 and record an OPENING_BALANCE ledger entry.
        const finalStock = 0;

        await connection.beginTransaction();

        // Check duplicate part_number/SKU for this brand among active products
        const [existing] = await connection.query(
            'SELECT id FROM products WHERE (part_number = ? OR sku = ?) AND brand = ? AND is_active = true LIMIT 1',
            [trimmedPartNumber, trimmedPartNumber, trimmedBrand]
        );
        if (existing.length > 0) {
            await connection.rollback();
            return res.status(400).json({ message: `Duplicate part number / SKU "${trimmedPartNumber}" and brand "${trimmedBrand}" detected.` });
        }

        const [productResult] = await connection.query(
            `INSERT INTO products (
                part_number,
                sku,
                name,
                brand,
                category,
                size,
                measurement,
                thread_type,
                cost_price,
                markup_percentage,
                selling_price,
                retail_price,
                stock,
                current_stock,
                reorder_level,
                is_serialized
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
            [
                String(part_number).trim(),
                String(part_number).trim(),
                String(name).trim(),
                trimmedBrand,
                String(category).trim(),
                String(size || '').trim(),
                isMissing(measurement) ? null : String(measurement).trim(),
                isMissing(thread_type) ? null : String(thread_type).trim(),
                parsedCost,
                parsedMarkup,
                computedSelling,
                computedSelling,
                Number(reorder_level),
                serialized
            ]
        );

        const productId = productResult.insertId;

        // Fetch DB Date string for reference number
        const [dateRows] = await connection.query(`SELECT DATE_FORMAT(NOW(), '%Y%m%d') as db_date;`);
        const dbDate = dateRows[0]?.db_date || new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const refNo = `OPENING-${dbDate}`;
        const userId = req.user?.id || null;

        // Insert initial OPENING_BALANCE ledger entry in the SAME transaction
        await applyMovement(connection, {
            itemId: productId,
            transactionType: 'OPENING_BALANCE',
            quantityChange: finalStock,
            referenceNo: refNo,
            unitCost: Number(cost_price || 0),
            remarks: `Initial baseline OPENING_BALANCE for new product ${String(name).trim()} (${String(part_number).trim()})`,
            createdBy: userId
        });

        if (unitIds.length > 0) {
            // Ensure all selected units have corresponding models in motorcycle_models
            await connection.query(`
                INSERT IGNORE INTO motorcycle_models (brand, model, year_model)
                SELECT brand, model, year_model FROM motorcycle_units WHERE id IN (?)
            `, [unitIds]);

            // Correctly map motorcycle_units to motorcycle_models IDs for product_compatibilities
            await connection.query(`
                INSERT IGNORE INTO product_compatibilities (product_id, motorcycle_model_id, compatibility_status)
                SELECT DISTINCT ?, mm.id, 'COMPATIBLE'
                FROM motorcycle_units mu
                JOIN motorcycle_models mm ON
                    mm.brand = mu.brand
                    AND mm.model = mu.model
                    AND (
                        (mm.year_model IS NULL AND mu.year_model IS NULL)
                        OR mm.year_model = mu.year_model
                    )
                WHERE mu.id IN (?)
            `, [productId, unitIds]);
        }

        if (groupIds.length > 0) {
            try {
                const groupValues = groupIds.map(groupId => [productId, groupId]);
                await connection.query(
                    'INSERT INTO product_compatibility_groups (product_id, compatibility_group_id) VALUES ?',
                    [groupValues]
                );
            } catch (groupInsertErr) {
                console.warn('Skipping retired product_compatibility_groups insert:', groupInsertErr.message);
            }
        }

        await connection.commit();
        res.status(201).json({ message: 'Product created successfully', productId });
    } catch (err) {
        await connection.rollback();
        console.error('Error creating product:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            if (err.message && err.message.includes('unique_part_brand')) {
                return res.status(400).json({ message: 'Duplicate part number and brand detected.' });
            }
            return res.status(400).json({ message: 'Duplicate serial number or compatibility detected.' });
        }
        if (err.message && (err.message.includes('required') || err.message.includes('Invalid') || err.message.includes('negative'))) {
            return res.status(400).json({ message: err.message });
        }
        res.status(500).json({ message: 'Error creating product' });
    } finally {
        connection.release();
    }
};

// ==========================================
// UPDATE PRODUCT (Details and Compatibility)
// ==========================================
exports.updateProduct = async (req, res) => {
    const { id } = req.params;
    const {
        part_number,
        sku,
        name,
        brand,
        category,
        size,
        measurement,
        thread_type,
        cost_price,
        markup_percentage,
        selling_price,
        retail_price,
        reorder_level,
        stock,
        motorcycle_unit_ids
    } = req.body;

    const connection = await db.getConnection();
    try {
        const resolvedPartNumber = String(part_number || sku || '').trim();
        if (isMissing(resolvedPartNumber)) throw new Error('Part number is required');
        if (isMissing(name)) throw new Error('Product name is required');
        if (isMissing(category)) throw new Error('Category is required');
        if (isMissing(cost_price)) throw new Error('Cost price is required');

        const rawPrice = selling_price !== undefined && selling_price !== null && selling_price !== ''
            ? selling_price
            : retail_price;
        if (isMissing(rawPrice) && isMissing(markup_percentage)) throw new Error('Selling price or markup percentage is required');
        if (isMissing(reorder_level)) throw new Error('Reorder level is required');

        const parsedCost = Number(cost_price);
        if (!Number.isFinite(parsedCost) || parsedCost < 0) {
            throw new Error('Cost price must be a valid non-negative number');
        }
        const parsedMarkup = markup_percentage !== undefined && markup_percentage !== null && markup_percentage !== ''
            ? Number(markup_percentage)
            : (parsedCost > 0 && Number(rawPrice) > parsedCost ? Math.round(((Number(rawPrice) - parsedCost) / parsedCost) * 10000) / 100 : 0);
        if (!Number.isFinite(parsedMarkup) || parsedMarkup < 0) {
            throw new Error('Markup percentage must be a valid non-negative number');
        }

        // Server recomputes selling price using formula: selling price = cost + (cost * percentage / 100)
        const computedSelling = Math.round(parsedCost * (1 + parsedMarkup / 100) * 100) / 100;
        const parsedReorder = Number(reorder_level);
        if (!Number.isFinite(parsedReorder) || parsedReorder < 0) {
            throw new Error('Reorder level must be a valid non-negative number');
        }

        const trimmedPartNumber = resolvedPartNumber;
        const trimmedBrand = String(brand || '').trim();

        const unitIds = normalizeMotorcycleUnitIds(motorcycle_unit_ids);
        const groupIds = normalizeCompatibilityGroupIds(req.body.compatibility_group_ids);

        await connection.beginTransaction();

        const [existingRows] = await connection.query(
            'SELECT id, name, sku, part_number, is_serialized, stock, current_stock, cost_price FROM products WHERE id = ? AND is_active = true FOR UPDATE',
            [id]
        );
        if (existingRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Product not found' });
        }

        // Check if SKU/part_number and brand are already used by another active product
        const [dupCheck] = await connection.query(
            'SELECT id FROM products WHERE (part_number = ? OR sku = ?) AND brand = ? AND id != ? AND is_active = true LIMIT 1',
            [trimmedPartNumber, trimmedPartNumber, trimmedBrand, id]
        );
        if (dupCheck.length > 0) {
            await connection.rollback();
            return res.status(400).json({ message: `Duplicate part number / SKU "${trimmedPartNumber}" and brand "${trimmedBrand}" detected.` });
        }

        const existingProduct = existingRows[0];
        const serialized = normalizeBoolean(existingProduct.is_serialized);
        // Product catalog edits cannot modify stock levels directly.
        // Stock can only be increased via Stock Receive (with supplier receipt) or adjusted via Discrepancy Adjustments.

        await connection.query(
            `UPDATE products SET
                part_number = ?,
                sku = ?,
                name = ?,
                brand = ?,
                category = ?,
                size = ?,
                measurement = ?,
                thread_type = ?,
                cost_price = ?,
                markup_percentage = ?,
                selling_price = ?,
                retail_price = ?,
                reorder_level = ?
             WHERE id = ? AND is_active = true`,
            [
                String(part_number).trim(),
                String(part_number).trim(),
                String(name).trim(),
                trimmedBrand,
                String(category).trim(),
                String(size || '').trim(),
                isMissing(measurement) ? null : String(measurement).trim(),
                isMissing(thread_type) ? null : String(thread_type).trim(),
                parsedCost,
                parsedMarkup,
                computedSelling,
                computedSelling,
                Number(reorder_level),
                id
            ]
        );

        // Only delete COMPATIBLE entries; PRESERVE NOT_COMPATIBLE and CONDITIONAL entries
        // so editing product metadata never erases negative fitment rules (e.g. V3 not compatible)
        await connection.query(
            "DELETE FROM product_compatibilities WHERE product_id = ? AND (compatibility_status = 'COMPATIBLE' OR compatibility_status IS NULL)",
            [id]
        );

        if (unitIds.length > 0) {
            // Ensure all selected units have corresponding models in motorcycle_models
            await connection.query(`
                INSERT IGNORE INTO motorcycle_models (brand, model, year_model)
                SELECT brand, model, year_model FROM motorcycle_units WHERE id IN (?)
            `, [unitIds]);

            // Correctly map motorcycle_units to motorcycle_models IDs for product_compatibilities
            await connection.query(`
                INSERT INTO product_compatibilities (product_id, motorcycle_model_id, compatibility_status)
                SELECT DISTINCT ?, mm.id, 'COMPATIBLE'
                FROM motorcycle_units mu
                JOIN motorcycle_models mm ON
                    mm.brand = mu.brand
                    AND mm.model = mu.model
                    AND (
                        (mm.year_model IS NULL AND mu.year_model IS NULL)
                        OR mm.year_model = mu.year_model
                    )
                WHERE mu.id IN (?)
                ON DUPLICATE KEY UPDATE compatibility_status = 'COMPATIBLE'
            `, [id, unitIds]);
        }

        try {
            await connection.query('DELETE FROM product_compatibility_groups WHERE product_id = ?', [id]);
            if (groupIds.length > 0) {
                await connection.query(
                    'INSERT INTO product_compatibility_groups (product_id, compatibility_group_id) VALUES ?',
                    [groupIds.map(groupId => [id, groupId])]
                );
            }
        } catch (groupUpdateErr) {
            console.warn('Skipping retired product_compatibility_groups update:', groupUpdateErr.message);
        }

        await connection.commit();
        res.json({ message: 'Product updated successfully' });
    } catch (err) {
        await connection.rollback();
        console.error('Error updating product:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            if (err.message && err.message.includes('unique_part_brand')) {
                return res.status(400).json({ message: 'Duplicate part number and brand detected.' });
            }
            return res.status(400).json({ message: 'Duplicate compatibility detected.' });
        }
        if (err.message && (err.message.includes('required') || err.message.includes('Invalid') || err.message.includes('negative'))) {
            return res.status(400).json({ message: err.message });
        }
        res.status(500).json({ message: 'Error updating product' });
    } finally {
        connection.release();
    }
};

// ==========================================
// DELETE PRODUCT (Soft Delete with Ledger LOSS write-off)
// ==========================================
exports.deleteProduct = async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id || null;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Lock product row pessimistic for update
        const [products] = await connection.query(
            'SELECT id, name, sku, part_number, stock, current_stock, cost_price, is_serialized, is_active FROM products WHERE id = ? FOR UPDATE',
            [id]
        );
        if (products.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Product not found' });
        }

        const product = products[0];
        const currentStock = Number(product.current_stock ?? product.stock ?? 0);

        // 2. If stock is above zero, log an explicit LOSS movement to balance the inventory ledger
        if (currentStock > 0) {
            const refNo = `DEL-${product.part_number || product.id}-${Date.now().toString().slice(-6)}`;
            await applyMovement(connection, {
                itemId: product.id,
                transactionType: 'LOSS',
                quantityChange: -currentStock,
                referenceNo: refNo,
                referenceType: 'PRODUCT_DELETION',
                referenceId: product.id,
                unitCost: Number(product.cost_price || 0.00),
                remarks: `Stock written off to LOSS upon deleting product: ${product.name} (${product.part_number || product.id})`,
                notes: `Product soft-deleted by user ${userId || 'admin'} with ${currentStock} active units. Entire remaining balance written off as inventory LOSS.`,
                createdBy: userId
            });

            // 3. If product has serialized inventory, update remaining available serials
            if (product.is_serialized) {
                await connection.query(
                    "UPDATE product_serials SET status = 'lost' WHERE product_id = ? AND status = 'available'",
                    [product.id]
                );
            }
        }

        // 4. Soft-delete the product and ensure cached stock is 0
        await connection.query(
            'UPDATE products SET is_active = false, stock = 0, current_stock = 0 WHERE id = ?',
            [id]
        );

        await connection.commit();
        res.json({
            message: 'Product deleted successfully',
            writtenOffStock: currentStock
        });
    } catch (err) {
        await connection.rollback();
        console.error('Error deleting product:', err);
        res.status(500).json({ message: 'Error deleting product' });
    } finally {
        connection.release();
    }
};

// ==========================================
// GET AVAILABLE SERIALS (Used by POS)
// ==========================================
exports.getProductSerials = async (req, res) => {
    const { id } = req.params;
    try {
        const [serials] = await db.query("SELECT id, serial_number, quantity, status FROM product_serials WHERE product_id = ? AND (status = 'available' OR status IS NULL) AND quantity > 0 ORDER BY serial_number ASC", [id]);
        res.json(serials);
    } catch (err) {
        console.error('Error fetching serial numbers:', err);
        res.status(500).json({ message: 'Error fetching serial numbers' });
    }
};

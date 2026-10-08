const db = require('../config/db');

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
                size, measurement, thread_type, cost_price, selling_price AS price,
                stock, reorder_level, is_serialized
            FROM products
            WHERE is_active = 1
            ORDER BY created_at DESC
        `);

        if (products.length === 0) return res.json([]);

        const productIds = products.map(p => p.id);

        const [directUnits] = await db.query(`
            SELECT pc.product_id, mu.id AS motorcycle_id, mu.brand, mu.model, mu.year_model
            FROM product_compatibility pc
            JOIN motorcycle_units mu ON pc.motorcycle_unit_id = mu.id
            WHERE pc.product_id IN (?)
            ORDER BY mu.brand ASC, mu.model ASC, mu.year_model ASC
        `, [productIds]);

        const [groupUnits] = await db.query(`
            SELECT pcg.product_id, cg.id AS group_id, cg.group_name, mu.id AS motorcycle_id, mu.brand, mu.model, mu.year_model
            FROM product_compatibility_groups pcg
            JOIN compatibility_groups cg ON pcg.compatibility_group_id = cg.id
            LEFT JOIN compatibility_group_units cgu ON cg.id = cgu.compatibility_group_id
            LEFT JOIN motorcycle_units mu ON cgu.motorcycle_unit_id = mu.id
            WHERE pcg.product_id IN (?)
        `, [productIds]);

        const result = products.map(p => {
            const dUnits = directUnits.filter(du => du.product_id === p.id);
            const gUnits = groupUnits.filter(gu => gu.product_id === p.id);

            const compatibility_group_ids = [...new Set(gUnits.map(g => g.group_id))];
            const compatibility_groups = [...new Set(gUnits.map(g => g.group_name))];

            const directUnitIds = dUnits.map(u => u.motorcycle_id);
            const groupUnitIds = gUnits.filter(u => u.motorcycle_id).map(u => u.motorcycle_id);
            const effectiveMotorcycleUnitIds = [...new Set([...directUnitIds, ...groupUnitIds])];

            const directCompatibilityLabels = dUnits.map(u => formatCompatibilityLabel(u));
            const groupCompatibilityLabels = gUnits.filter(u => u.motorcycle_id).map(u => formatCompatibilityLabel(u));
            const effectiveCompatibility = [...new Set([...directCompatibilityLabels, ...groupCompatibilityLabels])];

            const compatibility = [...new Set([...compatibility_groups, ...directCompatibilityLabels])];

            return {
                ...p,
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
        res.status(500).json({ message: 'Error fetching products', error: err.message });
    }
};

// ==========================================
// GET COMPATIBILITY GROUPS
// ==========================================
exports.getCompatibilityGroups = async (req, res) => {
    try {
        const [groups] = await db.query(`
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
        res.status(500).json({ message: 'Error fetching compatibility groups', error: err.message });
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
            ORDER BY brand ASC, model ASC, year_model ASC
        `);
        res.json(units);
    } catch (err) {
        console.error('Error fetching motorcycle units:', err);
        res.status(500).json({ message: 'Error fetching motorcycle units', error: err.message });
    }
};

// ==========================================
// CREATE PRODUCT (Handles Serialized & Non-Serialized)
// ==========================================
exports.createProduct = async (req, res) => {
    const {
        part_number,
        name,
        brand,
        category,
        size,
        measurement,
        thread_type,
        cost_price,
        selling_price,
        reorder_level,
        is_serialized,
        stock,
        serial_numbers,
        motorcycle_unit_ids
    } = req.body;

    const connection = await db.getConnection();
    try {
        if (isMissing(part_number)) throw new Error('Part number is required');
        if (isMissing(brand)) throw new Error('Brand is required');
        if (isMissing(name)) throw new Error('Product name is required');
        if (isMissing(category)) throw new Error('Category is required');
        if (isMissing(size)) throw new Error('Size is required');
        if (isMissing(cost_price)) throw new Error('Cost price is required');
        if (isMissing(selling_price)) throw new Error('Selling price is required');
        if (isMissing(reorder_level)) throw new Error('Reorder level is required');
        if (is_serialized === undefined || is_serialized === null) throw new Error('Product type is required');

        const unitIds = normalizeMotorcycleUnitIds(motorcycle_unit_ids);
        const groupIds = normalizeCompatibilityGroupIds(req.body.compatibility_group_ids);

        if (unitIds.length === 0 && groupIds.length === 0) {
            throw new Error('At least one motorcycle compatibility or group is required');
        }

        const serialized = normalizeBoolean(is_serialized);
        const cleanedSerials = normalizeSerialNumbers(serial_numbers);
        const uniqueSerials = new Set(cleanedSerials);
        let finalStock = Number(stock);

        if (serialized) {
            if (cleanedSerials.length === 0) {
                throw new Error('Serial numbers are required for serialized products');
            }
            if (cleanedSerials.length !== uniqueSerials.size) {
                throw new Error('Duplicate serial numbers not allowed');
            }
            finalStock = cleanedSerials.length;
        } else if (!Number.isInteger(finalStock) || finalStock < 0) {
            throw new Error('Stock quantity is required for non-serialized products');
        }

        await connection.beginTransaction();

        const [productResult] = await connection.query(
            `INSERT INTO products (
                part_number,
                name,
                brand,
                category,
                size,
                measurement,
                thread_type,
                cost_price,
                selling_price,
                stock,
                reorder_level,
                is_serialized
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                String(part_number).trim(),
                String(name).trim(),
                String(brand).trim(),
                String(category).trim(),
                String(size).trim(),
                isMissing(measurement) ? null : String(measurement).trim(),
                isMissing(thread_type) ? null : String(thread_type).trim(),
                Number(cost_price),
                Number(selling_price),
                finalStock,
                Number(reorder_level),
                serialized
            ]
        );

        const productId = productResult.insertId;

        if (unitIds.length > 0) {
            const compatibilityValues = unitIds.map(unitId => [productId, unitId]);
            await connection.query(
                'INSERT INTO product_compatibility (product_id, motorcycle_unit_id) VALUES ?',
                [compatibilityValues]
            );
        }

        if (groupIds.length > 0) {
            const groupValues = groupIds.map(groupId => [productId, groupId]);
            await connection.query(
                'INSERT INTO product_compatibility_groups (product_id, compatibility_group_id) VALUES ?',
                [groupValues]
            );
        }

        if (serialized) {
            const serialValues = cleanedSerials.map(serial => [productId, serial, 'available']);
            await connection.query(`INSERT INTO product_serials (product_id, serial_number, status) VALUES ?`, [serialValues]);
        }

        await connection.commit();
        res.status(201).json({ message: 'Product created successfully', productId });
    } catch (err) {
        await connection.rollback();
        console.error('Error creating product:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            if (err.message.includes('unique_part_brand')) {
                return res.status(400).json({ message: 'Duplicate part number and brand detected.' });
            }
            return res.status(400).json({ message: 'Duplicate serial number or compatibility detected.' });
        }
        res.status(400).json({ message: err.message || 'Error creating product' });
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
        name,
        brand,
        category,
        size,
        measurement,
        thread_type,
        cost_price,
        selling_price,
        reorder_level,
        stock,
        motorcycle_unit_ids
    } = req.body;

    const connection = await db.getConnection();
    try {
        if (isMissing(part_number)) throw new Error('Part number is required');
        if (isMissing(brand)) throw new Error('Brand is required');
        if (isMissing(name)) throw new Error('Product name is required');
        if (isMissing(category)) throw new Error('Category is required');
        if (isMissing(size)) throw new Error('Size is required');
        if (isMissing(cost_price)) throw new Error('Cost price is required');
        if (isMissing(selling_price)) throw new Error('Selling price is required');
        if (isMissing(reorder_level)) throw new Error('Reorder level is required');

        const unitIds = normalizeMotorcycleUnitIds(motorcycle_unit_ids);
        const groupIds = normalizeCompatibilityGroupIds(req.body.compatibility_group_ids);

        if (unitIds.length === 0 && groupIds.length === 0) {
            throw new Error('At least one motorcycle compatibility or group is required');
        }

        await connection.beginTransaction();

        const [existingRows] = await connection.query(
            'SELECT id, is_serialized, stock FROM products WHERE id = ? AND is_active = true FOR UPDATE',
            [id]
        );
        if (existingRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Product not found' });
        }

        const serialized = normalizeBoolean(existingRows[0].is_serialized);
        const finalStock = serialized ? existingRows[0].stock : Number(stock);
        if (!serialized && (!Number.isInteger(finalStock) || finalStock < 0)) {
            throw new Error('Stock quantity is required for non-serialized products');
        }

        await connection.query(
            `UPDATE products SET
                part_number = ?,
                name = ?,
                brand = ?,
                category = ?,
                size = ?,
                measurement = ?,
                thread_type = ?,
                cost_price = ?,
                selling_price = ?,
                stock = ?,
                reorder_level = ?
             WHERE id = ? AND is_active = true`,
            [
                String(part_number).trim(),
                String(name).trim(),
                String(brand).trim(),
                String(category).trim(),
                String(size).trim(),
                isMissing(measurement) ? null : String(measurement).trim(),
                isMissing(thread_type) ? null : String(thread_type).trim(),
                Number(cost_price),
                Number(selling_price),
                finalStock,
                Number(reorder_level),
                id
            ]
        );

        await connection.query('DELETE FROM product_compatibility WHERE product_id = ?', [id]);
        if (unitIds.length > 0) {
            await connection.query(
                'INSERT INTO product_compatibility (product_id, motorcycle_unit_id) VALUES ?',
                [unitIds.map(unitId => [id, unitId])]
            );
        }

        await connection.query('DELETE FROM product_compatibility_groups WHERE product_id = ?', [id]);
        if (groupIds.length > 0) {
            await connection.query(
                'INSERT INTO product_compatibility_groups (product_id, compatibility_group_id) VALUES ?',
                [groupIds.map(groupId => [id, groupId])]
            );
        }

        await connection.commit();
        res.json({ message: 'Product updated successfully' });
    } catch (err) {
        await connection.rollback();
        console.error('Error updating product:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            if (err.message.includes('unique_part_brand')) {
                return res.status(400).json({ message: 'Duplicate part number and brand detected.' });
            }
            return res.status(400).json({ message: 'Duplicate compatibility detected.' });
        }
        res.status(400).json({ message: err.message || 'Error updating product' });
    } finally {
        connection.release();
    }
};

// ==========================================
// DELETE PRODUCT (Soft Delete)
// ==========================================
exports.deleteProduct = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query('UPDATE products SET is_active = false WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Product not found' });
        res.json({ message: 'Product deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting product', error: err.message });
    }
};

// ==========================================
// GET AVAILABLE SERIALS (Used by POS)
// ==========================================
exports.getProductSerials = async (req, res) => {
    const { id } = req.params;
    try {
        const [serials] = await db.query("SELECT id, serial_number FROM product_serials WHERE product_id = ? AND status = 'available'", [id]);
        res.json(serials);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching serial numbers', error: err.message });
    }
};

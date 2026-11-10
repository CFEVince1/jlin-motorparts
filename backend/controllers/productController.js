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

const CANONICAL_CATEGORIES = {
    'ENG': 'Engine',
    'ENGINE': 'Engine',
    'ENGINE PARTS': 'Engine',
    'EXHAUST': 'Engine',
    'FILTERS': 'Engine',
    'BRK': 'Brakes',
    'BRAKES': 'Brakes',
    'CABLES': 'Brakes',
    'CHAS': 'Wheels',
    'SUSPENSION': 'Wheels',
    'WHEELS': 'Wheels',
    'TIRES': 'Wheels',
    'CHASSIS': 'Wheels',
    'CVT': 'CVT',
    'TRANSMISSION': 'CVT',
    'DRIVE': 'CVT',
    'ELEC': 'Electrical',
    'ELECTRICAL': 'Electrical',
    'ELECTRONICS': 'Electrical',
    'IGNITION': 'Electrical',
    'OIL': 'Oils',
    'OILS': 'Oils',
    'LUBRICANTS': 'Oils',
    'FLUIDS': 'Oils'
};

const normalizeCategory = (cat) => {
    if (!cat) return 'Engine';
    const upper = String(cat).trim().toUpperCase();
    return CANONICAL_CATEGORIES[upper] || 'Engine';
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
                shelf_location,
                COALESCE(stock, current_stock, 0) AS stock,
                COALESCE(stock, current_stock, 0) AS current_stock,
                reorder_level, is_serialized,
                supplier_id, supplier_name
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
                WHERE product_id IN (?) AND (status IN ('available', 'sold') OR status IS NULL)
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

            const unitSelling = Number(p.selling_price || p.retail_price || p.price || 0);
            const unitCost = Number(p.cost_price || 0);
            const maxDiscount = Math.max(0, Math.round((unitSelling - unitCost) * 100) / 100);

            return {
                ...p,
                cost_price: unitCost,
                max_discount: maxDiscount,
                max_allowable_discount: maxDiscount,
                shelf_location: p.shelf_location || '',
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
// VALIDATE PART NUMBER (REAL-TIME AUDIT)
// ==========================================
exports.validatePartNumber = async (req, res) => {
    try {
        const { part_number, excludeId } = req.query;
        if (!part_number || !String(part_number).trim()) {
            return res.json({ valid: false, message: 'Part number is required.' });
        }
        const trimmed = String(part_number).trim().toUpperCase();

        if (trimmed.length < 2) {
            return res.json({ valid: false, message: 'Part number must be at least 2 characters.' });
        }
        if (trimmed.length > 50) {
            return res.json({ valid: false, message: 'Part number cannot exceed 50 characters.' });
        }

        const partNumberRegex = /^[A-Z0-9-_./]+$/;
        if (!partNumberRegex.test(trimmed)) {
            return res.json({
                valid: false,
                message: 'Invalid characters. Only uppercase letters, numbers, hyphens (-), underscores (_), dots (.), and slashes (/) are allowed without spaces.'
            });
        }

        // Structural format check: must accept OEM motorcycle part number formats like "K59-A11" (alphanumeric, hyphens, dots)
        const partNumFormatRegex = /^[A-Z0-9]+([-.][A-Z0-9]+)*$/;
        if (!partNumFormatRegex.test(trimmed)) {
            return res.json({
                valid: false,
                message: 'Please enter a valid part number (e.g., K59-A11).'
            });
        }

        let query = 'SELECT id, name, part_number, brand FROM products WHERE (UPPER(part_number) = ? OR UPPER(sku) = ?) AND is_active = true';
        const params = [trimmed, trimmed];
        if (excludeId) {
            query += ' AND id != ?';
            params.push(Number(excludeId));
        }
        query += ' LIMIT 1';

        const [existing] = await db.query(query, params);
        if (existing.length > 0) {
            return res.json({
                valid: false,
                exists: true,
                message: `Part Number "${trimmed}" already exists in the catalog (${existing[0].name} [${existing[0].brand || 'Generic'}]). Use Stock Receive / Restock to add stock.`,
                product: existing[0]
            });
        }

        return res.json({ valid: true, exists: false, formatted: trimmed, message: 'Part number is valid and available.' });
    } catch (err) {
        console.error('validatePartNumber error:', err);
        res.status(500).json({ valid: false, message: 'Server error during part number validation' });
    }
};

// ==========================================
// VALIDATE SERIAL NUMBERS (REAL-TIME AUDIT)
// ==========================================
exports.validateSerials = async (req, res) => {
    try {
        const { serial_numbers } = req.body;
        const cleaned = normalizeSerialNumbers(serial_numbers).map(s => s.toUpperCase());

        if (cleaned.length === 0) {
            return res.json({ valid: true, count: 0, serials: [] });
        }

        const invalidSerials = [];
        const numericSerialRegex = /^\d{9,15}$/;
        for (const s of cleaned) {
            if (!numericSerialRegex.test(s)) {
                invalidSerials.push(s);
            }
        }
        if (invalidSerials.length > 0) {
            return res.json({
                valid: false,
                message: 'Serial numbers must contain numbers only and be between 9 to 15 digits long (e.g., 10029384751).',
                invalidSerials
            });
        }

        const duplicates = cleaned.filter((item, index) => cleaned.indexOf(item) !== index);
        const uniqueDuplicates = [...new Set(duplicates)];
        if (uniqueDuplicates.length > 0) {
            return res.json({
                valid: false,
                message: `Duplicate serial number(s) in entry: ${uniqueDuplicates.join(', ')}`,
                duplicates: uniqueDuplicates
            });
        }

        const [existingRows] = await db.query(
            'SELECT serial_number FROM product_serials WHERE UPPER(serial_number) IN (?) LIMIT 10',
            [cleaned]
        );
        if (existingRows.length > 0) {
            const existingList = existingRows.map(r => r.serial_number);
            return res.json({
                valid: false,
                exists: true,
                message: `Serial number(s) already exist in database: ${existingList.join(', ')}`,
                existingSerials: existingList
            });
        }

        return res.json({
            valid: true,
            count: cleaned.length,
            serials: cleaned,
            message: `All ${cleaned.length} serial numbers are valid and unique.`
        });
    } catch (err) {
        console.error('validateSerials error:', err);
        res.status(500).json({ valid: false, message: 'Server error during serial validation' });
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
        part_name,
        brand,
        category,
        size,
        measurement,
        thread_type,
        cost_price,
        supplier_cost,
        markup_percentage,
        selling_price,
        retail_price,
        reorder_level,
        is_serialized,
        shelf_location,
        stock,
        initial_stock,
        initial_stock_quantity,
        serial_numbers,
        motorcycle_unit_ids
    } = req.body;

    const connection = await db.getConnection();
    try {
        const resolvedPartNumber = String(part_number || sku || '').trim();
        if (isMissing(resolvedPartNumber)) throw new Error('Part number is required');
        const trimmedPartNumber = resolvedPartNumber.toUpperCase();

        if (trimmedPartNumber.length < 2 || trimmedPartNumber.length > 50) {
            throw new Error('Part number must be between 2 and 50 characters');
        }
        const partNumberRegex = /^[A-Z0-9]+([-.][A-Z0-9]+)*$/;
        if (!partNumberRegex.test(trimmedPartNumber)) {
            throw new Error('Please enter a valid part number (e.g., K59-A11).');
        }

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
        if (!Number.isFinite(parsedReorder) || !Number.isInteger(parsedReorder) || parsedReorder < 1) {
            throw new Error('Reorder level must be a positive whole number of at least 1 (e.g. 5)');
        }

        const trimmedBrand = String(brand || '').trim();

        const unitIds = normalizeMotorcycleUnitIds(motorcycle_unit_ids);
        const groupIds = normalizeCompatibilityGroupIds(req.body.compatibility_group_ids);

        const serialized = normalizeBoolean(is_serialized);
        const cleanedSerials = serialized ? normalizeSerialNumbers(serial_numbers).map(s => s.toUpperCase()) : [];
        const uniqueSerials = new Set(cleanedSerials);

        if (serialized) {
            if (cleanedSerials.length > 0) {
                const invalidSerials = [];
                const numericSerialRegex = /^\d{9,15}$/;
                for (const s of cleanedSerials) {
                    if (!numericSerialRegex.test(s)) {
                        invalidSerials.push(s);
                    }
                }
                if (invalidSerials.length > 0) {
                    return res.status(400).json({ 
                        message: 'Serial numbers must contain numbers only and be between 9 to 15 digits long (e.g., 10029384751).' 
                    });
                }
                if (cleanedSerials.length !== uniqueSerials.size) {
                    const dupes = [...new Set(cleanedSerials.filter((item, index) => cleanedSerials.indexOf(item) !== index))];
                    return res.status(400).json({ message: `Duplicate serial number(s) within submission: ${dupes.join(', ')}` });
                }
            }
        }

        // Determine Initial Stock Quantity
        const rawInitialStock = initial_stock !== undefined
            ? initial_stock
            : (initial_stock_quantity !== undefined ? initial_stock_quantity : stock);

        let finalStock = 0;
        if (serialized) {
            finalStock = cleanedSerials.length;
        } else {
            if (rawInitialStock === undefined || rawInitialStock === null || rawInitialStock === '') {
                throw new Error('Initial stock quantity is required');
            }
            const parsedStock = Number(rawInitialStock);
            if (!Number.isFinite(parsedStock) || !Number.isInteger(parsedStock) || parsedStock < 0) {
                throw new Error('Initial stock quantity must be a non-negative whole number');
            }
            finalStock = parsedStock;
        }

        await connection.beginTransaction();

        // Check duplicate part_number/SKU across active products
        const [existing] = await connection.query(
            'SELECT id, name, part_number, brand FROM products WHERE (UPPER(part_number) = ? OR UPPER(sku) = ?) AND is_active = true LIMIT 1',
            [trimmedPartNumber, trimmedPartNumber]
        );
        if (existing.length > 0) {
            await connection.rollback();
            return res.status(400).json({ 
                message: `Part Number "${trimmedPartNumber}" already exists in the catalog (Product: "${existing[0].name}" [${existing[0].brand || 'Generic'}]). To add more quantity, please use the Stock Receive or Restock process instead of creating a duplicate.` 
            });
        }

        if (serialized && cleanedSerials.length > 0) {
            const [existingSerials] = await connection.query(
                'SELECT serial_number FROM product_serials WHERE UPPER(serial_number) IN (?) LIMIT 5',
                [cleanedSerials]
            );
            if (existingSerials.length > 0) {
                await connection.rollback();
                const dupList = existingSerials.map(r => r.serial_number).join(', ');
                return res.status(400).json({ message: `Serial number(s) already exist in the database: ${dupList}` });
            }
        }

        const resolvedPartName = String(name || part_name || '').trim();
        const resolvedShelfLocation = shelf_location ? String(shelf_location).trim() : null;

        const supplierId = req.body.supplier_id ? Number(req.body.supplier_id) : null;
        let supplierName = req.body.supplier_name ? String(req.body.supplier_name).trim() : null;
        if (supplierId && !supplierName) {
            const [supRow] = await connection.query('SELECT name FROM suppliers WHERE id = ?', [supplierId]);
            if (supRow.length > 0) supplierName = supRow[0].name;
        }

        const [productResult] = await connection.query(
            `INSERT INTO products (
                part_number,
                sku,
                name,
                part_name,
                brand,
                category,
                shelf_location,
                size,
                measurement,
                thread_type,
                cost_price,
                supplier_cost,
                markup_percentage,
                selling_price,
                retail_price,
                stock,
                current_stock,
                sellable_stock,
                reorder_level,
                is_serialized,
                supplier_id,
                supplier_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?)`,
            [
                String(part_number).trim(),
                String(part_number).trim(),
                resolvedPartName,
                resolvedPartName,
                trimmedBrand,
                normalizeCategory(category),
                resolvedShelfLocation,
                String(size || '').trim(),
                isMissing(measurement) ? null : String(measurement).trim(),
                isMissing(thread_type) ? null : String(thread_type).trim(),
                parsedCost,
                parsedCost,
                parsedMarkup,
                computedSelling,
                computedSelling,
                Number(reorder_level),
                serialized,
                supplierId,
                supplierName
            ]
        );

        const productId = productResult.insertId;

        // Fetch DB Date string for reference number
        const [dateRows] = await connection.query(`SELECT DATE_FORMAT(NOW(), '%Y%m%d') as db_date;`);
        const dbDate = dateRows[0]?.db_date || new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const [[countRow]] = await connection.query(
            `SELECT COUNT(*) as cnt FROM inventory_transactions WHERE transaction_type = 'OPENING_BALANCE' AND DATE(created_at) = CURRENT_DATE()`
        );
        const seq = String((countRow?.cnt || 0) + 1).padStart(2, '0');
        const refNo = `OPENING-${dbDate}-${seq}`;
        const userId = req.user?.id || null;

        if (serialized && cleanedSerials.length > 0) {
            const serialValues = cleanedSerials.map(serial => [productId, serial, 1, 'available']);
            await connection.query(
                `INSERT INTO product_serials (product_id, serial_number, quantity, status) VALUES ?`,
                [serialValues]
            );
        }

        // Insert initial OPENING_BALANCE ledger entry in the SAME transaction
        await applyMovement(connection, {
            itemId: productId,
            transactionType: 'OPENING_BALANCE',
            quantityChange: finalStock,
            referenceNo: refNo,
            unitCost: parsedCost,
            remarks: finalStock > 0 
                ? (serialized 
                    ? `Initial opening stock (${finalStock} serialized units: ${cleanedSerials.join(', ')}) for ${resolvedPartName}`
                    : `Initial opening stock (${finalStock} units) for ${resolvedPartName}`)
                : `Initial baseline OPENING_BALANCE for new product ${resolvedPartName} (${trimmedPartNumber})`,
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
        const [newProductRows] = await connection.query('SELECT * FROM products WHERE id = ?', [productId]);
        const createdProduct = newProductRows[0] || {
            id: productId,
            name: resolvedPartName,
            part_number: trimmedPartNumber,
            brand: trimmedBrand,
            category: String(category).trim(),
            cost_price: parsedCost,
            selling_price: computedSelling,
            stock: finalStock,
            current_stock: finalStock,
            sellable_stock: finalStock,
            reorder_level: parsedReorder,
            is_serialized: serialized
        };
        res.status(201).json({ 
            message: 'Product created successfully', 
            productId,
            product: createdProduct
        });
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
        shelf_location,
        stock,
        motorcycle_unit_ids
    } = req.body;

    const connection = await db.getConnection();
    try {
        const resolvedPartNumber = String(part_number || sku || '').trim();
        if (isMissing(resolvedPartNumber)) throw new Error('Part number is required');
        const trimmedPartNumber = resolvedPartNumber.toUpperCase();

        if (trimmedPartNumber.length < 2 || trimmedPartNumber.length > 50) {
            throw new Error('Part number must be between 2 and 50 characters');
        }
        const partNumberRegex = /^[A-Z0-9]+([-.][A-Z0-9]+)*$/;
        if (!partNumberRegex.test(trimmedPartNumber)) {
            throw new Error('Please enter a valid part number (e.g., K59-A11).');
        }

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
        if (!Number.isFinite(parsedReorder) || parsedReorder < 1) {
            throw new Error('Reorder level must be a valid whole number of at least 1');
        }

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

        const supplierId = req.body.supplier_id !== undefined ? (req.body.supplier_id ? Number(req.body.supplier_id) : null) : (existingProduct.supplier_id || null);
        let supplierName = req.body.supplier_name !== undefined ? (req.body.supplier_name ? String(req.body.supplier_name).trim() : null) : (existingProduct.supplier_name || null);
        if (supplierId && !supplierName) {
            const [supRow] = await connection.query('SELECT name FROM suppliers WHERE id = ?', [supplierId]);
            if (supRow.length > 0) supplierName = supRow[0].name;
        }

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
                reorder_level = ?,
                shelf_location = ?,
                supplier_id = ?,
                supplier_name = ?
             WHERE id = ? AND is_active = true`,
            [
                String(part_number).trim(),
                String(part_number).trim(),
                String(name).trim(),
                trimmedBrand,
                normalizeCategory(category),
                String(size || '').trim(),
                isMissing(measurement) ? null : String(measurement).trim(),
                isMissing(thread_type) ? null : String(thread_type).trim(),
                parsedCost,
                parsedMarkup,
                computedSelling,
                computedSelling,
                Number(reorder_level),
                String(req.body.shelf_location || req.body.shelfLocation || '').trim(),
                supplierId,
                supplierName,
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
// GET AVAILABLE SERIALS (Used by POS and Adjustment)
// ==========================================
exports.getProductSerials = async (req, res) => {
    const { id } = req.params;
    const includeSold = req.query.include_sold === 'true' || req.query.all === 'true';
    try {
        const query = includeSold
            ? "SELECT id, serial_number, quantity, status FROM product_serials WHERE product_id = ? AND (status IN ('available', 'sold') OR status IS NULL) ORDER BY serial_number ASC"
            : "SELECT id, serial_number, quantity, status FROM product_serials WHERE product_id = ? AND (status = 'available' OR status IS NULL) AND quantity > 0 ORDER BY serial_number ASC";
        const [serials] = await db.query(query, [id]);
        res.json(serials);
    } catch (err) {
        console.error('Error fetching serial numbers:', err);
        res.status(500).json({ message: 'Error fetching serial numbers' });
    }
};

// ==========================================
// APPROVE / UPDATE PRICE REVIEW (Admin Only)

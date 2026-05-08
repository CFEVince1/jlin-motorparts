const db = require('../config/db');

// Helper
const isMissing = (value) => value === undefined || value === null || String(value).trim() === '';

const normalizeUnitIds = (ids) => {
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.map(id => Number(id)).filter(Number.isInteger))];
};

// ==========================================
// MOTORCYCLE UNITS CRUD
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

exports.createMotorcycleUnit = async (req, res) => {
    const { brand, model, year_model } = req.body;
    try {
        if (isMissing(brand)) throw new Error('Brand is required');
        if (isMissing(model)) throw new Error('Model is required');

        const [result] = await db.query(
            'INSERT INTO motorcycle_units (brand, model, year_model) VALUES (?, ?, ?)',
            [String(brand).trim(), String(model).trim(), isMissing(year_model) ? null : String(year_model).trim()]
        );
        res.status(201).json({ message: 'Motorcycle unit created successfully', id: result.insertId });
    } catch (err) {
        console.error('Error creating motorcycle unit:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'This motorcycle unit already exists.' });
        }
        res.status(400).json({ message: err.message || 'Error creating motorcycle unit' });
    }
};

exports.updateMotorcycleUnit = async (req, res) => {
    const { id } = req.params;
    const { brand, model, year_model } = req.body;
    try {
        if (isMissing(brand)) throw new Error('Brand is required');
        if (isMissing(model)) throw new Error('Model is required');

        const [result] = await db.query(
            'UPDATE motorcycle_units SET brand = ?, model = ?, year_model = ? WHERE id = ?',
            [String(brand).trim(), String(model).trim(), isMissing(year_model) ? null : String(year_model).trim(), id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Motorcycle unit not found' });
        res.json({ message: 'Motorcycle unit updated successfully' });
    } catch (err) {
        console.error('Error updating motorcycle unit:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'This motorcycle unit already exists.' });
        }
        res.status(400).json({ message: err.message || 'Error updating motorcycle unit' });
    }
};

exports.deleteMotorcycleUnit = async (req, res) => {
    const { id } = req.params;
    try {
        // Due to ON DELETE CASCADE, this will also remove from product_compatibility and compatibility_group_units
        const [result] = await db.query('DELETE FROM motorcycle_units WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Motorcycle unit not found' });
        res.json({ message: 'Motorcycle unit deleted successfully' });
    } catch (err) {
        console.error('Error deleting motorcycle unit:', err);
        res.status(500).json({ message: 'Error deleting motorcycle unit', error: err.message });
    }
};

// ==========================================
// COMPATIBILITY GROUPS CRUD
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

exports.createCompatibilityGroup = async (req, res) => {
    const { group_name, description, motorcycle_unit_ids } = req.body;
    const connection = await db.getConnection();
    try {
        if (isMissing(group_name)) throw new Error('Group name is required');
        const unitIds = normalizeUnitIds(motorcycle_unit_ids);

        await connection.beginTransaction();

        const [groupResult] = await connection.query(
            'INSERT INTO compatibility_groups (group_name, description) VALUES (?, ?)',
            [String(group_name).trim(), isMissing(description) ? null : String(description).trim()]
        );
        const groupId = groupResult.insertId;

        if (unitIds.length > 0) {
            const values = unitIds.map(unitId => [groupId, unitId]);
            await connection.query(
                'INSERT INTO compatibility_group_units (compatibility_group_id, motorcycle_unit_id) VALUES ?',
                [values]
            );
        }

        await connection.commit();
        res.status(201).json({ message: 'Compatibility group created successfully', id: groupId });
    } catch (err) {
        await connection.rollback();
        console.error('Error creating compatibility group:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'This group name already exists.' });
        }
        res.status(400).json({ message: err.message || 'Error creating compatibility group' });
    } finally {
        connection.release();
    }
};

exports.updateCompatibilityGroup = async (req, res) => {
    const { id } = req.params;
    const { group_name, description, motorcycle_unit_ids } = req.body;
    const connection = await db.getConnection();
    try {
        if (isMissing(group_name)) throw new Error('Group name is required');
        const unitIds = normalizeUnitIds(motorcycle_unit_ids);

        await connection.beginTransaction();

        const [groupResult] = await connection.query(
            'UPDATE compatibility_groups SET group_name = ?, description = ? WHERE id = ?',
            [String(group_name).trim(), isMissing(description) ? null : String(description).trim(), id]
        );
        if (groupResult.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Compatibility group not found' });
        }

        await connection.query('DELETE FROM compatibility_group_units WHERE compatibility_group_id = ?', [id]);
        
        if (unitIds.length > 0) {
            const values = unitIds.map(unitId => [id, unitId]);
            await connection.query(
                'INSERT INTO compatibility_group_units (compatibility_group_id, motorcycle_unit_id) VALUES ?',
                [values]
            );
        }

        await connection.commit();
        res.json({ message: 'Compatibility group updated successfully' });
    } catch (err) {
        await connection.rollback();
        console.error('Error updating compatibility group:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'This group name already exists.' });
        }
        res.status(400).json({ message: err.message || 'Error updating compatibility group' });
    } finally {
        connection.release();
    }
};

exports.deleteCompatibilityGroup = async (req, res) => {
    const { id } = req.params;
    try {
        // Due to ON DELETE CASCADE, this will remove from compatibility_group_units and product_compatibility_groups
        const [result] = await db.query('DELETE FROM compatibility_groups WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Compatibility group not found' });
        res.json({ message: 'Compatibility group deleted successfully' });
    } catch (err) {
        console.error('Error deleting compatibility group:', err);
        res.status(500).json({ message: 'Error deleting compatibility group', error: err.message });
    }
};

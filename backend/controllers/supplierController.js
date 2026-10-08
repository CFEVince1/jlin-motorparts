const db = require('../config/db');
const { AppValidationError, AppNotFoundError } = require('../utils/errors');

/**
 * Supplier Controller
 * Handles vendor master data for receiving records and purchasing.
 */

// Helper: check if string is null/undefined/empty
const isMissing = (value) => value === undefined || value === null || String(value).trim() === '';

/**
 * GET /api/suppliers
 * Fetch all active suppliers (or all with query ?includeInactive=true)
 */
exports.getSuppliers = async (req, res, next) => {
    try {
        const includeInactive = req.query.includeInactive === 'true';
        let query = `
            SELECT id, name, contact_person, email, phone, address, is_active, created_at, updated_at
            FROM suppliers
        `;
        const params = [];

        if (!includeInactive) {
            query += ' WHERE is_active = TRUE';
        }

        query += ' ORDER BY name ASC';

        const [suppliers] = await db.query(query, params);
        res.json(suppliers);
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/suppliers/:id
 * Fetch single supplier by ID
 */
exports.getSupplierById = async (req, res, next) => {
    try {
        const supplierId = Number(req.params.id);
        if (!supplierId) {
            throw new AppValidationError('Invalid supplier ID');
        }

        const [suppliers] = await db.query(
            'SELECT id, name, contact_person, email, phone, address, is_active, created_at, updated_at FROM suppliers WHERE id = ?',
            [supplierId]
        );

        if (suppliers.length === 0) {
            throw new AppNotFoundError('Supplier not found');
        }

        res.json(suppliers[0]);
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/suppliers
 * Register new supplier vendor
 * Required: name (unique)
 * Optional: contact_person, phone, email, address
 */
exports.createSupplier = async (req, res, next) => {
    try {
        const { name, contact_person, phone, email, address } = req.body;

        if (isMissing(name)) {
            throw new AppValidationError('Supplier name is required');
        }

        const trimmedName = String(name).trim();
        const trimmedContact = isMissing(contact_person) ? null : String(contact_person).trim();
        const trimmedPhone = isMissing(phone) ? null : String(phone).trim();
        const trimmedEmail = isMissing(email) ? null : String(email).trim();
        const trimmedAddress = isMissing(address) ? null : String(address).trim();

        // Check if supplier name already exists (case-insensitive)
        const [existing] = await db.query(
            'SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?) LIMIT 1',
            [trimmedName]
        );

        if (existing.length > 0) {
            throw new AppValidationError(`Supplier with name "${trimmedName}" already exists`);
        }

        const [result] = await db.query(
            `INSERT INTO suppliers (name, contact_person, email, phone, address, is_active)
             VALUES (?, ?, ?, ?, ?, TRUE)`,
            [trimmedName, trimmedContact, trimmedEmail, trimmedPhone, trimmedAddress]
        );

        const newId = result.insertId;
        const [created] = await db.query(
            'SELECT id, name, contact_person, email, phone, address, is_active, created_at, updated_at FROM suppliers WHERE id = ?',
            [newId]
        );

        res.status(201).json({
            message: 'Supplier registered successfully',
            supplier: created[0]
        });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(422).json({
                message: 'A supplier with this name already exists',
                errors: [{ field: 'name', message: 'Supplier name must be unique' }]
            });
        }
        next(err);
    }
};

/**
 * PUT /api/suppliers/:id
 * Update vendor details
 * Whitelist: name, contact_person, phone, email, address, is_active
 */
exports.updateSupplier = async (req, res, next) => {
    try {
        const supplierId = Number(req.params.id);
        if (!supplierId) {
            throw new AppValidationError('Invalid supplier ID');
        }

        const [existing] = await db.query(
            'SELECT id, name, contact_person, email, phone, address, is_active FROM suppliers WHERE id = ?',
            [supplierId]
        );

        if (existing.length === 0) {
            throw new AppNotFoundError('Supplier not found');
        }

        const { name, contact_person, phone, email, address, is_active } = req.body;

        const updatedName = !isMissing(name) ? String(name).trim() : existing[0].name;
        const updatedContact = contact_person !== undefined ? (isMissing(contact_person) ? null : String(contact_person).trim()) : existing[0].contact_person;
        const updatedPhone = phone !== undefined ? (isMissing(phone) ? null : String(phone).trim()) : existing[0].phone;
        const updatedEmail = email !== undefined ? (isMissing(email) ? null : String(email).trim()) : existing[0].email;
        const updatedAddress = address !== undefined ? (isMissing(address) ? null : String(address).trim()) : existing[0].address;
        const updatedIsActive = is_active !== undefined ? Boolean(is_active) : existing[0].is_active;

        if (isMissing(updatedName)) {
            throw new AppValidationError('Supplier name cannot be empty');
        }

        // Check uniqueness if name changed
        if (updatedName.toLowerCase() !== existing[0].name.toLowerCase()) {
            const [duplicate] = await db.query(
                'SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1',
                [updatedName, supplierId]
            );
            if (duplicate.length > 0) {
                throw new AppValidationError(`Supplier with name "${updatedName}" already exists`);
            }
        }

        await db.query(
            `UPDATE suppliers 
             SET name = ?, contact_person = ?, email = ?, phone = ?, address = ?, is_active = ?, updated_at = NOW()
             WHERE id = ?`,
            [updatedName, updatedContact, updatedEmail, updatedPhone, updatedAddress, updatedIsActive, supplierId]
        );

        const [refetched] = await db.query(
            'SELECT id, name, contact_person, email, phone, address, is_active, created_at, updated_at FROM suppliers WHERE id = ?',
            [supplierId]
        );

        res.json({
            message: 'Supplier updated successfully',
            supplier: refetched[0]
        });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(422).json({
                message: 'A supplier with this name already exists',
                errors: [{ field: 'name', message: 'Supplier name must be unique' }]
            });
        }
        next(err);
    }
};

/**
 * DELETE /api/suppliers/:id (Soft-delete or deactivate)
 */
exports.deleteSupplier = async (req, res, next) => {
    try {
        const supplierId = Number(req.params.id);
        if (!supplierId) {
            throw new AppValidationError('Invalid supplier ID');
        }

        const [result] = await db.query(
            'UPDATE suppliers SET is_active = FALSE, updated_at = NOW() WHERE id = ?',
            [supplierId]
        );

        if (result.affectedRows === 0) {
            throw new AppNotFoundError('Supplier not found');
        }

        res.json({ message: 'Supplier deactivated successfully' });
    } catch (err) {
        next(err);
    }
};

const db = require('../config/db');
const { AppValidationError, AppNotFoundError } = require('../utils/errors');

/**
 * Supplier Controller
 * Handles vendor master data for receiving records and purchasing.
 */

// Helper: check if string is null/undefined/empty
const isMissing = (value) => value === undefined || value === null || String(value).trim() === '';

// Helper: robust boolean parser (handles boolean, numbers, and strings like "false", "0", "true", "1")
const normalizeBoolean = (value, defaultValue = true) => {
    if (value === undefined || value === null) return defaultValue;
    if (value === true || value === 1 || value === '1' || value === 'true' || value === 'TRUE') return true;
    if (value === false || value === 0 || value === '0' || value === 'false' || value === 'FALSE') return false;
    return Boolean(value);
};

/**
 * GET /api/suppliers
 * Fetch all active suppliers (or all with query ?includeInactive=true)
 */
exports.getSuppliers = async (req, res, next) => {
    try {
        const includeInactive = req.query.includeInactive === 'true' || req.query.includeInactive === '1';
        let query = `
            SELECT s.id, s.name, s.fb_page_name, s.seller_contact_name, s.contact_person, s.email, s.phone, 
                   s.messenger_url, s.facebook_page_url, s.gcash_account_name, s.gcash_account_number, 
                   s.bank_details, s.category_tags, s.address, s.is_active, s.created_at, s.updated_at,
                   COALESCE((SELECT SUM(total_order_cost) FROM supplier_orders WHERE supplier_id = s.id AND order_status != 'Cancelled'), 0) AS total_po_billed,
                   COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = s.id), 0) AS total_payments_sent,
                   0 AS pre_acceptance_credits
            FROM suppliers s
        `;
        const params = [];

        if (!includeInactive) {
            query += ' WHERE is_active = TRUE';
        }

        query += ' ORDER BY name ASC';

        const [suppliers] = await db.query(query, params);
        const mapped = suppliers.map(s => {
            const billed = Number(s.total_po_billed || 0);
            const paid = Number(s.total_payments_sent || 0);
            const credits = Number(s.pre_acceptance_credits || 0);
            // Net Balance = What we owe the supplier (Billed - Paid - Credits)
            const netBalance = billed - paid - credits;
            return {
                ...s,
                total_po_billed: billed,
                total_payments_sent: paid,
                pre_acceptance_credits: credits,
                net_balance: netBalance
            };
        });
        res.json(mapped);
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
            `SELECT id, name, fb_page_name, seller_contact_name, contact_person, email, phone, 
                    messenger_url, facebook_page_url, gcash_account_name, gcash_account_number, 
                    bank_details, address, is_active, created_at, updated_at 
             FROM suppliers WHERE id = ?`,
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
 */
exports.createSupplier = async (req, res, next) => {
    try {
        const { 
            name, 
            fb_page_name, 
            seller_contact_name, 
            contact_person, 
            phone, 
            email, 
            messenger_url, 
            facebook_page_url, 
            gcash_account_name, 
            gcash_account_number, 
            bank_details, 
            category_tags,
            address, 
            is_active 
        } = req.body;

        if (isMissing(name)) {
            throw new AppValidationError('Supplier name is required');
        }

        const trimmedName = String(name).trim();
        if (!/[a-zA-Z]/.test(trimmedName) || trimmedName.replace(/[^a-zA-Z]/g, '').length < 2) {
            throw new AppValidationError('Supplier name must contain at least 2 letters and cannot be purely numbers');
        }

        const trimmedContact = isMissing(contact_person) 
            ? (isMissing(seller_contact_name) ? null : String(seller_contact_name).trim()) 
            : String(contact_person).trim();

        if (trimmedContact) {
            if (/\d/.test(trimmedContact) || !/^[a-zA-Z\s.'-]+$/.test(trimmedContact) || trimmedContact.replace(/[^a-zA-Z]/g, '').length < 2) {
                throw new AppValidationError('Contact person cannot contain numbers and must contain only letters and spaces');
            }
        }

        const trimmedPhone = isMissing(phone) ? null : String(phone).trim();
        if (trimmedPhone) {
            if (/[a-zA-Z]/.test(trimmedPhone) || !/^[0-9+\-()\s]{7,20}$/.test(trimmedPhone) || trimmedPhone.replace(/[^0-9]/g, '').length < 7) {
                throw new AppValidationError('Contact phone must be a valid phone number and cannot contain letters');
            }
        }

        const trimmedEmail = isMissing(email) ? null : String(email).trim();
        if (trimmedEmail) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
                throw new AppValidationError('Please enter a valid email address');
            }
        }

        const cleanFbPage = isMissing(fb_page_name) ? trimmedName : String(fb_page_name).trim();
        const cleanSellerContact = isMissing(seller_contact_name) ? trimmedContact : String(seller_contact_name).trim();
        const cleanMessenger = isMissing(messenger_url) ? null : String(messenger_url).trim();
        const cleanFbUrl = isMissing(facebook_page_url) ? null : String(facebook_page_url).trim();
        const cleanGcashName = isMissing(gcash_account_name) ? null : String(gcash_account_name).trim();
        const cleanGcashNum = isMissing(gcash_account_number) ? null : String(gcash_account_number).trim();
        const cleanBank = isMissing(bank_details) ? null : String(bank_details).trim();
        const trimmedAddress = isMissing(address) ? null : String(address).trim();
        const activeStatus = is_active !== undefined ? normalizeBoolean(is_active, true) : true;

        // Check if supplier name already exists (case-insensitive)
        const [existing] = await db.query(
            'SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?) LIMIT 1',
            [trimmedName]
        );

        if (existing.length > 0) {
            throw new AppValidationError(`Supplier with name "${trimmedName}" already exists`);
        }

        const [result] = await db.query(
            `INSERT INTO suppliers (
                name, fb_page_name, seller_contact_name, contact_person, email, phone, 
                messenger_url, facebook_page_url, gcash_account_name, gcash_account_number, 
                bank_details, address, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                trimmedName, cleanFbPage, cleanSellerContact, trimmedContact, trimmedEmail, trimmedPhone,
                cleanMessenger, cleanFbUrl, cleanGcashName, cleanGcashNum, cleanBank, trimmedAddress,
                activeStatus ? 1 : 0
            ]
        );

        const newId = result.insertId;
        const [created] = await db.query(
            `SELECT id, name, fb_page_name, seller_contact_name, contact_person, email, phone, 
                    messenger_url, facebook_page_url, gcash_account_name, gcash_account_number, 
                    bank_details, address, is_active, created_at, updated_at 
             FROM suppliers WHERE id = ?`,
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

        const { 
            name, 
            fb_page_name, 
            seller_contact_name, 
            contact_person, 
            phone, 
            email, 
            messenger_url, 
            facebook_page_url, 
            gcash_account_name, 
            gcash_account_number, 
            bank_details, 
            address, 
            is_active 
        } = req.body;

        const updatedName = !isMissing(name) ? String(name).trim() : existing[0].name;
        const updatedFbPage = fb_page_name !== undefined ? (isMissing(fb_page_name) ? null : String(fb_page_name).trim()) : existing[0].fb_page_name;
        const updatedSellerContact = seller_contact_name !== undefined ? (isMissing(seller_contact_name) ? null : String(seller_contact_name).trim()) : existing[0].seller_contact_name;
        const updatedContact = contact_person !== undefined ? (isMissing(contact_person) ? null : String(contact_person).trim()) : existing[0].contact_person;
        const updatedPhone = phone !== undefined ? (isMissing(phone) ? null : String(phone).trim()) : existing[0].phone;
        const updatedEmail = email !== undefined ? (isMissing(email) ? null : String(email).trim()) : existing[0].email;
        const updatedMessenger = messenger_url !== undefined ? (isMissing(messenger_url) ? null : String(messenger_url).trim()) : existing[0].messenger_url;
        const updatedFbUrl = facebook_page_url !== undefined ? (isMissing(facebook_page_url) ? null : String(facebook_page_url).trim()) : existing[0].facebook_page_url;
        const updatedGcashName = gcash_account_name !== undefined ? (isMissing(gcash_account_name) ? null : String(gcash_account_name).trim()) : existing[0].gcash_account_name;
        const updatedGcashNum = gcash_account_number !== undefined ? (isMissing(gcash_account_number) ? null : String(gcash_account_number).trim()) : existing[0].gcash_account_number;
        const updatedBank = bank_details !== undefined ? (isMissing(bank_details) ? null : String(bank_details).trim()) : existing[0].bank_details;
        const updatedAddress = address !== undefined ? (isMissing(address) ? null : String(address).trim()) : existing[0].address;
        const updatedIsActive = is_active !== undefined
            ? normalizeBoolean(is_active, Boolean(existing[0].is_active))
            : Boolean(existing[0].is_active);

        if (isMissing(updatedName)) {
            throw new AppValidationError('Supplier name cannot be empty');
        }
        if (!/[a-zA-Z]/.test(updatedName) || updatedName.replace(/[^a-zA-Z]/g, '').length < 2) {
            throw new AppValidationError('Supplier name must contain at least 2 letters and cannot be purely numbers');
        }

        if (updatedContact) {
            if (/\d/.test(updatedContact) || !/^[a-zA-Z\s.'-]+$/.test(updatedContact) || updatedContact.replace(/[^a-zA-Z]/g, '').length < 2) {
                throw new AppValidationError('Contact person cannot contain numbers and must contain only letters and spaces');
            }
        }

        if (updatedPhone) {
            if (/[a-zA-Z]/.test(updatedPhone) || !/^[0-9+\-()\s]{7,20}$/.test(updatedPhone) || updatedPhone.replace(/[^0-9]/g, '').length < 7) {
                throw new AppValidationError('Contact phone must be a valid phone number and cannot contain letters');
            }
        }

        if (updatedEmail) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updatedEmail)) {
                throw new AppValidationError('Please enter a valid email address');
            }
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
             SET name = ?, fb_page_name = ?, seller_contact_name = ?, contact_person = ?, 
                 email = ?, phone = ?, messenger_url = ?, facebook_page_url = ?, 
                 gcash_account_name = ?, gcash_account_number = ?, bank_details = ?, 
                 category_tags = ?, address = ?, is_active = ?, updated_at = NOW()
             WHERE id = ?`,
            [
                updatedName, updatedFbPage, updatedSellerContact, updatedContact, 
                updatedEmail, updatedPhone, updatedMessenger, updatedFbUrl, 
                updatedGcashName, updatedGcashNum, updatedBank, 
                updatedCategoryTags, updatedAddress, 
                updatedIsActive ? 1 : 0, supplierId
            ]
        );

        const [refetched] = await db.query(
            `SELECT id, name, fb_page_name, seller_contact_name, contact_person, email, phone, 
                    messenger_url, facebook_page_url, gcash_account_name, gcash_account_number, 
                    bank_details, address, is_active, created_at, updated_at 
             FROM suppliers WHERE id = ?`,
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

/**
 * ============================================================================
 * SECTION 6: SUPPLIER PAYMENT PROOFS & MESSENGER QUOTES (MIDDLE BRANCH)
 * ============================================================================
 */

/**
 * GET /api/suppliers/proofs
 * Central gallery of uploaded GCash/Bank transfer screenshots, courier waybills,
 * and Messenger price agreements linked to suppliers.
 */
exports.getProofs = async (req, res, next) => {
    try {
        const { supplier_id, proof_type, search } = req.query;
        let query = `
            SELECT p.*, s.name AS supplier_name, s.fb_page_name, s.messenger_url, s.gcash_account_number
            FROM supplier_proofs p
            JOIN suppliers s ON s.id = p.supplier_id
            WHERE 1=1
        `;
        const params = [];

        if (supplier_id && supplier_id !== 'ALL') {
            query += ' AND p.supplier_id = ?';
            params.push(Number(supplier_id));
        }

        if (proof_type && proof_type !== 'ALL') {
            query += ' AND p.proof_type = ?';
            params.push(proof_type);
        }

        if (search && search.trim()) {
            query += ' AND (p.title LIKE ? OR p.reference_no LIKE ? OR p.notes LIKE ? OR s.name LIKE ?)';
            const term = `%${search.trim()}%`;
            params.push(term, term, term, term);
        }

        query += ' ORDER BY p.created_at DESC';

        const [proofs] = await db.query(query, params);
        res.json(proofs);
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/suppliers/proofs
 * Upload / link new proof or Messenger agreement screenshot
 */
exports.createProof = async (req, res, next) => {
    try {
        const { supplier_id, po_id, proof_type, title, image_url, reference_no, amount, notes } = req.body;

        if (!supplier_id) {
            throw new AppValidationError('Supplier ID is required');
        }
        if (!title || !title.trim()) {
            throw new AppValidationError('Proof title / description is required');
        }
        if (!image_url || !image_url.trim()) {
            throw new AppValidationError('Image screenshot URL or file link is required');
        }

        const validTypes = ['payment_proof', 'messenger_quote', 'courier_waybill'];
        const cleanType = validTypes.includes(proof_type) ? proof_type : 'payment_proof';

        const [result] = await db.query(
            `INSERT INTO supplier_proofs (supplier_id, po_id, proof_type, title, image_url, reference_no, amount, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                Number(supplier_id),
                po_id ? Number(po_id) : null,
                cleanType,
                title.trim(),
                image_url.trim(),
                reference_no ? reference_no.trim() : null,
                parseFloat(amount) || 0,
                notes ? notes.trim() : null
            ]
        );

        const [newProof] = await db.query(
            `SELECT p.*, s.name AS supplier_name, s.fb_page_name 
             FROM supplier_proofs p
             JOIN suppliers s ON s.id = p.supplier_id
             WHERE p.id = ?`,
            [result.insertId]
        );

        res.status(201).json({
            message: 'Proof / quote added to gallery successfully',
            proof: newProof[0]
        });
    } catch (err) {
        next(err);
    }
};

/**
 * DELETE /api/suppliers/proofs/:id
 */
exports.deleteProof = async (req, res, next) => {
    try {
        const proofId = Number(req.params.id);
        const [result] = await db.query('DELETE FROM supplier_proofs WHERE id = ?', [proofId]);
        if (result.affectedRows === 0) {
            throw new AppNotFoundError('Proof not found');
        }
        res.json({ message: 'Proof deleted successfully' });
    } catch (err) {
        next(err);
    }
};

/**
 * ============================================================================
 * SECTION 6: SUPPLIER LEDGER (FINANCIAL STATEMENT & BALANCES)
 * ============================================================================
 */

/**
 * GET /api/suppliers/:id/ledger
 * Returns the itemized financial ledger statement for a Facebook supplier:
 * - Total POs Billed
 * - Total Payments Sent
 * - Pre-Acceptance Return Credits (Value owed from rejected damaged items)
 * - Net Balance With Supplier
 * - Itemized statement timeline with running balance
 */
exports.getSupplierLedger = async (req, res, next) => {
    try {
        const supplierId = Number(req.params.id);
        if (!supplierId) {
            throw new AppValidationError('Invalid supplier ID');
        }

        const [suppliers] = await db.query('SELECT * FROM suppliers WHERE id = ?', [supplierId]);
        if (suppliers.length === 0) {
            throw new AppNotFoundError('Supplier not found');
        }
        const supplier = suppliers[0];

        // 1. Fetch Purchase Orders Billed
        const [orders] = await db.query(
            `SELECT order_id, po_number, order_date, courier_name, tracking_number, shipping_fee, total_order_cost, order_status, notes, created_at
             FROM supplier_orders
             WHERE supplier_id = ? AND order_status != 'Cancelled'
             ORDER BY order_date ASC, created_at ASC`,
            [supplierId]
        );

        // 2. Fetch Payments Sent
        const [payments] = await db.query(
            `SELECT id, po_id, payment_date, amount, payment_method, reference_number, proof_img_url, notes, created_by, created_at
             FROM supplier_payments
             WHERE supplier_id = ?
             ORDER BY payment_date ASC, created_at ASC`,
            [supplierId]
        );

        // 3. Pre-Acceptance Return Credits (Damaged parts rejected at door - deducted on arrival)
        const returns = [];

        // Aggregate Totals
        const totalBilled = orders.reduce((sum, o) => sum + Number(o.total_order_cost || 0), 0);
        const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const totalPreAcceptanceCredits = returns.reduce((sum, r) => sum + Number(r.total_value_owed || 0), 0);
        const activeCreditsOwed = returns
            .filter(r => r.resolution_status !== 'Refunded via GCash')
            .reduce((sum, r) => sum + Number(r.total_value_owed || 0), 0);

        // Net Balance = Billed - Payments Sent - Active Credits Owed
        const netBalance = totalBilled - totalPaid - activeCreditsOwed;

        // Build chronological ledger timeline
        const statementEntries = [];

        orders.forEach(o => {
            statementEntries.push({
                id: `po_${o.order_id}`,
                date: o.order_date || o.created_at,
                type: 'PO_BILLED',
                typeLabel: 'Purchase Order Billed',
                reference: o.po_number || `PO-#${o.order_id}`,
                description: `PO Restock (${o.courier_name || 'Courier'}, Track: ${o.tracking_number || 'N/A'})`,
                debit: Number(o.total_order_cost || 0), // We owe this
                credit: 0,
                impact: Number(o.total_order_cost || 0),
                status: o.order_status,
                rawDate: new Date(o.order_date || o.created_at).getTime()
            });
        });

        payments.forEach(p => {
            statementEntries.push({
                id: `pay_${p.id}`,
                date: p.payment_date || p.created_at,
                type: 'PAYMENT_SENT',
                typeLabel: `Payment Sent (${p.payment_method})`,
                reference: p.reference_number || `PAY-#${p.id}`,
                description: `Payment via ${p.payment_method} ${p.notes ? '• ' + p.notes : ''}`,
                debit: 0,
                credit: Number(p.amount || 0), // Payment reduces what we owe
                impact: -Number(p.amount || 0),
                status: 'Completed',
                proof_url: p.proof_img_url,
                rawDate: new Date(p.payment_date || p.created_at).getTime()
            });
        });

        returns.forEach(r => {
            statementEntries.push({
                id: `ret_${r.id}`,
                date: r.created_at,
                type: 'RETURN_CREDIT',
                typeLabel: 'Pre-Acceptance Return Credit',
                reference: r.return_reference,
                description: `Rejected ${r.quantity_rejected}x ${r.product_name} (${r.rejection_reason})`,
                debit: 0,
                credit: Number(r.total_value_owed || 0), // Return credit reduces what we owe
                impact: -Number(r.total_value_owed || 0),
                status: r.resolution_status,
                rawDate: new Date(r.created_at).getTime()
            });
        });

        // Sort chronologically
        statementEntries.sort((a, b) => a.rawDate - b.rawDate);

        // Compute running balance
        let running = 0;
        const timelineWithRunningBalance = statementEntries.map(entry => {
            running += entry.impact;
            return {
                ...entry,
                running_balance: running
            };
        });

        res.json({
            supplier: {
                id: supplier.id,
                name: supplier.name,
                fb_page_name: supplier.fb_page_name,
                seller_contact_name: supplier.seller_contact_name,
                contact_person: supplier.contact_person,
                phone: supplier.phone,
                messenger_url: supplier.messenger_url,
                gcash_account_name: supplier.gcash_account_name,
                gcash_account_number: supplier.gcash_account_number,
                bank_details: supplier.bank_details,
                category_tags: supplier.category_tags
            },
            summary: {
                total_po_billed: totalBilled,
                total_payments_sent: totalPaid,
                total_pre_acceptance_credits: totalPreAcceptanceCredits,
                active_credits_owed: activeCreditsOwed,
                net_balance: netBalance,
                balance_status: netBalance > 0 ? 'SHOP_OWES_SUPPLIER' : (netBalance < 0 ? 'SUPPLIER_OWES_SHOP' : 'SETTLED')
            },
            statement: timelineWithRunningBalance
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/suppliers/:id/payments
 * Record a payment sent to the Facebook supplier (via GCash, Bank, or COD)
 */
exports.recordSupplierPayment = async (req, res, next) => {
    try {
        const supplierId = Number(req.params.id);
        const { po_id, payment_date, amount, payment_method, reference_number, proof_img_url, notes } = req.body;

        if (!supplierId) {
            throw new AppValidationError('Invalid supplier ID');
        }
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            throw new AppValidationError('Payment amount must be greater than zero');
        }

        const validMethods = ['GCash', 'Bank Transfer', 'Cash on Delivery (COD)'];
        const cleanMethod = validMethods.includes(payment_method) ? payment_method : 'GCash';

        const [result] = await db.query(
            `INSERT INTO supplier_payments (supplier_id, po_id, payment_date, amount, payment_method, reference_number, proof_img_url, notes, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                supplierId,
                po_id ? Number(po_id) : null,
                payment_date || new Date().toISOString().slice(0, 10),
                numericAmount,
                cleanMethod,
                reference_number ? reference_number.trim() : null,
                proof_img_url ? proof_img_url.trim() : null,
                notes ? notes.trim() : null,
                req.user?.username || 'Admin'
            ]
        );

        // Also insert into supplier_proofs gallery if a receipt image was provided
        if (proof_img_url && proof_img_url.trim()) {
            await db.query(
                `INSERT INTO supplier_proofs (supplier_id, po_id, proof_type, title, image_url, reference_no, amount, notes, created_at)
                 VALUES (?, ?, 'payment_proof', ?, ?, ?, ?, ?, NOW())`,
                [
                    supplierId,
                    po_id ? Number(po_id) : null,
                    `Payment Receipt (${cleanMethod})`,
                    proof_img_url.trim(),
                    reference_number ? reference_number.trim() : null,
                    numericAmount,
                    notes ? notes.trim() : `Payment of ₱${numericAmount.toLocaleString()} logged by ${req.user?.username || 'Admin'}`
                ]
            );
        }

        res.status(201).json({
            message: 'Payment sent recorded successfully in supplier ledger',
            payment_id: result.insertId
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/suppliers/ledger/summary
 * Balance sheet of all suppliers
 */
exports.getGlobalLedgerSummary = async (req, res, next) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                s.id, s.name, s.fb_page_name, s.seller_contact_name, s.phone, s.messenger_url, s.gcash_account_number, s.category_tags,
                COALESCE((SELECT SUM(total_order_cost) FROM supplier_orders WHERE supplier_id = s.id AND order_status != 'Cancelled'), 0) AS total_po_billed,
                COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = s.id), 0) AS total_payments_sent,
                0 AS pre_acceptance_credits
            FROM suppliers s
            WHERE s.is_active = TRUE
            ORDER BY s.name ASC
        `);

        let overallBilled = 0;
        let overallPaid = 0;
        let overallCredits = 0;

        const suppliersLedger = rows.map(r => {
            const billed = Number(r.total_po_billed || 0);
            const paid = Number(r.total_payments_sent || 0);
            const credits = Number(r.pre_acceptance_credits || 0);
            const net = billed - paid - credits;

            overallBilled += billed;
            overallPaid += paid;
            overallCredits += credits;

            return {
                ...r,
                total_po_billed: billed,
                total_payments_sent: paid,
                pre_acceptance_credits: credits,
                net_balance: net,
                status: net > 0 ? 'SHOP_OWES_SUPPLIER' : (net < 0 ? 'SUPPLIER_OWES_SHOP' : 'SETTLED')
            };
        });

        res.json({
            overall: {
                total_po_billed: overallBilled,
                total_payments_sent: overallPaid,
                total_pre_acceptance_credits: overallCredits,
                net_outstanding_balance: overallBilled - overallPaid - overallCredits
            },
            suppliers: suppliersLedger
        });
    } catch (err) {
        next(err);
    }
};

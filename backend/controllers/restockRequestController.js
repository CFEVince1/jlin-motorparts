const db = require('../config/db');
const mailer = require('../utils/mailer');

/**
 * Controller for Staff Restock Requests and Admin Approvals
 */

// Helper: Get active Admin email for notifications
async function getAdminEmail() {
    try {
        const [admins] = await db.query(
            "SELECT id, username, email FROM users WHERE LOWER(role) = 'admin' AND email IS NOT NULL AND email != '' ORDER BY id ASC LIMIT 1"
        );
        if (admins.length > 0 && admins[0].email) {
            return admins[0].email;
        }
    } catch (e) {
        console.error('Error fetching admin email:', e);
    }
    return process.env.SMTP_USER || 'jlinmotorparts.noreply@gmail.com';
}

// 1. GET ALL RESTOCK REQUESTS
exports.getRestockRequests = async (req, res) => {
    try {
        const { status = 'ALL', search = '', limit = 100 } = req.query;
        let whereClauses = [];
        let params = [];

        if (status && status !== 'ALL') {
            whereClauses.push('rr.status = ?');
            params.push(status);
        }

        if (search && search.trim()) {
            const pattern = `%${search.trim()}%`;
            whereClauses.push('(rr.part_number LIKE ? OR rr.product_name LIKE ? OR rr.staff_name LIKE ? OR rr.supplier_name LIKE ?)');
            params.push(pattern, pattern, pattern, pattern);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const [requests] = await db.query(`
            SELECT 
                rr.*,
                p.stock AS current_sellable_stock,
                s.name AS current_supplier_name,
                s.fb_page_name,
                s.messenger_url
            FROM restock_requests rr
            LEFT JOIN products p ON p.id = rr.product_id
            LEFT JOIN suppliers s ON s.id = rr.supplier_id
            ${whereSql}
            ORDER BY 
                CASE WHEN rr.status = 'PENDING' THEN 0 ELSE 1 END ASC,
                CASE rr.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END ASC,
                rr.created_at DESC
            LIMIT ?
        `, [...params, Number(limit) || 100]);

        // Get summary statistics
        const [statsRows] = await db.query(`
            SELECT 
                COUNT(*) AS total_count,
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending_count,
                SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved_count,
                SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count,
                SUM(CASE WHEN status = 'APPROVED' AND DATE(resolved_at) = CURRENT_DATE() THEN 1 ELSE 0 END) AS approved_today
            FROM restock_requests
        `);

        res.json({
            success: true,
            stats: statsRows[0] || { total_count: 0, pending_count: 0, approved_count: 0, rejected_count: 0, approved_today: 0 },
            data: requests
        });
    } catch (err) {
        console.error('Error fetching restock requests:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch restock requests' });
    }
};

// 2. CREATE RESTOCK REQUEST (Single or Multi-select Bulk with Owner Gmail Notification)
exports.createRestockRequest = async (req, res) => {
    try {
        const {
            product_id,
            requested_qty = 5,
            priority = 'NORMAL',
            notes = '',
            items = [] // Bulk items array: [{ product_id, requested_qty, notes }]
        } = req.body;

        const staffId = req.user?.id || 1;
        const staffName = req.user?.username || 'Staff';

        // Prepare items list to process
        let itemsToProcess = [];
        if (Array.isArray(items) && items.length > 0) {
            itemsToProcess = items;
        } else if (product_id) {
            itemsToProcess = [{
                product_id,
                requested_qty: Number(requested_qty) || 5,
                priority,
                notes
            }];
        } else {
            return res.status(400).json({ success: false, message: 'Please select at least one low-stock item to restock' });
        }

        const processedItems = [];
        const requestIds = [];

        for (const item of itemsToProcess) {
            const pId = Number(item.product_id);
            const qtyNum = parseInt(item.requested_qty || requested_qty, 10);
            const itemPriority = item.priority || priority || 'NORMAL';
            const itemNotes = (item.notes !== undefined && item.notes !== null && item.notes !== '') ? item.notes : notes;

            if (!pId || isNaN(qtyNum) || qtyNum <= 0) continue;

            // Fetch latest product details
            const [pRows] = await db.query(`
                SELECT 
                    p.id, p.part_number, p.name AS product_name, p.brand, p.category,
                    COALESCE(p.sellable_stock, p.current_stock, p.stock, 0) AS stock,
                    p.reorder_level, p.cost_price, p.supplier_id,
                    s.name AS supplier_name
                FROM products p
                LEFT JOIN suppliers s ON s.id = p.supplier_id
                WHERE p.id = ?
            `, [pId]);

            if (pRows.length === 0) continue;
            const product = pRows[0];

            // Check if there is already a PENDING request for this product
            const [existing] = await db.query(`
                SELECT id FROM restock_requests WHERE product_id = ? AND status = 'PENDING' LIMIT 1
            `, [pId]);

            let reqId;
            if (existing.length > 0) {
                reqId = existing[0].id;
                await db.query(`
                    UPDATE restock_requests
                    SET requested_qty = ?, priority = ?, notes = ?, staff_id = ?, staff_name = ?, created_at = NOW()
                    WHERE id = ?
                `, [qtyNum, itemPriority, itemNotes || null, staffId, staffName, reqId]);
            } else {
                const [insertResult] = await db.query(`
                    INSERT INTO restock_requests (
                        product_id, part_number, product_name, brand, category,
                        current_stock, reorder_level, requested_qty, unit_cost,
                        supplier_id, supplier_name, priority, notes,
                        staff_id, staff_name, status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW())
                `, [
                    product.id,
                    product.part_number,
                    product.product_name,
                    product.brand,
                    product.category,
                    product.stock,
                    product.reorder_level || 5,
                    qtyNum,
                    product.cost_price || 0,
                    product.supplier_id || null,
                    product.supplier_name || 'Generic / FB Supplier',
                    itemPriority,
                    itemNotes || null,
                    staffId,
                    staffName
                ]);
                reqId = insertResult.insertId;
            }

            requestIds.push(reqId);
            processedItems.push({
                id: reqId,
                product_id: product.id,
                part_number: product.part_number,
                product_name: product.product_name,
                brand: product.brand,
                current_stock: product.stock,
                reorder_level: product.reorder_level || 5,
                requested_qty: qtyNum,
                supplier_name: product.supplier_name
            });

            // Record in audit log
            try {
                await db.query(`
                    INSERT INTO audit_logs (
                        user_id, user_name, user_role, module, action_type,
                        entity_type, entity_id, reference_id, reason, created_at
                    ) VALUES (?, ?, ?, 'PURCHASING', 'Restock Requested', 'product', ?, ?, ?, NOW())
                `, [
                    staffId,
                    staffName,
                    req.user?.role || 'cashier',
                    String(product.id),
                    `REQ-${reqId}`,
                    itemNotes || `Restock request for ${product.part_number} (+${qtyNum} pcs, Priority: ${itemPriority})`
                ]);
            } catch (auditErr) {
                console.error('Failed to log restock request audit:', auditErr);
            }
        }

        if (processedItems.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid low-stock items could be processed' });
        }

        // Notify Owner / Admin Gmail
        const adminEmail = await getAdminEmail();
        let emailSent = false;
        try {
            await mailer.sendRestockRequestEmail({
                to: adminEmail,
                staffName,
                priority,
                notes,
                items: processedItems
            });
            emailSent = true;
            console.log(`[Restock Request] Sent Gmail notification to ${adminEmail} for ${processedItems.length} items.`);
        } catch (mailErr) {
            console.error('[Restock Request] Failed to send Gmail notification:', mailErr.message);
        }

        const maskedEmail = adminEmail ? adminEmail.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.min(5, b.length)) + c) : 'Owner Gmail';

        res.status(201).json({
            success: true,
            message: `Restock request for ${processedItems.length} item(s) submitted! Owner notified at ${maskedEmail} to buy new POs.`,
            count: processedItems.length,
            requestIds,
            items: processedItems,
            admin_email: maskedEmail,
            email_sent: emailSent
        });
    } catch (err) {
        console.error('Error creating restock request:', err);
        res.status(500).json({ success: false, message: 'Failed to submit restock request' });
    }
};

// 3. APPROVE RESTOCK REQUEST & CREATE PO (Admin Only)
exports.approveRestockRequest = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const requestId = Number(req.params.id);
        const adminId = req.user?.id || 1;
        const adminName = req.user?.username || 'admin';
        const {
            admin_notes = '',
            approved_qty,
            courier_name = 'Lalamove',
            shipping_fee = 0,
            create_po = true
        } = req.body;

        const [requests] = await connection.query('SELECT * FROM restock_requests WHERE id = ? FOR UPDATE', [requestId]);
        if (requests.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Restock request not found' });
        }

        const request = requests[0];
        if (request.status !== 'PENDING') {
            await connection.rollback();
            return res.status(400).json({ success: false, message: `Request is already ${request.status}` });
        }

        const finalQty = approved_qty !== undefined ? Number(approved_qty) : Number(request.requested_qty);
        const unitCost = Number(request.unit_cost || 0);
        const shipFee = Number(shipping_fee || 0);
        const totalCost = (finalQty * unitCost) + shipFee;

        let createdOrderId = null;
        let poNumber = null;

        if (create_po) {
            const trackingNum = `LLM-${Math.floor(100000 + Math.random() * 900000)}`;

            // Insert into supplier_orders
            const [orderResult] = await connection.query(`
                INSERT INTO supplier_orders (
                    supplier_id, order_date, courier_name, tracking_number,
                    shipping_fee, total_order_cost, order_status, payment_status,
                    payment_method, notes, created_at
                ) VALUES (?, NOW(), ?, ?, ?, ?, 'Ordered', 'PENDING_OWNER_APPROVAL', 'GCash', ?, NOW())
            `, [
                request.supplier_id || 1,
                courier_name,
                trackingNum,
                shipFee,
                totalCost,
                `Admin approved staff restock request #${requestId} by ${request.staff_name}. Note: ${admin_notes || request.notes || 'None'}`
            ]);

            createdOrderId = orderResult.insertId;
            poNumber = `PO-2026-${String(createdOrderId).padStart(4, '0')}`;

            await connection.query('UPDATE supplier_orders SET po_number = ? WHERE order_id = ?', [poNumber, createdOrderId]);

            // Insert into supplier_order_items
            await connection.query(`
                INSERT INTO supplier_order_items (
                    order_id, product_id, unit_cost, qty_ordered, qty_accepted_good, qty_rejected_damaged, created_at
                ) VALUES (?, ?, ?, ?, 0, 0, NOW())
            `, [createdOrderId, request.product_id, unitCost, finalQty]);
        }

        // Update restock request status
        await connection.query(`
            UPDATE restock_requests
            SET 
                status = 'APPROVED',
                requested_qty = ?,
                admin_id = ?,
                admin_name = ?,
                admin_notes = ?,
                po_id = ?,
                resolved_at = NOW()
            WHERE id = ?
        `, [
            finalQty,
            adminId,
            adminName,
            admin_notes || 'Approved by Admin',
            createdOrderId,
            requestId
        ]);

        // Audit log
        await connection.query(`
            INSERT INTO audit_logs (
                user_id, user_name, user_role, module, action_type,
                entity_type, entity_id, reference_id, reason, created_at
            ) VALUES (?, ?, 'admin', 'PURCHASING', 'Restock Request Approved', 'restock_request', ?, ?, ?, NOW())
        `, [
            adminId,
            adminName,
            String(requestId),
            poNumber || `REQ-${requestId}`,
            `Approved ${finalQty} units for ${request.part_number} (${request.product_name}). ${poNumber ? `Generated ${poNumber}.` : ''}`
        ]);

        await connection.commit();

        res.json({
            success: true,
            message: `Restock request #${requestId} approved! ${poNumber ? `Generated Purchase Order ${poNumber}.` : ''}`,
            requestId,
            po_id: createdOrderId,
            po_number: poNumber,
            approved_qty: finalQty
        });

    } catch (err) {
        await connection.rollback();
        console.error('Error approving restock request:', err);
        res.status(500).json({ success: false, message: 'Failed to approve restock request: ' + err.message });
    } finally {
        connection.release();
    }
};

// 4. REJECT RESTOCK REQUEST (Admin Only)
exports.rejectRestockRequest = async (req, res) => {
    try {
        const requestId = Number(req.params.id);
        const adminId = req.user?.id || 1;
        const adminName = req.user?.username || 'admin';
        const { reason = 'Declined by Admin' } = req.body;

        const [requests] = await db.query('SELECT * FROM restock_requests WHERE id = ?', [requestId]);
        if (requests.length === 0) {
            return res.status(404).json({ success: false, message: 'Restock request not found' });
        }

        const request = requests[0];
        if (request.status !== 'PENDING') {
            return res.status(400).json({ success: false, message: `Request is already ${request.status}` });
        }

        await db.query(`
            UPDATE restock_requests
            SET 
                status = 'REJECTED',
                admin_id = ?,
                admin_name = ?,
                admin_notes = ?,
                resolved_at = NOW()
            WHERE id = ?
        `, [adminId, adminName, reason, requestId]);

        // Audit log
        try {
            await db.query(`
                INSERT INTO audit_logs (
                    user_id, user_name, user_role, module, action_type,
                    entity_type, entity_id, reference_id, reason, created_at
                ) VALUES (?, ?, 'admin', 'PURCHASING', 'Restock Request Rejected', 'restock_request', ?, ?, ?, NOW())
            `, [
                adminId,
                adminName,
                String(requestId),
                `REQ-${requestId}`,
                `Rejected restock request for ${request.part_number}. Reason: ${reason}`
            ]);
        } catch (auditErr) {
            console.error('Failed to log audit for reject restock request:', auditErr);
        }

        res.json({
            success: true,
            message: `Restock request #${requestId} for ${request.part_number} declined.`,
            requestId,
            status: 'REJECTED'
        });
    } catch (err) {
        console.error('Error rejecting restock request:', err);
        res.status(500).json({ success: false, message: 'Failed to decline restock request' });
    }
};

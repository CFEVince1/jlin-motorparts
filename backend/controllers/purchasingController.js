const db = require('../config/db');
const { AppValidationError, AppNotFoundError } = require('../utils/errors');

/**
 * GET /api/purchasing/orders
 * Returns list of Purchase Orders with supplier info, courier, items count, and financial totals.
 */
exports.getPurchaseOrders = async (req, res, next) => {
    try {
        const { status, supplierId, search } = req.query;
        let whereClauses = [];
        let params = [];

        if (status && status !== 'ALL') {
            whereClauses.push('so.order_status = ?');
            params.push(status);
        }

        if (supplierId && supplierId !== 'ALL') {
            whereClauses.push('so.supplier_id = ?');
            params.push(Number(supplierId));
        }

        if (search && search.trim()) {
            const pattern = `%${search.trim()}%`;
            whereClauses.push('(so.po_number LIKE ? OR so.tracking_number LIKE ? OR s.name LIKE ? OR s.fb_page_name LIKE ?)');
            params.push(pattern, pattern, pattern, pattern);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const [orders] = await db.query(`
            SELECT 
                so.order_id,
                COALESCE(so.po_number, CONCAT('PO-2026-', LPAD(so.order_id, 4, '0'))) AS po_number,
                so.supplier_id,
                s.name AS supplier_name,
                s.fb_page_name,
                s.seller_contact_name,
                s.messenger_url,
                s.facebook_page_url,
                s.gcash_account_name,
                s.gcash_account_number,
                so.order_date,
                so.courier_name,
                so.tracking_number,
                so.shipping_fee,
                so.total_order_cost,
                so.payment_proof_img,
                so.messenger_quote_img,
                so.order_status,
                so.payment_status,
                so.payment_method,
                so.payment_reference,
                so.notes,
                so.created_at,
                COUNT(soi.order_item_id) AS total_line_items,
                COALESCE(SUM(soi.qty_ordered), 0) AS total_qty_ordered,
                COALESCE(SUM(soi.qty_accepted_good), 0) AS total_qty_accepted,
                COALESCE(SUM(soi.qty_rejected_damaged), 0) AS total_qty_rejected
            FROM supplier_orders so
            LEFT JOIN suppliers s ON s.id = so.supplier_id
            LEFT JOIN supplier_order_items soi ON soi.order_id = so.order_id
            ${whereSql}
            GROUP BY so.order_id
            ORDER BY so.order_date DESC, so.order_id DESC
        `, params);

        res.json(orders);
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/purchasing/orders/:id
 * Returns single Purchase Order with full line items breakdown.
 */
exports.getPurchaseOrderById = async (req, res, next) => {
    try {
        const orderId = Number(req.params.id);
        const [orders] = await db.query(`
            SELECT 
                so.order_id,
                COALESCE(so.po_number, CONCAT('PO-2026-', LPAD(so.order_id, 4, '0'))) AS po_number,
                so.supplier_id,
                s.name AS supplier_name,
                s.fb_page_name,
                s.seller_contact_name,
                s.messenger_url,
                s.facebook_page_url,
                s.gcash_account_name,
                s.gcash_account_number,
                so.order_date,
                so.courier_name,
                so.tracking_number,
                so.shipping_fee,
                so.total_order_cost,
                so.payment_proof_img,
                so.messenger_quote_img,
                so.order_status,
                so.payment_status,
                so.payment_method,
                so.payment_reference,
                so.notes,
                so.created_at
            FROM supplier_orders so
            LEFT JOIN suppliers s ON s.id = so.supplier_id
            WHERE so.order_id = ?
        `, [orderId]);

        if (orders.length === 0) {
            return res.status(404).json({ message: 'Purchase Order not found' });
        }

        const [items] = await db.query(`
            SELECT 
                soi.order_item_id,
                soi.order_id,
                soi.product_id,
                p.part_number,
                p.name AS product_name,
                p.brand,
                p.category,
                p.shelf_location,
                p.is_serialized,
                soi.unit_cost,
                soi.qty_ordered,
                soi.qty_accepted_good,
                soi.qty_rejected_damaged,
                soi.rejection_remarks,
                (soi.qty_ordered * soi.unit_cost) AS subtotal
            FROM supplier_order_items soi
            JOIN products p ON p.id = soi.product_id
            WHERE soi.order_id = ?
            ORDER BY soi.order_item_id ASC
        `, [orderId]);

        const order = orders[0];
        order.items = items;
        res.json(order);
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/purchasing/orders
 * Creates a new Purchase Order placed via Facebook Messenger.
 */
exports.createPurchaseOrder = async (req, res, next) => {
    const {
        supplier_id,
        order_date,
        items,
        shipping_fee,
        courier_name,
        tracking_number,
        messenger_quote_img,
        payment_proof_img,
        order_status,
        notes
    } = req.body;

    if (!supplier_id) {
        return res.status(422).json({ message: 'Facebook supplier is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(422).json({ message: 'At least one line item is required' });
    }
    const validItems = items.filter(it => (it.product_id || it.itemId || it.id) && (parseInt(it.qty_ordered || it.quantity || 0, 10) > 0));
    if (validItems.length === 0) {
        return res.status(422).json({ message: 'At least one valid line item with quantity > 0 is required' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Calculate items cost
        let totalItemsCost = 0;
        for (const it of validItems) {
            const qty = Math.max(1, parseInt(it.qty_ordered || it.quantity || 1, 10));
            const cost = Math.max(0, parseFloat(it.unit_cost || it.cost_price || 0));
            totalItemsCost += (qty * cost);
        }
        const shippingFeeNum = Math.max(0, parseFloat(shipping_fee || 0));
        const totalOrderCost = totalItemsCost + shippingFeeNum;

        // Generate PO number
        const poDate = order_date ? new Date(order_date) : new Date();
        const poNum = `PO-${poDate.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

        const cleanCourier = courier_name || 'Lalamove';
        const cleanStatus = order_status || 'Ordered on Messenger';

        const [orderResult] = await connection.query(`
            INSERT INTO supplier_orders (
                po_number, supplier_id, order_date, courier_name, tracking_number,
                shipping_fee, total_order_cost, payment_proof_img, messenger_quote_img,
                order_status, payment_status, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_OWNER_APPROVAL', ?, NOW())
        `, [
            poNum, supplier_id, poDate, cleanCourier, tracking_number || null,
            shippingFeeNum, totalOrderCost, payment_proof_img || null, messenger_quote_img || null,
            cleanStatus, notes || 'Created via Purchasing PO Manager'
        ]);

        const orderId = orderResult.insertId;

        // Insert line items
        for (const it of validItems) {
            const pId = Number(it.product_id || it.itemId || it.id);
            const qty = Math.max(1, parseInt(it.qty_ordered || it.quantity || 1, 10));
            const cost = Math.max(0, parseFloat(it.unit_cost || it.cost_price || 0));

            await connection.query(`
                INSERT INTO supplier_order_items (
                    order_id, product_id, unit_cost, qty_ordered, qty_accepted_good, qty_rejected_damaged
                ) VALUES (?, ?, ?, ?, 0, 0)
            `, [orderId, pId, cost, qty]);
        }

        await connection.commit();

        res.status(201).json({
            message: `Purchase Order ${poNum} created successfully!`,
            order_id: orderId,
            po_number: poNum,
            total_order_cost: totalOrderCost
        });
    } catch (err) {
        await connection.rollback();
        next(err);
    } finally {
        connection.release();
    }
};

/**
 * PUT /api/purchasing/orders/:id/status
 * Updates status of a Purchase Order (Draft, Ordered on Messenger, Paid, In Transit, Received).
 */
exports.updateOrderStatus = async (req, res, next) => {
    try {
        const orderId = Number(req.params.id);
        const { order_status, tracking_number, courier_name } = req.body;

        const ALLOWED_STATUSES = ['Draft', 'Ordered on Messenger', 'Paid', 'In Transit', 'Received', 'Inspected & Accepted'];
        if (!ALLOWED_STATUSES.includes(order_status)) {
            return res.status(422).json({ message: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(', ')}` });
        }

        const updates = ['order_status = ?'];
        const params = [order_status];

        if (tracking_number !== undefined) {
            updates.push('tracking_number = ?');
            params.push(tracking_number ? String(tracking_number).trim() : null);
        }
        if (courier_name !== undefined) {
            updates.push('courier_name = ?');
            params.push(courier_name ? String(courier_name).trim() : null);
        }

        params.push(orderId);

        await db.query(`UPDATE supplier_orders SET ${updates.join(', ')} WHERE order_id = ?`, params);

        res.json({ message: `Purchase Order status updated to "${order_status}"`, order_id: orderId, order_status });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/purchasing/returns
 * Lists Pre-Acceptance Supplier Returns (only items rejected during unboxing delivery inspection).
 */
exports.getSupplierReturns = async (req, res, next) => {
    try {
        res.json({
            data: [],
            summary: {
                total_rejected_items: 0,
                total_rejected_units: 0,
                total_value_owed: 0,
                pending_recovery_value: 0,
                refunded_gcash_value: 0,
                credited_po_value: 0
            }
        });
    } catch (err) {
        next(err);
    }
};

exports.resolveSupplierReturn = async (req, res, next) => {
    res.json({ message: 'Supplier returns are settled on arrival via immediate deduction' });
};

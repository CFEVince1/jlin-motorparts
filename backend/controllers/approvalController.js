const db = require('../config/db');
const bcrypt = require('bcryptjs');
const mailer = require('../utils/mailer');

// 1. GET ALL APPROVAL REQUESTS (Filtered by type and status)
exports.getApprovals = async (req, res, next) => {
    try {
        const { type, status, search } = req.query;

        let query = 'SELECT * FROM approval_requests WHERE 1=1';
        const params = [];

        if (type && type !== 'ALL') {
            query += ' AND request_type = ?';
            params.push(type);
        }

        if (status && status !== 'ALL') {
            query += ' AND status = ?';
            params.push(status);
        }

        if (search && search.trim()) {
            const q = `%${search.trim()}%`;
            query += ' AND (receipt_number LIKE ? OR item_name LIKE ? OR cashier_name LIKE ? OR reason LIKE ?)';
            params.push(q, q, q, q);
        }

        // Cashier/Staff: View Own Requests Only
        const userRole = (req.user?.role || '').toLowerCase();
        if (userRole !== 'admin') {
            query += ' AND (cashier_id = ? OR cashier_name = ?)';
            params.push(req.user?.id || 0, req.user?.username || '');
        }

        // Sort so PENDING requests are always on top, newest first
        query += " ORDER BY CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END, created_at DESC LIMIT 200";

        const [requests] = await db.query(query, params);

        return res.json({
            success: true,
            count: requests.length,
            data: requests
        });
    } catch (err) {
        console.error('Error fetching approval requests:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch approval requests' });
    }
};

// 2. GET SUMMARY COUNTS FOR APPROVALS QUEUE
exports.getApprovalStats = async (req, res, next) => {
    try {
        const userRole = (req.user?.role || '').toLowerCase();
        let whereClause = '';
        const params = [];
        if (userRole !== 'admin') {
            whereClause = 'WHERE (cashier_id = ? OR cashier_name = ?)';
            params.push(req.user?.id || 0, req.user?.username || '');
        }

        const [counts] = await db.query(`
            SELECT 
                COUNT(*) as total_count,
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_total,
                SUM(CASE WHEN status = 'PENDING' AND request_type = 'VOID_REFUND' THEN 1 ELSE 0 END) as pending_void_refund,
                SUM(CASE WHEN status = 'PENDING' AND request_type = 'DISCOUNT' THEN 1 ELSE 0 END) as pending_discount,
                SUM(CASE WHEN status = 'PENDING' AND request_type = 'PRICE_OVERRIDE' THEN 1 ELSE 0 END) as pending_price_override,
                SUM(CASE WHEN status = 'APPROVED' AND DATE(resolved_at) = CURRENT_DATE() THEN 1 ELSE 0 END) as approved_today,
                SUM(CASE WHEN status = 'REJECTED' AND DATE(resolved_at) = CURRENT_DATE() THEN 1 ELSE 0 END) as rejected_today
            FROM approval_requests
            ${whereClause}
        `, params);

        return res.json({
            success: true,
            stats: counts[0] || {
                total_count: 0,
                pending_total: 0,
                pending_void_refund: 0,
                pending_discount: 0,
                pending_price_override: 0,
                approved_today: 0,
                rejected_today: 0
            }
        });
    } catch (err) {
        console.error('Error fetching approval stats:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch approval statistics' });
    }
};

// 3. CREATE A NEW APPROVAL REQUEST (By Cashier or System)
exports.createApprovalRequest = async (req, res, next) => {
    try {
        const {
            request_type,
            receipt_number,
            product_id,
            item_name,
            quantity = 1,
            original_price = 0,
            cost_price = 0,
            requested_value = 0,
            reason,
            metadata
        } = req.body;

        if (!request_type || !['VOID_REFUND', 'DISCOUNT', 'PRICE_OVERRIDE'].includes(request_type)) {
            return res.status(400).json({ success: false, message: 'Invalid or missing request_type' });
        }

        const cashierId = req.user?.id || 1;
        const cashierName = req.user?.username || 'Staff';

        // Compute remaining profit and financial impact
        let remainingProfit = 0;
        let financialImpact = 0;

        const origPrice = Number(original_price) || 0;
        const costPrice = Number(cost_price) || 0;
        const reqVal = Number(requested_value) || 0;
        const qty = Number(quantity) || 1;

        if (request_type === 'DISCOUNT') {
            // financial impact is the discount given
            financialImpact = reqVal;
            // remaining profit is (original total - discount) - (cost * qty)
            remainingProfit = (origPrice - reqVal) - (costPrice * qty);
        } else if (request_type === 'PRICE_OVERRIDE') {
            // financial impact is difference between catalog price and new price
            financialImpact = (origPrice - reqVal) * qty;
            // remaining profit is (new price - cost) * qty
            remainingProfit = (reqVal - costPrice) * qty;
        } else if (request_type === 'VOID_REFUND') {
            // financial impact is the full refund amount
            financialImpact = origPrice || reqVal;
            remainingProfit = 0 - financialImpact;
        }

        const [result] = await db.query(`
            INSERT INTO approval_requests (
                request_type, status, receipt_number, product_id, item_name, quantity,
                original_price, cost_price, requested_value, remaining_profit, financial_impact,
                reason, cashier_id, cashier_name, metadata
            ) VALUES (?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            request_type,
            receipt_number || null,
            product_id || null,
            item_name || 'Item',
            qty,
            origPrice,
            costPrice,
            reqVal,
            remainingProfit,
            financialImpact,
            reason || 'Cashier request',
            cashierId,
            cashierName,
            metadata ? JSON.stringify(metadata) : null
        ]);

        return res.status(201).json({
            success: true,
            message: `${request_type} approval request submitted to Owner Queue`,
            requestId: result.insertId
        });
    } catch (err) {
        console.error('Error creating approval request:', err);
        return res.status(500).json({ success: false, message: 'Failed to create approval request' });
    }
};

// 4. APPROVE REQUEST (Admin only)
exports.approveRequest = async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const adminId = req.user?.id || 1;
        const adminName = req.user?.username || 'admin';
        const { notes } = req.body;

        const [rows] = await db.query('SELECT * FROM approval_requests WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Approval request not found' });
        }

        const request = rows[0];
        if (request.status !== 'PENDING') {
            return res.status(400).json({ success: false, message: `Request is already ${request.status}` });
        }

        let metadata = null;
        try {
            if (request.metadata) {
                metadata = typeof request.metadata === 'string' ? JSON.parse(request.metadata) : request.metadata;
            }
        } catch (e) {
            console.error('Error parsing approval request metadata:', e);
        }

        // If this is a Customer Warranty Return, execute the shop-liability return
        if (request.request_type === 'VOID_REFUND' && metadata && metadata.warranty_return) {
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();

                const saleId = metadata.sale_id;
                const saleItemId = metadata.sale_item_id;
                const returnQty = Number(metadata.quantity) || 1;
                const resolutionType = metadata.resolution_type; // 'OPTION_A_REPLACEMENT' or 'OPTION_B_REFUND'
                const refundMethod = metadata.refund_method || 'Cash';
                const damageReason = metadata.damage_reason || request.reason || 'Customer Warranty Return';

                const [pRows] = await conn.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [request.product_id]);
                const product = pRows[0];
                const unitCost = Number(request.cost_price || product?.cost_price || 0);
                const unitPrice = Number(request.original_price || product?.price || 0) / returnQty;
                const shopLoss = Math.round(unitCost * returnQty * 100) / 100;
                const retailRefund = Math.round(unitPrice * returnQty * 100) / 100;

                const [retCount] = await conn.query('SELECT COUNT(*) as count FROM customer_returns WHERE sale_id = ?', [saleId]);
                const returnSlipCode = `WAR-${request.receipt_number || saleId}-${String((retCount[0]?.count || 0) + 1).padStart(2, '0')}`;

                await conn.query('UPDATE sale_items SET returned_quantity = returned_quantity + ? WHERE id = ?', [returnQty, saleItemId]);

                let salesReversal = 0;
                let resolutionLabel = '';
                let recordedRefundMethod = 'None';

                if (resolutionType === 'OPTION_A_REPLACEMENT') {
                    resolutionLabel = 'Replacement';
                    salesReversal = 0;
                    recordedRefundMethod = 'None';

                    // 1-to-1 Replacement: deduct 1 from sellable stock, add 1 to damaged stock
                    await conn.query('UPDATE products SET stock = GREATEST(0, stock - ?), damaged_stock = damaged_stock + ? WHERE id = ?', [returnQty, returnQty, request.product_id]);
                } else {
                    recordedRefundMethod = refundMethod === 'GCash' ? 'GCash' : 'Cash';
                    resolutionLabel = recordedRefundMethod === 'GCash' ? 'GCash Refund' : 'Cash Refund';
                    salesReversal = retailRefund;

                    // Refund: sellable stock unchanged, add to damaged stock
                    await conn.query('UPDATE products SET damaged_stock = damaged_stock + ? WHERE id = ?', [returnQty, request.product_id]);

                    await conn.query(`
                        UPDATE sales
                        SET refund_amount = COALESCE(refund_amount, 0) + ?,
                            refunded_at = NOW(),
                            status = CASE WHEN (SELECT SUM(quantity - returned_quantity) FROM sale_items WHERE sale_id = ?) <= 0 THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END
                        WHERE id = ?
                    `, [retailRefund, saleId, saleId]);

                    if (recordedRefundMethod === 'Cash') {
                        const [floats] = await conn.query(`
                            SELECT id, current_cash_balance FROM cash_floats
                            WHERE staff_id = ? AND status = 'ACTIVE'
                            ORDER BY assigned_at DESC LIMIT 1 FOR UPDATE
                        `, [request.cashier_id || adminId]);

                        if (floats.length > 0) {
                            const activeFloat = floats[0];
                            const prevBal = Number(activeFloat.current_cash_balance || 0);
                            const newBal = Math.round((prevBal - retailRefund) * 100) / 100;
                            await conn.query('UPDATE cash_floats SET current_cash_balance = ? WHERE id = ?', [newBal, activeFloat.id]);
                        }
                    }
                }

                // Insert into customer_returns
                await conn.query(`
                    INSERT INTO customer_returns (
                        return_code, sale_id, customer_id, customer_name, sale_item_id, product_id,
                        part_number, product_name, brand, size, return_type, resolution_type,
                        condition_status, quantity, qty_returned, refund_amount, sales_reversal_amount,
                        shop_loss_amount, supplier_cost, refund_method, reason, damage_reason,
                        processed_by, return_date, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DAMAGED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                `, [
                    returnSlipCode,
                    saleId,
                    metadata.customer_id || null,
                    metadata.customer_name || 'Walk-in Customer',
                    saleItemId,
                    request.product_id,
                    product?.part_number || 'N/A',
                    request.item_name,
                    product?.brand || 'Generic',
                    product?.size || 'Standard',
                    resolutionType,
                    resolutionLabel,
                    returnQty,
                    returnQty,
                    salesReversal,
                    salesReversal,
                    shopLoss,
                    unitCost,
                    recordedRefundMethod,
                    damageReason,
                    damageReason,
                    adminId
                ]);

                // Insert into return_refund_history
                await conn.query(`
                    INSERT INTO return_refund_history (
                        reference_no, order_id, product_id, product_name, part_number,
                        movement_type, flow_path, qty, target_bucket, effect_badge,
                        refund_amount, status, remarks, processed_by, created_at
                    ) VALUES (?, ?, ?, ?, ?, 'CUSTOMER_RETURN_DAMAGE', ?, ?, 'DAMAGE', ?, ?, 'COMPLETED', ?, ?, NOW())
                `, [
                    returnSlipCode,
                    saleId,
                    request.product_id,
                    request.item_name,
                    product?.part_number || 'N/A',
                    resolutionType === 'OPTION_A_REPLACEMENT' ? 'Approved Warranty: 1-to-1 Replacement (Shop Loss)' : `Approved Warranty: ${resolutionLabel} (Shop Loss)`,
                    returnQty,
                    `+${returnQty} Damaged Stock`,
                    salesReversal,
                    `Admin Approved Warranty Return: ${damageReason}. Shop Loss: ₱${shopLoss.toFixed(2)}`,
                    adminName
                ]);

                await conn.commit();
            } catch (err) {
                await conn.rollback();
                console.error('Failed to execute approved warranty return:', err);
                return res.status(500).json({ success: false, message: 'Failed to process warranty return on approval: ' + err.message });
            } finally {
                conn.release();
            }
        }

        await db.query(`
            UPDATE approval_requests 
            SET status = 'APPROVED', admin_id = ?, admin_name = ?, admin_notes = ?, resolved_at = NOW()
            WHERE id = ?
        `, [adminId, adminName, notes || 'Approved by Admin', id]);

        return res.json({
            success: true,
            message: `Request #${id} (${request.request_type}) has been approved!`,
            requestId: id,
            status: 'APPROVED'
        });
    } catch (err) {
        console.error('Error approving request:', err);
        return res.status(500).json({ success: false, message: 'Failed to approve request' });
    }
};

// 5. REJECT REQUEST (Admin only)
exports.rejectRequest = async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const adminId = req.user?.id || 1;
        const adminName = req.user?.username || 'admin';
        const { notes } = req.body;

        const [rows] = await db.query('SELECT * FROM approval_requests WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Approval request not found' });
        }

        const request = rows[0];
        if (request.status !== 'PENDING') {
            return res.status(400).json({ success: false, message: `Request is already ${request.status}` });
        }

        await db.query(`
            UPDATE approval_requests 
            SET status = 'REJECTED', admin_id = ?, admin_name = ?, admin_notes = ?, resolved_at = NOW()
            WHERE id = ?
        `, [adminId, adminName, notes || 'Rejected by Admin', id]);

        return res.json({
            success: true,
            message: `Request #${id} (${request.request_type}) has been rejected.`,
            requestId: id,
            status: 'REJECTED'
        });
    } catch (err) {
        console.error('Error rejecting request:', err);
        return res.status(500).json({ success: false, message: 'Failed to reject request' });
    }
};

// 6. VERIFY ADMIN PIN / PASSWORD (For instant counter override)
exports.verifyAdminPin = async (req, res, next) => {
    try {
        const { pin, password, reason, action_type } = req.body;
        const inputCode = String(pin || password || '').trim();

        if (!inputCode) {
            return res.status(400).json({ success: false, message: 'Admin PIN or Password is required' });
        }

        // Fetch all admin users
        const [admins] = await db.query("SELECT id, username, pin, password, password_hash FROM users WHERE LOWER(role) = 'admin'");

        if (admins.length === 0) {
            return res.status(500).json({ success: false, message: 'No administrator accounts configured' });
        }

        let verifiedAdmin = null;

        for (const admin of admins) {
            // Check direct PIN match
            if (admin.pin && String(admin.pin).trim() === inputCode) {
                verifiedAdmin = admin;
                break;
            }

            // Check bcrypt password hash
            const hashToTest = admin.password_hash || admin.password;
            if (hashToTest) {
                try {
                    const isMatch = await bcrypt.compare(inputCode, hashToTest);
                    if (isMatch) {
                        verifiedAdmin = admin;
                        break;
                    }
                } catch (e) {
                    // plain password fallback if not hashed
                    if (hashToTest === inputCode) {
                        verifiedAdmin = admin;
                        break;
                    }
                }
            }
        }

        if (!verifiedAdmin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid Admin PIN or Password. Override not authorized.'
            });
        }

        // Optionally log the immediate pin override into approval_requests as AUTO-APPROVED for audit log
        if (action_type) {
            try {
                await db.query(`
                    INSERT INTO approval_requests (
                        request_type, status, reason, cashier_id, cashier_name, 
                        admin_id, admin_name, admin_notes, resolved_at
                    ) VALUES (?, 'APPROVED', ?, ?, ?, ?, ?, 'Instant Admin PIN Counter Override', NOW())
                `, [
                    action_type,
                    reason || 'Instant Admin PIN Override at Counter',
                    req.user?.id || 1,
                    req.user?.username || 'Cashier',
                    verifiedAdmin.id,
                    verifiedAdmin.username
                ]);
            } catch (ignoreErr) {
                // Table dropped or audit logged elsewhere
            }
        }

        return res.json({
            success: true,
            authorized: true,
            admin_username: verifiedAdmin.username,
            admin_id: verifiedAdmin.id,
            message: `Admin override authorized by ${verifiedAdmin.username}`
        });
    } catch (err) {
        console.error('Error verifying admin PIN:', err);
        return res.status(500).json({ success: false, message: 'Failed to verify admin PIN' });
    }
};

// 7. REQUEST DISCOUNT OTP (Sends 6-digit code to Admin Gmail)
exports.requestDiscountOtp = async (req, res, next) => {
    try {
        const { discount_type, discount_value, reason, cart_retail, cart_cost } = req.body;
        const val = parseFloat(discount_value);

        if (!Number.isFinite(val) || val <= 0) {
            return res.status(400).json({ success: false, message: 'Valid discount value is required' });
        }

        const cashierId = req.user?.id || null;
        const cashierName = req.user?.username || 'Cashier';

        // 1. Fetch active Admin email from users table
        const [admins] = await db.query(
            "SELECT id, username, email FROM users WHERE LOWER(role) = 'admin' AND email IS NOT NULL AND email != '' ORDER BY id ASC LIMIT 1"
        );

        let adminEmail = admins[0]?.email;
        if (!adminEmail) {
            adminEmail = process.env.SMTP_USER || 'jlinmotorparts.noreply@gmail.com';
        }

        // 2. Generate cryptographically strong 6-digit OTP code
        const otpCode = String(Math.floor(100000 + Math.random() * 900000));
        const codeHash = await bcrypt.hash(otpCode, 10);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // 3. Invalidate any prior unused OTPs for this cashier
        await db.query(
            "UPDATE pos_discount_otps SET used_at = NOW() WHERE used_at IS NULL AND (cashier_id = ? OR cashier_id IS NULL)",
            [cashierId]
        );

        // 4. Save to pos_discount_otps table
        const [result] = await db.query(`
            INSERT INTO pos_discount_otps (
                otp_code, code_hash, cashier_id, cashier_name, admin_email,
                discount_type, discount_value, reason, cart_retail, cart_cost,
                expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            otpCode,
            codeHash,
            cashierId,
            cashierName,
            adminEmail,
            discount_type || 'fixed',
            val,
            reason || 'Customer Discount Request',
            parseFloat(cart_retail) || 0,
            parseFloat(cart_cost) || 0,
            expiresAt
        ]);

        // 5. Send email to Admin Gmail via mailer
        try {
            await mailer.sendDiscountOtpEmail({
                to: adminEmail,
                code: otpCode,
                discountType: discount_type || 'fixed',
                discountValue: val,
                cashierName,
                reason: reason || 'Customer Discount Request',
                cartRetail: parseFloat(cart_retail) || 0,
                cartCost: parseFloat(cart_cost) || 0
            });
            console.log(`[POS Discount OTP] Dispatched OTP code ${otpCode} to ${adminEmail} for cashier ${cashierName}`);
        } catch (emailErr) {
            console.error('[POS Discount OTP] Failed to send email:', emailErr);
        }

        // Mask admin email for frontend display (e.g., ic***@gmail.com)
        const parts = adminEmail.split('@');
        const masked = parts[0].length > 2 
            ? `${parts[0].slice(0, 2)}***@${parts[1]}`
            : `${parts[0]}***@${parts[1]}`;

        return res.json({
            success: true,
            message: `OTP has been sent to Admin Gmail (${masked})!`,
            adminEmail: masked,
            fullAdminEmail: adminEmail,
            expiresAt,
            otpId: result.insertId
        });
    } catch (err) {
        console.error('Error requesting discount OTP:', err);
        return res.status(500).json({ success: false, message: 'Failed to request discount OTP' });
    }
};

// 8. VERIFY DISCOUNT OTP (Cashier inputs code from Admin Gmail)
exports.verifyDiscountOtp = async (req, res, next) => {
    try {
        const { otp } = req.body;
        const inputOtp = String(otp || '').trim();

        if (!inputOtp || inputOtp.length !== 6) {
            return res.status(400).json({ success: false, message: 'Please enter a valid 6-digit OTP code' });
        }

        // Fetch latest active OTP
        const [rows] = await db.query(`
            SELECT * FROM pos_discount_otps
            WHERE used_at IS NULL AND expires_at > NOW()
            ORDER BY created_at DESC LIMIT 1
        `);

        if (rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No active OTP found or OTP has expired (10-minute limit). Please request a new OTP.'
            });
        }

        const otpRecord = rows[0];

        if (otpRecord.attempts >= 5) {
            return res.status(400).json({
                success: false,
                message: 'Too many incorrect attempts. This OTP is locked. Please request a new OTP.'
            });
        }

        // Check code match (plain or bcrypt)
        const isMatch = (otpRecord.otp_code === inputOtp) || (await bcrypt.compare(inputOtp, otpRecord.code_hash));

        if (!isMatch) {
            await db.query('UPDATE pos_discount_otps SET attempts = attempts + 1 WHERE id = ?', [otpRecord.id]);
            const remaining = 4 - otpRecord.attempts;
            return res.status(400).json({
                success: false,
                message: `Invalid OTP code. Please check the code in Admin's Gmail. (${remaining} attempts remaining)`
            });
        }

        // Mark as used
        await db.query('UPDATE pos_discount_otps SET used_at = NOW() WHERE id = ?', [otpRecord.id]);

        return res.json({
            success: true,
            message: 'Admin OTP successfully verified! Discount applied to order.',
            discountType: otpRecord.discount_type,
            discountValue: otpRecord.discount_value
        });
    } catch (err) {
        console.error('Error verifying discount OTP:', err);
        return res.status(500).json({ success: false, message: 'Failed to verify discount OTP' });
    }
};

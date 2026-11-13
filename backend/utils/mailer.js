const https = require('https');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: Number(process.env.SMTP_PORT || 465) === 465,
  family: 4,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

// Sends email via Resend HTTPS REST API (Port 443 - Never blocked on Render or cloud containers)
async function sendViaResend(apiKey, from, to, subject, html, text) {
  return new Promise((resolve, reject) => {
    // If using resend.dev test domain, format must be <onboarding@resend.dev>
    let sender = from || 'JLIN Motorparts <onboarding@resend.dev>';
    if (sender.includes('gmail.com')) {
      sender = 'JLIN Motorparts <onboarding@resend.dev>';
    }

    const payload = JSON.stringify({
      from: sender,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    });

    const req = https.request('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ messageId: json.id, accepted: [to], response: '250 OK (Resend HTTPS)' });
          } else {
            reject(new Error(json.message || `Resend error (${res.statusCode}): ${body}`));
          }
        } catch {
          reject(new Error(`Resend non-JSON response (${res.statusCode}): ${body}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Resend HTTPS request timed out'));
    });

    req.write(payload);
    req.end();
  });
}

// The code is sent in the email body only. It is never logged.
async function sendOtpEmail(to, code, purposeText) {
  const resendApiKey = process.env.RESEND_API_KEY || (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('re_') ? process.env.SMTP_PASS : null);

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 28px 20px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 22px;">
        <h2 style="color: #0f172a; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">JLIN Motorparts</h2>
        <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Account Security & Password Recovery</p>
      </div>

      <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 22px; border: 1px solid #edf2f7;">
        <p style="color: #334155; font-size: 14px; margin: 0 0 14px 0;">Use the verification code below to <strong>${purposeText}</strong>:</p>
        <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0284c7; padding: 12px 24px; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px; display: inline-block; font-family: monospace;">
          ${code}
        </div>
        <p style="color: #94a3b8; font-size: 12px; margin: 14px 0 0 0;">This code is valid for <strong>10 minutes</strong>.</p>
      </div>

      <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 0 0 16px 0;">
        If you did not request this verification code, please ignore this email or review your account credentials immediately.
      </p>

      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />

      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
        © JLIN Motorparts. All rights reserved.
      </p>
    </div>
  `;

  const subject = `${code} is your JLIN Motorparts verification code`;
  const text =
    `Use this code to ${purposeText}:\n\n${code}\n\n` +
    'It expires in 10 minutes. If you did not request this, ignore this email.';

  if (resendApiKey) {
    return await sendViaResend(resendApiKey, process.env.MAIL_FROM, to, subject, htmlContent, text);
  }

  const sender = process.env.MAIL_FROM || `"JLIN Motorparts" <${process.env.SMTP_USER}>`;
  return await transporter.sendMail({
    from: sender,
    to,
    subject,
    text,
    html: htmlContent,
  });
}

// Sends POS Discount Approval OTP to Admin Gmail
async function sendDiscountOtpEmail({ to, code, discountType, discountValue, cashierName, reason, cartRetail, cartCost }) {
  const resendApiKey = process.env.RESEND_API_KEY || (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('re_') ? process.env.SMTP_PASS : null);

  const formattedDiscount = discountType === 'percent' ? `${discountValue}% OFF` : `₱${Number(discountValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const retailVal = Number(cartRetail || 0);
  const costVal = Number(cartCost || 0);
  const discountAmt = discountType === 'percent' ? (retailVal * (Math.min(100, Number(discountValue || 0)) / 100)) : Number(discountValue || 0);
  const profitMargin = Math.max(0, retailVal - costVal - discountAmt);

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #0f172a; margin: 0; font-size: 22px; font-weight: 700;">JLIN Motorparts</h2>
        <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">POS Counter Discount Approval Request</p>
      </div>

      <div style="background-color: #f0fdf4; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 20px; border: 1px solid #bbf7d0;">
        <p style="color: #166534; font-size: 13px; font-weight: 600; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">Discount Approval OTP Code</p>
        <div style="font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #15803d; padding: 12px 24px; background: #ffffff; border: 2px dashed #86efac; border-radius: 8px; display: inline-block; font-family: monospace;">
          ${code}
        </div>
        <p style="color: #64748b; font-size: 12px; margin: 10px 0 0 0;">This OTP code expires in <strong>10 minutes</strong>.</p>
      </div>

      <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #edf2f7; font-size: 13px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="color: #64748b; padding: 5px 0;">Cashier / Counter:</td>
            <td style="color: #0f172a; font-weight: 600; text-align: right; padding: 5px 0;">${cashierName || 'Cashier'}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 5px 0;">Requested Discount:</td>
            <td style="color: #15803d; font-weight: 700; font-size: 15px; text-align: right; padding: 5px 0;">${formattedDiscount}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 5px 0;">Customer Reason:</td>
            <td style="color: #0f172a; font-weight: 500; text-align: right; padding: 5px 0;">${reason || 'Customer Discount Request'}</td>
          </tr>
          <tr style="border-top: 1px dashed #cbd5e1;">
            <td style="color: #64748b; padding: 8px 0 4px 0;">Cart Retail Total:</td>
            <td style="color: #0f172a; text-align: right; padding: 8px 0 4px 0;">₱${retailVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 4px 0;">Puhunan (Cost):</td>
            <td style="color: #0f172a; text-align: right; padding: 4px 0;">₱${costVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 4px 0;">Remaining Profit:</td>
            <td style="color: ${profitMargin > 0 ? '#15803d' : '#ef4444'}; font-weight: 600; text-align: right; padding: 4px 0;">₱${profitMargin.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          </tr>
        </table>
      </div>

      <p style="color: #334155; font-size: 13px; line-height: 1.5; margin: 0 0 14px 0;">
        The cashier is currently at the counter waiting for your approval. If you approve this discount, tell or send this <strong>${code}</strong> OTP code to the cashier.
      </p>

      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />

      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
        © JLIN Motorparts POS Security System. If you do not approve, instruct the cashier to cancel the discount.
      </p>
    </div>
  `;

  const subject = `[JLIN Motorparts] ${code} is your POS Discount Approval OTP`;
  const text = `Discount Approval OTP: ${code}\nRequested Discount: ${formattedDiscount}\nCashier: ${cashierName || 'Cashier'}\nReason: ${reason || 'N/A'}\nCart Retail: ₱${retailVal}\nPuhunan: ₱${costVal}\n\nGive this 6-digit OTP code to the cashier if approved. Code expires in 10 minutes.`;

  if (resendApiKey) {
    return await sendViaResend(resendApiKey, process.env.MAIL_FROM, to, subject, htmlContent, text);
  }

  const sender = process.env.MAIL_FROM || `"JLIN Motorparts" <${process.env.SMTP_USER}>`;
  return await transporter.sendMail({
    from: sender,
    to,
    subject,
    text,
    html: htmlContent,
  });
}

// Sends Low-Stock Restock Request Notification to Owner Gmail
async function sendRestockRequestEmail({ to, staffName, priority, notes, items = [] }) {
  const resendApiKey = process.env.RESEND_API_KEY || (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('re_') ? process.env.SMTP_PASS : null);

  const priorityColor = priority === 'URGENT' ? '#dc2626' : (priority === 'HIGH' ? '#d97706' : '#2563eb');
  const priorityBadgeBg = priority === 'URGENT' ? '#fee2e2' : (priority === 'HIGH' ? '#fef3c7' : '#dbeafe');

  const itemsRows = items.map(item => `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 10px 10px; font-weight: 600; color: #0f172a; text-align: left;">
        <div style="font-size: 13px; font-weight: 700;">${item.product_name}</div>
        <div style="font-size: 11px; color: #64748b; font-family: monospace; margin-top: 2px;">
          ${item.part_number || 'N/A'}${item.brand ? ` • ${item.brand}` : ''}
        </div>
      </td>
      <td style="padding: 10px 8px; text-align: center;">
        <span style="font-weight: 700; color: ${item.current_stock <= 0 ? '#dc2626' : '#d97706'};">
          ${item.current_stock ?? 0}
        </span>
        <span style="font-size: 11px; color: #94a3b8;">/ ${item.reorder_level || 5}</span>
      </td>
      <td style="padding: 10px 8px; text-align: center; font-weight: 800; color: #059669; font-size: 14px; font-family: monospace;">
        +${item.requested_qty} pcs
      </td>
      <td style="padding: 10px 10px; font-size: 12px; color: #334155; text-align: left;">
        <strong style="color: #0284c7;">${item.supplier_name || 'Linked FB Supplier'}</strong>
      </td>
    </tr>
  `).join('');

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 26px 22px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.3px;">JLIN Motorparts</h2>
          <p style="color: #64748b; font-size: 12px; margin: 3px 0 0 0;">Low-Stock Alerts & Supplier Restock Notice</p>
        </div>
        <div>
          <span style="background-color: ${priorityBadgeBg}; color: ${priorityColor}; border: 1px solid ${priorityColor}; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 800; text-transform: uppercase;">
            ${priority} RESTOCK
          </span>
        </div>
      </div>

      <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #edf2f7; font-size: 13px;">
        <p style="margin: 0 0 8px 0; color: #334155; line-height: 1.5;">
          Staff member <strong style="color: #0f172a;">${staffName}</strong> has requested to restock <strong style="color: #059669;">${items.length} low-stock item(s)</strong> that are running out on the shop shelf.
        </p>
        ${notes ? `
          <div style="background-color: #ffffff; border-left: 3px solid #f59e0b; padding: 8px 12px; border-radius: 4px; font-size: 12px; color: #475569; font-style: italic; margin-top: 8px;">
            "${notes}"
          </div>
        ` : ''}
      </div>

      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">
          Requested Motorparts to Buy (${items.length} Items):
        </h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #475569; font-size: 11px; text-transform: uppercase;">
              <th style="padding: 8px 10px; text-align: left;">Product / Part #</th>
              <th style="padding: 8px; text-align: center;">Shelf Stock</th>
              <th style="padding: 8px; text-align: center;">Order Qty</th>
              <th style="padding: 8px 10px; text-align: left;">Supplier</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
      </div>

      <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 14px; text-align: center; margin-bottom: 20px;">
        <p style="margin: 0 0 6px 0; font-weight: 700; color: #065f46; font-size: 13px;">
          Action Required: Open Admin Dashboard to Approve & Generate PO
        </p>
        <p style="margin: 0; font-size: 12px; color: #047857;">
          You can approve these items with one click on your Admin Command Center to automatically create the Purchase Orders for your Facebook suppliers.
        </p>
      </div>

      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 18px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
        © JLIN Motorparts Management System • Automated Stock Alert Notification.
      </p>
    </div>
  `;

  const subject = `🚨 [JLIN Motorparts] Low-Stock Restock Request (${items.length} items) - New PO Approval Needed`;
  const text = `Staff member ${staffName} has submitted a restock request for ${items.length} low-stock items.\nPriority: ${priority}\nStaff Note: ${notes || 'None'}\n\nRequested Items:\n` +
    items.map(i => `- ${i.product_name} (${i.part_number}): Current ${i.current_stock}, Requested +${i.requested_qty} pcs, Supplier: ${i.supplier_name || 'Generic'}`).join('\n') +
    `\n\nPlease log in to the Admin Dashboard to approve and generate Purchase Orders.`;

  if (resendApiKey) {
    return await sendViaResend(resendApiKey, process.env.MAIL_FROM, to, subject, htmlContent, text);
  }

  const sender = process.env.MAIL_FROM || `"JLIN Motorparts" <${process.env.SMTP_USER}>`;
  return await transporter.sendMail({
    from: sender,
    to,
    subject,
    text,
    html: htmlContent,
  });
}

// Sends POS Shift Handover & Preliminary Count Notification to Admin Gmail
async function sendShiftClosingSubmittedEmail({
  to,
  cashierName,
  shiftCode,
  actualCash,
  expectedCash,
  variance,
  varianceBadge,
  openingFloat,
  cashSales,
  gcashSales,
  notes,
  gcashTransactions = []
}) {
  const resendApiKey = process.env.RESEND_API_KEY || (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('re_') ? process.env.SMTP_PASS : null);

  const numActual = Number(actualCash || 0);
  const numExpected = Number(expectedCash || 0);
  const numVariance = Number(variance || 0);
  const varianceColor = numVariance === 0 ? '#15803d' : (numVariance < 0 ? '#dc2626' : '#ea580c');
  const varianceLabel = numVariance === 0 ? 'EXACT MATCH (₱0.00)' : (numVariance < 0 ? `SHORTAGE of -₱${Math.abs(numVariance).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `OVERAGE of +₱${numVariance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

  const gcashRows = (gcashTransactions && gcashTransactions.length > 0)
    ? gcashTransactions.map(tx => `
      <tr style="border-bottom: 1px solid #f1f5f9; font-size: 12px;">
        <td style="padding: 6px 4px; color: #0f172a; font-family: monospace;">${tx.receipt_no || tx.order_number || 'N/A'}</td>
        <td style="padding: 6px 4px; color: #0284c7; font-weight: 700; font-family: monospace;">₱${Number(tx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td style="padding: 6px 4px; color: #059669; font-weight: 700; font-family: monospace;">${tx.gcash_reference || 'N/A'}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="3" style="padding: 10px; text-align: center; color: #94a3b8; font-size: 12px;">No GCash sales punched during this shift</td></tr>`;

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #0f172a; margin: 0; font-size: 22px; font-weight: 800;">JLIN Motorparts</h2>
        <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Remote End-Shift • Cashier Count Submitted</p>
      </div>

      <div style="background-color: #f8fafc; border-radius: 10px; padding: 18px; margin-bottom: 20px; border: 1px solid #e2e8f0; text-align: center;">
        <span style="display: inline-block; background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 800; padding: 3px 10px; borderRadius: 4px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
          Awaiting Admin Verification
        </span>
        <div style="font-size: 14px; color: #475569; margin-bottom: 6px;">
          Cashier <strong>@${cashierName || 'Staff'}</strong> has submitted their closing count for shift <strong>${shiftCode || 'Shift'}</strong>.
        </div>
        <div style="font-size: 32px; font-weight: 900; color: #0f172a; font-family: monospace;">
          ₱${numActual.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">
          Actual Cash Counted by Staff
        </div>
      </div>

      <div style="background-color: #ffffff; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #edf2f7; font-size: 13px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="color: #64748b; padding: 5px 0;">Opening Panukli (Float):</td>
            <td style="color: #0f172a; font-weight: 600; text-align: right; padding: 5px 0; font-family: monospace;">₱${Number(openingFloat || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 5px 0;">Cash Sales In:</td>
            <td style="color: #15803d; font-weight: 600; text-align: right; padding: 5px 0; font-family: monospace;">+₱${Number(cashSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 5px 0;">GCash Sales (Digital):</td>
            <td style="color: #0284c7; font-weight: 600; text-align: right; padding: 5px 0; font-family: monospace;">₱${Number(gcashSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr style="border-top: 1px solid #e2e8f0;">
            <td style="color: #64748b; padding: 8px 0 4px 0;">Expected Drawer Cash:</td>
            <td style="color: #0f172a; font-weight: 700; text-align: right; padding: 8px 0 4px 0; font-family: monospace;">₱${numExpected.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 4px 0;">Actual Counted Cash:</td>
            <td style="color: #0f172a; font-weight: 700; text-align: right; padding: 4px 0; font-family: monospace;">₱${numActual.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr style="border-top: 1px dashed #cbd5e1;">
            <td style="color: #0f172a; font-weight: 700; padding: 8px 0;">Variance / Discrepancy:</td>
            <td style="color: ${varianceColor}; font-weight: 800; font-size: 14px; text-align: right; padding: 8px 0; font-family: monospace;">${varianceLabel}</td>
          </tr>
          ${notes ? `<tr><td colspan="2" style="padding-top: 8px; font-size: 12px; color: #64748b; font-style: italic;">Staff Note: "${notes}"</td></tr>` : ''}
        </table>
      </div>

      <!-- GCash Reconciliation Table -->
      <div style="margin-bottom: 24px;">
        <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
          GCash Transactions for Verification (Check GCash App):
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: left; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;">
          <thead>
            <tr style="background: #f1f5f9; font-size: 11px; color: #64748b; text-transform: uppercase;">
              <th style="padding: 6px 8px;">Order / Receipt</th>
              <th style="padding: 6px 8px;">Amount</th>
              <th style="padding: 6px 8px;">13-Digit Ref No.</th>
            </tr>
          </thead>
          <tbody>
            ${gcashRows}
          </tbody>
        </table>
      </div>

      <div style="text-align: center; margin-bottom: 20px;">
        <a href="https://jlin-motorparts.vercel.app/cash-float" style="background-color: #059669; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 28px; border-radius: 8px; display: inline-block;">
          Approve &amp; End Shift (Sign Off)
        </a>
      </div>

      <p style="color: #64748b; font-size: 12px; line-height: 1.5; text-align: center; margin: 0 0 14px 0;">
        The cashier's POS screen is now locked. Once you click Approve &amp; End Shift, the shift will be finalized and the cashier's login token will be revoked until you open their next shift.
      </p>

      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />

      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
        &copy; JLIN Motorparts POS Shift Security System.
      </p>
    </div>
  `;

  const subject = `🔔 [JLIN POS] Shift Handover & Count Submitted by @${cashierName || 'Cashier'} (${shiftCode || 'Shift'})`;
  const text = `Shift Closing Count Submitted\nCashier: ${cashierName}\nShift: ${shiftCode}\nCounted Cash: ₱${numActual}\nExpected Cash: ₱${numExpected}\nVariance: ${varianceLabel}\nGCash Sales: ₱${gcashSales}\n\nReview & Approve online: https://jlin-motorparts.vercel.app/cash-float`;

  if (resendApiKey) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(resendApiKey);
      const fromEmail = process.env.MAIL_FROM || 'onboarding@resend.dev';
      const result = await resend.emails.send({
        from: fromEmail,
        to: [to],
        subject,
        text,
        html: htmlContent,
      });
      return result;
    } catch (err) {
      console.warn('[Mailer] Resend send error, falling back to SMTP:', err.message);
    }
  }

  const sender = process.env.MAIL_FROM || `"JLIN Motorparts" <${process.env.SMTP_USER}>`;
  return await transporter.sendMail({
    from: sender,
    to,
    subject,
    text,
    html: htmlContent,
  });
}

module.exports = { sendOtpEmail, sendDiscountOtpEmail, sendRestockRequestEmail, sendShiftClosingSubmittedEmail };

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

// HTML escaping helper to prevent unescaped symbols from breaking email templates
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Sends Low-Stock Restock Request Notification to Owner Gmail (Grouped by Supplier)
async function sendRestockRequestEmail({ to, staffName = 'Staff', priority = 'NORMAL', notes = '', items = [] }) {
  const resendApiKey = process.env.RESEND_API_KEY || (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('re_') ? process.env.SMTP_PASS : null);

  const cleanStaffName = escapeHtml(staffName);
  const cleanNotes = notes ? String(notes).trim().slice(0, 250) : '';
  const escapedNotes = escapeHtml(cleanNotes);
  const sentDateTime = new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  // Group items by Default Supplier
  const groupedSuppliers = {};
  items.forEach(item => {
    const suppName = item.supplier_name || 'Generic / FB Supplier';
    if (!groupedSuppliers[suppName]) {
      groupedSuppliers[suppName] = {
        name: suppName,
        contact: item.supplier_phone || item.contact_number || item.fb_page_name || '',
        items: []
      };
    }
    groupedSuppliers[suppName].items.push(item);
  });

  // Build supplier-grouped table rows
  const tableRows = [];
  Object.values(groupedSuppliers).forEach((group, gIdx) => {
    group.items.forEach((item, iIdx) => {
      const currentStock = Number(item.current_stock ?? item.stock ?? 0);
      const reorderLevel = Number(item.reorder_level || 5);
      const isZero = currentStock <= 0;
      const specs = [item.brand, item.size, item.measurement, item.thread_type].filter(Boolean).join(' • ');
      const unitCost = Number(item.cost_price || item.unit_cost || 0);

      tableRows.push(`
        <tr style="border-bottom: 1px solid #e2e8f0; ${iIdx % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
          ${iIdx === 0 ? `
            <td rowspan="${group.items.length}" style="padding: 10px 12px; vertical-align: top; border-right: 1px solid #e2e8f0; background-color: #f8fafc;">
              <strong style="color: #0f172a; font-size: 13px;">${escapeHtml(group.name)}</strong>
              ${group.contact ? `<div style="font-size: 11px; color: #64748b; margin-top: 3px;">${escapeHtml(group.contact)}</div>` : ''}
            </td>
          ` : ''}
          <td style="padding: 10px 10px; font-family: monospace; font-size: 12px; color: #0284c7; white-space: nowrap; vertical-align: top;">
            ${escapeHtml(item.part_number || 'N/A')}
          </td>
          <td style="padding: 10px 12px; vertical-align: top;">
            <div style="font-weight: 700; color: #0f172a; font-size: 13px;">${escapeHtml(item.product_name)}</div>
            ${specs ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${escapeHtml(specs)}</div>` : ''}
          </td>
          <td style="padding: 10px 10px; text-align: center; vertical-align: top; white-space: nowrap;">
            ${isZero 
              ? `<strong style="color: #dc2626; font-size: 13px;">0 Out</strong>` 
              : `<strong style="color: #d97706; font-size: 13px;">${currentStock} left</strong>`}
            <span style="font-size: 11px; color: #64748b; display: block;">(Min: ${reorderLevel})</span>
          </td>
          <td style="padding: 10px 12px; text-align: right; vertical-align: top; font-weight: 700; color: #0f172a; font-size: 13px; white-space: nowrap;">
            ₱${unitCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </td>
        </tr>
      `);
    });
  });

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 26px 22px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
      <!-- Header -->
      <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.3px;">JLIN Motorparts</h2>
          <p style="color: #64748b; font-size: 12px; margin: 3px 0 0 0;">Low-Stock Alerts & Supplier Restock Notice</p>
        </div>
        <div>
          <span style="background-color: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 800; text-transform: uppercase;">
            ${items.length} ITEM${items.length === 1 ? '' : 'S'} TO RESTOCK
          </span>
        </div>
      </div>

      <!-- Top Callout Box (Only Rendered If Staff Typed a Note) -->
      ${escapedNotes ? `
        <div style="background-color: #fffbeb; border: 1.5px solid #f59e0b; border-left: 5px solid #d97706; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #92400e; margin-bottom: 4px;">
            ⚡ Staff Urgent Note / Customer Waiting:
          </div>
          <div style="font-size: 14px; font-weight: 600; color: #78350f; font-style: italic;">
            "${escapedNotes}"
          </div>
          <div style="font-size: 11px; color: #b45309; margin-top: 6px;">
            Sent by <strong>${cleanStaffName}</strong> on ${sentDateTime}.
          </div>
        </div>
      ` : ''}

      <!-- Intro Subtext -->
      <p style="margin: 0 0 16px 0; color: #334155; font-size: 13px; line-height: 1.5;">
        Cashier <strong style="color: #0f172a;">${cleanStaffName}</strong> submitted a restock request for <strong style="color: #059669;">${items.length} low-stock item(s)</strong> that are depleted or near minimum threshold on the shop shelves.
      </p>

      <!-- Supplier-Grouped Table -->
      <div style="margin-bottom: 22px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background-color: #0f172a; color: #ffffff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
              <th style="padding: 10px 12px; text-align: left; width: 25%;">Supplier</th>
              <th style="padding: 10px 10px; text-align: left; width: 18%;">Part #</th>
              <th style="padding: 10px 12px; text-align: left; width: 28%;">Product Name & Specs</th>
              <th style="padding: 10px 10px; text-align: center; width: 17%;">Stock / Reorder</th>
              <th style="padding: 10px 12px; text-align: right; width: 12%;">Last Unit Cost (Puhunan)</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows.join('')}
          </tbody>
        </table>
      </div>

      <!-- Footer Call to Action -->
      <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 14px; text-align: center; margin-bottom: 18px;">
        <p style="margin: 0 0 4px 0; font-weight: 700; color: #065f46; font-size: 13px;">
          Ready to Order: Open Admin Command Center to Message Suppliers & Receive Deliveries
        </p>
        <p style="margin: 0; font-size: 12px; color: #047857;">
          When the delivery truck arrives, recording Good Qty in Stock-In (Receiving) will automatically clear these restock alerts.
        </p>
      </div>

      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 18px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
        © JLIN Motorparts Management System • Automated Stock Alert Notification.
      </p>
    </div>
  `;

  const subject = `[JLIN MOTO PARTS] Restock Request — ${items.length} Low-Stock Items (From ${staffName})`;

  const textLines = [
    `[JLIN MOTO PARTS] Restock Request — ${items.length} Low-Stock Items`,
    `Sent by: ${staffName} on ${sentDateTime}`,
    cleanNotes ? `Staff Urgent Note: "${cleanNotes}"\n` : '',
    'Requested Motorparts Grouped by Supplier:'
  ];

  Object.values(groupedSuppliers).forEach(group => {
    textLines.push(`\n=== SUPPLIER: ${group.name} ${group.contact ? `(${group.contact})` : ''} ===`);
    group.items.forEach(item => {
      const currentStock = Number(item.current_stock ?? item.stock ?? 0);
      const reorderLevel = Number(item.reorder_level || 5);
      const unitCost = Number(item.cost_price || item.unit_cost || 0);
      textLines.push(`  • ${item.part_number || 'N/A'} - ${item.product_name} | Stock: ${currentStock} left (Min: ${reorderLevel}) | Puhunan: ₱${unitCost.toFixed(2)}`);
    });
  });

  const text = textLines.filter(Boolean).join('\n');

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

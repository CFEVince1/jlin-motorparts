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

module.exports = { sendOtpEmail };

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

// The code is sent in the email body only. It is never logged.
async function sendOtpEmail(to, code, purposeText) {
  const sender = process.env.MAIL_FROM || `"JLIN Motorparts" <${process.env.SMTP_USER}>`;

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

  await transporter.sendMail({
    from: sender,
    to,
    subject: 'Your JLIN Motorparts verification code',
    text:
      `Use this code to ${purposeText}:\n\n${code}\n\n` +
      'It expires in 10 minutes. If you did not request this, ignore this email.',
    html: htmlContent,
  });
}

module.exports = { sendOtpEmail };

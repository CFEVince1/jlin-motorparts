const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

// The code is sent in the email body only. It is never logged.
async function sendOtpEmail(to, code, purposeText) {
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: 'Your JLIN Motorparts verification code',
    text:
      `Use this code to ${purposeText}:\n\n${code}\n\n` +
      'It expires in 10 minutes. If you did not request this, ignore this email.',
  });
}

module.exports = { sendOtpEmail };

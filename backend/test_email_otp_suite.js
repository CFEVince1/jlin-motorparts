const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./config/db');
const mailer = require('./utils/mailer');

async function runOtpTests() {
  console.log('========================================================');
  console.log(' Starting Email Code (OTP) & Password Recovery Test Suite');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // Intercept sendOtpEmail to record calls without spamming SMTP during fast tests
  const originalSendOtpEmail = mailer.sendOtpEmail;
  const sentEmails = [];
  mailer.sendOtpEmail = async (to, code, purposeText) => {
    sentEmails.push({ to, code, purposeText, timestamp: Date.now() });
    return Promise.resolve();
  };

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('./routes/authRoutes'));
  app.use('/api/staff', require('./routes/staffRoutes'));

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Reset admin user password to known hash for test start
    const adminPassHash = await bcrypt.hash('admin123', 10);
    await db.query(
      "UPDATE users SET password = ?, email = NULL, email_verified_at = NULL, token_version = 1 WHERE username = 'admin'",
      [adminPassHash]
    );
    await db.query("DELETE FROM password_otps WHERE user_id = (SELECT id FROM users WHERE username = 'admin')");

    // Login as admin
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && loginData.token, 'Admin logged in successfully with admin123');
    const adminToken = loginData.token;

    // --- TEST 1: Request email verification with wrong password ---
    console.log('\n[TEST 1] Profile: Wrong current password rejection');
    const t1Res = await fetch(`${baseUrl}/api/staff/email/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ email: 'jlinmotorparts.noreply@gmail.com', currentPassword: 'wrongpassword' })
    });
    const t1Data = await t1Res.json();
    assert(t1Res.status === 422, 'Request rejected with status 422 for wrong current password');
    assert(t1Data.message === 'Incorrect current password.', 'Error message is "Incorrect current password."');

    // --- TEST 2: Email verification flow (wrong codes max 5, then correct code) ---
    console.log('\n[TEST 2] Email verification: 5 wrong attempts lock code, then new code verifies');
    sentEmails.length = 0;
    const t2Req = await fetch(`${baseUrl}/api/staff/email/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ email: 'jlinmotorparts.noreply@gmail.com', currentPassword: 'admin123' })
    });
    assert(t2Req.status === 200, 'Verification code requested successfully');
    assert(sentEmails.length === 1, 'Verification email was dispatched');
    const firstCode = sentEmails[0].code;

    // Enter wrong code 5 times
    let wrongAttemptsOk = true;
    for (let i = 1; i <= 5; i++) {
      const wrongRes = await fetch(`${baseUrl}/api/staff/email/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ otp: '000000' })
      });
      if (wrongRes.status !== 422) wrongAttemptsOk = false;
    }
    assert(wrongAttemptsOk, 'Wrong code rejected 5 times with status 422');

    // Attempt correct code on locked OTP row
    const lockedRes = await fetch(`${baseUrl}/api/staff/email/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ otp: firstCode })
    });
    assert(lockedRes.status === 422, 'Correct code rejected after reaching 5 failed attempts');

    // Request new code and verify successfully
    const t2Req2 = await fetch(`${baseUrl}/api/staff/email/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ email: 'jlinmotorparts.noreply@gmail.com', currentPassword: 'admin123' })
    });
    const secondCode = sentEmails[sentEmails.length - 1].code;
    const confirmRes = await fetch(`${baseUrl}/api/staff/email/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ otp: secondCode })
    });
    const confirmData = await confirmRes.json();
    assert(confirmRes.status === 200, 'Second code verified successfully with status 200');
    assert(confirmData.message.includes('Email verified'), 'Response confirmed email is verified');

    // Check status endpoint
    const statusRes = await fetch(`${baseUrl}/api/staff/email`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const statusData = await statusRes.json();
    assert(statusData.verified === true && statusData.email === 'jlinmotorparts.noreply@gmail.com', 'GET /staff/email reflects verified: true');

    // --- TEST 3: Public Forgot Password sends code to verified email ---
    console.log('\n[TEST 3] Public Forgot Password: Sends code for admin with verified email');
    sentEmails.length = 0;
    const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin' })
    });
    const forgotData = await forgotRes.json();
    assert(forgotRes.status === 200, 'Forgot password returned status 200');
    assert(forgotData.message.includes('If this admin account has a verified email'), 'Generic security message returned');
    // Wait briefly for background email promise
    await new Promise((r) => setTimeout(r, 100));
    assert(sentEmails.length === 1, 'Reset code was dispatched to verified email');
    const resetCode = sentEmails[0].code;

    // --- TEST 4: Reset password with code and verify login credentials ---
    console.log('\n[TEST 4] Reset Password: New password active, old password fails');
    const resetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        otp: resetCode,
        newPassword: 'NewSecureAdminPassword123!'
      })
    });
    assert(resetRes.status === 200, 'Password reset succeeded with status 200');

    // Old password should fail
    const oldLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    assert(oldLogin.status === 401, 'Old password (admin123) is rejected');

    // New password should succeed
    const newLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'NewSecureAdminPassword123!' })
    });
    assert(newLogin.status === 200, 'New password (NewSecureAdminPassword123!) logs in successfully');

    // --- TEST 5: Code reuse rejection ---
    console.log('\n[TEST 5] Replay prevention: Reusing the same code fails');
    const reuseRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        otp: resetCode,
        newPassword: 'AnotherPassword123!'
      })
    });
    assert(reuseRes.status === 400, 'Reused code was rejected with status 400');

    // --- TEST 6: Expired code (> 10 minutes) ---
    console.log('\n[TEST 6] Expiration: Code older than 10 minutes is rejected');
    sentEmails.length = 0;
    await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin' })
    });
    await new Promise((r) => setTimeout(r, 100));
    const expiredCode = sentEmails[0].code;

    // Simulate expiration in DB
    await db.query(
      "UPDATE password_otps SET expires_at = DATE_SUB(NOW(), INTERVAL 11 MINUTE) WHERE purpose = 'reset_password' AND used_at IS NULL"
    );

    const expiredRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        otp: expiredCode,
        newPassword: 'AnotherPassword123!'
      })
    });
    assert(expiredRes.status === 400, 'Expired code was rejected with status 400');

    // --- TEST 7: Staff username or non-verified account receives generic message, no email sent ---
    console.log('\n[TEST 7] Security: Staff or non-existent username receives generic message with NO email sent');
    sentEmails.length = 0;
    const staffForgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'staff' })
    });
    await new Promise((r) => setTimeout(r, 100));
    assert(staffForgotRes.status === 200, 'Staff forgot-password returned generic 200 status');
    assert(sentEmails.length === 0, 'No email was dispatched for staff account');

    const fakeForgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nonexistentuser' })
    });
    await new Promise((r) => setTimeout(r, 100));
    assert(fakeForgotRes.status === 200, 'Fake user forgot-password returned generic 200 status');
    assert(sentEmails.length === 0, 'No email was dispatched for nonexistent user');

    // --- TEST 8: Max sends per 15 minutes (rate limit on email dispatch) ---
    console.log('\n[TEST 8] Throttling: Maximum 3 sends per 15 minutes per user/purpose');
    // Clear existing reset_password OTPs
    await db.query("DELETE FROM password_otps WHERE purpose = 'reset_password'");
    sentEmails.length = 0;

    for (let i = 1; i <= 4; i++) {
      await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin' })
      });
      await new Promise((r) => setTimeout(r, 100));
    }
    assert(sentEmails.length === 3, 'Exactly 3 emails sent; the 4th send attempt within 15 minutes was suppressed');

    // --- TEST 9: Invalidation of prior JWT sessions upon password reset ---
    console.log('\n[TEST 9] Session Revocation: Pre-reset JWT token is rejected');
    const oldTokenRes = await fetch(`${baseUrl}/api/staff/email`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(oldTokenRes.status === 401, 'Pre-reset token is rejected with 401 (token_version mismatch)');

    // Restore admin password to standard admin123
    const finalHash = await bcrypt.hash('admin123', 10);
    await db.query(
      "UPDATE users SET password = ?, token_version = 1 WHERE username = 'admin'",
      [finalHash]
    );

    console.log('\n========================================================');
    console.log(` Test Results: ${passed} passed, ${failed} failed`);
    console.log('========================================================\n');

  } finally {
    mailer.sendOtpEmail = originalSendOtpEmail;
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runOtpTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

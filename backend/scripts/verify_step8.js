require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const assert = require('assert');
const app = require('../server');
const db = require('../config/db');
const bcrypt = require('bcryptjs');

async function runTests() {
  console.log('=====================================================');
  console.log(' Starting Step 8 Recovery Codes Test Suite');
  console.log('=====================================================\n');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Test server running on ${baseUrl}\n`);

  try {
    // 0. Ensure admin is admin123
    const initialHash = await bcrypt.hash('admin123', 10);
    await db.query("UPDATE users SET password = ?, token_version = 1 WHERE username = 'admin'", [initialHash]);

    // 1. Log in as admin, generate recovery codes
    console.log('Test 1: Admin login & Generate Recovery Codes');
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    assert.strictEqual(loginRes.status, 200, 'Admin login should succeed');
    const loginData = await loginRes.json();
    const adminTokenPreReset = loginData.token;
    assert.ok(adminTokenPreReset, 'Should have received admin JWT');

    // Generate codes
    const genRes = await fetch(`${baseUrl}/api/staff/recovery-codes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminTokenPreReset}`
      },
      body: JSON.stringify({ currentPassword: 'admin123' })
    });
    assert.strictEqual(genRes.status, 200, 'Generating codes should return 200');
    const genData = await genRes.json();
    assert.strictEqual(Array.isArray(genData.codes), true, 'Codes should be an array');
    assert.strictEqual(genData.codes.length, 8, 'Should generate exactly 8 recovery codes');
    genData.codes.forEach(code => {
      assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/, `Code ${code} should match XXXX-XXXX format without 0/O/1/I`);
    });
    console.log(`  ✓ Generated 8 codes successfully: ${genData.codes.slice(0, 3).join(', ')}...`);

    // Verify staff cannot generate codes (403 Forbidden)
    const staffLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'staff', password: 'staff123' })
    });
    const staffData = await staffLogin.json();
    const staffGen = await fetch(`${baseUrl}/api/staff/recovery-codes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${staffData.token}`
      },
      body: JSON.stringify({ currentPassword: 'staff123' })
    });
    assert.strictEqual(staffGen.status, 403, 'Staff must be forbidden from generating recovery codes');
    console.log('  ✓ Staff role correctly blocked with HTTP 403.');

    const codes = genData.codes;
    const testCode1 = codes[0];
    const testCode2 = codes[1];

    // 2. Reset with a valid code
    console.log('\nTest 2: Reset password using recovery code');
    const resetRes = await fetch(`${baseUrl}/api/auth/reset-with-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        code: testCode1,
        newPassword: 'NewAdminPassword456!'
      })
    });
    assert.strictEqual(resetRes.status, 200, 'Password reset should return 200');
    const resetData = await resetRes.json();
    assert.strictEqual(resetData.message, 'Password reset. Please log in with your new password.');
    console.log('  ✓ Password reset succeeded with valid code.');

    // 3. Log in with new password (old password must fail)
    console.log('\nTest 3: Verify old password fails and new password succeeds');
    const oldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    assert.strictEqual(oldLoginRes.status, 401, 'Old password must fail with 401');

    const newLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'NewAdminPassword456!' })
    });
    assert.strictEqual(newLoginRes.status, 200, 'New password must succeed with 200');
    console.log('  ✓ Old password rejected (401), new password authenticated (200).');

    // 4. Reuse the same code -> Must fail
    console.log('\nTest 4: Reuse previously used code');
    const reuseRes = await fetch(`${baseUrl}/api/auth/reset-with-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        code: testCode1,
        newPassword: 'AnotherPassword789!'
      })
    });
    assert.strictEqual(reuseRes.status, 400, 'Reused code must return 400');
    const reuseData = await reuseRes.json();
    assert.strictEqual(reuseData.message, 'Invalid username or recovery code.');
    console.log('  ✓ Reused recovery code rejected with 400.');

    // 5. Use valid code with a staff username -> Must fail
    console.log('\nTest 5: Use recovery code with non-admin (staff) username');
    const staffResetRes = await fetch(`${baseUrl}/api/auth/reset-with-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'staff',
        code: testCode2,
        newPassword: 'StaffNewPassword789!'
      })
    });
    assert.strictEqual(staffResetRes.status, 400, 'Staff username with recovery code must return 400');
    const staffResetData = await staffResetRes.json();
    assert.strictEqual(staffResetData.message, 'Invalid username or recovery code.');
    console.log('  ✓ Staff username rejected with identical 400 error.');

    // 7. Use a token from before the reset -> Must be rejected (token_version incremented)
    console.log('\nTest 7: Verify session revocation (pre-reset token rejected)');
    const revokedRes = await fetch(`${baseUrl}/api/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminTokenPreReset}`
      }
    });
    assert.strictEqual(revokedRes.status, 401, 'Pre-reset token must be rejected with 401');
    const revokedData = await revokedRes.json();
    console.log(`  ✓ Pre-reset session rejected with 401: "${revokedData.message}"`);

    // 6. Rate limiter test: Make wrong attempts until rate limit triggers
    console.log('\nTest 6: Rate limit reset-with-code route (max 5 in 15 mins)');
    // We already made 2 reset requests above from this IP (reuseRes, staffResetRes).
    // Let's make additional attempts to trigger rate limit (max is 5).
    let rateLimited = false;
    for (let i = 1; i <= 6; i++) {
      const res = await fetch(`${baseUrl}/api/auth/reset-with-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin',
          code: 'WRONG-CODE',
          newPassword: 'AttemptPassword123!'
        })
      });
      if (res.status === 429) {
        rateLimited = true;
        const msg = await res.json();
        assert.strictEqual(msg.message, 'Too many attempts. Try again in 15 minutes.');
        console.log(`  ✓ Rate limit successfully enforced on attempt (HTTP 429): "${msg.message}"`);
        break;
      }
    }
    assert.strictEqual(rateLimited, true, 'Rate limiter must trigger HTTP 429');

    // Restore admin password to admin123
    const restoreHash = await bcrypt.hash('admin123', 10);
    await db.query("UPDATE users SET password = ?, token_version = 1 WHERE username = 'admin'", [restoreHash]);
    console.log('\n  ✓ Clean state restored: Admin password restored to "admin123".');

    console.log('\n=====================================================');
    console.log(' 🎉 ALL 7 STEP 8 TESTS PASSED SUCCESSFULLY!');
    console.log('=====================================================');
  } finally {
    server.close();
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});

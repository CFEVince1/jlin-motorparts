require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('./config/db');

function askPassword(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function resetAdmin() {
    try {
        console.log('[reset-admin] Initializing password update...');

        // 1. Resolve password from CLI arg, ENV var, or interactive prompt
        let newPassword = process.argv[2] || process.env.ADMIN_PASSWORD;

        if (!newPassword) {
            if (process.stdin.isTTY) {
                newPassword = await askPassword('Enter new admin password: ');
            } else {
                console.error('❌ Error: Password not provided. Set ADMIN_PASSWORD environment variable or pass password as an argument: node reset-admin.js <password>');
                process.exit(1);
            }
        }

        if (!newPassword || newPassword.length < 8) {
            console.error('❌ Error: Password must be at least 8 characters long.');
            process.exit(1);
        }

        if (newPassword.toLowerCase() === 'admin123' || newPassword.toLowerCase() === 'password') {
            console.error('❌ Error: Insecure default passwords like "admin123" are not allowed.');
            process.exit(1);
        }

        const targetUser = process.env.ADMIN_USERNAME || 'admin';
        console.log(`[reset-admin] Updating credentials for user "${targetUser}"...`);

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password and increment token_version to invalidate prior sessions
        await db.query(`
            INSERT INTO users (username, password, role, token_version) 
            VALUES (?, ?, 'admin', 1) 
            ON DUPLICATE KEY UPDATE 
                password = VALUES(password), 
                role = 'admin',
                token_version = token_version + 1
        `, [targetUser, hashedPassword]);

        console.log('✅ Admin password updated successfully!');
        console.log(`👉 Username: ${targetUser}`);
        console.log('👉 Password: [UPDATED]');
        console.log('👉 Any existing active sessions have been invalidated (token_version incremented).');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error resetting admin user:', error.message);
        process.exit(1);
    }
}

resetAdmin();

const zxcvbn = require('zxcvbn');
const crypto = require('crypto');

async function validatePassword(password, username = '') {
    if (!password || password.length < 8) {
        return { valid: false, message: 'Password must be at least 8 characters long.' };
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!passwordRegex.test(password)) {
        return { valid: false, message: 'Password does not meet complexity requirements. It must contain at least one uppercase letter, one lowercase letter, one number, and one special character.' };
    }

    if (username && password.toLowerCase().includes(username.toLowerCase())) {
        return { valid: false, message: 'Password cannot contain your username.' };
    }

    // Check strength using zxcvbn
    const evaluation = zxcvbn(password);
    if (evaluation.score < 3) {
        let feedback = 'Password is too weak.';
        if (evaluation.feedback.warning) {
            feedback += ` ${evaluation.feedback.warning}.`;
        }
        return { valid: false, message: feedback };
    }

    // Check against Have I Been Pwned API (k-Anonymity model)
    try {
        const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
        const prefix = hash.slice(0, 5);
        const suffix = hash.slice(5);

        const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
        if (!response.ok) {
            // Fail open if the API is down
            return { valid: true };
        }

        const text = await response.text();
        const lines = text.split('\n');

        for (const line of lines) {
            const [hashSuffix, count] = line.split(':');
            if (hashSuffix.trim() === suffix) {
                return { valid: false, message: 'This password has appeared in a known data breach. Please choose another one.' };
            }
        }
    } catch (error) {
        console.error("Error checking Pwned Passwords API:", error);
        // Fail open if network request fails
    }

    return { valid: true };
}

module.exports = { validatePassword };

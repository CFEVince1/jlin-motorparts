const crypto = require('crypto');

// Six digits, zero-padded, e.g. "048213"
function makeOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

module.exports = { makeOtp };

const crypto = require('crypto');

// No 0, O, 1 or I, so codes are easy to read aloud and write down
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode() {
  const bytes = crypto.randomBytes(8);
  let raw = '';
  for (const b of bytes) raw += ALPHABET[b % ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

// Ignore dashes, spaces and letter case when comparing
function normalize(input) {
  return String(input).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

module.exports = { makeCode, normalize };

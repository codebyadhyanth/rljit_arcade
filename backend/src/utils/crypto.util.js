import crypto from 'crypto';
import argon2 from 'argon2';

/**
 * Valid dummy Argon2id hash used to perform constant-time verification
 * when a user is not found, eliminating user enumeration timing attacks.
 */
const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$Q29uc3RhbnRUaW1lU2FsdA$Vl0w0Z96jK4g2U10jT99+f01K09f+3/981jK01/8j9g';

/**
 * Returns a 32-byte (256-bit) Buffer derived from AES_ENCRYPTION_KEY using SHA-256
 */
function getAESKey() {
  const secret =
    process.env.AES_ENCRYPTION_KEY ||
    'rljit_aes_256_gcm_master_encryption_key_2026_rljit_arcade';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Hashes a plain text password using Argon2id
 * @param {string} password
 * @returns {Promise<string>} Argon2id hash
 */
export async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verifies a password against an Argon2id hash
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, hash) {
  try {
    return await argon2.verify(hash, password);
  } catch (err) {
    console.error('Argon2 verify error:', err.message);
    return false;
  }
}

/**
 * Performs a constant-time dummy verification when user is not found
 * @param {string} password
 * @returns {Promise<boolean>} always false
 */
export async function verifyDummyPassword(password = 'dummy_password') {
  try {
    await argon2.verify(DUMMY_ARGON2_HASH, password);
  } catch {
    // Ignore verification errors on dummy hash
  }
  return false;
}

/**
 * Encrypts plain text using AES-256-GCM
 * Output format: iv:authTag:ciphertext (hex encoded)
 * @param {string} plainText
 * @returns {string} iv:authTag:ciphertext
 */
export function encryptAES(plainText) {
  if (plainText === null || plainText === undefined) {
    return '';
  }
  const key = getAESKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(String(plainText), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM payload in format iv:authTag:ciphertext
 * @param {string} encryptedPayload
 * @returns {string} decrypted plain text
 */
export function decryptAES(encryptedPayload) {
  if (!encryptedPayload || typeof encryptedPayload !== 'string') {
    return '';
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid AES-256-GCM ciphertext format. Expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, cipherTextHex] = parts;
  const key = getAESKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherTextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Creates an HMAC-SHA256 blind index for exact search on encrypted fields
 * Normalized to lowercase trimmed strings
 * @param {string} value
 * @returns {string} 64-character hex blind index
 */
export function createBlindIndex(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const secret =
    process.env.BLIND_INDEX_SECRET ||
    'rljit_blind_index_hmac_sha256_secret_key_2026_rljit_arcade';
  return crypto.createHmac('sha256', secret).update(normalized).digest('hex');
}

/**
 * Generates a 12-character strong temporary password
 * Guaranteed to have uppercase, lowercase, numbers, and symbols
 * @param {number} length default 12
 * @returns {string} strong temporary password
 */
export function generateTempPassword(length = 12) {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghijkmnpqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%^&*()_+-=';
  const all = uppers + lowers + numbers + symbols;

  // Ensure at least one character from each set
  const passwordChars = [
    uppers[crypto.randomInt(0, uppers.length)],
    lowers[crypto.randomInt(0, lowers.length)],
    numbers[crypto.randomInt(0, numbers.length)],
    symbols[crypto.randomInt(0, symbols.length)],
  ];

  for (let i = passwordChars.length; i < length; i++) {
    passwordChars.push(all[crypto.randomInt(0, all.length)]);
  }

  // Fisher-Yates shuffle
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }

  return passwordChars.join('');
}

export default {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
  encryptAES,
  decryptAES,
  createBlindIndex,
  generateTempPassword,
};


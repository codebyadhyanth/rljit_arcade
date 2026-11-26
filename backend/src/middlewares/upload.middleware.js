import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure base upload directories exist
export const VAULT_DIR = path.resolve(__dirname, '../../uploads/vault');
export const OCR_DIR = path.resolve(__dirname, '../../uploads/ocr');
export const PRIVATE_VAULT_DIR = path.resolve(__dirname, '../../private_vault');

fs.mkdirSync(VAULT_DIR, { recursive: true });
fs.mkdirSync(OCR_DIR, { recursive: true });
fs.mkdirSync(PRIVATE_VAULT_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.pdf']);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
]);

export const DOC_ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.txt',
  '.md',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);

export const DOC_MIME_BY_EXT = {
  '.pdf': ['application/pdf'],
  '.txt': ['text/plain'],
  '.md': ['text/markdown', 'text/x-markdown', 'text/plain'],
  '.csv': ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg', 'image/jpg'],
  '.jpeg': ['image/jpeg', 'image/jpg'],
  '.webp': ['image/webp'],
};

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function badFileError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function createFileFilter() {
  return (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(mime)) {
      return cb(badFileError('Invalid file type. Only .jpg, .jpeg, .png, and .pdf are allowed.'));
    }
    return cb(null, true);
  };
}

function createDocumentFileFilter() {
  return (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const allowedMimes = DOC_MIME_BY_EXT[ext];
    if (!allowedMimes || !allowedMimes.includes(mime)) {
      return cb(
        badFileError(
          'Invalid file type. Allowed extensions: .pdf, .txt, .md, .csv, .png, .jpg, .jpeg, .webp'
        )
      );
    }
    return cb(null, true);
  };
}

function createStorage(destinationDir) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, destinationDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const uniqueFilename = `${crypto.randomUUID()}${ext}`;
      cb(null, uniqueFilename);
    },
  });
}

/**
 * Validates file content magic bytes (PDF, PNG, JPEG, WEBP) or strict NUL-free UTF-8 text (.txt/.md/.csv).
 * @param {string|Buffer} filePathOrBuffer
 * @param {string} [ext]
 * @returns {boolean}
 */
export function validateMagicBytes(filePathOrBuffer, ext = '') {
  try {
    const rawExt =
      ext || (typeof filePathOrBuffer === 'string' ? path.extname(filePathOrBuffer) : '');
    const cleanExt = rawExt
      ? rawExt.startsWith('.')
        ? rawExt.toLowerCase()
        : `.${rawExt.toLowerCase()}`
      : '';
    if (!DOC_ALLOWED_EXTENSIONS.has(cleanExt)) return false;

    const isText = cleanExt === '.txt' || cleanExt === '.md' || cleanExt === '.csv';
    let buf;
    if (Buffer.isBuffer(filePathOrBuffer)) {
      buf = filePathOrBuffer;
    } else if (typeof filePathOrBuffer === 'string' && filePathOrBuffer.trim()) {
      if (isText) {
        buf = fs.readFileSync(filePathOrBuffer);
      } else {
        const fd = fs.openSync(filePathOrBuffer, 'r');
        try {
          const head = Buffer.alloc(16);
          const bytesRead = fs.readSync(fd, head, 0, 16, 0);
          buf = head.subarray(0, bytesRead);
        } finally {
          fs.closeSync(fd);
        }
      }
    } else {
      return false;
    }

    if (!buf || buf.length === 0) return false;

    if (cleanExt === '.pdf') {
      return buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-';
    }
    if (cleanExt === '.png') {
      return (
        buf.length >= 4 &&
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47
      );
    }
    if (cleanExt === '.jpg' || cleanExt === '.jpeg') {
      return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    }
    if (cleanExt === '.webp') {
      return (
        buf.length >= 12 &&
        buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buf.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }

    // Safe UTF-8 text / markdown / csv without NUL bytes
    if (buf.includes(0x00)) return false;
    utf8Decoder.decode(buf);
    return true;
  } catch {
    return false;
  }
}

const limits = {
  fileSize: 5 * 1024 * 1024, // 5MB max
};

export const uploadVault = multer({
  storage: createStorage(VAULT_DIR),
  limits,
  fileFilter: createFileFilter(),
});

export const uploadOcr = multer({
  storage: createStorage(OCR_DIR),
  limits,
  fileFilter: createFileFilter(),
});

export const uploadDocumentVault = multer({
  storage: createStorage(PRIVATE_VAULT_DIR),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max
  fileFilter: createDocumentFileFilter(),
});

export default {
  uploadVault,
  uploadOcr,
  uploadDocumentVault,
  validateMagicBytes,
  VAULT_DIR,
  OCR_DIR,
  PRIVATE_VAULT_DIR,
  DOC_ALLOWED_EXTENSIONS,
  DOC_MIME_BY_EXT,
};

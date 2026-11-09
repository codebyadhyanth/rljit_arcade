import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure base upload directories exist
const VAULT_DIR = path.resolve(__dirname, '../../uploads/vault');
const OCR_DIR = path.resolve(__dirname, '../../uploads/ocr');

fs.mkdirSync(VAULT_DIR, { recursive: true });
fs.mkdirSync(OCR_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.pdf']);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
]);

function createFileFilter() {
  return (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
      return cb(
        new Error(`Invalid file type. Only .jpg, .jpeg, .png, and .pdf are allowed.`)
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
      const ext = path.extname(file.originalname).toLowerCase();
      const uniqueFilename = `${crypto.randomUUID()}${ext}`;
      cb(null, uniqueFilename);
    },
  });
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

export default {
  uploadVault,
  uploadOcr,
  VAULT_DIR,
  OCR_DIR,
};


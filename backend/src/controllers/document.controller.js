import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool, { ensureDatabaseExists } from '../config/db.js';
import {
  PRIVATE_VAULT_DIR,
  DOC_ALLOWED_EXTENSIONS,
  DOC_MIME_BY_EXT,
  validateMagicBytes,
} from '../middlewares/upload.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
const RLJIT_DATA_BASES = [
  path.resolve(WORKSPACE_ROOT, 'rljit_data'),
  path.resolve(BACKEND_ROOT, 'rljit_data'),
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const VALID_ACCESS_TIERS = [
  'STUDENT_PUBLIC',
  'FACULTY_INTERNAL',
  'HOD_AND_ADMIN',
  'SENSITIVE_ADMIN',
];

const SAFE_DOC_COLUMNS = `
  id, title, description, category, department, semester, subject_code,
  access_tier, file_name, mime_type, file_size, uploaded_by, is_active,
  created_at, updated_at
`;

function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Ignore cleanup errors
  }
}

function cleanStr(val) {
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanUpper(val) {
  const s = cleanStr(val);
  return s ? s.toUpperCase() : null;
}

function normalizePathCompare(p) {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

function isInsideBase(baseDir, candidatePath) {
  const rel = path.relative(normalizePathCompare(baseDir), normalizePathCompare(candidatePath));
  return Boolean(rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function resolveDocumentPath(rawStoragePath) {
  if (!rawStoragePath || typeof rawStoragePath !== 'string') {
    return { ok: false, status: 400, error: 'storage_path is required' };
  }
  if (rawStoragePath.includes('\0')) {
    return { ok: false, status: 400, error: 'Invalid storage_path: null byte detected' };
  }

  const trimmed = rawStoragePath.trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: 'storage_path cannot be empty' };
  }
  if (/(^|[\\/])\.\.([\\/]|$)/.test(trimmed)) {
    return { ok: false, status: 400, error: 'Directory traversal (..) is not allowed in storage_path' };
  }

  let candidate;
  let storedPath;

  if (path.isAbsolute(trimmed)) {
    candidate = path.resolve(trimmed);
    storedPath = candidate;
  } else {
    const slashNorm = trimmed.replace(/\\/g, '/').replace(/^\.\//, '');
    if (slashNorm.startsWith('private_vault/')) {
      candidate = path.resolve(BACKEND_ROOT, slashNorm);
      storedPath = slashNorm;
    } else if (slashNorm.startsWith('rljit_data/')) {
      const backendDataCandidate = path.resolve(BACKEND_ROOT, slashNorm);
      const workspaceDataCandidate = path.resolve(WORKSPACE_ROOT, slashNorm);
      candidate = fs.existsSync(backendDataCandidate) ? backendDataCandidate : workspaceDataCandidate;
      storedPath = slashNorm;
    } else {
      candidate = path.resolve(PRIVATE_VAULT_DIR, slashNorm);
      storedPath = `private_vault/${slashNorm}`;
    }
  }

  const allowedBases = [PRIVATE_VAULT_DIR, ...RLJIT_DATA_BASES];
  const matchedBase = allowedBases.find((base) => isInsideBase(base, candidate));
  if (!matchedBase) {
    return {
      ok: false,
      status: 403,
      error: 'Forbidden: storage_path escapes permitted vault directories',
    };
  }

  if (fs.existsSync(candidate)) {
    const realCandidate = fs.realpathSync(candidate);
    const realBase = fs.existsSync(matchedBase) ? fs.realpathSync(matchedBase) : matchedBase;
    if (!isInsideBase(realBase, realCandidate)) {
      return {
        ok: false,
        status: 403,
        error: 'Forbidden: Resolved symlink escapes permitted vault directories',
      };
    }
  }

  return { ok: true, path: candidate, storedPath };
}

/**
 * Resolves permitted document access tiers strictly from caller JWT role/tier/section.
 */
export function getReadableAccessTiers(user = {}) {
  const baseRole = String(user.baseRole || '').trim().toUpperCase();
  const adminTier = String(user.adminTier || '').trim().toUpperCase();
  const sectionCode = String(user.sectionCode || '').trim().toUpperCase();
  const subRoles = Array.isArray(user.subRoles)
    ? user.subRoles.map((r) => String(r).trim().toUpperCase())
    : [];

  if (
    adminTier === 'SUPER_ADMIN' ||
    ['MGT', 'PRN', 'PRINCIPAL', 'MANAGEMENT'].includes(sectionCode) ||
    subRoles.includes('PRINCIPAL') ||
    subRoles.includes('MANAGEMENT')
  ) {
    return ['STUDENT_PUBLIC', 'FACULTY_INTERNAL', 'HOD_AND_ADMIN', 'SENSITIVE_ADMIN'];
  }

  if (adminTier === 'REGULAR_ADMIN' || baseRole === 'ADMIN') {
    return ['STUDENT_PUBLIC', 'FACULTY_INTERNAL', 'HOD_AND_ADMIN'];
  }

  if (adminTier === 'HOD_ADMIN' || subRoles.includes('HOD')) {
    return ['STUDENT_PUBLIC', 'FACULTY_INTERNAL', 'HOD_AND_ADMIN'];
  }

  if (baseRole === 'FACULTY') {
    return ['STUDENT_PUBLIC', 'FACULTY_INTERNAL'];
  }

  return ['STUDENT_PUBLIC'];
}

function sanitizeHeaderFilename(name) {
  return String(name || 'document')
    .replace(/[\r\n"\\]/g, '_')
    .trim() || 'document';
}

function formatDocumentRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    department: row.department,
    semester: row.semester,
    subject_code: row.subject_code,
    access_tier: row.access_tier,
    file_name: row.file_name,
    mime_type: row.mime_type,
    file_size: Number(row.file_size || 0),
    uploaded_by: row.uploaded_by,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    view_url: `/api/v1/documents/${row.id}/view`,
  };
}

/**
 * POST /api/v1/documents
 * Upload multipart file or register safe metadata JSON for institutional documents.
 */
export async function uploadOrRegisterDocument(req, res) {
  const file = req.file;
  try {
    await ensureDatabaseExists();

    const baseRole = String(req.user?.baseRole || '').toUpperCase();
    const adminTier = String(req.user?.adminTier || '').toUpperCase();
    const subRoles = Array.isArray(req.user?.subRoles)
      ? req.user.subRoles.map((r) => String(r).toUpperCase())
      : [];
    const isAllowedUploader =
      adminTier === 'SUPER_ADMIN' ||
      baseRole === 'FACULTY' ||
      baseRole === 'ADMIN' ||
      adminTier === 'HOD_ADMIN' ||
      adminTier === 'REGULAR_ADMIN' ||
      subRoles.includes('HOD');

    if (!isAllowedUploader || baseRole === 'STUDENT') {
      safeUnlink(file?.path);
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Students cannot upload or register institutional documents',
      });
    }

    const body = req.body || {};
    const title = cleanStr(body.title);
    const description = cleanStr(body.description);
    const category = cleanUpper(body.category);
    const department = cleanUpper(body.department);
    const subjectCode = cleanUpper(body.subject_code ?? body.subjectCode);
    const accessTier = cleanUpper(body.access_tier ?? body.accessTier) || 'STUDENT_PUBLIC';

    if (!title || !category) {
      safeUnlink(file?.path);
      return res.status(400).json({
        success: false,
        error: 'title and category are required',
      });
    }

    if (!VALID_ACCESS_TIERS.includes(accessTier)) {
      safeUnlink(file?.path);
      return res.status(400).json({
        success: false,
        error: `access_tier must be one of: ${VALID_ACCESS_TIERS.join(', ')}`,
      });
    }

    const readableTiers = getReadableAccessTiers(req.user);
    if (!readableTiers.includes(accessTier)) {
      safeUnlink(file?.path);
      return res.status(403).json({
        success: false,
        error: `Forbidden: Your role cannot upload documents with access_tier '${accessTier}'`,
      });
    }

    let semester = null;
    const rawSem = body.semester;
    if (rawSem !== undefined && rawSem !== null && String(rawSem).trim() !== '') {
      const semStr = String(rawSem).trim();
      const parsedSem = Number(semStr);
      if (!/^\d+$/.test(semStr) || !Number.isInteger(parsedSem) || parsedSem < 1 || parsedSem > 8) {
        safeUnlink(file?.path);
        return res.status(400).json({
          success: false,
          error: 'semester must be an integer between 1 and 8',
        });
      }
      semester = parsedSem;
    }

    let fileName;
    let mimeType;
    let fileSize;
    let storagePath;

    if (file) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!DOC_ALLOWED_EXTENSIONS.has(ext) || !validateMagicBytes(file.path, ext)) {
        safeUnlink(file.path);
        return res.status(400).json({
          success: false,
          error: 'Uploaded file failed magic-byte and content signature validation',
        });
      }

      fileName = path.basename(file.originalname || path.basename(file.path)).slice(0, 255);
      mimeType = String(file.mimetype || DOC_MIME_BY_EXT[ext][0]).slice(0, 128);
      fileSize = Number(file.size || 0);
      storagePath = `private_vault/${path.basename(file.path)}`;
    } else {
      const rawFileName = cleanStr(body.file_name ?? body.fileName);
      const rawStoragePath = cleanStr(body.storage_path ?? body.storagePath);
      const rawMimeType = cleanStr(body.mime_type ?? body.mimeType);
      const rawFileSize = body.file_size ?? body.fileSize;

      if (!rawFileName || !rawStoragePath) {
        return res.status(400).json({
          success: false,
          error: 'Either a multipart file or metadata fields (file_name, storage_path) are required',
        });
      }

      const ext = path.extname(rawFileName).toLowerCase();
      if (!DOC_ALLOWED_EXTENSIONS.has(ext)) {
        return res.status(400).json({
          success: false,
          error: `Unsupported file extension '${ext || 'NONE'}'. Allowed: ${[...DOC_ALLOWED_EXTENSIONS].join(', ')}`,
        });
      }

      const allowedMimes = DOC_MIME_BY_EXT[ext];
      mimeType = rawMimeType ? rawMimeType.toLowerCase() : allowedMimes[0];
      if (!allowedMimes.includes(mimeType)) {
        return res.status(400).json({
          success: false,
          error: `Invalid mime_type '${mimeType}' for extension '${ext}'`,
        });
      }

      const resolved = resolveDocumentPath(rawStoragePath);
      if (!resolved.ok) {
        return res.status(resolved.status).json({ success: false, error: resolved.error });
      }

      const pathExt = path.extname(resolved.path).toLowerCase();
      if (!DOC_ALLOWED_EXTENSIONS.has(pathExt)) {
        return res.status(400).json({
          success: false,
          error: 'storage_path must reference a supported file extension',
        });
      }

      if (fs.existsSync(resolved.path)) {
        const stat = fs.statSync(resolved.path);
        if (!stat.isFile() || !validateMagicBytes(resolved.path, pathExt)) {
          return res.status(400).json({
            success: false,
            error: 'Target file on disk failed magic-byte validation',
          });
        }
        fileSize = stat.size;
      } else if (rawFileSize !== undefined && rawFileSize !== null && String(rawFileSize).trim() !== '') {
        const numSize = Number(rawFileSize);
        if (!Number.isFinite(numSize) || numSize < 0) {
          return res.status(400).json({ success: false, error: 'file_size must be a non-negative number' });
        }
        fileSize = Math.floor(numSize);
      } else {
        fileSize = 0;
      }

      fileName = path.basename(rawFileName).slice(0, 255);
      storagePath = resolved.storedPath;
    }

    const uploaderId = req.user.userId || req.user.id;
    const insertQuery = `
      INSERT INTO institutional_documents (
        title, description, category, department, semester, subject_code,
        access_tier, file_name, mime_type, file_size, storage_path, uploaded_by, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE)
      RETURNING ${SAFE_DOC_COLUMNS}, xmin::text AS pg_xmin, ctid::text AS pg_ctid;
    `;

    const result = await pool.query(insertQuery, [
      title.slice(0, 255),
      description,
      category.slice(0, 64),
      department ? department.slice(0, 32) : null,
      semester,
      subjectCode ? subjectCode.slice(0, 32) : null,
      accessTier,
      fileName,
      mimeType,
      fileSize,
      storagePath,
      uploaderId,
    ]);

    const row = result.rows[0];
    return res.status(201).json({
      success: true,
      message: 'Institutional document saved successfully',
      document: formatDocumentRow(row),
      dbReceipt: {
        persisted: true,
        pgTransactionId: row.pg_xmin,
        physicalDiskTuple: row.pg_ctid,
        storedInTable: 'institutional_documents',
        timestamp: row.created_at,
      },
    });
  } catch (error) {
    safeUnlink(file?.path);
    console.error('uploadOrRegisterDocument error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to save institutional document',
    });
  }
}

/**
 * GET /api/v1/documents
 * List institutional documents filtered strictly by caller role access_tier and optional query filters.
 */
export async function listDocuments(req, res) {
  try {
    await ensureDatabaseExists();

    const readableTiers = getReadableAccessTiers(req.user);
    const isStudent = String(req.user?.baseRole || '').toUpperCase() === 'STUDENT';

    const params = [readableTiers];
    const conditions = ['is_active = TRUE', 'access_tier = ANY($1::text[])'];

    // Students strictly ignore any ?access_tier= query param
    const requestedTier = cleanUpper(req.query.access_tier ?? req.query.accessTier);
    if (!isStudent && requestedTier) {
      if (!VALID_ACCESS_TIERS.includes(requestedTier)) {
        return res.status(400).json({
          success: false,
          error: `Invalid access_tier filter. Allowed: ${VALID_ACCESS_TIERS.join(', ')}`,
        });
      }
      params.push(requestedTier);
      conditions.push(`access_tier = $${params.length}`);
    }

    const category = cleanUpper(req.query.category);
    if (category) {
      params.push(category);
      conditions.push(`UPPER(category) = $${params.length}`);
    }

    const department = cleanUpper(req.query.department);
    if (department) {
      params.push(department);
      conditions.push(`UPPER(department) = $${params.length}`);
    }

    const rawSem = req.query.semester;
    if (rawSem !== undefined && rawSem !== null && String(rawSem).trim() !== '') {
      const semStr = String(rawSem).trim();
      const parsedSem = Number(semStr);
      if (!/^\d+$/.test(semStr) || !Number.isInteger(parsedSem) || parsedSem < 1) {
        return res.status(400).json({ success: false, error: 'semester must be a positive integer' });
      }
      params.push(parsedSem);
      conditions.push(`semester = $${params.length}`);
    }

    const q = cleanStr(req.query.q);
    if (q) {
      params.push(`%${q}%`);
      const p = `$${params.length}`;
      conditions.push(
        `(title ILIKE ${p} OR COALESCE(description, '') ILIKE ${p} OR COALESCE(subject_code, '') ILIKE ${p} OR category ILIKE ${p} OR file_name ILIKE ${p})`
      );
    }

    const query = `
      SELECT ${SAFE_DOC_COLUMNS}
      FROM institutional_documents
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC;
    `;

    const result = await pool.query(query, params);
    const documents = result.rows.map(formatDocumentRow);

    return res.status(200).json({
      success: true,
      count: documents.length,
      documents,
    });
  } catch (error) {
    console.error('listDocuments error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to list institutional documents',
    });
  }
}

/**
 * GET /api/v1/documents/:id/view
 * Securely streams a document after role clearance, canonical path containment, and disk existence checks.
 */
export async function viewDocument(req, res) {
  try {
    await ensureDatabaseExists();
    const { id } = req.params;

    if (!UUID_REGEX.test(String(id || '').trim())) {
      return res.status(400).json({ success: false, error: 'Invalid document ID format' });
    }

    const docRes = await pool.query(
      'SELECT * FROM institutional_documents WHERE id = $1 AND is_active = TRUE LIMIT 1;',
      [id.trim()]
    );

    if (docRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const doc = docRes.rows[0];
    const readableTiers = getReadableAccessTiers(req.user);
    if (!readableTiers.includes(doc.access_tier)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Access tier '${doc.access_tier}' requires higher privileges`,
      });
    }

    const resolved = resolveDocumentPath(doc.storage_path);
    if (!resolved.ok) {
      return res.status(resolved.status).json({ success: false, error: resolved.error });
    }

    if (!fs.existsSync(resolved.path) || !fs.statSync(resolved.path).isFile()) {
      return res.status(404).json({
        success: false,
        error: 'Document file not yet synced on disk',
        code: 'FILE_NOT_ON_DISK',
      });
    }

    const ext = path.extname(resolved.path).toLowerCase();
    if (!DOC_ALLOWED_EXTENSIONS.has(ext) || !validateMagicBytes(resolved.path, ext)) {
      return res.status(400).json({
        success: false,
        error: 'Document file failed integrity validation',
      });
    }

    const safeName = sanitizeHeaderFilename(doc.file_name);
    const contentType = doc.mime_type || DOC_MIME_BY_EXT[ext][0] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');

    const stream = fs.createReadStream(resolved.path);
    stream.on('error', (streamErr) => {
      console.error('Document stream error:', streamErr.message);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to stream document' });
      } else {
        res.end();
      }
    });
    return stream.pipe(res);
  } catch (error) {
    console.error('viewDocument error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to serve document',
    });
  }
}

/**
 * GET /api/v1/college-info
 * Returns college institutional metadata entries (empty array cleanly on 0 rows).
 */
export async function getCollegeInfo(req, res) {
  try {
    await ensureDatabaseExists();
    const sectionKey = cleanStr(req.query.section_key ?? req.query.sectionKey);

    const params = [];
    let whereSql = '';
    if (sectionKey) {
      params.push(sectionKey);
      whereSql = 'WHERE LOWER(section_key) = LOWER($1)';
    }

    const result = await pool.query(
      `SELECT id, section_key, title, content, source_url, updated_by, created_at, updated_at
       FROM college_metadata
       ${whereSql}
       ORDER BY section_key ASC;`,
      params
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      metadata: result.rows,
    });
  } catch (error) {
    console.error('getCollegeInfo error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch college metadata',
    });
  }
}

/**
 * POST /api/v1/college-info
 * Upserts a college_metadata entry by section_key (ADMIN, HOD, SUPER_ADMIN only).
 */
export async function upsertCollegeInfo(req, res) {
  try {
    await ensureDatabaseExists();
    const body = req.body || {};
    const sectionKey = cleanStr(body.section_key ?? body.sectionKey);
    const title = cleanStr(body.title);
    const sourceUrl = cleanStr(body.source_url ?? body.sourceUrl);
    const rawContent = body.content;

    if (!sectionKey || sectionKey.length > 64) {
      return res.status(400).json({
        success: false,
        error: 'section_key is required and must be <= 64 characters',
      });
    }

    if (!title || title.length > 255) {
      return res.status(400).json({
        success: false,
        error: 'title is required and must be <= 255 characters',
      });
    }

    let contentObj = {};
    if (rawContent !== undefined && rawContent !== null) {
      if (typeof rawContent === 'string') {
        try {
          contentObj = JSON.parse(rawContent);
        } catch {
          return res.status(400).json({
            success: false,
            error: 'content string must be valid JSON',
          });
        }
      } else if (typeof rawContent === 'object') {
        contentObj = rawContent;
      } else {
        return res.status(400).json({
          success: false,
          error: 'content must be a JSON object or array',
        });
      }
    }

    const actorId = req.user.userId || req.user.id;
    const upsertQuery = `
      INSERT INTO college_metadata (section_key, title, content, source_url, updated_by, updated_at)
      VALUES ($1, $2, $3::jsonb, $4, $5, NOW())
      ON CONFLICT (section_key)
      DO UPDATE SET
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        source_url = COALESCE(EXCLUDED.source_url, college_metadata.source_url),
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING id, section_key, title, content, source_url, updated_by, created_at, updated_at,
                xmin::text AS pg_xmin, ctid::text AS pg_ctid;
    `;

    const result = await pool.query(upsertQuery, [
      sectionKey,
      title,
      JSON.stringify(contentObj),
      sourceUrl,
      actorId,
    ]);

    const { pg_xmin, pg_ctid, ...item } = result.rows[0];
    return res.status(200).json({
      success: true,
      message: 'College metadata saved successfully',
      metadata: item,
      dbReceipt: {
        persisted: true,
        pgTransactionId: pg_xmin,
        physicalDiskTuple: pg_ctid,
        storedInTable: 'college_metadata',
        timestamp: item.updated_at,
      },
    });
  } catch (error) {
    console.error('upsertCollegeInfo error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to save college metadata',
    });
  }
}

export default {
  uploadOrRegisterDocument,
  listDocuments,
  viewDocument,
  getCollegeInfo,
  upsertCollegeInfo,
  getReadableAccessTiers,
  VALID_ACCESS_TIERS,
};

import pool from '../config/db.js';

/**
 * Atomically increments and returns the next sequence number for a given prefix.
 * @param {string} prefix unique sequence identifier
 * @param {number} startSeq initial starting number if not yet registered (e.g. 1 or 401)
 * @param {object} dbClient pg Pool or Client instance
 * @returns {Promise<number>} the allocated sequence number
 */
export async function getNextSequence(prefix, startSeq = 1, dbClient = pool) {
  const query = `
    INSERT INTO id_sequences (prefix, last_seq)
    VALUES ($1, $2)
    ON CONFLICT (prefix)
    DO UPDATE SET last_seq = id_sequences.last_seq + 1
    RETURNING last_seq;
  `;
  const res = await dbClient.query(query, [prefix, startSeq]);
  return parseInt(res.rows[0].last_seq, 10);
}

/**
 * Generates an atomic role-specific username / USN.
 * @param {object} options
 * @param {string} options.role 'ADMIN', 'FACULTY', 'STUDENT', 'HOD'
 * @param {string} [options.adminTier] 'SUPER_ADMIN', 'REGULAR_ADMIN', 'HOD_ADMIN'
 * @param {string} [options.sectionCode] 'ADM', 'ACC', 'PLC', 'SPT'
 * @param {string} [options.department] e.g. 'CS', 'IS', 'EC', 'ME'
 * @param {number} [options.admissionYear] e.g. 2026
 * @param {string} [options.entryType] 'REGULAR' or 'LATERAL'
 * @param {object} [dbClient] pg client or pool
 * @returns {Promise<string>} generated username
 */
export async function generateUsername(
  { role, adminTier, sectionCode, department, admissionYear, entryType },
  dbClient = pool
) {
  const currentYear = new Date().getFullYear();
  const year = admissionYear ? parseInt(admissionYear, 10) : currentYear;
  const yy = String(year).slice(-2);
  const dept = (department || '').trim().toUpperCase();
  const sec = (sectionCode || '').trim().toUpperCase();

  // 1. SUPER_ADMIN -> RLSUPER001
  if (adminTier === 'SUPER_ADMIN') {
    const seq = await getNextSequence('RLSUPER', 1, dbClient);
    return `RLSUPER${String(seq).padStart(3, '0')}`;
  }

  // 2. REGULAR_ADMIN -> RLADM_${sectionCode}_001 (e.g. RLADM_ADM_001)
  if (adminTier === 'REGULAR_ADMIN' || (role === 'ADMIN' && sec)) {
    const prefix = `RLADM_${sec}_`;
    const seq = await getNextSequence(prefix, 1, dbClient);
    return `RLADM_${sec}_${String(seq).padStart(3, '0')}`;
  }

  // 3. HOD_ADMIN / HOD -> RLHOD${YY}${DEPT}001 (e.g. RLHOD26CS001)
  if (adminTier === 'HOD_ADMIN' || role === 'HOD') {
    if (!dept) throw new Error('Department is required for HOD username generation');
    const prefix = `RLHOD${yy}${dept}`;
    const seq = await getNextSequence(prefix, 1, dbClient);
    return `RLHOD${yy}${dept}${String(seq).padStart(3, '0')}`;
  }

  // 4. Normal FACULTY -> RLFAC${YY}${DEPT}001
  if (role === 'FACULTY') {
    if (!dept) throw new Error('Department is required for Faculty username generation');
    const prefix = `RLFAC${yy}${dept}`;
    const seq = await getNextSequence(prefix, 1, dbClient);
    return `RLFAC${yy}${dept}${String(seq).padStart(3, '0')}`;
  }

  // 5. STUDENT -> REGULAR: 1RL${YY}${DEPT}001, LATERAL: 1RL${YY}${DEPT}401
  if (role === 'STUDENT') {
    if (!dept) throw new Error('Department is required for Student USN generation');
    const isLateral = String(entryType || '').trim().toUpperCase() === 'LATERAL';
    const startSeq = isLateral ? 401 : 1;
    const prefix = isLateral ? `1RL${yy}${dept}_LAT` : `1RL${yy}${dept}_REG`;
    const seq = await getNextSequence(prefix, startSeq, dbClient);
    return `1RL${yy}${dept}${String(seq).padStart(3, '0')}`;
  }

  throw new Error(`Unable to generate username: unknown role configuration`);
}

export default {
  getNextSequence,
  generateUsername,
};


/**
 * SQL DDL Schemas for RLJIT Arcade Database
 * Includes RBAC users, cryptographic blind indexes, atomic ID sequences, role tables,
 * and foreign key dual-table sync with cascading references.
 */

export const EXTENSIONS_SQL = `
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
`;

export const ID_SEQUENCES_SCHEMA = `
  CREATE TABLE IF NOT EXISTS id_sequences (
    prefix VARCHAR(32) PRIMARY KEY,
    last_seq INT NOT NULL DEFAULT 0
  );
`;

export const USERS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(32) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name_encrypted TEXT NOT NULL,
    email_encrypted TEXT NOT NULL,
    phone_encrypted TEXT NOT NULL,
    email_bidx CHAR(64) UNIQUE NOT NULL,
    phone_bidx CHAR(64) UNIQUE NOT NULL,
    base_role VARCHAR(20) NOT NULL CHECK (base_role IN ('ADMIN', 'FACULTY', 'STUDENT')),
    admin_tier VARCHAR(20) CHECK (admin_tier IS NULL OR admin_tier IN ('SUPER_ADMIN', 'REGULAR_ADMIN', 'HOD_ADMIN')),
    sub_roles TEXT[] DEFAULT '{}',
    permissions TEXT[] DEFAULT '{}',
    department VARCHAR(16),
    section_code VARCHAR(16),
    admission_year INT,
    semester INT,
    entry_type VARCHAR(16),
    created_by UUID REFERENCES users(id),
    login_count INT DEFAULT 0,
    last_login_at TIMESTAMPTZ,
    must_change_password BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

export const USERS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_users_username_btree ON users (username);
  CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON users USING gin (username gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS idx_users_email_bidx ON users (email_bidx);
  CREATE INDEX IF NOT EXISTS idx_users_phone_bidx ON users (phone_bidx);
  CREATE INDEX IF NOT EXISTS idx_users_base_role ON users (base_role);
  CREATE INDEX IF NOT EXISTS idx_users_admin_tier ON users (admin_tier);
  CREATE INDEX IF NOT EXISTS idx_users_department ON users (department);
`;

export const ROLE_SCHEMAS = {
  student: `
    CREATE TABLE IF NOT EXISTS student (
      id SERIAL PRIMARY KEY,
      user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      usn VARCHAR(50) UNIQUE NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE,
      department VARCHAR(100),
      semester INT,
      section VARCHAR(10),
      entry_type VARCHAR(50) DEFAULT 'REGULAR',
      lg_faculty_id INT,
      status VARCHAR(50) DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `,
  faculty: `
    CREATE TABLE IF NOT EXISTS faculty (
      id SERIAL PRIMARY KEY,
      user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      emp_id VARCHAR(50) UNIQUE NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE,
      department VARCHAR(100),
      designation VARCHAR(100),
      is_lg_coordinator BOOLEAN DEFAULT FALSE,
      is_hod BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `,
  admin: `
    CREATE TABLE IF NOT EXISTS admin (
      id SERIAL PRIMARY KEY,
      user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      admin_code VARCHAR(50) UNIQUE NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE,
      section_role VARCHAR(100),
      is_mastermind BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `
};

export const MIGRATIONS_SQL = `
  ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INT DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
  ALTER TABLE student ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE;
  ALTER TABLE faculty ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE;
  ALTER TABLE admin ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE;
  CREATE INDEX IF NOT EXISTS idx_student_user_id ON student (user_id);
  CREATE INDEX IF NOT EXISTS idx_faculty_user_id ON faculty (user_id);
  CREATE INDEX IF NOT EXISTS idx_admin_user_id ON admin (user_id);
`;

export const VALID_ROLES = ['student', 'faculty', 'admin'];

export const ALL_SCHEMAS = [
  EXTENSIONS_SQL,
  ID_SEQUENCES_SCHEMA,
  USERS_SCHEMA,
  USERS_INDEXES_SQL,
  ROLE_SCHEMAS.student,
  ROLE_SCHEMAS.faculty,
  ROLE_SCHEMAS.admin,
  MIGRATIONS_SQL
];

export default {
  EXTENSIONS_SQL,
  ID_SEQUENCES_SCHEMA,
  USERS_SCHEMA,
  USERS_INDEXES_SQL,
  ROLE_SCHEMAS,
  MIGRATIONS_SQL,
  VALID_ROLES,
  ALL_SCHEMAS
};

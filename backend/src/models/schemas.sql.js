/**
 * SQL DDL Schemas for RLJIT Arcade Database Roles
 * Scope: student, faculty, admin
 */

export const ROLE_SCHEMAS = {
  student: `
    CREATE TABLE IF NOT EXISTS student (
      id SERIAL PRIMARY KEY,
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
      admin_code VARCHAR(50) UNIQUE NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE,
      section_role VARCHAR(100),
      is_mastermind BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `
};

export const VALID_ROLES = ['student', 'faculty', 'admin'];

export const ALL_SCHEMAS = [
  ROLE_SCHEMAS.student,
  ROLE_SCHEMAS.faculty,
  ROLE_SCHEMAS.admin
];

export default ROLE_SCHEMAS;


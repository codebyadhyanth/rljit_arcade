/**
 * SQL DDL Schemas for RLJIT Arcade Database
 * Complete Enterprise Architecture including RBAC, Dual-Table Relational Sync,
 * Timetable & Swaps, Academic OCR & Lock/Unlock Auditing, LG Mentorship,
 * Document Vault, and Student Finance Ledgers.
 */

export const EXTENSIONS_SQL = `
  DO $$
  BEGIN
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
      END IF;
    EXCEPTION WHEN unique_violation OR duplicate_object THEN NULL;
    END;
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
      END IF;
    EXCEPTION WHEN unique_violation OR duplicate_object THEN NULL;
    END;
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      END IF;
    EXCEPTION WHEN unique_violation OR duplicate_object THEN NULL;
    END;
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
        CREATE EXTENSION IF NOT EXISTS "btree_gist";
      END IF;
    EXCEPTION WHEN unique_violation OR duplicate_object THEN NULL;
    END;
  END $$;
`;

export const ID_SEQUENCES_SCHEMA = `
  CREATE TABLE IF NOT EXISTS id_sequences (
    prefix VARCHAR(64) PRIMARY KEY,
    last_seq INT NOT NULL DEFAULT 0
  );
`;

export const USERS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) UNIQUE NOT NULL,
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
    department VARCHAR(32),
    section_code VARCHAR(16),
    admission_year INT,
    semester INT,
    entry_type VARCHAR(16),
    avatar_url TEXT,
    token_version INT DEFAULT 1,
    login_count INT DEFAULT 0,
    last_login_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
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
      core_branch VARCHAR(16),
      semester INT,
      academic_year INT,
      section VARCHAR(10),
      entry_type VARCHAR(50) DEFAULT 'REGULAR',
      lg_faculty_id UUID REFERENCES users(id),
      parent_whatsapp_encrypted TEXT,
      admission_quota VARCHAR(32) DEFAULT 'KEA_CET',
      cgpa NUMERIC(4,2) DEFAULT 0.00,
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
      classification VARCHAR(32),
      cabin_room VARCHAR(32),
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

export const DOMAIN_TABLES_SQL = `
  -- Module 2: Master Timetable & Class Swap Engine
  CREATE TABLE IF NOT EXISTS timetables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department VARCHAR(16) NOT NULL,
    semester INT NOT NULL,
    section VARCHAR(8) NOT NULL,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
    period_no INT NOT NULL,
    subject_code VARCHAR(20) NOT NULL,
    faculty_id UUID REFERENCES users(id),
    room_no VARCHAR(20),
    UNIQUE(department, semester, section, day_of_week, period_no)
  );

  CREATE TABLE IF NOT EXISTS timetable_swaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timetable_id UUID REFERENCES timetables(id) ON DELETE CASCADE,
    swap_date DATE NOT NULL,
    requesting_faculty_id UUID REFERENCES users(id),
    target_faculty_id UUID REFERENCES users(id),
    new_subject_code VARCHAR(20),
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Module 3: OCR Attendance & CIE Marks + EOD Lock + Dual-Approval Unlock
  CREATE TABLE IF NOT EXISTS ocr_staging_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_id UUID REFERENCES users(id),
    record_type VARCHAR(20) CHECK (record_type IN ('ATTENDANCE','CIE_MARKS')),
    department VARCHAR(16),
    semester INT,
    section VARCHAR(8),
    subject_code VARCHAR(20),
    image_path TEXT,
    extracted_json JSONB,
    status VARCHAR(20) DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS academic_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_usn VARCHAR(32) NOT NULL,
    subject_code VARCHAR(20) NOT NULL,
    department VARCHAR(16),
    semester INT,
    section VARCHAR(8),
    record_type VARCHAR(20) CHECK (record_type IN ('ATTENDANCE','CIE_1','CIE_2','CIE_3','ASSIGNMENT','OVERALL_INTERNAL')),
    session_date DATE DEFAULT CURRENT_DATE,
    period_no INT,
    attendance_status VARCHAR(12) CHECK (attendance_status IN ('P','A','OD_PRESENT', NULL)),
    marks_obtained NUMERIC(5,2),
    max_marks NUMERIC(5,2),
    recorded_by UUID REFERENCES users(id),
    locked_after TIMESTAMPTZ NOT NULL,
    is_unlocked_override BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS record_unlock_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_record_id UUID REFERENCES academic_records(id) ON DELETE CASCADE,
    student_usn VARCHAR(32),
    requested_by UUID REFERENCES users(id),
    department VARCHAR(16),
    current_val TEXT,
    proposed_val TEXT,
    reason TEXT NOT NULL,
    hod_status VARCHAR(20) DEFAULT 'PENDING',
    hod_approved_by UUID REFERENCES users(id),
    principal_status VARCHAR(20) DEFAULT 'PENDING',
    principal_approved_by UUID REFERENCES users(id),
    is_consumed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS academic_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_record_id UUID,
    unlock_request_id UUID,
    student_usn VARCHAR(32),
    old_val TEXT,
    new_val TEXT,
    changed_by UUID REFERENCES users(id),
    hod_id UUID REFERENCES users(id),
    principal_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Module 4: Local Guardian (LG) Mentorship & Leave Lifecycle
  CREATE TABLE IF NOT EXISTS lg_leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_usn VARCHAR(32),
    lg_faculty_id UUID REFERENCES users(id),
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'PENDING',
    parent_notified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Module 5: Admission Document Vault & Student Finance Ledgers
  CREATE TABLE IF NOT EXISTS student_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_usn VARCHAR(32) NOT NULL,
    doc_type VARCHAR(40) NOT NULL,
    file_path TEXT NOT NULL,
    verification_status VARCHAR(24) DEFAULT 'PENDING_REVIEW' CHECK (verification_status IN ('PENDING_REVIEW','VERIFIED','REJECTED')),
    custody_status VARCHAR(32) DEFAULT 'SUBMITTED_TO_ADMISSION_DEPT' CHECK (custody_status IN ('WITH_STUDENT','SUBMITTED_TO_ADMISSION_DEPT','RETURNED_TO_STUDENT')),
    verified_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS finance_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_usn VARCHAR(32) NOT NULL,
    category VARCHAR(20) CHECK (category IN ('TUITION_FEE','EXAM_FEE','MISC_FEE','FINE')),
    title VARCHAR(100) NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL,
    paid_amount NUMERIC(10,2) DEFAULT 0.00,
    due_date DATE,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING','PARTIAL','PAID','WAIVED')),
    imposed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS finance_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ledger_id UUID REFERENCES finance_ledgers(id) ON DELETE CASCADE,
    student_usn VARCHAR(32) NOT NULL,
    amount_paid NUMERIC(10,2) NOT NULL,
    payment_mode VARCHAR(20),
    ref_no_encrypted TEXT,
    recorded_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Module 6: Master Venue Directory & Multi-Stage Approval Engine
  CREATE TABLE IF NOT EXISTS venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    code VARCHAR(32) UNIQUE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('AUDITORIUM', 'SEMINAR_HALL', 'CONFERENCE_ROOM', 'LAB', 'OPEN_AIR_THEATRE')),
    category VARCHAR(50),
    department VARCHAR(32),
    building VARCHAR(100),
    floor VARCHAR(50),
    location_details TEXT,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    facilities JSONB DEFAULT '[]'::jsonb,
    amenities TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS venue_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_code VARCHAR(50) UNIQUE NOT NULL,
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
    initiator_id UUID NOT NULL REFERENCES users(id),
    requested_by UUID REFERENCES users(id),
    initiator_role VARCHAR(20) NOT NULL CHECK (initiator_role IN ('STUDENT', 'FACULTY', 'ADMIN')),
    coordinator_id UUID NOT NULL REFERENCES users(id),
    department VARCHAR(32) NOT NULL,
    event_title VARCHAR(255) NOT NULL,
    purpose TEXT NOT NULL,
    expected_headcount INTEGER NOT NULL CHECK (expected_headcount > 0),
    booking_date DATE,
    start_time VARCHAR(16),
    end_time VARCHAR(16),
    event_start_time TIMESTAMPTZ NOT NULL,
    event_end_time TIMESTAMPTZ NOT NULL,
    buffered_time_range TSTZRANGE NOT NULL,
    status VARCHAR(30) DEFAULT 'PENDING_HOD' NOT NULL CHECK (status IN (
      'PENDING_HOD',
      'PENDING_MANAGEMENT',
      'PENDING_PRINCIPAL',
      'PARTIALLY_ACCEPTED',
      'APPROVED',
      'REJECTED',
      'CANCELLED'
    )),
    active_terms_and_conditions JSONB,
    reviewed_by UUID REFERENCES users(id),
    remarks TEXT,
    hod_approved_by UUID REFERENCES users(id),
    hod_approved_at TIMESTAMPTZ,
    management_approved_by UUID REFERENCES users(id),
    management_approved_at TIMESTAMPTZ,
    principal_approved_by UUID REFERENCES users(id),
    principal_approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    cancelled_by UUID REFERENCES users(id),
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT prevent_venue_double_booking EXCLUDE USING gist (
      venue_id WITH =,
      buffered_time_range WITH &&
    ) WHERE (status IN ('PENDING_HOD', 'PENDING_MANAGEMENT', 'PENDING_PRINCIPAL', 'PARTIALLY_ACCEPTED', 'APPROVED'))
  );

  CREATE TABLE IF NOT EXISTS booking_timeline_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES venue_bookings(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id),
    actor_role VARCHAR(30),
    action VARCHAR(50) NOT NULL CHECK (action IN (
      'INITIATED',
      'HOD_APPROVED',
      'HOD_PARTIAL_TERMS',
      'HOD_REJECTED',
      'MANAGEMENT_APPROVED',
      'MANAGEMENT_PARTIAL_TERMS',
      'MANAGEMENT_REJECTED',
      'PRINCIPAL_APPROVED',
      'PRINCIPAL_PARTIAL_TERMS',
      'PRINCIPAL_REJECTED',
      'COORDINATOR_AGREED_TERMS',
      'COORDINATOR_COUNTER_PROPOSAL',
      'VENUE_CHANGE_REQUESTED',
      'TRANSFER_REQUESTED',
      'TRANSFER_APPROVED',
      'TRANSFER_REJECTED',
      'CANCELLED'
    )),
    previous_status VARCHAR(30),
    new_status VARCHAR(30),
    message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS venue_transfer_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES venue_bookings(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES users(id),
    new_coordinator_id UUID NOT NULL REFERENCES users(id),
    new_event_title VARCHAR(255) NOT NULL,
    new_purpose TEXT NOT NULL,
    urgency_reason TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'PENDING_COORDINATOR' NOT NULL CHECK (status IN (
      'PENDING_COORDINATOR',
      'APPROVED',
      'REJECTED'
    )),
    response_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ
  );

  -- Module 7: Normalized Operational Tables (Timetable Slots, Attendance, CIE Marks, Placements, Finance Records)
  CREATE TABLE IF NOT EXISTS timetable_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department VARCHAR(32),
    semester INT,
    section VARCHAR(8),
    day_of_week INT,
    period_no INT,
    start_time VARCHAR(16),
    end_time VARCHAR(16),
    subject_code VARCHAR(24),
    subject_name VARCHAR(120),
    faculty_id UUID REFERENCES users(id) ON DELETE SET NULL,
    room_no VARCHAR(32),
    swapped_faculty_id UUID REFERENCES users(id) ON DELETE SET NULL,
    swap_status VARCHAR(20),
    swap_requested_by UUID REFERENCES users(id),
    swap_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(department, semester, section, day_of_week, period_no)
  );

  CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    faculty_id UUID NOT NULL REFERENCES users(id),
    department VARCHAR(32) NOT NULL,
    semester INT NOT NULL,
    section VARCHAR(8) NOT NULL,
    subject_code VARCHAR(24) NOT NULL,
    attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    period_no INT NOT NULL DEFAULT 1,
    status VARCHAR(16) NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'LATE')),
    entry_mode VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, subject_code, attendance_date, period_no)
  );

  CREATE TABLE IF NOT EXISTS cie_marks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    faculty_id UUID NOT NULL REFERENCES users(id),
    department VARCHAR(32) NOT NULL,
    semester INT NOT NULL,
    subject_code VARCHAR(24) NOT NULL,
    subject_name VARCHAR(120),
    cie1 NUMERIC(5,2) DEFAULT 0.00,
    cie2 NUMERIC(5,2) DEFAULT 0.00,
    cie3 NUMERIC(5,2) DEFAULT 0.00,
    assignment NUMERIC(5,2) DEFAULT 0.00,
    total_cie NUMERIC(5,2) DEFAULT 0.00,
    max_marks NUMERIC(5,2) DEFAULT 50.00,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, semester, subject_code)
  );

  CREATE TABLE IF NOT EXISTS placement_drives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(120) NOT NULL,
    role_title VARCHAR(120) NOT NULL,
    package_lpa NUMERIC(6,2) NOT NULL,
    min_cgpa NUMERIC(4,2) DEFAULT 0.00,
    eligible_branches TEXT[] DEFAULT '{}',
    drive_date DATE NOT NULL,
    status VARCHAR(24) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'COMPLETED')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS placement_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drive_id UUID NOT NULL REFERENCES placement_drives(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(24) DEFAULT 'APPLIED' CHECK (status IN ('APPLIED', 'SHORTLISTED', 'SELECTED', 'REJECTED')),
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(drive_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS finance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fee_type VARCHAR(64) NOT NULL,
    amount_due NUMERIC(10,2) NOT NULL,
    amount_paid NUMERIC(10,2) DEFAULT 0.00,
    fine_amount NUMERIC(10,2) DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PAID', 'PARTIAL', 'PENDING')),
    due_date DATE,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Module 8: Institutional Metadata & Tiered Document Vault
  CREATE TABLE IF NOT EXISTS college_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_key VARCHAR(64) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_url TEXT,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS institutional_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(64) NOT NULL,
    department VARCHAR(32),
    semester INT,
    subject_code VARCHAR(32),
    access_tier VARCHAR(32) NOT NULL CHECK (access_tier IN (
      'STUDENT_PUBLIC',
      'FACULTY_INTERNAL',
      'HOD_AND_ADMIN',
      'SENSITIVE_ADMIN'
    )),
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    file_size BIGINT DEFAULT 0,
    storage_path TEXT NOT NULL,
    uploaded_by UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

export const VENUE_MIGRATIONS_SQL = `
  -- Non-breaking venue & booking extensions
  ALTER TABLE venues ADD COLUMN IF NOT EXISTS code VARCHAR(32) UNIQUE;
  ALTER TABLE venues ADD COLUMN IF NOT EXISTS category VARCHAR(50);
  ALTER TABLE venues ADD COLUMN IF NOT EXISTS building VARCHAR(100);
  ALTER TABLE venues ADD COLUMN IF NOT EXISTS floor VARCHAR(50);
  ALTER TABLE venues ADD COLUMN IF NOT EXISTS amenities TEXT[] DEFAULT '{}';

  ALTER TABLE venue_bookings ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES users(id);
  ALTER TABLE venue_bookings ADD COLUMN IF NOT EXISTS booking_date DATE;
  ALTER TABLE venue_bookings ADD COLUMN IF NOT EXISTS start_time VARCHAR(16);
  ALTER TABLE venue_bookings ADD COLUMN IF NOT EXISTS end_time VARCHAR(16);
  ALTER TABLE venue_bookings ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
  ALTER TABLE venue_bookings ADD COLUMN IF NOT EXISTS remarks TEXT;
  ALTER TABLE venue_bookings ADD COLUMN IF NOT EXISTS management_approved_by UUID REFERENCES users(id);
  ALTER TABLE venue_bookings ADD COLUMN IF NOT EXISTS management_approved_at TIMESTAMPTZ;

  -- Dynamically drop any old CHECK constraint on venue_bookings.status and recreate venue_bookings_status_check
  DO $$
  DECLARE
    r RECORD;
  BEGIN
    FOR r IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.conrelid = 'venue_bookings'::regclass
        AND c.contype = 'c'
        AND a.attname = 'status'
    LOOP
      EXECUTE format('ALTER TABLE venue_bookings DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;

    ALTER TABLE venue_bookings
    ADD CONSTRAINT venue_bookings_status_check
    CHECK (status IN (
      'PENDING_HOD',
      'PENDING_MANAGEMENT',
      'PENDING_PRINCIPAL',
      'PARTIALLY_ACCEPTED',
      'APPROVED',
      'REJECTED',
      'CANCELLED'
    ));
  END $$;

  -- Ensure prevent_venue_double_booking includes PENDING_MANAGEMENT
  DO $$
  DECLARE
    con_def TEXT;
  BEGIN
    SELECT pg_get_constraintdef(oid) INTO con_def
    FROM pg_constraint
    WHERE conrelid = 'venue_bookings'::regclass
      AND conname = 'prevent_venue_double_booking';

    IF con_def IS NOT NULL AND position('PENDING_MANAGEMENT' in con_def) = 0 THEN
      ALTER TABLE venue_bookings DROP CONSTRAINT prevent_venue_double_booking;
      con_def := NULL;
    END IF;

    IF con_def IS NULL THEN
      ALTER TABLE venue_bookings
      ADD CONSTRAINT prevent_venue_double_booking
      EXCLUDE USING gist (
        venue_id WITH =,
        buffered_time_range WITH &&
      ) WHERE (status IN ('PENDING_HOD', 'PENDING_MANAGEMENT', 'PENDING_PRINCIPAL', 'PARTIALLY_ACCEPTED', 'APPROVED'));
    END IF;
  END $$;

  -- Allow MANAGEMENT_APPROVED, MANAGEMENT_PARTIAL_TERMS, and MANAGEMENT_REJECTED in booking_timeline_logs action CHECK
  DO $$
  DECLARE
    r RECORD;
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'booking_timeline_logs'::regclass
        AND conname = 'booking_timeline_logs_action_check'
        AND position('MANAGEMENT_PARTIAL_TERMS' in pg_get_constraintdef(oid)) > 0
        AND position('MANAGEMENT_APPROVED' in pg_get_constraintdef(oid)) > 0
        AND position('MANAGEMENT_REJECTED' in pg_get_constraintdef(oid)) > 0
    ) THEN
      FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'booking_timeline_logs'::regclass
          AND c.contype = 'c'
          AND a.attname = 'action'
      LOOP
        EXECUTE format('ALTER TABLE booking_timeline_logs DROP CONSTRAINT IF EXISTS %I', r.conname);
      END LOOP;

      ALTER TABLE booking_timeline_logs
      ADD CONSTRAINT booking_timeline_logs_action_check
      CHECK (action IN (
        'INITIATED',
        'HOD_APPROVED',
        'HOD_PARTIAL_TERMS',
        'HOD_REJECTED',
        'MANAGEMENT_APPROVED',
        'MANAGEMENT_PARTIAL_TERMS',
        'MANAGEMENT_REJECTED',
        'PRINCIPAL_APPROVED',
        'PRINCIPAL_PARTIAL_TERMS',
        'PRINCIPAL_REJECTED',
        'COORDINATOR_AGREED_TERMS',
        'COORDINATOR_COUNTER_PROPOSAL',
        'VENUE_CHANGE_REQUESTED',
        'TRANSFER_REQUESTED',
        'TRANSFER_APPROVED',
        'TRANSFER_REJECTED',
        'CANCELLED'
      ));
    END IF;
  END $$;

  -- Performance & Cooldown Indexes
  CREATE INDEX IF NOT EXISTS idx_venues_type ON venues (type);
  CREATE INDEX IF NOT EXISTS idx_venues_department ON venues (department);
  CREATE INDEX IF NOT EXISTS idx_venues_is_active ON venues (is_active);
  CREATE INDEX IF NOT EXISTS idx_venue_bookings_venue_id ON venue_bookings (venue_id);
  CREATE INDEX IF NOT EXISTS idx_venue_bookings_initiator ON venue_bookings (initiator_id);
  CREATE INDEX IF NOT EXISTS idx_venue_bookings_coordinator ON venue_bookings (coordinator_id);
  CREATE INDEX IF NOT EXISTS idx_venue_bookings_status ON venue_bookings (status);
  CREATE INDEX IF NOT EXISTS idx_venue_bookings_dept ON venue_bookings (department);
  CREATE INDEX IF NOT EXISTS idx_venue_bookings_date ON venue_bookings (booking_date);
  CREATE INDEX IF NOT EXISTS idx_venue_bookings_cooldown ON venue_bookings (venue_id, status, cancelled_at);
  CREATE INDEX IF NOT EXISTS idx_booking_timeline_booking ON booking_timeline_logs (booking_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_venue_transfers_booking ON venue_transfer_requests (booking_id);
  CREATE INDEX IF NOT EXISTS idx_venue_transfers_requester ON venue_transfer_requests (requester_id);
`;

export const MIGRATIONS_SQL = `
  -- Non-breaking column widenings
  ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(64);
  ALTER TABLE users ALTER COLUMN department TYPE VARCHAR(32);
  ALTER TABLE id_sequences ALTER COLUMN prefix TYPE VARCHAR(64);
  ALTER TABLE timetables ALTER COLUMN department TYPE VARCHAR(32);
  ALTER TABLE ocr_staging_batches ALTER COLUMN department TYPE VARCHAR(32);
  ALTER TABLE academic_records ALTER COLUMN department TYPE VARCHAR(32);
  ALTER TABLE record_unlock_requests ALTER COLUMN department TYPE VARCHAR(32);

  -- Users table migrations
  ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT DEFAULT 1;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INT DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

  -- Student table migrations
  ALTER TABLE student ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE;
  ALTER TABLE student ADD COLUMN IF NOT EXISTS lg_faculty_id UUID REFERENCES users(id);
  ALTER TABLE student ADD COLUMN IF NOT EXISTS parent_whatsapp_encrypted TEXT;
  ALTER TABLE student ADD COLUMN IF NOT EXISTS admission_quota VARCHAR(32) DEFAULT 'KEA_CET';
  ALTER TABLE student ADD COLUMN IF NOT EXISTS cgpa NUMERIC(4,2) DEFAULT 0.00;
  ALTER TABLE student ADD COLUMN IF NOT EXISTS core_branch VARCHAR(16);
  ALTER TABLE student ADD COLUMN IF NOT EXISTS academic_year INT;

  -- Faculty table migrations
  ALTER TABLE faculty ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE;
  ALTER TABLE faculty ADD COLUMN IF NOT EXISTS cabin_room VARCHAR(32);
  ALTER TABLE faculty ADD COLUMN IF NOT EXISTS classification VARCHAR(32);

  -- Admin table migrations
  ALTER TABLE admin ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE;

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_student_user_id ON student (user_id);
  CREATE INDEX IF NOT EXISTS idx_student_lg_faculty_id ON student (lg_faculty_id);
  CREATE INDEX IF NOT EXISTS idx_faculty_user_id ON faculty (user_id);
  CREATE INDEX IF NOT EXISTS idx_admin_user_id ON admin (user_id);
  CREATE INDEX IF NOT EXISTS idx_timetables_slot ON timetables (department, semester, section, day_of_week);
  CREATE INDEX IF NOT EXISTS idx_academic_records_lookup ON academic_records (student_usn, subject_code, record_type);
  CREATE INDEX IF NOT EXISTS idx_finance_ledgers_usn ON finance_ledgers (student_usn);
  CREATE INDEX IF NOT EXISTS idx_student_documents_usn ON student_documents (student_usn);

  -- B-Tree & FK indexes on new normalized domain tables
  CREATE INDEX IF NOT EXISTS idx_timetable_slots_dept_sem ON timetable_slots (department, semester, section);
  CREATE INDEX IF NOT EXISTS idx_timetable_slots_faculty ON timetable_slots (faculty_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records (student_id, attendance_date);
  CREATE INDEX IF NOT EXISTS idx_attendance_section ON attendance_records (department, semester, section, attendance_date);
  CREATE INDEX IF NOT EXISTS idx_cie_student ON cie_marks (student_id, semester);
  CREATE INDEX IF NOT EXISTS idx_cie_section ON cie_marks (department, semester, subject_code);
  CREATE INDEX IF NOT EXISTS idx_placement_apps_drive ON placement_applications (drive_id);
  CREATE INDEX IF NOT EXISTS idx_placement_apps_student ON placement_applications (student_id);
  CREATE INDEX IF NOT EXISTS idx_finance_records_student ON finance_records (student_id, status);

  -- B-Tree indexes on Module 8 institutional_documents
  CREATE INDEX IF NOT EXISTS idx_institutional_docs_access_tier ON institutional_documents (access_tier);
  CREATE INDEX IF NOT EXISTS idx_institutional_docs_category ON institutional_documents (category);
  CREATE INDEX IF NOT EXISTS idx_institutional_docs_department ON institutional_documents (department);
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
  DOMAIN_TABLES_SQL,
  VENUE_MIGRATIONS_SQL,
  MIGRATIONS_SQL
];

export default {
  EXTENSIONS_SQL,
  ID_SEQUENCES_SCHEMA,
  USERS_SCHEMA,
  USERS_INDEXES_SQL,
  ROLE_SCHEMAS,
  DOMAIN_TABLES_SQL,
  VENUE_MIGRATIONS_SQL,
  MIGRATIONS_SQL,
  VALID_ROLES,
  ALL_SCHEMAS
};

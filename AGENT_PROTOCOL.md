# RLJIT ARCADE — AGENT GOVERNANCE & ARCHITECTURAL PROTOCOL

**Version:** 2.0.0  
**Classification:** Enterprise Academic Institution Operating System  
**Institution:** R.L. Jalappa Institute of Technology (RLJIT)  
**Security Standard:** Zero-Trust Dual-Table Persistence with Argon2id, AES-256-GCM, and HMAC-SHA256 Blind Indexing  

---

## 1. ARCHITECTURAL FOUNDATION

RLJIT Arcade operates on a hardened, deterministic three-tier architecture:
1. **Frontend Tier:**
   - **Web Portal:** Vite 6 + React 18 with Tailwind CSS adhering to the *Warm Neutral Bento Grid* design language (Obsidian `#121214`, Oxford Navy `#1E293B`, Slate `#F4F4F6`/`#F8FAFC`, Burnt Orange `#EA580C`, Emerald `#10B981`/`#15803D`, zero neon).
   - **Mobile App:** React Native with Expo SDK 58, custom StyleSheet tokens, and real-time offline-tolerant optimistic UI.
2. **Backend API Tier:**
   - Express.js 4 on Node.js 22 LTS with Helmet, HPP, CORS origin whitelisting, and rate limiting.
   - Dual-mount architecture: routes are accessible under `/api/v1/*` as well as backward-compatible root aliases.
3. **Database Tier:**
   - PostgreSQL 16+ relational engine with `pgcrypto`, `uuid-ossp`, and `pg_trgm` extensions.
   - **Strict Zero-Mock Mandate:** 100% of data presented on Web and Mobile interfaces originates from authenticated PostgreSQL API queries. No static dummy arrays or uncommitted client-side mocks are permitted.

---

## 2. SECURITY & ENCRYPTION ARCHITECTURE

### 2.1 Dual-Table Identity Model
Every authorized user in the system possesses:
- A primary record in `users` storing identity, credentials, active status, and session token versions.
- A strictly synchronized domain role record in `student`, `faculty`, or `admin`.

### 2.2 Cryptographic Standard
- **Passwords:** Hashed with Argon2id using unique random salts and memory-hard parameters.
- **Personally Identifiable Information (PII):** Full names, institutional emails, and phone numbers are encrypted at rest using **AES-256-GCM** with unique 12-byte initialization vectors (`iv`) and 16-byte authentication tags (`authTag`). Stored in format `iv:authTag:ciphertext`.
- **Blind Index Lookup:** Fast searching and uniqueness enforcement on encrypted fields without decryption using **HMAC-SHA256** blind indexing with institution-secret peppering (`email_bidx`, `phone_bidx`).
- **Session Revocation:** JWTs carry an atomic `token_version`. Instant global session invalidation occurs by incrementing `users.token_version` upon logout.

---

## 3. ROLE-BASED ACCESS CONTROL (RBAC) MATRIX

| Role / Tier | Scope / Permissions | Redirect Endpoint |
|---|---|---|
| `SUPER_ADMIN` | Global institutional mastermind, system bootstrap, authority provisioning, storage verifier, multi-tier override | `/portal/super-admin/mastermind-home` |
| `HOD_ADMIN` | Departmental scope across 11 disciplines (`CSE`, `AIML`, `DS`, `CYBER`, `ME`, `ECE`, `ALLIED_SCIENCE`, `MATH_SCI`, `PHY_CHEM`, `HUMANITIES`, `RND_ACADEMICS`). Timetable setup, student creation, stage-1 unlock review, venue approvals | `/portal/hod-admin/:dept/home` |
| `REGULAR_ADMIN` (7 Sections) | - `ADM` (Admissions): Global student provisioning, document vault verification.<br>- `ACC` (Finance): Student fee charges, payment recording, ledger balancing.<br>- `PLC` (Placements): Campus drive creation, applications review.<br>- `SPT` (Sports): Facility and sports quota administration.<br>- `MGT` (Management): Venue stage-2 approval.<br>- `PRN` (Principal): Final venue allotment, dual-approval unlock sign-off.<br>- `EXM` (Exam Cell): Hall ticket generation, exam clearance. | `/portal/admin/:sec/home` |
| `FACULTY` | Attendance marking (manual & OCR draft), CIE scoreupserting, mentorship radar, class swap requests | `/portal/faculty/home` |
| `STUDENT` | Timetable viewing, personal attendance & CIE scorecard, leave submission, document vault inspection, fee payment, placement application | `/portal/student/home` |

---

## 4. ACADEMIC & INSTITUTIONAL MODULE SPECIFICATIONS

### Module 1: Unified Profile & Role Dashboard
- `GET /api/v1/profile/me`: Returns decrypted caller identity, role metadata, and active permissions.
- `GET /api/v1/dashboard/metrics`: Dynamic aggregate counters computed directly via PostgreSQL aggregate functions.

### Module 2: Master Timetable & Class Swap Engine
- `GET /api/v1/timetable`: Filtered query on `timetable_slots` by department, semester, section, and faculty ID.
- `POST /api/v1/timetable`: Bulk creation and upserting of weekly period slots by HOD or Super Admin.
- `PATCH /api/v1/timetable/:id/swap`: Faculty slot swap request and peer/HOD acceptance workflow.
- `GET /api/v1/timetable/daily-view`: Schedule view with active swap overlays.

### Module 3: Academic Assessments & Attendance Console
- `POST /api/v1/attendance/manual`: Faculty bulk-marks section attendance inside a PostgreSQL transaction; returns atomic `dbReceipt`.
- `GET /api/v1/attendance/student/:studentId`: Live calculated overall percentage and per-subject attendance stats.
- `GET /api/v1/attendance/section`: Live section attendance records.
- `POST /api/v1/cie/manual`: Upserts Continuous Internal Evaluation marks (CIE 1, 2, 3, assignment); auto-computes `total_cie`.
- `GET /api/v1/cie/student/:studentId`: Student CIE scorecards.
- `GET /api/v1/cie/section`: Section-wide CIE assessment summary.
- Post-EOD dual-approval unlock workflow with permanent institutional audit logging.

### Module 4: Local Guardian (LG) Mentorship & At-Risk Radar
- `GET /api/v1/faculty/lg-mentees`: Mentee profiles and attendance summaries.
- `GET /api/v1/faculty/lg-radar`: Automated early-warning risk radar identifying students below threshold (attendance < 75% or dues pending).
- `POST /api/v1/student/leave-request` & `PATCH /api/v1/faculty/leave-approve/:id`: Student leave lifecycle.

### Module 5: Document Vault, Finance Ledgers & No-Dues Engine
- `POST /api/v1/admissions/documents/upload` & `PATCH /api/v1/admissions/documents/:id/verify`: Document custody tracking.
- `GET /api/v1/admissions/vault/:usn`: Student vault verification status.
- `GET /api/v1/student/clearance-status/:usn`: Automated 4-pillar No-Dues calculation (Attendance, Fees, Documents, Disciplinary).

### Module 6: Master Venue Booking & Multi-Stage Approval
- `GET /api/v1/venues` & `GET /api/v1/venues/availability`: Conflict detection using PostgreSQL range operator `&&` on `buffered_time_range`.
- `POST /api/v1/venues/bookings`: Request initiation with mandatory Faculty Coordinator.
- `PATCH /api/v1/venues/bookings/:id/review`: Unified multi-tier approval workflow (`PENDING_HOD` -> `PENDING_MANAGEMENT` -> `PENDING_PRINCIPAL` -> `APPROVED`), returning signed `dbReceipt`.
- Cancellation penalty: Enforces 24-hour PostgreSQL cooldown check preventing immediate re-booking of the same hall.

### Module 7: Campus Placement Drives & Applications
- `GET /api/v1/placements/drives`: List scheduled corporate drives with branch eligibility and minimum CGPA criteria.
- `POST /api/v1/placements/drives`: Placement Officer publishes drive details and salary packages.
- `POST /api/v1/placements/drives/:id/apply`: Student submits application with resume link; verifies eligibility.

### Module 8: Student Finance Obligations & Ledger Payments
- `GET /api/v1/finance/records`: Student fee ledger entries and fine tracking.
- `POST /api/v1/finance/records`: Finance Section Admin creates tuition, exam, or hostel obligations.
- `PATCH /api/v1/finance/records/:id/pay`: Partial or full fee payment reconciliation with `dbReceipt`.

---

## 5. INTERNAL BULK PROVISIONING ENGINE SPECIFICATION

### 5.1 Endpoint Security
- `POST /api/v1/internal/bulk-provision`
- `GET /api/v1/internal/bulk-provision/status/:jobId`
- **Protection:** Strictly non-public. Requires `x-internal-seed-key === process.env.BOOTSTRAP_SECRET` or an authenticated Super Admin JWT. Never exposed in public navigation menus.

### 5.2 Mathematical Student Intake Formula
The engine populates the exact institutional intake model across Years 1 through 4:
1. **Year 1 Intake (Semesters 1 & 2):**
   - **480 Regular Students** enrolled under department `ALLIED_SCIENCE` with branch preservation:
     * AIML: 60 students
     * Data Science (DS): 60 students
     * Cyber Security (CYBER): 60 students
     * Computer Science & Engineering (CSE): 180 students
     * Mechanical Engineering (ME): 60 students
     * Electronics & Communication (ECE): 60 students
     * **Total Year 1 = 480 students**
2. **Years 2, 3, and 4 (Semesters 3 through 8):**
   - Per-Year Regular Intake: 480 students (matching branch distribution) × 3 years = **1,440 regular students**
   - Per-Year Lateral Entry Intake (~10%): 48 students (`entryType = 'LATERAL'`, USN `401+`) × 3 years = **144 lateral students**
   - **Total Years 2, 3, 4 = 1,440 + 144 = 1,584 students**
3. **Grand Total Enrolled Students = 480 + 1,584 = 2,064 Students**

### 5.3 Faculty & Authority Distribution
- **11 Department HODs:** Assigned to `CSE`, `AIML`, `DS`, `CYBER`, `ME`, `ECE`, `ALLIED_SCIENCE`, `MATH_SCI`, `PHY_CHEM`, `HUMANITIES`, and `RND_ACADEMICS`.
- **7 Portal Administrators:** Assigned to `ADM`, `ACC`, `PLC`, `SPT`, `MGT`, `PRN`, and `EXM`.
- **310+ Teaching Faculty:** Distributed across all departments with formal academic classifications:
  * Assistant Professor
  * Professor
  * Associate Professor
  * Programmer
  * Lab Assistant

### 5.4 Execution Pipeline (Concurrency Pool of 10)
1. **Step A — Master CSV Generation:** Generates `hods.csv`, `portal_admins.csv`, `faculty.csv`, `students.csv`, `venues_and_bookings.csv`, `timetable.csv`, `attendance.csv`, `cie_marks.csv`, `placements.csv`, and `finance.csv` in `backend/seed_data/`.
2. **Step B — Concurrency Loopback Provisioning:** Invokes live endpoints (`/api/v1/super-admin/provision-authority` and `/api/v1/portals/provision-student`) via local HTTP loopback in worker batches of 10 with `x-idempotent: true` so all Argon2id hashes, AES-256-GCM ciphertexts, and HMAC blind indexes are generated through the active security middleware.
3. **Step C — Credentials Export:** Writes login credentials to root `/credentials/` grouped by department:
   - `credentials/CSE/`
   - `credentials/AIML/`
   - `credentials/DS/`
   - `credentials/CYBER/`
   - `credentials/ME/`
   - `credentials/ECE/`
   - `credentials/ALLIED_SCIENCE/`
   - `credentials/ADMIN_PORTALS/`
   Containing `hod_credentials.csv`, `faculty_credentials.csv`, and `student_credentials.csv`.

---

## 6. POSTGRESQL ATOMIC AUDIT RECEIPT (`dbReceipt`) STANDARD

Every transactional mutation endpoint in RLJIT Arcade produces an immutable audit receipt adhering to the following schema:

```json
{
  "receiptId": "RCPT-ATT-1732464000000-A9X2B",
  "transactionId": "tx_att_1732464000000",
  "table": "attendance_records",
  "status": "COMMITTED",
  "markedBy": "3b29d4c1-6b2a-4c28-98e3-066e4a2a1234",
  "department": "CSE",
  "semester": 3,
  "section": "A",
  "subjectCode": "BCS301",
  "attendanceDate": "2026-11-24",
  "periodNo": 1,
  "totalMarked": 60,
  "timestamp": "2026-11-24T21:45:00.000Z"
}
```

---

## 7. OPERATIONAL VERIFICATION & DIAGNOSTICS

- **System Diagnostics:** `GET {{baseUrl}}/db:rljit_arcade/connect`
- **Database Storage Verifier:** `GET {{baseUrl}}/api/v1/db/verify-storage` (Returns exact row counts across all database tables).
- **Automated Health Check:** `GET {{baseUrl}}/`
- **Postman Test Collection:** Available at `RLJIT_Arcade_API.postman_collection.json` containing 63+ automated integration assertions across 14 organized modules.

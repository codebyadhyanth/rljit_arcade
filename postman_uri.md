# RLJIT Arcade Backend — Postman URI Specification & Endpoints Guide

**Host:** `http://localhost:5000`  
**API Version:** `v1`  
**Base URL:** `http://localhost:5000/api/v1`  
**Environment Variables Required:**
- `baseUrl`: `http://localhost:5000`
- `SUPER_ADMIN_JWT_TOKEN`: Live JWT of RLSUPER001
- `ADMISSION_ADMIN_JWT_TOKEN`: Live JWT of Admission Officer
- `FINANCE_ADMIN_JWT_TOKEN`: Live JWT of Finance Officer
- `HOD_CS_JWT_TOKEN`: Live JWT of CSE HOD
- `FACULTY_JWT_TOKEN`: Live JWT of Faculty Member
- `STUDENT_JWT_TOKEN`: Live JWT of Student
- `bootstrapKey`: `RLJIT_SUPER_MASTERMIND_BOOTSTRAP_KEY_2026`

---

## 1. Setup & Diagnostics
- `GET {{baseUrl}}/`: Root Health Check
- `GET {{baseUrl}}/db:rljit_arcade/connect`: Initialize Core Tables & PostgreSQL Connection
- `GET {{baseUrl}}/db:rljit_arcade:student/connect`: Initialize Student Table
- `GET {{baseUrl}}/db:rljit_arcade:student/status`: Inspect Table Schema & Column Status
- `GET {{baseUrl}}/api/v1/db/verify-storage`: PostgreSQL Live Storage Verifier across all tables

## 2. Super Admin Initial Setup & Authority Provisioning
- `POST {{baseUrl}}/api/v1/auth/bootstrap-super-admin`: One-time Super Admin bootstrap
- `POST {{baseUrl}}/api/v1/super-admin/provision-authority`:
  - Body (Admission Admin): `{"authorityType": "REGULAR_ADMIN", "fullName": "...", "email": "...", "phone": "...", "sectionCode": "ADM", "subRoles": ["ADMISSION_OFFICER"]}`
  - Body (HOD Admin): `{"authorityType": "HOD", "fullName": "...", "email": "...", "phone": "...", "department": "CSE", "subRoles": ["HOD", "DEPT_HEAD"]}`
  - Body (Faculty): `{"authorityType": "FACULTY", "fullName": "...", "email": "...", "phone": "...", "department": "CSE", "classification": "Assistant Professor"}`

## 3. Student Provisioning Portals
- `POST {{baseUrl}}/api/v1/portals/provision-student`:
  - Enrolled under Admission Section or Department HOD.
  - Supports Year 1 Allied Science with core branch preservation:
    `{"fullName": "...", "email": "...", "phone": "...", "department": "ALLIED_SCIENCE", "coreBranch": "CSE", "semester": 1, "academicYear": 1, "entryType": "REGULAR"}`
  - Supports Years 2-4 regular and lateral entry (`entryType = 'LATERAL'`).

## 4. Authentication, Session Revocation & Fast Search
- `POST {{baseUrl}}/api/v1/auth/login`: Hashed Argon2id verification returning live JWT
- `POST {{baseUrl}}/api/v1/auth/logout`: Atomically increments `token_version`
- `GET {{baseUrl}}/api/v1/users/search?q=...`: HMAC Blind Index & trigram fuzzy search

## 5. Module 1: Unified Profile & Role Dashboard
- `GET {{baseUrl}}/api/v1/profile/me`: Full decrypted user identity & role metadata
- `GET {{baseUrl}}/api/v1/dashboard/metrics`: Role-scoped aggregate metrics

## 6. Module 2: Master Timetable & Class Swap Engine
- `GET {{baseUrl}}/api/v1/timetable?department=CSE&semester=3&section=A`: All slots by scope
- `POST {{baseUrl}}/api/v1/timetable`: Manual slot creation / upsert
- `PATCH {{baseUrl}}/api/v1/timetable/:id/swap`: Faculty class exchange request / approval
- `POST {{baseUrl}}/api/v1/timetable/master-setup`: Legacy weekly period setup
- `GET {{baseUrl}}/api/v1/timetable/daily-view?dept=CSE&sem=3&sec=A&date=...`: Schedule view with swap overlay
- `POST {{baseUrl}}/api/v1/timetable/swap-request`: Faculty swap request
- `PATCH {{baseUrl}}/api/v1/timetable/swap-approve/:swapId`: Swap acceptance

## 7. Module 3: Academic Assessments & Attendance Console
- `POST {{baseUrl}}/api/v1/attendance/manual`: Bulk-mark section attendance inside a transaction
- `GET {{baseUrl}}/api/v1/attendance/student/:studentId`: Live attendance percentages & subject breakdown
- `GET {{baseUrl}}/api/v1/attendance/section?department=CSE&semester=3&section=A`: Section records
- `POST {{baseUrl}}/api/v1/cie/manual`: Upsert Continuous Internal Evaluation marks
- `GET {{baseUrl}}/api/v1/cie/student/:studentId`: Student CIE scorecards
- `GET {{baseUrl}}/api/v1/cie/section?department=CSE&semester=3&subject_code=BCS301`: Section CIE marks
- `POST {{baseUrl}}/api/v1/faculty/ocr/extract-draft`: Simulated OCR handwritten draft parsing
- `POST {{baseUrl}}/api/v1/faculty/academic-record/commit`: Automatic EOD lock
- `PATCH {{baseUrl}}/api/v1/faculty/academic-record/:id/eod-edit`: EOD window edit
- `POST {{baseUrl}}/api/v1/faculty/unlock-request`: Post-EOD unlock justification
- `PATCH {{baseUrl}}/api/v1/hod/unlock-approve/:reqId`: Stage 1 HOD unlock approval
- `PATCH {{baseUrl}}/api/v1/principal/unlock-approve/:reqId`: Stage 2 Principal unlock approval
- `PATCH {{baseUrl}}/api/v1/faculty/academic-record/execute-unlocked/:reqId`: Single-use unlocked commit

## 8. Module 4: Local Guardian Mentorship & Leave Lifecycle
- `GET {{baseUrl}}/api/v1/faculty/lg-mentees`: Mentee profiles and attendance
- `GET {{baseUrl}}/api/v1/faculty/lg-radar`: Automated early-warning risk radar
- `POST {{baseUrl}}/api/v1/student/leave-request`: Submit leave application
- `PATCH {{baseUrl}}/api/v1/faculty/leave-approve/:id`: LG approve/reject leave
- `POST {{baseUrl}}/api/v1/hod/lg-mapping/assign`: HOD assigns mentor mapping
- `PATCH {{baseUrl}}/api/v1/hod/assign-subroles`: Assign sub-roles

## 9. Module 5: Document Vault, Finance Ledgers & No-Dues
- `POST {{baseUrl}}/api/v1/admissions/documents/upload`: Upload student document
- `PATCH {{baseUrl}}/api/v1/admissions/documents/:id/verify`: Physical custody verification
- `GET {{baseUrl}}/api/v1/admissions/vault/:usn`: View student document vault
- `POST {{baseUrl}}/api/v1/finance/ledger/charge`: Impose financial obligation
- `POST {{baseUrl}}/api/v1/finance/ledger/pay`: Record student fee payment
- `GET {{baseUrl}}/api/v1/finance/ledger/:usn`: View student fee statement
- `GET {{baseUrl}}/api/v1/student/clearance-status/:usn`: Automated 4-pillar No-Dues clearance

## 10. Module 6: Master Venue Booking & Multi-Stage Approvals
- `POST {{baseUrl}}/api/v1/venues`: Super Admin creates campus venue
- `GET {{baseUrl}}/api/v1/venues`: List active campus venues
- `PATCH {{baseUrl}}/api/v1/venues/:venueId`: Update venue details
- `GET {{baseUrl}}/api/v1/venues/availability`: Real-time slot conflict check
- `POST {{baseUrl}}/api/v1/venues/bookings`: Initiate booking request
- `GET {{baseUrl}}/api/v1/venues/bookings`: Role-scoped bookings list
- `GET {{baseUrl}}/api/v1/venues/bookings/:id`: Audit timeline logs & details
- `PATCH {{baseUrl}}/api/v1/venues/bookings/:id/review`: Unified multi-tier approval workflow
- `PATCH {{baseUrl}}/api/v1/venues/bookings/:id/hod-review`: HOD review
- `PATCH {{baseUrl}}/api/v1/venues/bookings/:id/coordinator-response`: Coordinator negotiation
- `PATCH {{baseUrl}}/api/v1/venues/bookings/:id/principal-review`: Principal review
- `PATCH {{baseUrl}}/api/v1/venues/bookings/:id/change-venue`: Change venue
- `POST {{baseUrl}}/api/v1/venues/bookings/:id/cancel`: Cancel booking & trigger 24h cooldown
- `POST {{baseUrl}}/api/v1/venues/bookings/:id/transfer-request`: Transfer request
- `PATCH {{baseUrl}}/api/v1/venues/transfer-requests/:transferId/respond`: Respond transfer

## 11. Module 7: Campus Placement Drives & Applications
- `GET {{baseUrl}}/api/v1/placements/drives`: List campus recruitment drives
- `POST {{baseUrl}}/api/v1/placements/drives`: Create placement drive
- `POST {{baseUrl}}/api/v1/placements/drives/:id/apply`: Student applies for drive

## 12. Module 8: Student Finance Obligations & Ledger Payments
- `GET {{baseUrl}}/api/v1/finance/records`: List student finance records
- `POST {{baseUrl}}/api/v1/finance/records`: Impose fee obligation
- `PATCH {{baseUrl}}/api/v1/finance/records/:id/pay`: Record fee payment

## 13. Internal Bulk Provisioning Engine (Non-Public)
- `POST {{baseUrl}}/api/v1/internal/bulk-provision`: Trigger background seeder
  - Header: `x-internal-seed-key: {{bootstrapKey}}`
  - Optional Query: `?csv_only=true` (Pre-generates master CSVs only)
- `GET {{baseUrl}}/api/v1/internal/bulk-provision/status/:jobId`: Live progress & counts
  - Header: `x-internal-seed-key: {{bootstrapKey}}`

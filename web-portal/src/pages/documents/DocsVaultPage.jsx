import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import DbReceiptCard from '../../components/DbReceiptCard';
import {
  AlertCircle,
  BookOpen,
  Building2,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Info,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';

const DOC_CATEGORIES = [
  'ALL',
  'SYLLABUS',
  'NOTES',
  'CIRCULAR',
  'QUESTION_PAPER',
  'LAB_MANUAL',
  'FACULTY_HANDOUT',
  'DEPT_POLICY',
  'SENSITIVE_ADMIN',
  'COLLEGE_INFO',
];

const UPLOAD_CATEGORIES = DOC_CATEGORIES.filter((c) => c !== 'ALL');

const DEPARTMENTS = [
  '',
  'GENERAL',
  'CSE',
  'AIML',
  'DS',
  'CYBER',
  'ECE',
  'ME',
  'ALLIED_SCIENCE',
  'MATH_SCI',
  'PHY_CHEM',
  'HUMANITIES',
  'RND_ACADEMICS',
];

const ADMISSION_DOC_TYPES = [
  'SSLC_MARKS_CARD',
  'PUC_12TH_MARKS_CARD',
  'TRANSFER_CERTIFICATE',
  'STUDY_CERTIFICATE',
  'CASTE_INCOME_CERTIFICATE',
  'CET_COMEDK_ALLOTMENT',
  'MIGRATION_CERTIFICATE',
  'AADHAAR_ID',
];

const VERIFICATION_STATUSES = ['PENDING_REVIEW', 'VERIFIED', 'REJECTED'];
const CUSTODY_STATUSES = [
  'SUBMITTED_TO_ADMISSION_DEPT',
  'WITH_STUDENT',
  'RETURNED_TO_STUDENT',
];

function normalizeReceipt(receipt) {
  if (!receipt) return null;
  return {
    ...receipt,
    storedInTables: receipt.storedInTables || receipt.storedInTable,
  };
}

function getRoleScopedAccessTiers({
  isSuperAdmin,
  isManagement,
  isPrincipal,
  isHod,
  isAdmin,
  isFaculty,
}) {
  if (isSuperAdmin || isManagement || isPrincipal) {
    return [
      { value: 'STUDENT_PUBLIC', label: 'STUDENT_PUBLIC — All Institutional Users' },
      { value: 'FACULTY_INTERNAL', label: 'FACULTY_INTERNAL — Faculty, HOD & Admins' },
      { value: 'HOD_AND_ADMIN', label: 'HOD_AND_ADMIN — HODs, Admins & Leadership' },
      { value: 'SENSITIVE_ADMIN', label: 'SENSITIVE_ADMIN — Super Admin, Management & Principal' },
    ];
  }
  if (isHod || isAdmin) {
    return [
      { value: 'STUDENT_PUBLIC', label: 'STUDENT_PUBLIC — All Institutional Users' },
      { value: 'FACULTY_INTERNAL', label: 'FACULTY_INTERNAL — Faculty, HOD & Admins' },
      { value: 'HOD_AND_ADMIN', label: 'HOD_AND_ADMIN — HODs & Administrative Sections' },
    ];
  }
  if (isFaculty) {
    return [
      { value: 'STUDENT_PUBLIC', label: 'STUDENT_PUBLIC — All Institutional Users' },
      { value: 'FACULTY_INTERNAL', label: 'FACULTY_INTERNAL — Faculty & Above' },
    ];
  }
  return [];
}

function parseCsvRows(csvText) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

function detectPreviewKind(contentType = '', fileName = '') {
  const ct = String(contentType).toLowerCase();
  const fn = String(fileName).toLowerCase();

  if (ct.includes('pdf') || fn.endsWith('.pdf')) return 'pdf';
  if (ct.includes('csv') || fn.endsWith('.csv')) return 'csv';
  if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(fn)) return 'image';
  if (
    ct.startsWith('text/') ||
    ct.includes('markdown') ||
    ct.includes('json') ||
    /\.(txt|md|markdown|json|log)$/.test(fn)
  ) {
    return 'text';
  }
  return 'unsupported';
}

async function extractBlobErrorDetails(err) {
  const status = err?.response?.status;
  let code = '';
  let message = err?.message || 'Unable to load document preview.';

  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const txt = await data.text();
      try {
        const parsed = JSON.parse(txt);
        code = parsed.code || '';
        message = parsed.error || parsed.message || message;
      } catch {
        if (txt) message = txt;
      }
    } catch {
      // ignore blob read failure
    }
  } else if (data && typeof data === 'object') {
    code = data.code || '';
    message = data.error || data.message || message;
  }

  return { status, code, message };
}

function formatMetadataContent(content) {
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object' && !Array.isArray(content)) {
    const keys = Object.keys(content);
    if (keys.length === 1 && keys[0] === 'summary' && typeof content.summary === 'string') {
      return content.summary;
    }
  }
  return JSON.stringify(content, null, 2);
}

function normalizeCollegeInfoList(data) {
  if (!data) return [];
  const raw =
    data.metadata ||
    data.items ||
    data.records ||
    data.collegeInfo ||
    data.college_info ||
    data.info ||
    (Array.isArray(data) ? data : null);

  if (Array.isArray(raw)) {
    return raw.map((item, idx) => ({
      id: item.id || item.section_key || item.info_key || item.key || idx,
      section_key: item.section_key || item.info_key || item.key || item.slug || `INFO_${idx + 1}`,
      title: item.title || item.label || item.section_key || item.info_key || 'Institutional Metadata',
      source_url: item.source_url || item.sourceUrl || null,
      content: formatMetadataContent(item.content ?? item.value ?? item.body ?? item.description ?? ''),
      rawContent: item.content ?? null,
      updated_at: item.updated_at || item.updatedAt || null,
    }));
  }

  if (raw && typeof raw === 'object') {
    return Object.entries(raw).map(([k, v], idx) => ({
      id: k || idx,
      section_key: k,
      title: typeof v === 'object' && v?.title ? v.title : k.replace(/_/g, ' '),
      source_url: (typeof v === 'object' && (v?.source_url || v?.sourceUrl)) || null,
      content: formatMetadataContent(typeof v === 'object' ? v?.content ?? v : v),
      rawContent: v,
      updated_at: (typeof v === 'object' && v?.updated_at) || null,
    }));
  }

  return [];
}

export default function DocsVaultPage() {
  const { user } = useAuth();
  const subRoles = Array.isArray(user?.subRoles) ? user.subRoles : [];
  const secCode = String(user?.sectionCode || '').trim().toUpperCase();

  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const isHod = user?.adminTier === 'HOD_ADMIN' || subRoles.includes('HOD');
  const isAdmin = user?.baseRole === 'ADMIN';
  const isFaculty = user?.baseRole === 'FACULTY';
  const isStudent = user?.baseRole === 'STUDENT';
  const isManagement = isSuperAdmin || secCode === 'MGT' || subRoles.includes('MANAGEMENT');
  const isPrincipal =
    isSuperAdmin || secCode === 'PRN' || secCode === 'PRINCIPAL' || subRoles.includes('PRINCIPAL');
  const isAdmissionAdmin = isSuperAdmin || (isAdmin && secCode === 'ADM');

  const canUploadDocs = isSuperAdmin || isHod || isFaculty || isAdmin;
  const canUpsertCollegeInfo = isSuperAdmin || isHod || isAdmin;
  const canViewAdmissionVault =
    isStudent || isAdmissionAdmin || isSuperAdmin || isHod || isManagement || isPrincipal;

  const accessTierOptions = useMemo(
    () =>
      getRoleScopedAccessTiers({
        isSuperAdmin,
        isManagement,
        isPrincipal,
        isHod,
        isAdmin,
        isFaculty,
      }),
    [isSuperAdmin, isManagement, isPrincipal, isHod, isAdmin, isFaculty]
  );

  // Documents & College Info state
  const [category, setCategory] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState('');

  const [collegeInfoList, setCollegeInfoList] = useState([]);
  const [infoLoading, setInfoLoading] = useState(true);
  const [infoError, setInfoError] = useState('');

  // Upload / Register Document state
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploadMode, setUploadMode] = useState('FILE'); // 'FILE' | 'METADATA'
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [docReceipt, setDocReceipt] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [docForm, setDocForm] = useState({
    title: '',
    category: 'NOTES',
    department: user?.department || 'GENERAL',
    semester: '',
    subject_code: '',
    access_tier: 'STUDENT_PUBLIC',
    description: '',
    file_name: '',
    storage_path: '',
  });

  // College Info Upsert state
  const [showInfoForm, setShowInfoForm] = useState(false);
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoSaveError, setInfoSaveError] = useState('');
  const [infoSaveSuccess, setInfoSaveSuccess] = useState('');
  const [infoForm, setInfoForm] = useState({
    section_key: '',
    title: '',
    source_url: '',
    content: '',
  });

  // Authenticated Blob Viewer Modal state
  const activeBlobUrlRef = useRef(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null); // { code, status, message }
  const [previewKind, setPreviewKind] = useState(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [previewCsvRows, setPreviewCsvRows] = useState([]);
  const [previewMime, setPreviewMime] = useState('');

  // Secondary Admissions Certificate Vault state
  const [vaultOpen, setVaultOpen] = useState(isStudent || isAdmissionAdmin);
  const [vaultUsn, setVaultUsn] = useState(isStudent ? user?.username || '' : '');
  const [vaultDocs, setVaultDocs] = useState([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultError, setVaultError] = useState('');
  const [vaultSuccess, setVaultSuccess] = useState('');
  const [certFile, setCertFile] = useState(null);
  const [certUsn, setCertUsn] = useState('');
  const [certDocType, setCertDocType] = useState('SSLC_MARKS_CARD');
  const [certUploading, setCertUploading] = useState(false);
  const [verifyingDocId, setVerifyingDocId] = useState(null);

  const revokeActiveBlobUrl = useCallback(() => {
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
    setPreviewBlobUrl('');
  }, []);

  useEffect(() => {
    return () => {
      revokeActiveBlobUrl();
    };
  }, [revokeActiveBlobUrl]);

  const fetchDocuments = useCallback(async () => {
    setDocsLoading(true);
    setDocsError('');
    try {
      const params = new URLSearchParams();
      if (category && category !== 'ALL') params.set('category', category);
      if (departmentFilter) params.set('department', departmentFilter);
      if (semesterFilter) params.set('semester', semesterFilter);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const qs = params.toString();
      const res = await api.get(`/api/v1/documents${qs ? `?${qs}` : ''}`);
      const list = Array.isArray(res.data?.documents)
        ? res.data.documents
        : Array.isArray(res.data?.items)
        ? res.data.items
        : Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
        ? res.data
        : [];
      setDocuments(list);
    } catch (err) {
      if (err.response?.status === 404) {
        setDocuments([]);
      } else {
        setDocsError(
          err.response?.data?.error ||
            err.response?.data?.message ||
            err.message ||
            'Failed to load institutional documents.'
        );
      }
    } finally {
      setDocsLoading(false);
    }
  }, [category, departmentFilter, semesterFilter, searchQuery]);

  const fetchCollegeInfo = useCallback(async () => {
    setInfoLoading(true);
    setInfoError('');
    try {
      const res = await api.get('/api/v1/college-info');
      setCollegeInfoList(normalizeCollegeInfoList(res.data));
    } catch (err) {
      if (err.response?.status === 404) {
        setCollegeInfoList([]);
      } else {
        setInfoError(
          err.response?.data?.error ||
            err.response?.data?.message ||
            err.message ||
            'Failed to load college info metadata.'
        );
      }
    } finally {
      setInfoLoading(false);
    }
  }, []);

  const fetchAdmissionVault = useCallback(
    async (targetUsnOverride = null) => {
      if (!canViewAdmissionVault) return;
      const target = String(
        targetUsnOverride ?? (isStudent ? user?.username || '' : vaultUsn)
      )
        .trim()
        .toUpperCase();
      if (!target) {
        setVaultDocs([]);
        return;
      }

      setVaultLoading(true);
      setVaultError('');
      try {
        const res = await api.get(`/api/v1/admissions/vault/${encodeURIComponent(target)}`);
        setVaultDocs(Array.isArray(res.data?.documents) ? res.data.documents : []);
      } catch (err) {
        setVaultDocs([]);
        setVaultError(
          err.response?.data?.error ||
            err.response?.data?.message ||
            err.message ||
            'Unable to retrieve student admission vault.'
        );
      } finally {
        setVaultLoading(false);
      }
    },
    [canViewAdmissionVault, isStudent, user?.username, vaultUsn]
  );

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    fetchCollegeInfo();
  }, [fetchCollegeInfo]);

  useEffect(() => {
    if (isStudent && user?.username) {
      setVaultUsn(user.username);
      fetchAdmissionVault(user.username);
    }
  }, [isStudent, user?.username, fetchAdmissionVault]);

  const handleClosePreview = () => {
    revokeActiveBlobUrl();
    setPreviewDoc(null);
    setPreviewError(null);
    setPreviewKind(null);
    setPreviewText('');
    setPreviewCsvRows([]);
    setPreviewMime('');
  };

  const handlePreviewDocument = async (doc) => {
    if (!doc?.id) return;
    revokeActiveBlobUrl();
    setPreviewDoc(doc);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewKind(null);
    setPreviewText('');
    setPreviewCsvRows([]);
    setPreviewMime('');

    try {
      const res = await api.get(`/api/v1/documents/${encodeURIComponent(doc.id)}/view`, {
        responseType: 'blob',
      });

      const rawBlob = res.data;
      const responseMime =
        res.headers?.['content-type'] || rawBlob?.type || doc.mime_type || 'application/octet-stream';
      const fileName =
        doc.file_name || doc.filename || doc.original_name || doc.file_path || doc.title || '';
      const kind = detectPreviewKind(responseMime, fileName);

      setPreviewMime(responseMime);
      setPreviewKind(kind);

      const typedBlob =
        kind === 'pdf' && !String(rawBlob.type).includes('pdf')
          ? new Blob([rawBlob], { type: 'application/pdf' })
          : rawBlob;

      const url = URL.createObjectURL(typedBlob);
      activeBlobUrlRef.current = url;
      setPreviewBlobUrl(url);

      if (kind === 'csv') {
        const txt = await typedBlob.text();
        setPreviewCsvRows(parseCsvRows(txt));
      } else if (kind === 'text') {
        const txt = await typedBlob.text();
        setPreviewText(txt);
      }
    } catch (err) {
      const details = await extractBlobErrorDetails(err);
      setPreviewError(details);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleUploadDocument = async (e) => {
    e.preventDefault();
    if (!docForm.title.trim()) {
      setUploadError('Document title is required.');
      return;
    }
    if (uploadMode === 'FILE' && !selectedFile) {
      setUploadError('Please choose a file to upload, or switch to Metadata Registration mode.');
      return;
    }
    if (
      uploadMode === 'METADATA' &&
      (!docForm.file_name.trim() || !docForm.storage_path.trim())
    ) {
      setUploadError('file_name and storage_path are required in Metadata Registration mode.');
      return;
    }

    setUploadBusy(true);
    setUploadError('');
    setUploadSuccess('');
    setDocReceipt(null);

    try {
      let res;
      if (uploadMode === 'FILE' && selectedFile) {
        const body = new FormData();
        body.append('file', selectedFile);
        body.append('title', docForm.title.trim());
        body.append('category', docForm.category);
        if (docForm.department) body.append('department', docForm.department);
        if (docForm.semester) body.append('semester', String(docForm.semester));
        if (docForm.subject_code.trim()) {
          body.append('subject_code', docForm.subject_code.trim().toUpperCase());
        }
        body.append('access_tier', docForm.access_tier);
        if (docForm.description.trim()) body.append('description', docForm.description.trim());

        res = await api.post('/api/v1/documents', body, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        const payload = {
          title: docForm.title.trim(),
          category: docForm.category,
          department: docForm.department || undefined,
          semester: docForm.semester ? Number(docForm.semester) : undefined,
          subject_code: docForm.subject_code.trim()
            ? docForm.subject_code.trim().toUpperCase()
            : undefined,
          access_tier: docForm.access_tier,
          description: docForm.description.trim() || undefined,
          file_name: docForm.file_name.trim(),
          storage_path: docForm.storage_path.trim(),
        };
        res = await api.post('/api/v1/documents', payload);
      }

      setUploadSuccess(res.data?.message || 'Document saved to Institutional Vault.');
      setDocReceipt(normalizeReceipt(res.data?.dbReceipt));
      setSelectedFile(null);
      setDocForm((prev) => ({
        ...prev,
        title: '',
        subject_code: '',
        description: '',
        file_name: '',
        storage_path: '',
      }));
      setShowUploadPanel(false);
      await fetchDocuments();
    } catch (err) {
      setUploadError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Failed to publish document.'
      );
    } finally {
      setUploadBusy(false);
    }
  };

  const handleUpsertCollegeInfo = async (e) => {
    e.preventDefault();
    if (!infoForm.section_key.trim() || !infoForm.title.trim() || !infoForm.content.trim()) {
      setInfoSaveError('Section Key, Title, and Content are required.');
      return;
    }

    setInfoSaving(true);
    setInfoSaveError('');
    setInfoSaveSuccess('');
    try {
      const normalizedKey = infoForm.section_key.trim().toLowerCase().replace(/\s+/g, '_');
      const rawContentStr = infoForm.content.trim();
      let parsedContent;
      try {
        const parsed = JSON.parse(rawContentStr);
        parsedContent =
          parsed && typeof parsed === 'object' ? parsed : { summary: String(parsed) };
      } catch {
        parsedContent = { summary: rawContentStr };
      }

      const res = await api.post('/api/v1/college-info', {
        section_key: normalizedKey,
        title: infoForm.title.trim(),
        source_url: infoForm.source_url.trim() || null,
        content: parsedContent,
      });
      setInfoSaveSuccess(res.data?.message || 'College info record upserted into PostgreSQL.');
      if (res.data?.dbReceipt) setDocReceipt(normalizeReceipt(res.data.dbReceipt));
      setInfoForm({ section_key: '', title: '', source_url: '', content: '' });
      setShowInfoForm(false);
      await fetchCollegeInfo();
    } catch (err) {
      setInfoSaveError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Failed to upsert college info metadata.'
      );
    } finally {
      setInfoSaving(false);
    }
  };

  const handleUploadAdmissionCert = async (e) => {
    e.preventDefault();
    if (!certUsn.trim() || !certDocType || !certFile) {
      setVaultError('Student USN, Document Type, and certificate file (.pdf/.jpg/.png) are required.');
      return;
    }
    setCertUploading(true);
    setVaultError('');
    setVaultSuccess('');
    try {
      const body = new FormData();
      body.append('studentUsn', certUsn.trim().toUpperCase());
      body.append('docType', certDocType);
      body.append('document', certFile);

      const res = await api.post('/api/v1/admissions/documents/upload', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setVaultSuccess(res.data?.message || 'Certificate uploaded to Admissions Vault.');
      const target = certUsn.trim().toUpperCase();
      setVaultUsn(target);
      setCertFile(null);
      await fetchAdmissionVault(target);
    } catch (err) {
      setVaultError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Certificate upload failed.'
      );
    } finally {
      setCertUploading(false);
    }
  };

  const handleVerifyAdmissionDoc = async (docId, verificationStatus, custodyStatus) => {
    setVerifyingDocId(docId);
    setVaultError('');
    setVaultSuccess('');
    try {
      const res = await api.patch(`/api/v1/admissions/documents/${docId}/verify`, {
        verificationStatus,
        custodyStatus,
      });
      setVaultSuccess(res.data?.message || 'Document verification status updated.');
      await fetchAdmissionVault(vaultUsn);
    } catch (err) {
      setVaultError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Verification update failed.'
      );
    } finally {
      setVerifyingDocId(null);
    }
  };

  const filteredCollegeInfo = useMemo(() => {
    if (!searchQuery.trim()) return collegeInfoList;
    const q = searchQuery.trim().toLowerCase();
    return collegeInfoList.filter(
      (item) =>
        String(item.section_key || '').toLowerCase().includes(q) ||
        String(item.title || '').toLowerCase().includes(q) ||
        String(item.content || '').toLowerCase().includes(q)
    );
  }, [collegeInfoList, searchQuery]);

  const showCollegeInfoProminent = category === 'COLLEGE_INFO' || category === 'ALL';

  return (
    <div className="space-y-6">
      {/* ─── HEADER & FILTER BAR ─── */}
      <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#EBEBEF] pb-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-orange-50 text-[#EA580C] border border-orange-200">
              <FolderOpen size={12} /> RBAC Institutional Repository
            </span>
            <h1 className="mt-2 text-lg font-bold text-zinc-900 tracking-tight">
              Docs, Notes &amp; Institutional Vault
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Syllabi, lecture notes, circulars, lab manuals, college info metadata, and authenticated in-browser previews.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canUploadDocs && (
              <button
                type="button"
                onClick={() => {
                  setShowUploadPanel((v) => !v);
                  setUploadError('');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold shadow-sm transition"
              >
                <Plus size={14} />
                <span>{showUploadPanel ? 'Close Uploader' : 'Publish Document'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                fetchDocuments();
                fetchCollegeInfo();
              }}
              disabled={docsLoading || infoLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#FBFBFC] hover:bg-zinc-100 border border-[#EBEBEF] text-zinc-700 text-xs font-semibold transition"
            >
              <RefreshCw
                size={13}
                className={docsLoading || infoLoading ? 'animate-spin' : ''}
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Search, Department & Semester Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, subject code, filename..."
              className="w-full pl-9 pr-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 outline-none focus:bg-white focus:border-[#EA580C]"
            />
          </div>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
          >
            <option value="">All Departments</option>
            {DEPARTMENTS.filter(Boolean).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={semesterFilter}
            onChange={(e) => setSemesterFilter(e.target.value)}
            className="px-3 py-2.5 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
          >
            <option value="">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={s}>
                Semester {s}
              </option>
            ))}
          </select>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {DOC_CATEGORIES.map((cat) => {
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border transition ${
                  active
                    ? 'bg-[#121214] text-white border-[#121214]'
                    : 'bg-[#FBFBFC] text-zinc-600 border-[#EBEBEF] hover:bg-zinc-100'
                }`}
              >
                {cat.replace(/_/g, ' ')}
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback & Receipt Banners */}
      {uploadSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-emerald-800 text-xs font-semibold">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{uploadSuccess}</span>
        </div>
      )}
      {infoSaveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-emerald-800 text-xs font-semibold">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{infoSaveSuccess}</span>
        </div>
      )}
      {docReceipt && <DbReceiptCard receipt={docReceipt} title="Repository Persistence Receipt" />}

      {/* ─── PUBLISH / REGISTER DOCUMENT PANEL ─── */}
      {canUploadDocs && showUploadPanel && (
        <section className="bg-white border-2 border-[#EA580C]/30 rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EBEBEF] pb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <Upload size={15} className="text-[#EA580C]" />
                <span>Publish Document or Register Metadata (`POST /api/v1/documents`)</span>
              </h2>
              <p className="text-xs text-zinc-500">
                Access tiers are scoped strictly to your institutional role ({user?.adminTier || user?.baseRole}).
              </p>
            </div>

            <div className="inline-flex rounded-xl border border-[#EBEBEF] bg-[#FBFBFC] p-1 text-xs">
              <button
                type="button"
                onClick={() => setUploadMode('FILE')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  uploadMode === 'FILE' ? 'bg-[#121214] text-white' : 'text-zinc-600'
                }`}
              >
                Multipart Upload
              </button>
              <button
                type="button"
                onClick={() => setUploadMode('METADATA')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  uploadMode === 'METADATA' ? 'bg-[#121214] text-white' : 'text-zinc-600'
                }`}
              >
                Metadata Only
              </button>
            </div>
          </div>

          {uploadError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
              <ShieldAlert size={15} className="text-rose-600 shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}

          <form onSubmit={handleUploadDocument} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Document Title *
                </label>
                <input
                  type="text"
                  required
                  value={docForm.title}
                  onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                  placeholder="e.g. BCS301 Module 1 Notes"
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Category *
                </label>
                <select
                  value={docForm.category}
                  onChange={(e) => setDocForm({ ...docForm, category: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                >
                  {UPLOAD_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1 flex items-center gap-1">
                  <Lock size={11} className="text-[#EA580C]" />
                  <span>Access Tier (Role-Scoped) *</span>
                </label>
                <select
                  value={docForm.access_tier}
                  onChange={(e) => setDocForm({ ...docForm, access_tier: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                >
                  {accessTierOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Department</label>
                <select
                  value={docForm.department}
                  onChange={(e) => setDocForm({ ...docForm, department: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d || 'all'} value={d}>
                      {d || 'Institutional / Unscoped'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Semester <span className="text-zinc-400">(optional)</span>
                </label>
                <select
                  value={docForm.semester}
                  onChange={(e) => setDocForm({ ...docForm, semester: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                >
                  <option value="">All / General</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>
                      Sem {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Subject Code <span className="text-zinc-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={docForm.subject_code}
                  onChange={(e) => setDocForm({ ...docForm, subject_code: e.target.value })}
                  placeholder="BCS301"
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs font-mono text-zinc-900 outline-none focus:border-[#EA580C]"
                />
              </div>
            </div>

            {uploadMode === 'FILE' ? (
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Attach File (.pdf, .csv, .txt, .md, .png, .jpg, .webp — max 15MB) *
                </label>
                <input
                  type="file"
                  accept=".pdf,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-700"
                />
                {selectedFile && (
                  <p className="text-[11px] font-mono text-zinc-500 mt-1">
                    Selected: {selectedFile.name} ({Math.max(1, Math.round(selectedFile.size / 1024))} KB)
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    File Name (with extension) *
                  </label>
                  <input
                    type="text"
                    required={uploadMode === 'METADATA'}
                    value={docForm.file_name}
                    onChange={(e) => setDocForm({ ...docForm, file_name: e.target.value })}
                    placeholder="e.g. cse_sem3_syllabus.pdf"
                    className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs font-mono text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Storage Path (`rljit_data/...` or `private_vault/...`) *
                  </label>
                  <input
                    type="text"
                    required={uploadMode === 'METADATA'}
                    value={docForm.storage_path}
                    onChange={(e) => setDocForm({ ...docForm, storage_path: e.target.value })}
                    placeholder="e.g. rljit_data/syllabus/cse_sem3_syllabus.pdf"
                    className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs font-mono text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Description / Summary
              </label>
              <textarea
                rows={2}
                value={docForm.description}
                onChange={(e) => setDocForm({ ...docForm, description: e.target.value })}
                placeholder="Brief institutional context or revision notes..."
                className="w-full px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs text-zinc-900 outline-none focus:border-[#EA580C]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUploadPanel(false)}
                className="px-4 py-2 rounded-xl border border-[#EBEBEF] text-xs font-semibold text-zinc-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploadBusy}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#121214] hover:bg-black text-white text-xs font-semibold transition disabled:opacity-50"
              >
                <Upload size={13} />
                <span>{uploadBusy ? 'Publishing...' : 'Publish to Vault'}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ─── DOCUMENTS REPOSITORY TABLE / LIST ─── */}
      <section className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex items-center justify-between border-b border-[#EBEBEF] pb-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              <BookOpen size={16} className="text-[#EA580C]" />
              <span>Institutional Documents ({documents.length})</span>
            </h2>
            <p className="text-xs text-zinc-500">
              Click Preview to open documents securely via authenticated in-memory Blob streaming
            </p>
          </div>
        </div>

        {docsError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-800 text-xs">
            <ShieldAlert size={15} className="text-rose-600 shrink-0 mt-0.5" />
            <span>{docsError}</span>
          </div>
        )}

        {docsLoading ? (
          <div className="py-10 text-center text-xs text-zinc-500">
            Loading live documents from PostgreSQL...
          </div>
        ) : documents.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <FileText size={28} className="mx-auto text-zinc-400" />
            <p className="text-sm font-semibold text-zinc-900">
              No Institutional Documents Found
            </p>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              Zero document records matched your current filters or no files have been indexed yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc) => {
              const fileLabel =
                doc.file_name || doc.filename || doc.original_name || doc.mime_type || 'Metadata Record';
              return (
                <div
                  key={doc.id || `${doc.title}-${doc.created_at}`}
                  className="p-4 rounded-xl border border-[#EBEBEF] bg-[#FBFBFC] hover:bg-white transition flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-[#EA580C] border border-orange-200">
                        {(doc.category || 'DOCUMENT').replace(/_/g, ' ')}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {doc.access_tier && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200">
                            {doc.access_tier}
                          </span>
                        )}
                        {doc.department && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-[#1E293B]">
                            {doc.department}
                            {doc.semester ? ` · S${doc.semester}` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="text-sm font-bold text-zinc-900 leading-snug">
                      {doc.title || fileLabel}
                    </h3>

                    {doc.description && (
                      <p className="text-xs text-zinc-600 line-clamp-2">{doc.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-zinc-500 pt-1">
                      {doc.subject_code && (
                        <span className="font-bold text-[#1E293B]">{doc.subject_code}</span>
                      )}
                      <span className="truncate max-w-[220px]">{fileLabel}</span>
                      {doc.created_at && <span>{String(doc.created_at).slice(0, 10)}</span>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#EBEBEF]">
                    <span className="text-[11px] text-zinc-400 font-mono">
                      {doc.id ? `ID: ${String(doc.id).slice(0, 8)}…` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePreviewDocument(doc)}
                      disabled={!doc.id}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#121214] hover:bg-black text-white text-xs font-semibold transition disabled:opacity-50"
                    >
                      <Eye size={13} />
                      <span>Preview</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── INSTITUTIONAL COLLEGE INFO METADATA PANEL ─── */}
      {showCollegeInfoProminent && (
        <section className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EBEBEF] pb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <Building2 size={16} className="text-[#EA580C]" />
                <span>Institutional College Info &amp; Policies ({filteredCollegeInfo.length})</span>
              </h2>
              <p className="text-xs text-zinc-500">
                Live college directory, institutional circulars, and department metadata from `/api/v1/college-info`
              </p>
            </div>

            {canUpsertCollegeInfo && (
              <button
                type="button"
                onClick={() => {
                  setShowInfoForm((v) => !v);
                  setInfoSaveError('');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#121214] hover:bg-black text-white text-xs font-semibold transition"
              >
                <Plus size={13} />
                <span>{showInfoForm ? 'Close Info Editor' : 'Upsert College Info'}</span>
              </button>
            )}
          </div>

          {canUpsertCollegeInfo && showInfoForm && (
            <form
              onSubmit={handleUpsertCollegeInfo}
              className="p-4 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF] space-y-3"
            >
              {infoSaveError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                  <ShieldAlert size={14} className="text-rose-600 shrink-0 mt-0.5" />
                  <span>{infoSaveError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Section Key *
                  </label>
                  <input
                    type="text"
                    required
                    value={infoForm.section_key}
                    onChange={(e) => setInfoForm({ ...infoForm, section_key: e.target.value })}
                    placeholder="e.g. exam_timings"
                    className="w-full px-3 py-2 bg-white border border-[#EBEBEF] rounded-xl text-xs font-mono text-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={infoForm.title}
                    onChange={(e) => setInfoForm({ ...infoForm, title: e.target.value })}
                    placeholder="Institutional Policy Title"
                    className="w-full px-3 py-2 bg-white border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Source URL <span className="text-zinc-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={infoForm.source_url}
                    onChange={(e) => setInfoForm({ ...infoForm, source_url: e.target.value })}
                    placeholder="https://rljit.in/..."
                    className="w-full px-3 py-2 bg-white border border-[#EBEBEF] rounded-xl text-xs text-zinc-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Content (JSON object/array or plain summary text) *
                </label>
                <textarea
                  rows={3}
                  required
                  value={infoForm.content}
                  onChange={(e) => setInfoForm({ ...infoForm, content: e.target.value })}
                  placeholder='{"office": "Main Block", "hours": "09:00-16:30"} or plain summary text...'
                  className="w-full px-3 py-2 bg-white border border-[#EBEBEF] rounded-xl text-xs font-mono text-zinc-900"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowInfoForm(false)}
                  className="px-3.5 py-2 rounded-xl border border-[#EBEBEF] text-xs font-semibold text-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={infoSaving}
                  className="px-4 py-2 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold disabled:opacity-50"
                >
                  {infoSaving ? 'Saving...' : 'Save College Info'}
                </button>
              </div>
            </form>
          )}

          {infoError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-800 text-xs">
              <ShieldAlert size={15} className="text-rose-600 shrink-0 mt-0.5" />
              <span>{infoError}</span>
            </div>
          )}

          {infoLoading ? (
            <p className="text-xs text-zinc-500">Loading college metadata...</p>
          ) : filteredCollegeInfo.length === 0 ? (
            <div className="py-8 text-center space-y-1.5">
              <Info size={24} className="mx-auto text-zinc-400" />
              <p className="text-xs font-semibold text-zinc-800">
                No College Info Metadata Records Found
              </p>
              <p className="text-xs text-zinc-500">
                Institutional metadata entries published by Admins or HODs will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredCollegeInfo.map((info) => (
                <div
                  key={info.id}
                  className="p-4 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF] space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold text-[#EA580C]">
                      {info.section_key}
                    </span>
                    {info.updated_at && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white border border-[#EBEBEF] text-zinc-500">
                        {String(info.updated_at).slice(0, 10)}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs font-bold text-zinc-900">{info.title}</h3>
                  <p className="text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed font-mono text-[11px]">
                    {info.content}
                  </p>
                  {info.source_url && (
                    <p className="text-[10px] font-mono text-zinc-500 truncate">
                      Source: {info.source_url}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ─── SECONDARY: STUDENT ADMISSIONS CERTIFICATE VAULT ─── */}
      {canViewAdmissionVault && (
        <section className="bg-white border border-[#EBEBEF] rounded-2xl p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EBEBEF] pb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <ShieldCheck size={16} className="text-[#15803D]" />
                <span>Student Admissions Certificate Vault (`/admissions/vault/:usn`)</span>
              </h2>
              <p className="text-xs text-zinc-500">
                {isStudent
                  ? 'Inspect verification and physical custody status of your submitted admission certificates.'
                  : 'Inspect student admission certificates; ADM Admins & Super Admin can upload and verify custody.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setVaultOpen((v) => !v)}
              className="px-3.5 py-2 rounded-xl bg-[#FBFBFC] hover:bg-zinc-100 border border-[#EBEBEF] text-xs font-semibold text-zinc-700"
            >
              {vaultOpen ? 'Collapse Vault' : 'Open Admissions Vault'}
            </button>
          </div>

          {vaultOpen && (
            <div className="space-y-4">
              {vaultError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                  <ShieldAlert size={15} className="text-rose-600 shrink-0 mt-0.5" />
                  <span>{vaultError}</span>
                </div>
              )}

              {vaultSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 font-semibold">
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                  <span>{vaultSuccess}</span>
                </div>
              )}

              {/* Lookup Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  fetchAdmissionVault(vaultUsn);
                }}
                className="flex flex-wrap items-center gap-2.5"
              >
                {isStudent ? (
                  <div className="px-3 py-2 bg-zinc-100 border border-[#EBEBEF] rounded-xl text-xs font-mono font-bold text-zinc-800">
                    USN: {user?.username}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={vaultUsn}
                    onChange={(e) => setVaultUsn(e.target.value.toUpperCase())}
                    placeholder="Enter Student USN (e.g. 1RL26CSE001)"
                    className="flex-1 min-w-[220px] px-3 py-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs font-mono text-zinc-900 outline-none focus:border-[#EA580C]"
                  />
                )}
                <button
                  type="submit"
                  disabled={vaultLoading || (!isStudent && !vaultUsn.trim())}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#121214] hover:bg-black text-white text-xs font-semibold transition disabled:opacity-50"
                >
                  <Search size={13} />
                  <span>{vaultLoading ? 'Loading...' : 'Load Student Vault'}</span>
                </button>
              </form>

              {/* Upload Certificate Form for ADM / SUPER_ADMIN */}
              {isAdmissionAdmin && (
                <form
                  onSubmit={handleUploadAdmissionCert}
                  className="p-4 rounded-xl bg-[#FBFBFC] border border-[#EBEBEF] space-y-3"
                >
                  <p className="text-xs font-bold text-zinc-900">
                    Upload Student Admission Certificate (`POST /api/v1/admissions/documents/upload`)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Student USN *
                      </label>
                      <input
                        type="text"
                        required
                        value={certUsn}
                        onChange={(e) => setCertUsn(e.target.value.toUpperCase())}
                        placeholder="1RL26CSE001"
                        className="w-full px-3 py-2 bg-white border border-[#EBEBEF] rounded-xl text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Document Type *
                      </label>
                      <select
                        value={certDocType}
                        onChange={(e) => setCertDocType(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#EBEBEF] rounded-xl text-xs"
                      >
                        {ADMISSION_DOC_TYPES.map((dt) => (
                          <option key={dt} value={dt}>
                            {dt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Certificate File (.pdf/.jpg/.png) *
                      </label>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => setCertFile(e.target.files?.[0] || null)}
                        className="w-full px-2.5 py-1.5 bg-white border border-[#EBEBEF] rounded-xl text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={certUploading}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold disabled:opacity-50"
                    >
                      <Upload size={13} />
                      <span>{certUploading ? 'Uploading...' : 'Upload Certificate'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Vault Documents Table */}
              {vaultLoading ? (
                <p className="text-xs text-zinc-500">Fetching student admission certificates...</p>
              ) : vaultDocs.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  {vaultUsn.trim()
                    ? `No admission vault certificates found for ${vaultUsn.trim()}.`
                    : 'Enter a Student USN above to inspect their admission certificate vault.'}
                </p>
              ) : (
                <div className="overflow-x-auto border border-[#EBEBEF] rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FAFAFA] border-b border-[#EBEBEF] text-zinc-500 font-semibold text-[11px]">
                      <tr>
                        <th className="p-3">Document Type</th>
                        <th className="p-3">Verification</th>
                        <th className="p-3">Physical Custody</th>
                        <th className="p-3">Updated</th>
                        {isAdmissionAdmin && <th className="p-3 text-right">Verify / Custody</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EBEBEF]">
                      {vaultDocs.map((vd) => (
                        <tr key={vd.id} className="hover:bg-[#FBFBFC]">
                          <td className="p-3 font-mono font-bold text-zinc-900">{vd.doc_type}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                vd.verification_status === 'VERIFIED'
                                  ? 'bg-emerald-50 text-[#15803D] border-emerald-200'
                                  : vd.verification_status === 'REJECTED'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-amber-50 text-[#B45309] border-amber-200'
                              }`}
                            >
                              {vd.verification_status}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-[11px] text-zinc-700">
                            {vd.custody_status}
                          </td>
                          <td className="p-3 font-mono text-[11px] text-zinc-500">
                            {vd.updated_at ? String(vd.updated_at).slice(0, 10) : '—'}
                          </td>
                          {isAdmissionAdmin && (
                            <td className="p-3 text-right whitespace-nowrap space-x-1.5">
                              {VERIFICATION_STATUSES.map((vs) => (
                                <button
                                  key={vs}
                                  type="button"
                                  disabled={verifyingDocId === vd.id}
                                  onClick={() =>
                                    handleVerifyAdmissionDoc(
                                      vd.id,
                                      vs,
                                      vs === 'VERIFIED'
                                        ? CUSTODY_STATUSES[0]
                                        : vd.custody_status
                                    )
                                  }
                                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition ${
                                    vd.verification_status === vs
                                      ? 'bg-[#121214] text-white border-[#121214]'
                                      : 'bg-white text-zinc-700 border-[#EBEBEF] hover:bg-zinc-100'
                                  }`}
                                >
                                  {vs === 'PENDING_REVIEW' ? 'Pending' : vs}
                                </button>
                              ))}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ─── AUTHENTICATED BLOB DOCUMENT VIEWER MODAL ─── */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Authenticated Document Preview"
        >
          <div className="bg-white border border-[#EBEBEF] rounded-2xl w-full max-w-5xl shadow-xl overflow-hidden my-auto">
            <div className="bg-[#141E2B] text-white px-6 py-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-orange-300 font-semibold">
                  Authenticated Blob Viewer ({previewDoc.category || 'DOCUMENT'})
                </p>
                <h2 className="text-base font-bold truncate mt-0.5">
                  {previewDoc.title || previewDoc.file_name || 'Document Preview'}
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {previewBlobUrl && (
                  <a
                    href={previewBlobUrl}
                    download={
                      previewDoc.file_name ||
                      previewDoc.filename ||
                      previewDoc.original_name ||
                      `${previewDoc.title || 'document'}`
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold transition"
                  >
                    <Download size={13} />
                    <span>Download</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleClosePreview}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
                  aria-label="Close preview"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {previewLoading ? (
                <div className="py-16 text-center text-xs text-zinc-500">
                  Streaming authenticated document blob from `/api/v1/documents/{previewDoc.id}/view`...
                </div>
              ) : previewError ? (
                <div className="p-5 bg-rose-50 border border-rose-200 rounded-2xl space-y-2 text-xs text-rose-900">
                  <div className="flex items-center gap-2 font-bold text-rose-800">
                    <AlertCircle size={17} className="text-rose-600 shrink-0" />
                    <span>
                      {previewError.status === 404 ||
                      previewError.code === 'FILE_NOT_ON_DISK' ||
                      String(previewError.message).includes('FILE_NOT_ON_DISK')
                        ? '404 FILE_NOT_ON_DISK — Physical File Unavailable'
                        : `Document Preview Unavailable (${previewError.status || 'Error'})`}
                    </span>
                  </div>
                  <p className="text-rose-800 leading-relaxed">{previewError.message}</p>
                  <p className="text-[11px] font-mono text-rose-700/90">
                    Metadata exists in PostgreSQL, but no readable binary payload was found on disk for document ID{' '}
                    {previewDoc.id}.
                  </p>
                </div>
              ) : previewKind === 'pdf' && previewBlobUrl ? (
                <iframe
                  src={previewBlobUrl}
                  title={previewDoc.title || 'PDF Preview'}
                  className="w-full h-[70vh] rounded-xl border border-[#EBEBEF] bg-zinc-50"
                />
              ) : previewKind === 'image' && previewBlobUrl ? (
                <div className="bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl p-4 flex items-center justify-center">
                  <img
                    src={previewBlobUrl}
                    alt={previewDoc.title || 'Document Image Preview'}
                    className="max-h-[68vh] max-w-full rounded-lg object-contain"
                  />
                </div>
              ) : previewKind === 'csv' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-800">
                      <FileSpreadsheet size={14} className="text-[#EA580C]" />
                      CSV Preview ({previewCsvRows.length} rows)
                    </span>
                  </div>
                  {previewCsvRows.length > 0 ? (
                    <div className="overflow-auto max-h-[65vh] border border-[#EBEBEF] rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#FAFAFA] border-b border-[#EBEBEF] text-zinc-600 font-semibold sticky top-0">
                          <tr>
                            {previewCsvRows[0].map((header, idx) => (
                              <th key={idx} className="p-2.5 whitespace-nowrap">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EBEBEF]">
                          {previewCsvRows.slice(1).map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-[#FBFBFC]">
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="p-2.5 font-mono text-zinc-800 whitespace-nowrap">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">CSV file is empty.</p>
                  )}
                </div>
              ) : previewKind === 'text' ? (
                <pre className="w-full max-h-[68vh] overflow-auto p-4 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-xs font-mono text-zinc-800 whitespace-pre-wrap leading-relaxed">
                  {previewText || '(Empty text file)'}
                </pre>
              ) : (
                <div className="p-6 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-center space-y-2 text-xs text-zinc-600">
                  <p className="font-semibold text-zinc-900">
                    Inline browser preview is unavailable for MIME type{' '}
                    <span className="font-mono">{previewMime || 'application/octet-stream'}</span>.
                  </p>
                  <p>Use the Download button above to inspect the authenticated file locally.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  BookOpen,
  Eye,
  FileText,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react-native';
import api, { getBaseUrl, getToken } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import Colors from '../../theme/colors';
import DbReceiptCard from '../DbReceiptCard';
import { DEPARTMENTS, getStatusTone, getUserRoles } from './constants';

const DOC_CATEGORIES = [
  'ALL',
  'CIRCULAR',
  'NOTES',
  'SYLLABUS',
  'HANDBOOK',
  'POLICY',
  'LAB_MANUAL',
  'OTHER',
];

const UPLOAD_CATEGORIES = DOC_CATEGORIES.filter((c) => c !== 'ALL');
const ACCESS_TIERS = ['PUBLIC', 'STUDENT', 'FACULTY', 'DEPARTMENT', 'ADMIN'];

function decodeArrayBuffer(buffer) {
  if (!buffer) return '';
  try {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8').decode(new Uint8Array(buffer));
    }
    const bytes = new Uint8Array(buffer);
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
      out += String.fromCharCode(bytes[i]);
    }
    return out;
  } catch {
    return '';
  }
}

function extractApiError(err, fallback) {
  const raw = err?.response?.data;
  if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
    const decoded = decodeArrayBuffer(raw instanceof ArrayBuffer ? raw : raw.buffer);
    try {
      const parsed = JSON.parse(decoded);
      return {
        code: parsed?.code || null,
        message: parsed?.error || parsed?.message || fallback,
      };
    } catch {
      return { code: null, message: decoded || fallback };
    }
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return {
        code: parsed?.code || null,
        message: parsed?.error || parsed?.message || fallback,
      };
    } catch {
      return { code: null, message: raw || fallback };
    }
  }
  return {
    code: raw?.code || null,
    message: raw?.error || raw?.message || err?.message || fallback,
  };
}

function classifyDocumentKind(doc, contentTypeHeader = '') {
  const mime = String(
    contentTypeHeader || doc?.mime_type || doc?.mimeType || doc?.content_type || ''
  )
    .toLowerCase()
    .split(';')[0]
    .trim();
  const fileName = String(
    doc?.file_name || doc?.original_name || doc?.file_path || doc?.title || ''
  ).toLowerCase();

  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(fileName)) {
    return 'image';
  }
  if (mime === 'application/pdf' || /\.pdf$/i.test(fileName)) {
    return 'pdf';
  }
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/csv' ||
    /\.(txt|csv|md|markdown|log|json)$/i.test(fileName)
  ) {
    return 'text';
  }
  return 'unknown';
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function hasPdfSignature(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 4) return false;
  const bytes = new Uint8Array(buffer.slice(0, 5));
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function StatusPill({ status, label }) {
  const tone = getStatusTone(status);
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Text style={[styles.badgeText, { color: tone.text }]}>
        {label || String(status || '—')}
      </Text>
    </View>
  );
}

export default function MobileDocsVault() {
  const { user, token } = useAuth();
  const roles = getUserRoles(user);
  const canManageAccessTier =
    roles.isFaculty || roles.isHod || roles.isAdmin || roles.isSuper;

  const [sectionTab, setSectionTab] = useState('documents'); // 'documents' | 'college-info'
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [receipt, setReceipt] = useState(null);

  // Documents State
  const [documents, setDocuments] = useState([]);
  const [docSearch, setDocSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [uploadMode, setUploadMode] = useState('metadata'); // 'metadata' | 'image'
  const [pickedImage, setPickedImage] = useState(null);
  const [docForm, setDocForm] = useState({
    title: '',
    category: 'NOTES',
    department: user?.department || '',
    semester: '',
    subject_code: '',
    description: '',
    content: '',
    external_url: '',
    access_tier: 'PUBLIC',
  });

  // College Info State
  const [collegeInfoItems, setCollegeInfoItems] = useState([]);

  // Preview Modal State
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewState, setPreviewState] = useState(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (categoryFilter !== 'ALL') params.category = categoryFilter;
      if (docSearch.trim()) params.q = docSearch.trim();
      const res = await api.get('/api/v1/documents', { params });
      const list = Array.isArray(res.data?.documents)
        ? res.data.documents
        : Array.isArray(res.data?.rows)
        ? res.data.rows
        : Array.isArray(res.data?.items)
        ? res.data.items
        : Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
        ? res.data
        : [];
      setDocuments(list);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load documents vault.').message);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, docSearch]);

  const loadCollegeInfo = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/v1/college-info');
      const payload = res.data;
      const list = Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.info)
        ? payload.info
        : Array.isArray(payload?.collegeInfo)
        ? payload.collegeInfo
        : Array.isArray(payload?.records)
        ? payload.records
        : Array.isArray(payload?.sections)
        ? payload.sections
        : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
        ? payload
        : payload?.collegeInfo && typeof payload.collegeInfo === 'object'
        ? Object.entries(payload.collegeInfo).map(([k, v], idx) => ({
            id: `info-${idx}`,
            title: k.replace(/_/g, ' ').toUpperCase(),
            content: typeof v === 'string' ? v : JSON.stringify(v, null, 2),
          }))
        : [];
      setCollegeInfoItems(list);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load institutional college info.').message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setError('');
    setSuccessMsg('');
    if (sectionTab === 'documents') loadDocuments();
    else loadCollegeInfo();
  }, [sectionTab, loadDocuments, loadCollegeInfo]);

  const handlePickImage = async () => {
    setError('');
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      if (!picked.canceled && picked.assets?.[0]) {
        setPickedImage(picked.assets[0]);
      }
    } catch (err) {
      setError(err?.message || 'Unable to open device image library.');
    }
  };

  const handleCreateDocument = async () => {
    if (!docForm.title.trim()) {
      setError('Document title is required.');
      return;
    }
    if (uploadMode === 'image' && !pickedImage?.uri) {
      setError('Select an image from your device before uploading.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccessMsg('');
    setReceipt(null);

    try {
      let res;
      if (uploadMode === 'image') {
        const body = new FormData();
        body.append('title', docForm.title.trim());
        body.append('category', docForm.category);
        if (docForm.department.trim()) {
          body.append('department', docForm.department.trim().toUpperCase());
        }
        if (docForm.semester.trim()) body.append('semester', docForm.semester.trim());
        if (docForm.subject_code.trim()) {
          body.append('subject_code', docForm.subject_code.trim().toUpperCase());
        }
        if (docForm.description.trim()) {
          body.append('description', docForm.description.trim());
        }
        if (canManageAccessTier && docForm.access_tier) {
          body.append('access_tier', docForm.access_tier);
        }

        const fileName = pickedImage.fileName || `document-${Date.now()}.jpg`;
        const mimeType = pickedImage.mimeType || 'image/jpeg';
        body.append('file', {
          uri: pickedImage.uri,
          name: fileName,
          type: mimeType,
        });

        res = await api.post('/api/v1/documents', body, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        const payload = {
          title: docForm.title.trim(),
          category: docForm.category,
          department: docForm.department.trim().toUpperCase() || undefined,
          semester: docForm.semester.trim() ? Number(docForm.semester.trim()) : undefined,
          subject_code: docForm.subject_code.trim().toUpperCase() || undefined,
          description: docForm.description.trim() || undefined,
          content: docForm.content.trim() || undefined,
          external_url: docForm.external_url.trim() || undefined,
        };
        if (canManageAccessTier && docForm.access_tier) {
          payload.access_tier = docForm.access_tier;
        }
        res = await api.post('/api/v1/documents', payload);
      }

      setSuccessMsg(res.data?.message || 'Document published to institutional vault.');
      setReceipt(res.data?.dbReceipt || null);
      setPickedImage(null);
      setDocForm({
        title: '',
        category: 'NOTES',
        department: user?.department || '',
        semester: '',
        subject_code: '',
        description: '',
        content: '',
        external_url: '',
        access_tier: 'PUBLIC',
      });
      setShowCreate(false);
      await loadDocuments();
    } catch (err) {
      setError(extractApiError(err, 'Failed to publish document.').message);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenPreview = async (doc) => {
    setPreviewDoc(doc);
    setPreviewState(null);
    setPreviewError('');
    setPreviewLoading(true);

    const viewPath = `/api/v1/documents/${encodeURIComponent(doc.id)}/view`;
    const initialKind = classifyDocumentKind(doc);

    try {
      if (initialKind === 'text') {
        const res = await api.get(viewPath, { responseType: 'text' });
        const textBody =
          typeof res.data === 'string'
            ? res.data
            : JSON.stringify(res.data ?? '', null, 2);
        setPreviewState({
          kind: 'text',
          mimeType: res.headers?.['content-type'] || doc.mime_type || 'text/plain',
          text: textBody,
        });
        return;
      }

      const jwt = token || (await getToken());
      const base = getBaseUrl().replace(/\/+$/, '');
      const fullViewUrl = `${base}${viewPath}`;

      if (initialKind === 'image') {
        const res = await api.get(viewPath, { responseType: 'arraybuffer' });
        const mimeType =
          String(res.headers?.['content-type'] || doc.mime_type || 'image/jpeg')
            .split(';')[0]
            .trim();
        setPreviewState({
          kind: 'image',
          uri: fullViewUrl,
          headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
          mimeType,
          byteLength: res.data?.byteLength || 0,
        });
        return;
      }

      // PDF or unknown stream verification via authenticated ArrayBuffer
      const res = await api.get(viewPath, { responseType: 'arraybuffer' });
      const headerMime = String(
        res.headers?.['content-type'] || doc.mime_type || 'application/octet-stream'
      )
        .split(';')[0]
        .trim();
      const detectedKind = classifyDocumentKind(doc, headerMime);

      if (detectedKind === 'text') {
        setPreviewState({
          kind: 'text',
          mimeType: headerMime,
          text: decodeArrayBuffer(res.data),
        });
      } else if (detectedKind === 'image') {
        setPreviewState({
          kind: 'image',
          uri: fullViewUrl,
          headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
          mimeType: headerMime,
          byteLength: res.data?.byteLength || 0,
        });
      } else if (detectedKind === 'pdf') {
        setPreviewState({
          kind: 'pdf',
          mimeType: headerMime,
          byteLength: res.data?.byteLength || 0,
          signatureVerified: hasPdfSignature(res.data),
        });
      } else {
        setPreviewState({
          kind: 'binary',
          mimeType: headerMime,
          byteLength: res.data?.byteLength || 0,
        });
      }
    } catch (err) {
      const parsed = extractApiError(err, 'Unable to load document stream.');
      const isMissingOnDisk =
        parsed.code === 'FILE_NOT_ON_DISK' ||
        err?.response?.status === 404;

      if (isMissingOnDisk && (doc.content || doc.text_content || doc.description)) {
        setPreviewError(
          parsed.code === 'FILE_NOT_ON_DISK'
            ? 'FILE_NOT_ON_DISK: Binary file was not found on server storage. Showing stored metadata.'
            : `${parsed.message} Showing stored record metadata.`
        );
        setPreviewState({
          kind: 'text',
          mimeType: doc.mime_type || 'text/plain',
          text: doc.content || doc.text_content || doc.description,
        });
      } else {
        setPreviewError(
          parsed.code === 'FILE_NOT_ON_DISK'
            ? 'FILE_NOT_ON_DISK (404): This file is registered in PostgreSQL but missing from server disk storage.'
            : parsed.message
        );
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Sub-navigation */}
      <View style={styles.subTabBar}>
        {[
          { id: 'documents', label: 'Docs & Notes', icon: FolderOpen },
          { id: 'college-info', label: 'College Info', icon: BookOpen },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = sectionTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.subTabBtn, active && styles.subTabBtnActive]}
              onPress={() => setSectionTab(tab.id)}
              activeOpacity={0.85}
            >
              <Icon size={15} color={active ? '#FFFFFF' : Colors.textMuted} />
              <Text style={[styles.subTabText, active && styles.subTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {successMsg ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>{successMsg}</Text>
        </View>
      ) : null}

      {receipt ? (
        <DbReceiptCard receipt={receipt} title="Document Vault PostgreSQL Receipt" />
      ) : null}

      {/* ─── TAB 1: DOCUMENTS & NOTES ─── */}
      {sectionTab === 'documents' ? (
        <View style={styles.sectionGap}>
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Docs & Notes Vault</Text>
                <Text style={styles.metaText}>
                  Role-scoped institutional circulars, notes, syllabi, and uploads.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.iconTouch}
                onPress={loadDocuments}
                disabled={loading}
              >
                <RefreshCw size={16} color={Colors.textBody} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={docSearch}
                onChangeText={setDocSearch}
                placeholder="Search title, subject code, or notes..."
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.darkSmallBtn}
                onPress={loadDocuments}
                disabled={loading}
              >
                <Search size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipScroll}
            >
              {DOC_CATEGORIES.map((cat) => {
                const active = categoryFilter === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setCategoryFilter(cat)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive,
                      ]}
                    >
                      {cat.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.outlineActionBtn}
              onPress={() => setShowCreate((v) => !v)}
              activeOpacity={0.85}
            >
              <Plus size={16} color={Colors.brandOrange} />
              <Text style={styles.outlineActionText}>
                {showCreate ? 'Close Registration Form' : 'Upload / Register Document'}
              </Text>
            </TouchableOpacity>
          </View>

          {showCreate ? (
            <View style={[styles.card, { borderColor: Colors.brandOrange }]}>
              <Text style={styles.cardTitle}>Publish to Document Vault</Text>

              <View style={styles.modeRow}>
                <TouchableOpacity
                  style={[
                    styles.modeChip,
                    uploadMode === 'metadata' && styles.modeChipActive,
                  ]}
                  onPress={() => setUploadMode('metadata')}
                >
                  <FileText
                    size={14}
                    color={uploadMode === 'metadata' ? '#FFFFFF' : Colors.textBody}
                  />
                  <Text
                    style={[
                      styles.modeChipText,
                      uploadMode === 'metadata' && styles.modeChipTextActive,
                    ]}
                  >
                    JSON Metadata / Note
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modeChip,
                    uploadMode === 'image' && styles.modeChipActive,
                  ]}
                  onPress={() => setUploadMode('image')}
                >
                  <Upload
                    size={14}
                    color={uploadMode === 'image' ? '#FFFFFF' : Colors.textBody}
                  />
                  <Text
                    style={[
                      styles.modeChipText,
                      uploadMode === 'image' && styles.modeChipTextActive,
                    ]}
                  >
                    Image Upload
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Title *</Text>
              <TextInput
                style={styles.input}
                value={docForm.title}
                onChangeText={(v) => setDocForm((p) => ({ ...p, title: v }))}
                placeholder="e.g. Data Structures Unit 3 Notes"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.label}>Category</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipScroll}
              >
                {UPLOAD_CATEGORIES.map((cat) => {
                  const active = docForm.category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setDocForm((p) => ({ ...p, category: cat }))}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          active && styles.filterChipTextActive,
                        ]}
                      >
                        {cat.replace(/_/g, ' ')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>Department</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipScroll}
              >
                {[{ code: '' }, ...DEPARTMENTS].map((d) => {
                  const active = docForm.department === d.code;
                  return (
                    <TouchableOpacity
                      key={d.code || 'ALL'}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setDocForm((p) => ({ ...p, department: d.code }))}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          active && styles.filterChipTextActive,
                        ]}
                      >
                        {d.code || 'ALL DEPTS'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.twoCol}>
                <View style={styles.half}>
                  <Text style={styles.label}>Semester (Opt)</Text>
                  <TextInput
                    style={styles.input}
                    value={docForm.semester}
                    onChangeText={(v) => setDocForm((p) => ({ ...p, semester: v }))}
                    placeholder="1–8"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Subject Code (Opt)</Text>
                  <TextInput
                    style={styles.input}
                    value={docForm.subject_code}
                    onChangeText={(v) =>
                      setDocForm((p) => ({ ...p, subject_code: v.toUpperCase() }))
                    }
                    placeholder="BCS301"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              {canManageAccessTier ? (
                <>
                  <Text style={styles.label}>Access Tier (Faculty / HOD / Admin)</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipScroll}
                  >
                    {ACCESS_TIERS.map((tier) => {
                      const active = docForm.access_tier === tier;
                      return (
                        <TouchableOpacity
                          key={tier}
                          style={[styles.filterChip, active && styles.filterChipActive]}
                          onPress={() =>
                            setDocForm((p) => ({ ...p, access_tier: tier }))
                          }
                        >
                          <Text
                            style={[
                              styles.filterChipText,
                              active && styles.filterChipTextActive,
                            ]}
                          >
                            {tier}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={docForm.description}
                onChangeText={(v) => setDocForm((p) => ({ ...p, description: v }))}
                placeholder="Brief summary or exam reference"
                placeholderTextColor={Colors.textMuted}
                multiline
              />

              {uploadMode === 'metadata' ? (
                <>
                  <Text style={styles.label}>Text / Markdown Content (Optional)</Text>
                  <TextInput
                    style={[styles.input, styles.multilineLarge]}
                    value={docForm.content}
                    onChangeText={(v) => setDocForm((p) => ({ ...p, content: v }))}
                    placeholder="Paste text, markdown notes, or syllabus breakdown..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                  />
                  <Text style={styles.label}>External Reference URL (Optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={docForm.external_url}
                    onChangeText={(v) =>
                      setDocForm((p) => ({ ...p, external_url: v }))
                    }
                    placeholder="https://..."
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                  />
                </>
              ) : (
                <View style={styles.imagePickBox}>
                  <TouchableOpacity
                    style={styles.outlineActionBtn}
                    onPress={handlePickImage}
                    activeOpacity={0.85}
                  >
                    <Upload size={16} color={Colors.brandOrange} />
                    <Text style={styles.outlineActionText}>
                      {pickedImage ? 'Choose Different Image' : 'Pick Image from Library'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.metaText}>
                    {pickedImage
                      ? `Selected: ${pickedImage.fileName || pickedImage.uri} (${pickedImage.mimeType || 'image/jpeg'})`
                      : 'No image selected yet.'}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleCreateDocument}
                disabled={busy}
                activeOpacity={0.85}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {uploadMode === 'image' ? 'Upload Image Document' : 'Register Document'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Documents ({documents.length})</Text>
            {loading && documents.length === 0 ? (
              <ActivityIndicator color={Colors.brandOrange} style={{ marginVertical: 16 }} />
            ) : documents.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No documents published yet</Text>
                <Text style={styles.metaText}>
                  No records returned by /api/v1/documents for the current filters.
                </Text>
              </View>
            ) : (
              documents.map((doc, idx) => {
                const kind = classifyDocumentKind(doc);
                return (
                  <View key={doc.id || idx} style={styles.docItem}>
                    <View style={styles.cardHeaderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.docTitle}>
                          {doc.title || doc.file_name || 'Untitled Document'}
                        </Text>
                        <Text style={styles.metaText}>
                          {[
                            doc.category,
                            doc.department,
                            doc.semester ? `Sem ${doc.semester}` : null,
                            doc.subject_code,
                            kind !== 'unknown' ? kind.toUpperCase() : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      {doc.access_tier ? (
                        <StatusPill status={doc.access_tier} label={doc.access_tier} />
                      ) : null}
                    </View>

                    {doc.description ? (
                      <Text style={styles.bodyText}>{doc.description}</Text>
                    ) : null}

                    <View style={styles.docFooter}>
                      <Text style={styles.metaSmall}>
                        {doc.uploader_name || doc.uploaded_by_name || doc.mime_type || 'Institutional'}
                        {doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ''}
                      </Text>
                      <TouchableOpacity
                        style={styles.previewBtn}
                        onPress={() => handleOpenPreview(doc)}
                        activeOpacity={0.85}
                      >
                        <Eye size={14} color={Colors.textInverse} />
                        <Text style={styles.previewBtnText}>Preview</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>
      ) : (
        /* ─── TAB 2: COLLEGE INFO ─── */
        <View style={styles.sectionGap}>
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Institutional College Info</Text>
                <Text style={styles.metaText}>
                  Verified policies, institutional handbooks, and academic directories.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.iconTouch}
                onPress={loadCollegeInfo}
                disabled={loading}
              >
                <RefreshCw size={16} color={Colors.textBody} />
              </TouchableOpacity>
            </View>

            {loading && collegeInfoItems.length === 0 ? (
              <ActivityIndicator color={Colors.brandOrange} style={{ marginVertical: 16 }} />
            ) : collegeInfoItems.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No college information entries found</Text>
                <Text style={styles.metaText}>
                  /api/v1/college-info returned 0 rows. Institutional details will appear once published.
                </Text>
              </View>
            ) : (
              collegeInfoItems.map((item, idx) => (
                <View key={item.id || idx} style={styles.docItem}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={[styles.docTitle, { flex: 1 }]}>
                      {item.title || item.heading || item.key || `Info Entry ${idx + 1}`}
                    </Text>
                    {item.category ? (
                      <StatusPill status={item.category} label={item.category} />
                    ) : null}
                  </View>
                  {item.content || item.body || item.description || item.value ? (
                    <Text style={styles.bodyText}>
                      {item.content || item.body || item.description || item.value}
                    </Text>
                  ) : null}
                  {item.department || item.contact_email || item.contact_phone || item.updated_at ? (
                    <Text style={styles.metaSmall}>
                      {[
                        item.department,
                        item.contact_email,
                        item.contact_phone,
                        item.updated_at
                          ? `Updated ${new Date(item.updated_at).toLocaleDateString()}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </View>
      )}

      {/* ─── AUTHENTICATED PREVIEW MODAL ─── */}
      <Modal
        visible={Boolean(previewDoc)}
        animationType="slide"
        transparent
        onRequestClose={() => setPreviewDoc(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle} numberOfLines={2}>
                  {previewDoc?.title || previewDoc?.file_name || 'Document Preview'}
                </Text>
                <Text style={styles.metaText}>
                  Authenticated Stream · Bearer JWT Verified
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setPreviewDoc(null)}
                activeOpacity={0.8}
              >
                <X size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator
            >
              {previewLoading ? (
                <View style={styles.modalCenter}>
                  <ActivityIndicator color={Colors.brandOrange} />
                  <Text style={styles.metaText}>Fetching authenticated document stream…</Text>
                </View>
              ) : null}

              {previewError ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{previewError}</Text>
                </View>
              ) : null}

              {!previewLoading && previewState?.kind === 'text' ? (
                <View style={styles.textPreviewBox}>
                  <Text style={styles.metaSmall}>
                    MIME: {previewState.mimeType}
                  </Text>
                  <Text selectable style={styles.previewCodeText}>
                    {previewState.text || '(Empty file)'}
                  </Text>
                </View>
              ) : null}

              {!previewLoading && previewState?.kind === 'image' ? (
                <View style={styles.imagePreviewWrap}>
                  <View style={styles.verifiedRow}>
                    <ShieldCheck size={15} color={Colors.statusEmerald} />
                    <Text style={styles.verifiedText}>
                      Authenticated Image Stream · {previewState.mimeType} (
                      {formatBytes(previewState.byteLength)})
                    </Text>
                  </View>
                  <Image
                    source={{
                      uri: previewState.uri,
                      headers: previewState.headers,
                    }}
                    style={styles.previewImage}
                    resizeMode="contain"
                    onError={() =>
                      setPreviewError(
                        'Unable to decode authenticated image stream in native view.'
                      )
                    }
                  />
                </View>
              ) : null}

              {!previewLoading && previewState?.kind === 'pdf' ? (
                <View style={styles.pdfBox}>
                  <View style={styles.verifiedRow}>
                    <ShieldCheck size={16} color={Colors.statusEmerald} />
                    <Text style={styles.verifiedText}>
                      Verified PDF Stream ({formatBytes(previewState.byteLength)})
                    </Text>
                  </View>
                  <View style={styles.metaGrid}>
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>File Name</Text>
                      <Text style={styles.metaVal}>
                        {previewDoc?.file_name || previewDoc?.title || 'Document.pdf'}
                      </Text>
                    </View>
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>MIME Type</Text>
                      <Text style={styles.metaVal}>{previewState.mimeType}</Text>
                    </View>
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>Stream Size</Text>
                      <Text style={styles.metaVal}>
                        {formatBytes(previewState.byteLength)}
                      </Text>
                    </View>
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>PDF Header</Text>
                      <Text style={styles.metaVal}>
                        {previewState.signatureVerified ? '%PDF Signature Confirmed' : 'Binary Stream Verified'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.noticeBox}>
                    <Text style={styles.noticeTitle}>PDF Stream Verification Complete</Text>
                    <Text style={styles.noticeText}>
                      The PDF payload was fetched cleanly with Bearer JWT authorization. Full
                      multi-page PDF canvas rendering is not bundled in this Expo runtime; use the
                      RLJIT Arcade Web Portal to inspect rendered PDF pages.
                    </Text>
                  </View>
                </View>
              ) : null}

              {!previewLoading && previewState?.kind === 'binary' ? (
                <View style={styles.pdfBox}>
                  <View style={styles.verifiedRow}>
                    <ShieldCheck size={16} color={Colors.statusEmerald} />
                    <Text style={styles.verifiedText}>
                      Stream Verified · {previewState.mimeType} (
                      {formatBytes(previewState.byteLength)})
                    </Text>
                  </View>
                  <Text style={styles.metaText}>
                    Authenticated binary payload verified on server storage.
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  sectionGap: { gap: 12 },
  subTabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 4,
    gap: 4,
  },
  subTabBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  subTabBtnActive: { backgroundColor: Colors.surfaceDark },
  subTabText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  subTabTextActive: { color: Colors.textInverse },
  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 16,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  label: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginTop: 2 },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  multiline: { minHeight: 84, paddingTop: 12, textAlignVertical: 'top' },
  multilineLarge: { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' },
  twoCol: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  darkSmallBtn: {
    minHeight: 52,
    minWidth: 52,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: Colors.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTouch: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.canvasBg,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipScroll: { gap: 8, paddingVertical: 2 },
  filterChip: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    backgroundColor: '#FBFBFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: { backgroundColor: Colors.surfaceDark, borderColor: Colors.surfaceDark },
  filterChipText: { fontSize: 11, fontWeight: '700', color: Colors.textBody },
  filterChipTextActive: { color: Colors.textInverse },
  outlineActionBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: Colors.brandOrangeLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  outlineActionText: { fontSize: 13, fontWeight: '700', color: Colors.brandOrange },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    backgroundColor: '#FBFBFC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  modeChipActive: { backgroundColor: Colors.surfaceDark, borderColor: Colors.surfaceDark },
  modeChipText: { fontSize: 12, fontWeight: '700', color: Colors.textBody },
  modeChipTextActive: { color: Colors.textInverse },
  imagePickBox: { gap: 8, paddingVertical: 4 },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: Colors.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: Colors.textInverse, fontSize: 14, fontWeight: '700' },
  docItem: {
    borderTopWidth: 1,
    borderTopColor: Colors.hairlineBorder,
    paddingTop: 12,
    gap: 6,
  },
  docTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  bodyText: { fontSize: 12, color: Colors.textBody, lineHeight: 18 },
  metaText: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  metaSmall: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  docFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  previewBtn: {
    minHeight: 48,
    minWidth: 104,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.surfaceDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  previewBtnText: { fontSize: 12, fontWeight: '700', color: Colors.textInverse },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
  emptyBox: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  emptyTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  errorBox: {
    backgroundColor: Colors.statusRoseBg,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: Colors.statusRose, fontSize: 12, fontWeight: '600', lineHeight: 18 },
  successBox: {
    backgroundColor: Colors.statusEmeraldBg,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 12,
  },
  successText: { color: Colors.statusEmerald, fontSize: 12, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(18, 18, 20, 0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surfaceCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    maxHeight: '88%',
    minHeight: '55%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairlineBorder,
  },
  modalTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  modalCloseBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.canvasBg,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: { flex: 1 },
  modalScrollContent: { padding: 16, gap: 12 },
  modalCenter: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28, gap: 8 },
  textPreviewBox: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  previewCodeText: {
    fontSize: 12,
    lineHeight: 19,
    color: Colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  imagePreviewWrap: { gap: 10 },
  previewImage: {
    width: '100%',
    height: 340,
    borderRadius: 14,
    backgroundColor: Colors.canvasBg,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
  },
  pdfBox: { gap: 12 },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.statusEmeraldBg,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 12,
  },
  verifiedText: { fontSize: 12, fontWeight: '700', color: Colors.statusEmerald, flex: 1 },
  metaGrid: {
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  metaLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  metaVal: { fontSize: 12, color: Colors.textPrimary, fontWeight: '700', flex: 1, textAlign: 'right' },
  noticeBox: {
    backgroundColor: Colors.brandOrangeLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  noticeTitle: { fontSize: 12, fontWeight: '800', color: Colors.brandOrange },
  noticeText: { fontSize: 12, color: Colors.textBody, lineHeight: 18 },
});

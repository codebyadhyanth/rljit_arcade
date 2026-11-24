import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';
import Colors from '../theme/colors';
import MaskedField from '../components/MaskedField';

export default function DirectoryScreen() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [execTimeMs, setExecTimeMs] = useState(null);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    const startTime = Date.now();

    try {
      const res = await api.get(`/api/v1/users/search?q=${encodeURIComponent(query.trim())}`);
      const duration = Date.now() - startTime;
      setExecTimeMs(duration);
      setResults(res.data.results || []);
      setSearched(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>Institutional Directory</Text>
        <Text style={styles.headerSubtitle}>
          Search across live PostgreSQL using pg_trgm and HMAC-SHA256 blind indexing.
        </Text>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search USN, Name, Email, or Phone..."
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={handleSearch}
            disabled={loading || !query.trim()}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={Colors.textInverse} size="small" />
            ) : (
              <Text style={styles.searchBtnText}>Search</Text>
            )}
          </TouchableOpacity>
        </View>

        {searched ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaCount}>
              Found {results.length} record(s)
            </Text>
            {execTimeMs !== null ? (
              <Text style={styles.metaTime}>{execTimeMs}ms execution</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {searched && (
        <View style={styles.resultsContainer}>
          {results.length > 0 ? (
            results.map((r) => (
              <View key={r.id} style={styles.resultCard}>
                <View style={styles.cardHeader}>
                  <Text style={styles.usernameText}>{r.username}</Text>
                  <View style={styles.roleTag}>
                    <Text style={styles.roleTagText}>{r.baseRole}</Text>
                  </View>
                </View>
                <Text style={styles.nameText}>{r.fullName || '<Decrypted Name>'}</Text>

                <View style={styles.detailsRow}>
                  <Text style={styles.detailText}>
                    Dept: {r.department || 'N/A'}
                  </Text>
                  <Text style={styles.detailText}>
                    {r.entryType ? `${r.entryType} • Sem ${r.semester ?? 1}` : (r.sectionCode ? `Sec: ${r.sectionCode}` : 'Institutional')}
                  </Text>
                </View>

                <View style={styles.maskedContainer}>
                  <MaskedField label="Email" value={r.email} mono={false} />
                  <MaskedField label="Phone" value={r.phone} mono={true} />
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No matching records found.</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  headerCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 16,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#FBFBFC',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  searchBtn: {
    backgroundColor: Colors.surfaceDark,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnText: {
    color: Colors.textInverse,
    fontSize: 13,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.hairlineBorder,
  },
  metaCount: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textBody,
  },
  metaTime: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: Colors.statusEmerald,
  },
  errorBox: {
    backgroundColor: Colors.statusRoseBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: Colors.statusRose,
    fontSize: 12,
  },
  resultsContainer: {
    gap: 10,
  },
  resultCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  usernameText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    color: Colors.textPrimary,
  },
  roleTag: {
    backgroundColor: Colors.surfaceDark,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  roleTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  nameText: {
    fontSize: 12,
    color: Colors.textBody,
    marginTop: 2,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 6,
  },
  detailText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  maskedContainer: {
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});


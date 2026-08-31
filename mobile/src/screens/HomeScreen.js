import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { SCAN_ROLES } from '../utils/constants';

export default function HomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { isOnline, queueCount } = useSync();
  const canScan = SCAN_ROLES.includes(user.role);

  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.title}>LeakProofX Scanner</Text>
        <Text style={styles.subtitle}>{user.name} · {user.role}</Text>

        <View style={[styles.statusPill, isOnline ? styles.online : styles.offline]}>
          <Text style={styles.statusPillText}>{isOnline ? 'Online' : 'Offline'}</Text>
        </View>

        {canScan && (
          <Pressable style={styles.card} onPress={() => navigation.navigate('Scan')}>
            <Text style={styles.cardTitle}>Scan a paper</Text>
            <Text style={styles.cardSubtitle}>Record a custody transition via QR code</Text>
          </Pressable>
        )}

        <Pressable style={styles.card} onPress={() => navigation.navigate('Queue')}>
          <Text style={styles.cardTitle}>
            Sync queue {queueCount > 0 ? `(${queueCount})` : ''}
          </Text>
          <Text style={styles.cardSubtitle}>
            {queueCount > 0 ? 'Scans waiting to sync' : 'Everything is synced'}
          </Text>
        </Pressable>
      </View>

      <Pressable style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9', padding: 20, justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 2, marginBottom: 16 },
  statusPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 20 },
  online: { backgroundColor: '#d1fae5' },
  offline: { backgroundColor: '#fee2e2' },
  statusPillText: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 18,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  cardSubtitle: { fontSize: 13, color: '#64748b', marginTop: 4 },
  logoutButton: { alignItems: 'center', padding: 12 },
  logoutText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
});

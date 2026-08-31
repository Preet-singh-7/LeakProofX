import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSync } from '../context/SyncContext';
import { getQueue } from '../storage/scanQueue';

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

const STATUS_LABEL = { pending: 'Pending', syncing: 'Syncing…', failed: 'Retry pending' };

export default function QueueScreen() {
  const { isOnline, isSyncing, sync, lastSyncResult } = useSync();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const queue = await getQueue();
    setItems(queue.slice().reverse());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleSyncNow() {
    await sync();
    await load();
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>{isOnline ? '🟢 Online' : '🔴 Offline'}</Text>
        <Text style={styles.statusText}>{items.length} queued</Text>
      </View>

      {lastSyncResult && (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryText}>
            Last sync — synced {lastSyncResult.succeeded.length}, rejected {lastSyncResult.rejected.length}, still
            pending {lastSyncResult.stillPending.length}
          </Text>
        </View>
      )}

      <Pressable
        style={[styles.syncButton, (!isOnline || isSyncing || items.length === 0) && styles.syncButtonDisabled]}
        onPress={handleSyncNow}
        disabled={!isOnline || isSyncing || items.length === 0}
      >
        {isSyncing ? <ActivityIndicator color="#fff" /> : <Text style={styles.syncButtonText}>Sync now</Text>}
      </Pressable>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>Nothing queued — every recorded scan has synced.</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 12 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Text style={styles.itemStep}>→ {item.toStep.replaceAll('_', ' ')}</Text>
              <Text style={styles.itemMeta}>
                Recorded {formatDate(item.clientTimestamp)}
                {item.location ? ` · ${item.location}` : ''}
              </Text>
              <Text style={styles.itemStatus}>{STATUS_LABEL[item.status] || item.status}</Text>
              {item.lastError ? <Text style={styles.itemError}>{item.lastError}</Text> : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9', padding: 16 },
  statusBar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  statusText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  summaryBox: { backgroundColor: '#e0e7ff', borderRadius: 8, padding: 10, marginBottom: 12 },
  summaryText: { fontSize: 12, color: '#3730a3' },
  syncButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  syncButtonDisabled: { backgroundColor: '#c7d2fe' },
  syncButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 13 },
  item: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 8,
  },
  itemStep: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  itemMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  itemStatus: { fontSize: 11, fontWeight: '600', color: '#4f46e5', marginTop: 4 },
  itemError: { fontSize: 11, color: '#b91c1c', marginTop: 2 },
});

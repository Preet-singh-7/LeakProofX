import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { submitScan } from '../api/tracking';
import { enqueueScan, getQueue } from '../storage/scanQueue';
import { runSync } from '../api/syncService';

const SyncContext = createContext(null);

export function SyncProvider({ children }) {
  const [isOnline, setIsOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const wasOffline = useRef(false);

  const refreshQueueCount = useCallback(async () => {
    const queue = await getQueue();
    setQueueCount(queue.length);
  }, []);

  const sync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await runSync();
      setLastSyncResult(result);
      await refreshQueueCount();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [refreshQueueCount]);

  useEffect(() => {
    refreshQueueCount();
  }, [refreshQueueCount]);

  // The actual "sync job on reconnect" the spec calls for: NetInfo reports
  // connectivity, and the transition from offline -> online is what
  // triggers a sync attempt automatically, not a poll timer.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      if (online && wasOffline.current) {
        sync();
      }
      wasOffline.current = !online;
    });
    return unsubscribe;
  }, [sync]);

  /**
   * What the scan screen calls for every scan, online or not. Tries a
   * direct submit first when we believe we're online (fresher than the
   * queue-then-sync path for the common case); falls back to the offline
   * queue on any network-level failure — including the case where NetInfo
   * said "online" but the request still couldn't reach the server (a flaky
   * connection, not just a binary online/offline state).
   */
  const recordScan = useCallback(
    async ({ qrToken, toStep, location, deviceId }) => {
      if (isOnline) {
        try {
          const result = await submitScan({ qrToken, toStep, location, deviceId });
          return { mode: 'online', ...result };
        } catch (err) {
          if (!err.response) {
            const queued = await enqueueScan({ qrToken, toStep, location, deviceId });
            await refreshQueueCount();
            return { mode: 'queued', queued };
          }
          throw err; // a real server rejection (409/403/etc.) — surface it, don't queue it
        }
      }

      const queued = await enqueueScan({ qrToken, toStep, location, deviceId });
      await refreshQueueCount();
      return { mode: 'queued', queued };
    },
    [isOnline, refreshQueueCount]
  );

  const value = useMemo(
    () => ({ isOnline, queueCount, isSyncing, lastSyncResult, recordScan, sync, refreshQueueCount }),
    [isOnline, queueCount, isSyncing, lastSyncResult, recordScan, sync, refreshQueueCount]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within a SyncProvider');
  return ctx;
}

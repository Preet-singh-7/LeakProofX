import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSync } from '../context/SyncContext';
import { extractErrorMessage } from '../api/client';
import { decodeQrPayload } from '../utils/qr';
import { CUSTODY_STEP_ORDER } from '../utils/constants';

const SCANNABLE_STEPS = CUSTODY_STEP_ORDER.slice(1); // everything after CREATED

export default function ScanScreen() {
  const { isOnline, recordScan } = useSync();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedToken, setScannedToken] = useState(null);
  const [payload, setPayload] = useState(null);
  const [toStep, setToStep] = useState(SCANNABLE_STEPS[0]);
  const [location, setLocation] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resultBanner, setResultBanner] = useState(null);

  function handleBarcodeScanned({ data }) {
    if (scannedToken) return; // ignore repeat fires while a scan is already being reviewed
    setScannedToken(data);
    setPayload(decodeQrPayload(data));
    setError('');
    setResultBanner(null);
  }

  function resetToCamera() {
    setScannedToken(null);
    setPayload(null);
    setLocation('');
    setDeviceId('');
    setError('');
  }

  async function handleSubmit() {
    setError('');
    setSubmitting(true);
    try {
      const result = await recordScan({ qrToken: scannedToken, toStep, location, deviceId });
      setResultBanner(
        result.mode === 'queued'
          ? { tone: 'warn', text: 'No connection — scan saved to the offline queue. It will sync automatically.' }
          : { tone: 'ok', text: `Recorded: ${result.log.fromStep} → ${result.log.toStep}` }
      );
      setScannedToken(null);
      setPayload(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>Camera access is needed to scan custody QR codes.</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant camera access</Text>
        </Pressable>
      </View>
    );
  }

  if (!scannedToken) {
    return (
      <View style={styles.flex}>
        {!isOnline && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>Offline — scans will be queued and synced later</Text>
          </View>
        )}
        {resultBanner && (
          <View style={[styles.resultBanner, resultBanner.tone === 'warn' ? styles.warnBanner : styles.okBanner]}>
            <Text style={styles.resultBannerText}>{resultBanner.text}</Text>
          </View>
        )}
        <CameraView
          style={styles.flex}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleBarcodeScanned}
        />
        <View style={styles.hintOverlay}>
          <Text style={styles.hintText}>Point the camera at a paper's custody QR code</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.formContainer} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.formTitle}>Custody scan</Text>

      <View style={styles.paperInfoBox}>
        {payload ? (
          <>
            <Text style={styles.paperInfoLabel}>Paper ID</Text>
            <Text style={styles.paperInfoValue}>{payload.paperId}</Text>
          </>
        ) : (
          <Text style={styles.paperInfoWarning}>
            Couldn't read this as a LeakProofX custody QR code — you can still submit and let the server validate it,
            or scan again.
          </Text>
        )}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Text style={styles.label}>New custody step</Text>
      <View style={styles.stepGrid}>
        {SCANNABLE_STEPS.map((step) => (
          <Pressable
            key={step}
            style={[styles.stepChip, toStep === step && styles.stepChipSelected]}
            onPress={() => setToStep(step)}
          >
            <Text style={[styles.stepChipText, toStep === step && styles.stepChipTextSelected]}>
              {step.replaceAll('_', ' ')}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Location (optional)</Text>
      <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="e.g. Center A" />

      <Text style={styles.label}>Device ID (optional)</Text>
      <TextInput style={styles.input} value={deviceId} onChangeText={setDeviceId} placeholder="e.g. scanner-07" />

      <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Record scan</Text>}
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={resetToCamera} disabled={submitting}>
        <Text style={styles.secondaryButtonText}>Cancel — scan again</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  permissionText: { textAlign: 'center', color: '#334155', fontSize: 15 },
  hintOverlay: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderRadius: 8,
    padding: 12,
  },
  hintText: { color: '#fff', textAlign: 'center', fontSize: 13 },
  offlineBanner: { backgroundColor: '#b45309', padding: 8 },
  offlineBannerText: { color: '#fff', textAlign: 'center', fontSize: 12, fontWeight: '600' },
  resultBanner: { padding: 10 },
  okBanner: { backgroundColor: '#059669' },
  warnBanner: { backgroundColor: '#b45309' },
  resultBannerText: { color: '#fff', textAlign: 'center', fontSize: 13, fontWeight: '600' },
  formContainer: { flex: 1, backgroundColor: '#f1f5f9', padding: 20 },
  formTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 16 },
  paperInfoBox: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 16,
  },
  paperInfoLabel: { fontSize: 11, color: '#64748b', fontWeight: '600', textTransform: 'uppercase' },
  paperInfoValue: { fontSize: 13, color: '#0f172a', fontFamily: 'Courier', marginTop: 2 },
  paperInfoWarning: { fontSize: 13, color: '#b45309' },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  stepGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  stepChipSelected: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  stepChipText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  stepChipTextSelected: { color: '#fff' },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { backgroundColor: '#a5b4fc' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryButton: { alignItems: 'center', marginTop: 14, padding: 8 },
  secondaryButtonText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  errorText: { color: '#991b1b', fontSize: 13 },
});

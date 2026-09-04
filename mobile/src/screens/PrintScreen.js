import { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { printPaper } from '../api/papers';
import { extractErrorMessage } from '../api/client';
import { decodeQrPayload } from '../utils/qr';

// scan -> selfie -> review -> done
export default function PrintScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [phase, setPhase] = useState('scan');
  const [paperId, setPaperId] = useState(null);
  const [selfieImage, setSelfieImage] = useState(null);
  const [location, setLocation] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  function handleBarcodeScanned({ data }) {
    if (paperId) return; // already past this phase, ignore repeat fires
    const decoded = decodeQrPayload(data);
    if (!decoded?.paperId) {
      setError("Couldn't read a paper ID from that QR code — try scanning again.");
      return;
    }
    setError('');
    setPaperId(decoded.paperId);
    setPhase('selfie');
  }

  async function captureSelfie() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      setSelfieImage(`data:image/jpeg;base64,${photo.base64}`);
      setPhase('review');
    } catch {
      setError('Could not capture a photo — try again.');
    } finally {
      setCapturing(false);
    }
  }

  function retakeSelfie() {
    setSelfieImage(null);
    setPhase('selfie');
  }

  async function handleSubmit() {
    setError('');
    setSubmitting(true);
    try {
      const data = await printPaper(paperId, { selfieImage, location, deviceId });
      setResult(data);
      setPhase('done');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setPhase('scan');
    setPaperId(null);
    setSelfieImage(null);
    setLocation('');
    setDeviceId('');
    setError('');
    setResult(null);
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
        <Text style={styles.permissionText}>Camera access is needed to identify the paper and capture ID evidence.</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant camera access</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'scan') {
    return (
      <View style={styles.flex}>
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}
        <CameraView
          style={styles.flex}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleBarcodeScanned}
        />
        <View style={styles.hintOverlay}>
          <Text style={styles.hintText}>Scan the paper's custody QR code to identify it for printing</Text>
        </View>
      </View>
    );
  }

  if (phase === 'selfie') {
    return (
      <View style={styles.flex}>
        <CameraView ref={cameraRef} style={styles.flex} facing="front" />
        <View style={styles.hintOverlay}>
          <Text style={styles.hintText}>Live photo of whoever is printing this paper — required for accountability</Text>
        </View>
        <Pressable style={[styles.captureButton, capturing && styles.buttonDisabled]} onPress={captureSelfie} disabled={capturing}>
          {capturing ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Capture</Text>}
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.formContainer} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.formTitle}>{phase === 'done' ? 'Print recorded' : 'Confirm and print'}</Text>

      <View style={styles.paperInfoBox}>
        <Text style={styles.paperInfoLabel}>Paper ID</Text>
        <Text style={styles.paperInfoValue}>{paperId}</Text>
      </View>

      {selfieImage && (
        <View style={styles.selfieRow}>
          <Image source={{ uri: selfieImage }} style={styles.selfieThumb} />
          {phase !== 'done' && (
            <Pressable style={styles.secondaryButton} onPress={retakeSelfie} disabled={submitting}>
              <Text style={styles.secondaryButtonText}>Retake</Text>
            </Pressable>
          )}
        </View>
      )}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {phase === 'review' && (
        <>
          <Text style={styles.label}>Location (optional)</Text>
          <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="e.g. Center A" />

          <Text style={styles.label}>Device ID (optional)</Text>
          <TextInput style={styles.input} value={deviceId} onChangeText={setDeviceId} placeholder="e.g. scanner-07" />

          <Pressable
            style={[styles.button, (submitting || !selfieImage) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting || !selfieImage}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Record print</Text>}
          </Pressable>
        </>
      )}

      {phase === 'done' && result && (
        <>
          <View style={styles.okBanner}>
            <Text style={styles.okBannerText}>Recorded — evidence saved. Hand off for physical printing.</Text>
          </View>
          <Text style={styles.label}>{result.title} — {result.examName}</Text>
          <View style={styles.contentBox}>
            {result.contentType === 'PDF' ? (
              <Text style={styles.contentText}>PDF paper — open the web dashboard to view the content. Evidence is recorded either way.</Text>
            ) : (
              <Text style={styles.contentText}>{result.content}</Text>
            )}
          </View>
          <Pressable style={styles.button} onPress={reset}>
            <Text style={styles.buttonText}>Print another paper</Text>
          </Pressable>
        </>
      )}

      {phase !== 'done' && (
        <Pressable style={styles.secondaryButton} onPress={reset} disabled={submitting}>
          <Text style={styles.secondaryButtonText}>Cancel — start over</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  permissionText: { textAlign: 'center', color: '#334155', fontSize: 15 },
  hintOverlay: {
    position: 'absolute',
    bottom: 96,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderRadius: 8,
    padding: 12,
  },
  hintText: { color: '#fff', textAlign: 'center', fontSize: 13 },
  errorBanner: { backgroundColor: '#991b1b', padding: 8, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
  errorBannerText: { color: '#fff', textAlign: 'center', fontSize: 12, fontWeight: '600' },
  captureButton: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 16,
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
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
  selfieRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  selfieThumb: { width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' },
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
  contentBox: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  contentText: { fontFamily: 'Courier', fontSize: 13, color: '#0f172a' },
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
  okBanner: { backgroundColor: '#059669', borderRadius: 8, padding: 12, marginBottom: 16 },
  okBannerText: { color: '#fff', textAlign: 'center', fontSize: 13, fontWeight: '600' },
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

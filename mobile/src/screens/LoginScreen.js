import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { extractErrorMessage } from '../api/client';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // No navigation call needed — RootNavigator switches stacks based on
      // AuthContext.isAuthenticated once `user` updates.
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.title}>LeakProofX</Text>
        <Text style={styles.subtitle}>Custody Scanner</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="you@leakproofx.local"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
        />

        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>

        <Text style={styles.footnote}>Accounts are provisioned by an administrator.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#f1f5f9',
  },
  title: { fontSize: 28, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 32 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { backgroundColor: '#a5b4fc' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  errorText: { color: '#991b1b', fontSize: 13 },
  footnote: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 20 },
});

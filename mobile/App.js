import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { SyncProvider } from './src/context/SyncContext';
import RootNavigator from './src/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SyncProvider>
          <RootNavigator />
          <StatusBar style="auto" />
        </SyncProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

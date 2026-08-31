import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from './context/AuthContext';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import ScanScreen from './screens/ScanScreen';
import QueueScreen from './screens/QueueScreen';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerTintColor: '#4f46e5' }}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'LeakProofX' }} />
            <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan custody QR' }} />
            <Stack.Screen name="Queue" component={QueueScreen} options={{ title: 'Sync queue' }} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

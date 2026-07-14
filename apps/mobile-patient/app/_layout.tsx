import { Stack } from 'expo-router';

// This hides the default header bars so our custom designs show correctly
export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="create-account" />
    
    </Stack>
  );
}
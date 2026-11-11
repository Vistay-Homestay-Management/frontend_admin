import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { MobileSessionProvider } from '../MobileSession'

export default function RootLayout() {
  return <MobileSessionProvider>
      <StatusBar style="light" />
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
  </MobileSessionProvider>
}

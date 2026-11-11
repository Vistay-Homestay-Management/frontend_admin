import { Redirect } from 'expo-router'
import { LoadingScreen, LoginScreen, useMobileSession } from '../MobileSession'

export default function EntryScreen() {
  const { auth } = useMobileSession()
  if (auth.status === 'loading' || auth.status === 'authorizing') return <LoadingScreen />
  if (auth.status === 'authenticated' && auth.accessToken) return <Redirect href="/overview" />
  return <LoginScreen />
}

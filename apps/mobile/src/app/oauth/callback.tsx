import { Redirect } from 'expo-router'

// The OAuth response is consumed by expo-auth-session in the root provider.
// Keep a real Expo Router target for the deep link so the callback does not
// fall through to the not-found screen before the session is exchanged.
export default function OAuthCallbackScreen() {
  return <Redirect href="/" />
}

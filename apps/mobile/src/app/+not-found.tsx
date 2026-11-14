import { router } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { palette, radii } from '../ui/theme'

export default function NotFoundScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Không tìm thấy màn hình</Text>
        <Text style={styles.detail}>
          Liên kết đăng nhập đã được nhận nhưng đường dẫn không hợp lệ. Hãy quay lại và thử đăng nhập lại.
        </Text>
        <Pressable onPress={() => router.replace('/')} style={styles.button}>
          <Text style={styles.buttonText}>Quay lại đăng nhập</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  container: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 14 },
  title: { color: palette.ink, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  detail: { maxWidth: 320, color: palette.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  button: { minHeight: 48, paddingHorizontal: 24, borderRadius: radii.medium, backgroundColor: palette.evergreen, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: palette.white, fontSize: 14, fontWeight: '700' },
})

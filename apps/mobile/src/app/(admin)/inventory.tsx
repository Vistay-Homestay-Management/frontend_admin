import { ScrollView, View } from 'react-native'
import { InventoryWorkspace } from '../../InventoryWorkspace'
import { useAdmin } from '../../AdminContext'
import { PageHeading, pageStyles } from '../../ui/primitives'

/**
 * Dedicated inventory route for operators. Keep the booking route intact for
 * compatibility, while exposing the same revision-pinned workspace from the
 * primary navigation so the capability is discoverable on touch devices.
 */
export default function InventoryScreen() {
  const { accessToken, config, viewer } = useAdmin()
  return <ScrollView style={pageStyles.scroll} contentContainerStyle={pageStyles.content}>
    <PageHeading
      eyebrow="Vận hành"
      title="Tồn phòng"
      detail="Xem khả dụng theo từng căn, tạo hoặc giải phóng block vận hành theo revision mới nhất."
    />
    <View><InventoryWorkspace accessToken={accessToken} graphqlUrl={config.graphqlUrl} viewer={viewer} /></View>
  </ScrollView>
}

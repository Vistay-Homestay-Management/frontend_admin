import { ScrollView, View } from 'react-native'
import { InventoryWorkspace } from '../../InventoryWorkspace'
import { useAdmin } from '../../AdminContext'
import { PageHeading, pageStyles } from '../../ui/primitives'

export default function BookingScreen() {
  const { accessToken, config, viewer } = useAdmin()
  return <ScrollView style={pageStyles.scroll} contentContainerStyle={pageStyles.content}>
    <PageHeading eyebrow="Lưu trú" title="Booking" detail="Lịch khả dụng, chặn phòng và thao tác vận hành dùng trực tiếp contract GraphQL hiện có." />
    <View><InventoryWorkspace accessToken={accessToken} graphqlUrl={config.graphqlUrl} viewer={viewer} /></View>
  </ScrollView>
}

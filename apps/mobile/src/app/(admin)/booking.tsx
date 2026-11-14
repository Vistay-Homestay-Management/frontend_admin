import { ScrollView, View } from 'react-native'
import { useState } from 'react'
import { InventoryWorkspace, type InventorySection } from '../../InventoryWorkspace'
import { useAdmin } from '../../AdminContext'
import { PageHeading, Segmented, pageStyles } from '../../ui/primitives'

export default function BookingScreen() {
  const { accessToken, config, viewer } = useAdmin()
  const [section, setSection] = useState<InventorySection>('map')
  return <ScrollView style={pageStyles.scroll} contentContainerStyle={pageStyles.content}>
    <PageHeading eyebrow="Lưu trú" title="Booking" detail="Lịch khả dụng, chặn phòng và thao tác vận hành dùng trực tiếp contract GraphQL hiện có." />
    <Segmented
      options={[{ label: 'Sơ đồ', value: 'map' }, { label: 'Đặt phòng', value: 'reservations' }, { label: 'Check-in', value: 'check-in' }, { label: 'Check-out', value: 'check-out' }]}
      value={section}
      onChange={setSection}
    />
    <View><InventoryWorkspace accessToken={accessToken} graphqlUrl={config.graphqlUrl} section={section} viewer={viewer} /></View>
  </ScrollView>
}

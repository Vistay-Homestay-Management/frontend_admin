import { ScrollView, View } from 'react-native'
import { useState } from 'react'
import { InventoryWorkspace, type InventoryWorkspaceTab } from '../../InventoryWorkspace'
import { useAdmin } from '../../AdminContext'
import { PageHeading, Segmented, pageStyles } from '../../ui/primitives'

export default function BookingScreen() {
  const { accessToken, config, viewer } = useAdmin()
  const [tab, setTab] = useState<InventoryWorkspaceTab>('overview')
  return <ScrollView style={pageStyles.scroll} contentContainerStyle={pageStyles.content}>
    <PageHeading eyebrow="Lưu trú" title="Booking" detail="Lịch khả dụng, chặn phòng và thao tác vận hành dùng trực tiếp contract GraphQL hiện có." />
    <Segmented
      options={[{ label: 'Khả dụng', value: 'overview' }, { label: 'Đang chặn', value: 'active' }, { label: 'Lịch sử', value: 'history' }]}
      value={tab}
      onChange={setTab}
    />
    <View><InventoryWorkspace accessToken={accessToken} graphqlUrl={config.graphqlUrl} tab={tab} viewer={viewer} /></View>
  </ScrollView>
}

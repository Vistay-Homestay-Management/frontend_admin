import { ScrollView } from 'react-native'
import { NotificationInbox } from '../../NotificationInbox'
import { useAdmin } from '../../AdminContext'
import { PageHeading, pageStyles } from '../../ui/primitives'

export default function NotificationsScreen() {
  const { inbox } = useAdmin()
  return <ScrollView style={pageStyles.scroll} contentContainerStyle={pageStyles.content}>
    <PageHeading eyebrow="Trung tâm" title="Thông báo" detail="Hộp thư và trạng thái đọc" />
    <NotificationInbox model={inbox} />
  </ScrollView>
}

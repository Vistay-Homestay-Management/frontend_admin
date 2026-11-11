import { ScrollView } from 'react-native'
import { NotificationInbox } from '../../NotificationInbox'
import { useAdmin } from '../../AdminContext'
import { PageHeading, pageStyles } from '../../ui/primitives'

export default function NotificationsScreen() {
  const { inbox } = useAdmin()
  return <ScrollView style={pageStyles.scroll} contentContainerStyle={pageStyles.content}>
    <PageHeading eyebrow="Trung tâm" title="Thông báo" detail="Hộp thư thời gian thực, trạng thái đọc và cursor được đồng bộ với tài khoản hiện tại." />
    <NotificationInbox model={inbox} />
  </ScrollView>
}

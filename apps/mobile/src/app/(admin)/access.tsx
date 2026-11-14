import { ScrollView, View } from 'react-native'
import { AuthorizationWorkspace } from '../../AuthorizationWorkspace'
import { useAdmin } from '../../AdminContext'
import { PageHeading, pageStyles } from '../../ui/primitives'

export default function AccessScreen() {
  const { accessToken, config, viewer } = useAdmin()
  return <ScrollView style={pageStyles.scroll} contentContainerStyle={pageStyles.content}>
    <PageHeading eyebrow="Bảo mật" title="Tài khoản & phân quyền" detail="Role, permission và yêu cầu maker-checker được lấy từ cùng nguồn sự thật với web admin." />
    <View><AuthorizationWorkspace accessToken={accessToken} graphqlUrl={config.graphqlUrl} viewer={viewer} /></View>
  </ScrollView>
}

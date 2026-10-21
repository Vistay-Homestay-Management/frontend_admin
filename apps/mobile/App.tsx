import { StatusBar } from 'expo-status-bar'
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

const signals = [
  ['Nhận phòng', '14', '11 sẵn sàng'],
  ['Yêu cầu mở', '9', '2 quá hạn'],
  ['Công suất', '82,4%', '7 ngày tới'],
  ['Doanh thu', '1,28 tỷ', '108% kế hoạch'],
]

export default function App() {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>TRUNG TÂM VẬN HÀNH</Text><Text style={styles.title}>Nhịp ViStay hôm nay.</Text></View>
          <TouchableOpacity style={styles.avatar}><Text style={styles.avatarText}>HP</Text></TouchableOpacity>
        </View>
        <View style={styles.signalGrid}>
          {signals.map(([label, value, note], index) => (
            <View key={label} style={[styles.signal, index === 3 && styles.signalAccent]}>
              <Text style={styles.signalLabel}>{label}</Text><Text style={styles.signalValue}>{value}</Text><Text style={styles.signalNote}>{note}</Text>
            </View>
          ))}
        </View>
        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Cần xử lý</Text><Text style={styles.count}>9 mục</Text></View>
        <View style={styles.tasks}>
          {[
            ['Điều hòa không làm lạnh', 'Sơn Trà House', '18 phút'],
            ['Duyệt chi phí sửa khóa', 'Sông Hàn Loft', '46 phút'],
            ['Đối chiếu booking OTA', 'An Thượng Studio', '1 giờ'],
          ].map(([title, place, age], index) => (
            <TouchableOpacity key={title} style={styles.task}>
              <View style={[styles.dot, index === 0 && styles.dotCritical]} />
              <View style={styles.taskCopy}><Text style={styles.taskTitle}>{title}</Text><Text style={styles.taskPlace}>{place}</Text></View>
              <Text style={styles.taskAge}>{age}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>Mở lịch vận hành</Text></TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f3f1ea'}, page:{padding:22,paddingBottom:50}, header:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginTop:18,marginBottom:34},
  eyebrow:{fontSize:11,letterSpacing:1.4,color:'#6f7b74',fontWeight:'600'}, title:{fontSize:38,lineHeight:39,letterSpacing:-2.1,color:'#17231d',fontWeight:'600',maxWidth:270,marginTop:7},
  avatar:{width:45,height:45,borderRadius:23,backgroundColor:'#d9ff63',alignItems:'center',justifyContent:'center'},avatarText:{fontWeight:'700',color:'#17231d'},
  signalGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},signal:{width:'48%',minHeight:142,padding:17,borderWidth:1,borderColor:'#dcddd5',borderRadius:17,backgroundColor:'#fffef9'},signalAccent:{backgroundColor:'#d9ff63',borderColor:'#d9ff63'},
  signalLabel:{fontSize:12,color:'#6f7b74'},signalValue:{fontSize:29,letterSpacing:-1.5,fontWeight:'600',color:'#17231d',marginTop:'auto'},signalNote:{fontSize:11,color:'#65766b',marginTop:4},
  sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:38,marginBottom:14},sectionTitle:{fontSize:23,fontWeight:'600',letterSpacing:-.7,color:'#17231d'},count:{fontSize:11,paddingHorizontal:9,paddingVertical:5,borderRadius:20,backgroundColor:'#e6e6df',color:'#59655e'},
  tasks:{borderWidth:1,borderColor:'#dcddd5',borderRadius:18,backgroundColor:'#fffef9',paddingHorizontal:17},task:{minHeight:84,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#e5e6df'},dot:{width:8,height:8,borderRadius:4,backgroundColor:'#dda943',marginRight:12},dotCritical:{backgroundColor:'#d35b4d'},taskCopy:{flex:1},taskTitle:{fontSize:14,fontWeight:'600',color:'#17231d'},taskPlace:{fontSize:11,color:'#6f7b74',marginTop:5},taskAge:{fontSize:10,color:'#879189'},
  primary:{height:55,borderRadius:15,backgroundColor:'#17231d',alignItems:'center',justifyContent:'center',marginTop:20},primaryText:{color:'white',fontWeight:'600',fontSize:14},
})

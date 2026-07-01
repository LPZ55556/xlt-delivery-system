import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { API_BASE_URL } from './config';

type Screen = 'home' | 'login' | 'bill' | 'scan' | 'merchant' | 'route';

const tabs: Array<{ key: Screen; label: string }> = [
  { key: 'home', label: '首页' },
  { key: 'merchant', label: '商户' },
  { key: 'scan', label: '扫码' },
  { key: 'route', label: '轨迹' },
];

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

function renderScreen(screen: Screen) {
  switch (screen) {
    case 'login':
      return <Placeholder title="登录" description="配送员账号登录占位，后续接入认证接口。" />;
    case 'bill':
      return <Placeholder title="开单" description="选择商户、扫码商品、调整数量、生成电子清单的流程占位。App 端不显示商品进价。" />;
    case 'scan':
      return <Placeholder title="扫码" description="摄像头扫码接口预留，当前阶段不接入实际扫码能力。" />;
    case 'merchant':
      return <Placeholder title="商户选择" description="商户列表和附近商户推荐占位，地图定位后续接入。" />;
    case 'route':
      return <Placeholder title="今日轨迹" description="定位点、到店顺序和订单位置展示占位，后续接入高德地图。" />;
    default:
      return (
        <View style={styles.panel}>
          <Text style={styles.title}>今日营业概览</Text>
          <View style={styles.metrics}>
            {['今日营业额', '已配送商户', '今日订单数', '售出商品数'].map((item) => (
              <View style={styles.metric} key={item}>
                <Text style={styles.metricValue}>--</Text>
                <Text style={styles.metricLabel}>{item}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.description}>未同步订单、未打印订单、商品销量排行和库存查询入口将在后续阶段接入。</Text>
        </View>
      );
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>小灵通</Text>
          <Text style={styles.apiText}>API: {API_BASE_URL}</Text>
        </View>
        <TouchableOpacity style={styles.loginButton} onPress={() => setScreen('login')}>
          <Text style={styles.loginText}>登录</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content}>{renderScreen(screen)}</ScrollView>
      <View style={styles.bottomNav}>
        {tabs.slice(0, 2).map((tab) => (
          <TouchableOpacity key={tab.key} style={styles.tab} onPress={() => setScreen(tab.key)}>
            <Text style={styles.tabText}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.billButton} onPress={() => setScreen('bill')}>
          <Text style={styles.billText}>开单</Text>
        </TouchableOpacity>
        {tabs.slice(2).map((tab) => (
          <TouchableOpacity key={tab.key} style={styles.tab} onPress={() => setScreen(tab.key)}>
            <Text style={styles.tabText}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f7fb' },
  header: { alignItems: 'center', borderBottomColor: '#dfe4ec', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 18 },
  appName: { color: '#172033', fontSize: 22, fontWeight: '700' },
  apiText: { color: '#6b7280', fontSize: 12, marginTop: 4 },
  loginButton: { backgroundColor: '#0f766e', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
  loginText: { color: '#fff', fontWeight: '600' },
  content: { padding: 16, paddingBottom: 112 },
  panel: { backgroundColor: '#fff', borderColor: '#dfe4ec', borderRadius: 8, borderWidth: 1, padding: 18 },
  title: { color: '#172033', fontSize: 24, fontWeight: '700', marginBottom: 10 },
  description: { color: '#5f6b7a', fontSize: 15, lineHeight: 22 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  metric: { backgroundColor: '#edf7f5', borderRadius: 8, minWidth: '45%', padding: 14 },
  metricValue: { color: '#0f766e', fontSize: 22, fontWeight: '700' },
  metricLabel: { color: '#506070', marginTop: 4 },
  bottomNav: { alignItems: 'center', backgroundColor: '#fff', borderTopColor: '#dfe4ec', borderTopWidth: 1, bottom: 0, flexDirection: 'row', justifyContent: 'space-around', left: 0, paddingBottom: 10, paddingTop: 10, position: 'absolute', right: 0 },
  tab: { alignItems: 'center', minWidth: 56, paddingVertical: 8 },
  tabText: { color: '#334155', fontWeight: '600' },
  billButton: { alignItems: 'center', backgroundColor: '#0f766e', borderRadius: 34, height: 68, justifyContent: 'center', marginTop: -32, width: 68 },
  billText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});

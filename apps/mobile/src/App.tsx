import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  NativeModules,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import { WebView } from 'react-native-webview';
import { api, setUnauthorizedHandler } from './api';
import { AMAP_WEB_SERVICE_KEY, API_BASE_URL } from './config';
import { clearSession, getAccessToken, getStoredUser, saveSession } from './storage';
import { formatCents, formatDateTime, moneyToCents, multiplyMoney, statusLabel } from './money';
import type { AmapPoi, CartItem, CurrentUser, Merchant, Order, Product, ProductSalesRankingItem, Receipt, TrackPoint } from './types';

type Screen = 'login' | 'home' | 'merchantSelect' | 'billing' | 'orders' | 'orderDetail' | 'route' | 'ranking' | 'printer' | 'settings' | 'scanner' | 'productManage' | 'productForm' | 'merchantManage' | 'merchantForm';
type ScannerMode = 'billing' | 'productForm';
type NativeLocationModule = { getCurrentPosition?: () => Promise<TrackPoint> };
type Message = { type: 'error' | 'success' | 'info'; text: string } | null;

const roleLabels: Record<string, string> = { super_admin: '超级管理员', admin: '管理员', finance: '财务', warehouse: '仓库', salesperson: '配送员' };


const xltLocation = NativeModules.XltLocation as NativeLocationModule | undefined;
function canManageProducts(role: string) { return ['super_admin', 'admin', 'warehouse'].includes(role); }
function canManageMerchants(role: string) { return ['super_admin', 'admin'].includes(role); }
function canViewRanking(role: string) { return ['super_admin', 'admin', 'finance', 'salesperson'].includes(role); }
async function requestLocationPermission() {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
    title: '\u5b9a\u4f4d\u6743\u9650',
    message: '\u5c0f\u7075\u901a\u9700\u8981\u5b9a\u4f4d\u6743\u9650\u7528\u4e8e\u5230\u5e97\u786e\u8ba4\u548c\u8f68\u8ff9\u8bb0\u5f55\u3002',
    buttonPositive: '\u5141\u8bb8',
    buttonNegative: '\u53d6\u6d88',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
async function getCurrentPosition() {
  const granted = await requestLocationPermission();
  if (!granted) throw new Error('\u5b9a\u4f4d\u6743\u9650\u672a\u6388\u6743\u3002');
  if (!xltLocation?.getCurrentPosition) throw new Error('\u5b9a\u4f4d\u6a21\u5757\u672a\u5c31\u7eea\u3002');
  return xltLocation.getCurrentPosition();
}
async function searchAmapPois(keyword: string): Promise<AmapPoi[]> {
  if (!AMAP_WEB_SERVICE_KEY) throw new Error('\u672a\u914d\u7f6e\u9ad8\u5fb7 Key\uff0c\u8bf7\u5148\u914d\u7f6e AMAP_WEB_SERVICE_KEY\u3002');
  const url = `https://restapi.amap.com/v3/place/text?key=${encodeURIComponent(AMAP_WEB_SERVICE_KEY)}&keywords=${encodeURIComponent(keyword)}&offset=10&page=1&extensions=base`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.status !== '1') throw new Error(data.info || '\u5730\u56fe\u641c\u7d22\u5931\u8d25\u3002');
  return (Array.isArray(data.pois) ? data.pois : []).map((item: { id?: string; name?: string; address?: string | string[]; location?: string }, index: number) => {
    const [longitude = '', latitude = ''] = String(item.location ?? '').split(',');
    const address = Array.isArray(item.address) ? item.address.join('') : String(item.address ?? '');
    return { id: item.id || `${index}`, name: item.name || '', address, latitude, longitude };
  }).filter((item: AmapPoi) => item.name && item.latitude && item.longitude);
}
function createMapHtml(points: TrackPoint[], current: TrackPoint | null, userName: string) {
  const line = points.map((point) => [Number(point.longitude), Number(point.latitude)]).filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  const center = current ? [Number(current.longitude), Number(current.latitude)] : line[0];
  return `<!doctype html><html><head><meta name="viewport" content="initial-scale=1,maximum-scale=1,width=device-width"><style>html,body,#map{height:100%;margin:0}.label{background:#0f766e;color:white;padding:4px 8px;border-radius:4px;font-size:12px}</style><script src="https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(AMAP_WEB_SERVICE_KEY)}"></script></head><body><div id="map"></div><script>var center=${JSON.stringify(center ?? [116.397428,39.90923])};var points=${JSON.stringify(line)};var map=new AMap.Map('map',{zoom:15,center:center});if(points.length){new AMap.Polyline({path:points,strokeColor:'#0f766e',strokeWeight:5}).setMap(map);map.setFitView();}new AMap.Marker({position:center,content:'<div class="label">${userName}</div>'}).setMap(map);</script></body></html>`;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [message, setMessage] = useState<Message>(null);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const [scannerMode, setScannerMode] = useState<ScannerMode>('billing');
  const [prefillBarcode, setPrefillBarcode] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingMerchant, setEditingMerchant] = useState<Merchant | null>(null);
  const [productsRefreshKey, setProductsRefreshKey] = useState(0);
  const [merchantsRefreshKey, setMerchantsRefreshKey] = useState(0);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null); setSelectedMerchant(null); setCart([]); setScreen('login');
      setMessage({ type: 'error', text: '登录已过期，请重新登录。' });
    });
    async function restoreSession() {
      try {
        const [token, storedUser] = await Promise.all([getAccessToken(), getStoredUser()]);
        if (!token || !storedUser) { setScreen('login'); return; }
        const result = await api.me();
        setUser(result.user); setScreen('home');
      } catch {
        await clearSession(); setScreen('login');
      } finally { setBooting(false); }
    }
    restoreSession();
  }, []);

  async function handleLogin(username: string, password: string) {
    setMessage(null);
    try {
      const result = await api.login({ username, password });
      await saveSession(result.accessToken, result.user);
      setUser(result.user); setScreen('home'); setMessage({ type: 'success', text: '登录成功。' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '登录失败，请稍后重试。' });
    }
  }

  async function logout() {
    await clearSession();
    setUser(null); setSelectedMerchant(null); setCart([]); setSelectedOrderId(null); setScreen('login');
    setMessage({ type: 'info', text: '已退出登录。' });
  }

  function startBilling() { setSelectedMerchant(null); setCart([]); setScreen('merchantSelect'); }
  function selectMerchant(merchant: Merchant) { setSelectedMerchant(merchant); setCart([]); setScreen('billing'); }

  function addProduct(product: Product) {
    if (!product.enabled) { setMessage({ type: 'error', text: '该商品已停用，不能加入清单。' }); return; }
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) return current.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { product, quantity: 1 }];
    });
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((current) => current.map((item) => {
      if (item.product.id !== productId) return item;
      const next = item.quantity + delta;
      if (next < 1) { setMessage({ type: 'error', text: '商品数量不能小于 1。' }); return item; }
      return { ...item, quantity: next };
    }));
  }
  function removeCartItem(productId: string) { setCart((current) => current.filter((item) => item.product.id !== productId)); }

  async function submitOrder(remark?: string) {
    if (!selectedMerchant) { setMessage({ type: 'error', text: '请先选择商户。' }); return; }
    if (cart.length === 0) { setMessage({ type: 'error', text: '电子清单为空，不能提交订单。' }); return; }
    try {
      const order = await api.createOrder({ merchantId: selectedMerchant.id, items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })), remark });
      setSelectedOrderId(order.id); setSelectedMerchant(null); setCart([]); setOrdersRefreshKey((value) => value + 1); setScreen('orderDetail');
      setMessage({ type: 'success', text: `订单 ${order.orderNo} 创建成功。` });
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : '创建订单失败。' }); }
  }


  async function handleMerchantCheckIn(merchant: Merchant) {
    try {
      const point = await getCurrentPosition();
      await api.checkIn({ merchantId: merchant.id, latitude: point.latitude, longitude: point.longitude, address: merchant.address });
      setMessage({ type: 'success', text: '\u5230\u5e97\u786e\u8ba4\u5df2\u4e0a\u4f20\u3002' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '\u5230\u5e97\u786e\u8ba4\u5931\u8d25\u3002' });
    }
  }

  const content = booting ? <CenteredLoading text="正在恢复登录状态..." /> : !user ? <LoginScreen onLogin={handleLogin} message={message} /> : (
    <>
      <Header user={user} onLogout={logout} />
      {message ? <MessageBanner message={message} onClose={() => setMessage(null)} /> : null}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {screen === 'home' ? <HomeScreen user={user} onStartBilling={startBilling} onOpenOrders={() => setScreen('orders')} onOpenRoute={() => setScreen('route')} onOpenRanking={() => setScreen('ranking')} onOpenProducts={() => setScreen('productManage')} onOpenMerchants={() => setScreen('merchantManage')} onOpenPrinter={() => setScreen('printer')} onOpenSettings={() => setScreen('settings')} /> : null}
        {screen === 'merchantSelect' ? <MerchantSelectScreen onSelect={selectMerchant} onCheckIn={handleMerchantCheckIn} onBack={() => setScreen('home')} /> : null}
        {screen === 'billing' && selectedMerchant ? <BillingScreen merchant={selectedMerchant} cart={cart} onAddProduct={addProduct} onQuantityChange={changeQuantity} onRemove={removeCartItem} onScanBarcode={() => { setScannerMode('billing'); setScreen('scanner'); }} onSubmit={submitOrder} onBack={() => setScreen('merchantSelect')} /> : null}
        {screen === 'orders' ? <OrdersScreen refreshKey={ordersRefreshKey} onOpenDetail={(id) => { setSelectedOrderId(id); setScreen('orderDetail'); }} /> : null}
        {screen === 'orderDetail' && selectedOrderId ? <OrderDetailScreen orderId={selectedOrderId} onBack={() => setScreen('orders')} onHome={() => setScreen('home')} /> : null}
        {screen === 'route' ? <PlaceholderScreen title="今日轨迹" description="今日轨迹后续接入高德地图、定位点、到店商户和订单发生位置。本阶段不申请高德 Key。" /> : null}
        {screen === 'ranking' ? <PlaceholderScreen title="商品销量排行" description="商品销量排行后续接入报表接口，仅展示销量和销售金额，不展示进价或利润。" /> : null}
        {screen === 'printer' ? <PlaceholderScreen title="打印机连接" description="蓝牙热敏打印功能后续接入；当前可在订单详情中预览小票数据。" /> : null}
        {screen === 'settings' ? <SettingsScreen apiBaseUrl={API_BASE_URL} onLogout={logout} /> : null}
      </ScrollView>
      <BottomNav current={screen} onHome={() => setScreen('home')} onOrders={() => setScreen('orders')} onStartBilling={startBilling} onRoute={() => setScreen('route')} onSettings={() => setScreen('settings')} />
    </>
  );

  return <SafeAreaView style={styles.safeArea}><StatusBar barStyle="dark-content" />{content}</SafeAreaView>;
}

function Header({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  return <View style={styles.header}><View><Text style={styles.appName}>小灵通</Text><Text style={styles.mutedText}>{user.name || user.displayName || user.username} · {roleLabels[user.role] ?? user.role}</Text></View><TouchableOpacity style={styles.secondaryButton} onPress={onLogout}><Text style={styles.secondaryButtonText}>退出</Text></TouchableOpacity></View>;
}

function LoginScreen({ onLogin, message }: { onLogin: (username: string, password: string) => Promise<void>; message: Message }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [submitting, setSubmitting] = useState(false);
  async function submit() { if (!username.trim() || !password) { Alert.alert('登录提示', '请输入账号和密码。'); return; } setSubmitting(true); await onLogin(username.trim(), password); setSubmitting(false); }
  return <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled"><View style={styles.authCard}><Text style={styles.loginTitle}>小灵通</Text><Text style={styles.description}>使用 Web 后台创建的配送员账号登录。</Text>{message ? <MessageBanner message={message} /> : null}<Text style={styles.label}>账号</Text><TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} /><Text style={styles.label}>密码</Text><TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry /><TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={submitting}><Text style={styles.primaryButtonText}>{submitting ? '登录中...' : '登录'}</Text></TouchableOpacity></View></ScrollView>;
}

function HomeScreen({ user, onStartBilling, onOpenOrders, onOpenRoute, onOpenRanking, onOpenProducts, onOpenMerchants, onOpenPrinter, onOpenSettings }: { user: CurrentUser; onStartBilling: () => void; onOpenOrders: () => void; onOpenRoute: () => void; onOpenRanking: () => void; onOpenProducts: () => void; onOpenMerchants: () => void; onOpenPrinter: () => void; onOpenSettings: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let alive = true; api.listOrders().then((result) => { if (alive) setOrders(result.items); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '\u8ba2\u5355\u7edf\u8ba1\u52a0\u8f7d\u5931\u8d25\u3002'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, []);
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((order) => order.createdAt.slice(0, 10) === today && order.status !== 'voided');
  const todayAmount = todayOrders.reduce((total, order) => total + moneyToCents(order.totalAmount), 0);
  const todayProductCount = todayOrders.reduce((total, order) => total + order.items.reduce((sum, item) => sum + item.quantity, 0), 0);
  const merchantCount = new Set(todayOrders.map((order) => order.merchantId)).size;
  return <View><View style={styles.panel}><Text style={styles.title}>\u4eca\u65e5\u8425\u4e1a\u6982\u89c8</Text><Text style={styles.description}>\u5f53\u524d\u7528\u6237\uff1a{user.name || user.displayName || user.username}?{roleLabels[user.role] ?? user.role}?</Text>{loading ? <ActivityIndicator color="#0f766e" /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}<View style={styles.metrics}><Metric label="\u4eca\u65e5\u8425\u4e1a\u989d" value={`?${formatCents(todayAmount)}`} /><Metric label="\u5df2\u914d\u9001\u5546\u6237" value={String(merchantCount)} /><Metric label="\u4eca\u65e5\u8ba2\u5355\u6570" value={String(todayOrders.length)} /><Metric label="\u552e\u51fa\u5546\u54c1\u6570" value={String(todayProductCount)} /><Metric label="\u672a\u540c\u6b65\u8ba2\u5355" value="--" /><Metric label="\u672a\u6253\u5370\u8ba2\u5355" value="--" /></View></View><View style={styles.actionGrid}><ActionButton label="\u5f00\u5355" primary onPress={onStartBilling} /><ActionButton label="\u6211\u7684\u8ba2\u5355" onPress={onOpenOrders} />{canManageProducts(user.role) ? <ActionButton label="\u5546\u54c1\u7ba1\u7406" onPress={onOpenProducts} /> : null}<ActionButton label="\u5546\u6237\u7ba1\u7406" onPress={onOpenMerchants} />{canViewRanking(user.role) ? <ActionButton label="\u5546\u54c1\u9500\u91cf\u6392\u884c" onPress={onOpenRanking} /> : null}<ActionButton label="\u4eca\u65e5\u8f68\u8ff9" onPress={onOpenRoute} /><ActionButton label="\u6253\u5370\u673a\u8fde\u63a5" onPress={onOpenPrinter} /><ActionButton label="\u8bbe\u7f6e / \u9000\u51fa" onPress={onOpenSettings} /></View></View>;
}
function MerchantSelectScreen({ onSelect, onCheckIn, onBack }: { onSelect: (merchant: Merchant) => void; onCheckIn: (merchant: Merchant) => void; onBack: () => void }) {
  const [merchants, setMerchants] = useState<Merchant[]>([]); const [keyword, setKeyword] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let alive = true; api.listMerchants().then((result) => { if (alive) setMerchants(result.items.filter((item) => item.isActive)); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '\u5546\u6237\u52a0\u8f7d\u5931\u8d25\u3002'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, []);
  const filtered = merchants.filter((merchant) => !keyword.trim() || merchant.name.includes(keyword.trim()) || Boolean(merchant.phone?.includes(keyword.trim())) || merchant.address.includes(keyword.trim()));
  return <View><PageTitle title="\u9009\u62e9\u5546\u6237" onBack={onBack} /><Text style={styles.description}>\u53ef\u9009\u62e9\u5546\u6237\u5f00\u5355\uff0c\u4e5f\u53ef\u5148\u8fdb\u884c\u5230\u5e97\u5b9a\u4f4d\u786e\u8ba4\u3002</Text><TextInput style={styles.input} value={keyword} onChangeText={setKeyword} placeholder="\u6309\u5546\u6237\u540d\u79f0\u3001\u7535\u8bdd\u6216\u5730\u5740\u641c\u7d22" />{loading ? <CenteredLoading text="\u6b63\u5728\u52a0\u8f7d\u5546\u6237..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{!loading && filtered.length === 0 ? <EmptyText text="\u6682\u65e0\u53ef\u9009\u5546\u6237" /> : null}{filtered.map((merchant) => <View key={merchant.id} style={styles.listCard}><Text style={styles.cardTitle}>{merchant.name}</Text><Text style={styles.mutedText}>{merchant.address}</Text><Text style={styles.mutedText}>{merchant.contactName ?? '\u672a\u586b\u5199\u8054\u7cfb\u4eba'} ? {merchant.phone ?? '\u672a\u586b\u5199\u7535\u8bdd'}</Text><View style={styles.row}><TouchableOpacity style={[styles.secondaryButton, styles.rowButton]} onPress={() => onCheckIn(merchant)}><Text style={styles.secondaryButtonText}>\u5230\u5e97\u786e\u8ba4</Text></TouchableOpacity><TouchableOpacity style={[styles.primarySmallButton, styles.rowButton]} onPress={() => onSelect(merchant)}><Text style={styles.primarySmallButtonText}>\u9009\u62e9\u5f00\u5355</Text></TouchableOpacity></View></View>)}</View>;
}
function BillingScreen({ merchant, cart, onAddProduct, onQuantityChange, onRemove, onScanBarcode, onSubmit, onBack }: { merchant: Merchant; cart: CartItem[]; onAddProduct: (product: Product) => void; onQuantityChange: (productId: string, delta: number) => void; onRemove: (productId: string) => void; onScanBarcode: () => void; onSubmit: (remark?: string) => Promise<void>; onBack: () => void }) {
  const [products, setProducts] = useState<Product[]>([]); const [keyword, setKeyword] = useState(''); const [barcode, setBarcode] = useState(''); const [remark, setRemark] = useState(''); const [loading, setLoading] = useState(true); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('');
  useEffect(() => { let alive = true; api.listProducts().then((result) => { if (alive) setProducts(result.items.filter((item) => item.enabled)); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '商品加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, []);
  const filteredProducts = products.filter((product) => { const keywordMatch = !keyword.trim() || product.name.includes(keyword.trim()) || product.barcode.includes(keyword.trim()); const barcodeMatch = !barcode.trim() || product.barcode.includes(barcode.trim()); return keywordMatch && barcodeMatch; });
  const totalCents = cart.reduce((total, item) => total + moneyToCents(item.product.salePrice) * item.quantity, 0);
  async function submit() { setSubmitting(true); await onSubmit(remark.trim() || undefined); setSubmitting(false); }
  return <View><PageTitle title="开单" onBack={onBack} /><View style={styles.panel}><Text style={styles.cardTitle}>商户：{merchant.name}</Text><Text style={styles.mutedText}>{merchant.address}</Text></View><Text style={styles.sectionTitle}>手动条码搜索</Text><View style={styles.row}><TextInput style={[styles.input, styles.rowInput]} value={barcode} onChangeText={setBarcode} placeholder="输入条码" /><TouchableOpacity style={styles.secondaryButton} onPress={() => Alert.alert('扫码占位', '扫码功能后续接入摄像头。')}><Text style={styles.secondaryButtonText}>扫码</Text></TouchableOpacity></View><TextInput style={styles.input} value={keyword} onChangeText={setKeyword} placeholder="按商品名称或条码搜索" />{loading ? <CenteredLoading text="正在加载商品..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}<Text style={styles.sectionTitle}>商品列表</Text>{!loading && filteredProducts.length === 0 ? <EmptyText text="暂无匹配商品" /> : null}{filteredProducts.slice(0, 30).map((product) => <TouchableOpacity key={product.id} style={styles.productCard} onPress={() => onAddProduct(product)}><View style={styles.flex1}><Text style={styles.cardTitle}>{product.name}</Text><Text style={styles.mutedText}>{product.spec ?? '未填写规格'} · 条码 {product.barcode}</Text></View><Text style={styles.priceText}>¥{product.salePrice}</Text></TouchableOpacity>)}<Text style={styles.sectionTitle}>电子清单</Text>{cart.length === 0 ? <EmptyText text="请从商品列表加入商品" /> : null}{cart.map((item) => <View key={item.product.id} style={styles.cartCard}><View style={styles.flex1}><Text style={styles.cardTitle}>{item.product.name}</Text><Text style={styles.mutedText}>{item.product.spec ?? '未填写规格'} · 单价 ¥{item.product.salePrice}</Text><Text style={styles.priceText}>小计 ¥{multiplyMoney(item.product.salePrice, item.quantity)}</Text></View><View style={styles.quantityBox}><TouchableOpacity style={styles.quantityButton} onPress={() => onQuantityChange(item.product.id, -1)}><Text style={styles.quantityText}>-</Text></TouchableOpacity><Text style={styles.quantityValue}>{item.quantity}</Text><TouchableOpacity style={styles.quantityButton} onPress={() => onQuantityChange(item.product.id, 1)}><Text style={styles.quantityText}>+</Text></TouchableOpacity><TouchableOpacity onPress={() => onRemove(item.product.id)}><Text style={styles.dangerText}>删除</Text></TouchableOpacity></View></View>)}<TextInput style={[styles.input, styles.textarea]} value={remark} onChangeText={setRemark} placeholder="订单备注，可选" multiline /><View style={styles.totalBar}><Text style={styles.totalLabel}>合计</Text><Text style={styles.totalValue}>¥{formatCents(totalCents)}</Text></View><TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={submitting}><Text style={styles.primaryButtonText}>{submitting ? '提交中...' : '提交订单'}</Text></TouchableOpacity></View>;
}

function OrdersScreen({ refreshKey, onOpenDetail }: { refreshKey: number; onOpenDetail: (id: string) => void }) {
  const [orders, setOrders] = useState<Order[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let alive = true; setLoading(true); api.listOrders().then((result) => { if (alive) setOrders(result.items); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '订单加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [refreshKey]);
  return <View><Text style={styles.title}>我的订单</Text><Text style={styles.description}>当前后端列表未提供日期筛选，先展示我的订单列表。</Text>{loading ? <CenteredLoading text="正在加载订单..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{!loading && orders.length === 0 ? <EmptyText text="暂无订单" /> : null}{orders.map((order) => <TouchableOpacity key={order.id} style={styles.listCard} onPress={() => onOpenDetail(order.id)}><Text style={styles.cardTitle}>{order.orderNo}</Text><Text style={styles.mutedText}>{order.merchant?.name ?? '未知商户'} · {statusLabel(order.status)}</Text><Text style={styles.priceText}>¥{order.totalAmount}</Text><Text style={styles.mutedText}>{formatDateTime(order.createdAt)}</Text></TouchableOpacity>)}</View>;
}

function OrderDetailScreen({ orderId, onBack, onHome }: { orderId: string; onBack: () => void; onHome: () => void }) {
  const [order, setOrder] = useState<Order | null>(null); const [receipt, setReceipt] = useState<Receipt | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let alive = true; api.getOrder(orderId).then((result) => { if (alive) setOrder(result); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '订单详情加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [orderId]);
  async function loadReceipt() { try { const result = await api.getReceipt(orderId); setReceipt(result); } catch (err) { Alert.alert('小票预览', err instanceof Error ? err.message : '小票数据加载失败。'); } }
  if (loading) return <CenteredLoading text="正在加载订单详情..." />;
  if (error) return <Text style={styles.errorText}>{error}</Text>;
  if (!order) return <EmptyText text="订单不存在" />;
  return <View><PageTitle title="订单详情" onBack={onBack} /><View style={styles.panel}><Text style={styles.cardTitle}>{order.orderNo}</Text><Text style={styles.mutedText}>商户：{order.merchant?.name ?? '未知商户'}</Text><Text style={styles.mutedText}>状态：{statusLabel(order.status)}</Text><Text style={styles.mutedText}>创建时间：{formatDateTime(order.createdAt)}</Text><Text style={styles.totalValue}>总金额 ¥{order.totalAmount}</Text></View><Text style={styles.sectionTitle}>商品明细</Text>{order.items.map((item) => <View key={item.id} style={styles.cartCard}><View style={styles.flex1}><Text style={styles.cardTitle}>{item.productNameSnapshot}</Text><Text style={styles.mutedText}>{item.productSpecSnapshot ?? '未填写规格'} · 条码 {item.productBarcodeSnapshot}</Text><Text style={styles.mutedText}>单价 ¥{item.salePriceSnapshot} × {item.quantity}</Text></View><Text style={styles.priceText}>¥{item.subtotal}</Text></View>)}<View style={styles.actionGrid}><ActionButton label="小票预览" onPress={loadReceipt} /><ActionButton label="返回首页" primary onPress={onHome} /></View>{receipt ? <ReceiptPreview receipt={receipt} /> : null}</View>;
}

function ReceiptPreview({ receipt }: { receipt: Receipt }) {
  return <View style={styles.receipt}><Text style={styles.receiptTitle}>{receipt.storeName}</Text><Text style={styles.mutedText}>配送员：{receipt.salespersonName}</Text><Text style={styles.mutedText}>时间：{formatDateTime(receipt.dateTime)}</Text><Text style={styles.mutedText}>订单号：{receipt.orderNo}</Text>{receipt.items.map((item, index) => <View style={styles.receiptLine} key={`${item.productName}-${index}`}><Text style={styles.flex1}>{item.productName} × {item.quantity}</Text><Text>¥{item.subtotal}</Text></View>)}<View style={styles.receiptLine}><Text style={styles.cardTitle}>总价</Text><Text style={styles.cardTitle}>¥{receipt.totalAmount}</Text></View><Text style={styles.description}>蓝牙打印功能后续接入。</Text></View>;
}


function ScannerScreen({ mode, onScanned, onBack }: { mode: ScannerMode; onScanned: (code: string) => Promise<void>; onBack: () => void }) {
  const device = useCameraDevice('back');
  const [permission, setPermission] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [manualBarcode, setManualBarcode] = useState('');
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastScannedAt = useRef(0);
  useEffect(() => { Camera.requestCameraPermission().then((status) => setPermission(status === 'granted' ? 'granted' : 'denied')); }, []);
  const handleCode = useCallback(async (value: string) => {
    const now = Date.now();
    if (!value || busy || now - lastScannedAt.current < 1200) return;
    lastScannedAt.current = now; setBusy(true); await onScanned(value.trim()); setBusy(false);
  }, [busy, onScanned]);
  const codeScanner = useCodeScanner({ codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128', 'code-39', 'qr'], onCodeScanned: (codes) => { const value = codes[0]?.value; if (value) void handleCode(value); } });
  function submitManual() { if (!manualBarcode.trim()) { Alert.alert('\u6761\u7801\u63d0\u793a', '\u8bf7\u8f93\u5165\u6761\u7801\u3002'); return; } void handleCode(manualBarcode.trim()); }
  if (permission === 'checking') return <CenteredLoading text="\u6b63\u5728\u8bf7\u6c42\u6444\u50cf\u5934\u6743\u9650..." />;
  if (permission === 'denied') return <View><PageTitle title="\u626b\u7801" onBack={onBack} /><View style={styles.panel}><Text style={styles.title}>\u9700\u8981\u6444\u50cf\u5934\u6743\u9650</Text><Text style={styles.description}>\u8bf7\u5728\u7cfb\u7edf\u8bbe\u7f6e\u4e2d\u5141\u8bb8\u5c0f\u7075\u901a\u4f7f\u7528\u6444\u50cf\u5934\u3002</Text><TouchableOpacity style={styles.primaryButton} onPress={() => Linking.openSettings()}><Text style={styles.primaryButtonText}>\u6253\u5f00\u8bbe\u7f6e</Text></TouchableOpacity></View></View>;
  return <View><PageTitle title={mode === 'billing' ? '\u626b\u7801\u6dfb\u52a0\u5546\u54c1' : '\u626b\u7801\u5f55\u5165\u6761\u7801'} onBack={onBack} />{device ? <View style={styles.cameraWrap}><Camera style={styles.camera} device={device} isActive={!busy} codeScanner={codeScanner} torch={torchEnabled ? 'on' : 'off'} /><View style={styles.scanFrame} /></View> : <EmptyText text="\u672a\u627e\u5230\u53ef\u7528\u6444\u50cf\u5934" />}<View style={styles.panel}><View style={styles.row}><TouchableOpacity style={styles.secondaryButton} onPress={() => setTorchEnabled((value) => !value)}><Text style={styles.secondaryButtonText}>{torchEnabled ? '\u5173\u95ed\u624b\u7535' : '\u6253\u5f00\u624b\u7535'}</Text></TouchableOpacity><Text style={styles.mutedText}>{busy ? '\u5904\u7406\u4e2d...' : '\u5bf9\u51c6\u5546\u54c1\u6761\u7801\u6216 QR'}</Text></View><TextInput style={styles.input} value={manualBarcode} onChangeText={setManualBarcode} placeholder="\u624b\u52a8\u8f93\u5165\u6761\u7801" /><TouchableOpacity style={styles.primaryButton} onPress={submitManual}><Text style={styles.primaryButtonText}>\u4f7f\u7528\u624b\u52a8\u6761\u7801</Text></TouchableOpacity></View></View>;
}

function RankingScreen({ onBack }: { onBack: () => void }) {
  const [range, setRange] = useState<'today' | '7d' | 'month'>('today'); const [items, setItems] = useState<ProductSalesRankingItem[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let alive = true; setLoading(true); setError(''); api.productSalesRanking(range).then((result) => { if (alive) setItems(result.items); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '\u9500\u91cf\u6392\u884c\u52a0\u8f7d\u5931\u8d25\u3002'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [range]);
  return <View><PageTitle title="\u5546\u54c1\u9500\u91cf\u6392\u884c" onBack={onBack} /><View style={styles.segment}><SegmentButton label="\u4eca\u65e5" active={range === 'today'} onPress={() => setRange('today')} /><SegmentButton label="\u8fd1 7 \u5929" active={range === '7d'} onPress={() => setRange('7d')} /><SegmentButton label="\u672c\u6708" active={range === 'month'} onPress={() => setRange('month')} /></View><Text style={styles.description}>\u53ea\u5c55\u793a\u9500\u91cf\u548c\u9500\u552e\u989d\uff0c\u4e0d\u663e\u793a\u8fdb\u4ef7\u548c\u5229\u6da6\u3002</Text>{loading ? <CenteredLoading text="\u6b63\u5728\u52a0\u8f7d\u6392\u884c..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{!loading && items.length === 0 ? <EmptyText text="\u6682\u65e0\u9500\u91cf\u6570\u636e" /> : null}{items.map((item) => <View key={item.productId} style={styles.listCard}><View style={styles.rowBetween}><Text style={styles.cardTitle}>#{item.rank} {item.productName}</Text><Text style={styles.priceText}>?{item.salesAmount}</Text></View><Text style={styles.mutedText}>\u6761\u7801 {item.barcode}</Text><Text style={styles.mutedText}>\u9500\u552e\u6570\u91cf {item.quantitySold}</Text></View>)}</View>;
}

function RouteScreen({ user, onBack }: { user: CurrentUser; onBack: () => void }) {
  const [current, setCurrent] = useState<TrackPoint | null>(null); const [points, setPoints] = useState<TrackPoint[]>([]); const [recording, setRecording] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(''); try { const [position, track] = await Promise.all([getCurrentPosition(), api.myTodayTrack()]); setCurrent(position); setPoints(track.points); } catch (err) { setError(err instanceof Error ? err.message : '\u8f68\u8ff9\u52a0\u8f7d\u5931\u8d25\u3002'); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); return () => { if (timer.current) clearInterval(timer.current); }; }, [load]);
  async function collectPoint() { try { const point = await getCurrentPosition(); setCurrent(point); setPoints((value) => [...value, point]); } catch (err) { setError(err instanceof Error ? err.message : '\u5b9a\u4f4d\u5931\u8d25\u3002'); } }
  function start() { if (timer.current) clearInterval(timer.current); setRecording(true); void collectPoint(); timer.current = setInterval(() => { void collectPoint(); }, 15000); }
  function stop() { setRecording(false); if (timer.current) { clearInterval(timer.current); timer.current = null; } }
  async function upload() { try { const localPoints = points.filter((point) => !point.id); if (localPoints.length === 0) { Alert.alert('\u8f68\u8ff9\u63d0\u793a', '\u6ca1\u6709\u9700\u8981\u4e0a\u4f20\u7684\u65b0\u8f68\u8ff9\u70b9\u3002'); return; } await api.uploadTrackPoints(localPoints); await load(); Alert.alert('\u4e0a\u4f20\u6210\u529f', '\u8f68\u8ff9\u70b9\u5df2\u4e0a\u4f20\u3002'); } catch (err) { setError(err instanceof Error ? err.message : '\u8f68\u8ff9\u4e0a\u4f20\u5931\u8d25\u3002'); } }
  const html = AMAP_WEB_SERVICE_KEY ? createMapHtml(points, current, user.name || user.displayName || user.username) : '';
  return <View><PageTitle title="\u4eca\u65e5\u8f68\u8ff9" onBack={onBack} />{loading ? <CenteredLoading text="\u6b63\u5728\u52a0\u8f7d\u5b9a\u4f4d\u548c\u8f68\u8ff9..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{AMAP_WEB_SERVICE_KEY && current ? <WebView originWhitelist={['*']} source={{ html }} style={styles.mapView} /> : <View style={styles.panel}><Text style={styles.title}>\u5730\u56fe\u529f\u80fd\u672a\u5b8c\u5168\u914d\u7f6e</Text><Text style={styles.description}>\u8bf7\u914d\u7f6e AMAP_WEB_SERVICE_KEY ????? APK?????????????</Text></View>}<View style={styles.panel}><Text style={styles.cardTitle}>\u5f53\u524d\u4f4d\u7f6e</Text><Text style={styles.mutedText}>{current ? `${current.latitude}, ${current.longitude}` : '-'}</Text><Text style={styles.mutedText}>\u8f68\u8ff9\u70b9\uff1a{points.length}</Text><View style={styles.actionGrid}><ActionButton label={recording ? '\u8bb0\u5f55\u4e2d' : '\u5f00\u59cb\u8bb0\u5f55'} primary={!recording} onPress={recording ? stop : start} /><ActionButton label="\u505c\u6b62\u8bb0\u5f55" onPress={stop} /><ActionButton label="\u4e0a\u4f20\u8f68\u8ff9" onPress={() => void upload()} /><ActionButton label="\u5237\u65b0" onPress={() => void load()} /></View></View>{points.slice(-6).reverse().map((point, index) => <View key={`${point.recordedAt}-${index}`} style={styles.listCard}><Text style={styles.cardTitle}>{formatDateTime(point.recordedAt)}</Text><Text style={styles.mutedText}>{point.latitude}, {point.longitude}</Text><Text style={styles.mutedText}>accuracy {point.accuracy ?? '-'} / speed {point.speed ?? '-'}</Text></View>)}</View>;
}


function ProductManageScreen({ user, refreshKey, onAdd, onEdit, onRefresh, onBack }: { user: CurrentUser; refreshKey: number; onAdd: () => void; onEdit: (product: Product) => void; onRefresh: () => void; onBack: () => void }) {
  const [products, setProducts] = useState<Product[]>([]); const [keyword, setKeyword] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const manageable = canManageProducts(user.role);
  useEffect(() => { let alive = true; setLoading(true); api.listProducts().then((result) => { if (alive) setProducts(result.items); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '\u5546\u54c1\u52a0\u8f7d\u5931\u8d25\u3002'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [refreshKey]);
  const filtered = products.filter((product) => !keyword.trim() || product.name.includes(keyword.trim()) || product.barcode.includes(keyword.trim()));
  function disable(product: Product) { Alert.alert('\u505c\u7528\u5546\u54c1', `\u786e\u8ba4\u505c\u7528 ${product.name} ?`, [{ text: '\u53d6\u6d88', style: 'cancel' }, { text: '\u505c\u7528', style: 'destructive', onPress: async () => { await api.disableProduct(product.id); onRefresh(); } }]); }
  return <View><PageTitle title="\u5546\u54c1\u7ba1\u7406" onBack={onBack} /><Text style={styles.description}>\u624b\u673a\u7aef\u4e0d\u663e\u793a\u8fdb\u4ef7\u6216\u5229\u6da6\u3002</Text><TextInput style={styles.input} value={keyword} onChangeText={setKeyword} placeholder="\u641c\u7d22\u5546\u54c1\u540d\u79f0\u6216\u6761\u7801" />{manageable ? <TouchableOpacity style={styles.primaryButton} onPress={onAdd}><Text style={styles.primaryButtonText}>\u65b0\u589e\u5546\u54c1</Text></TouchableOpacity> : <Text style={styles.description}>\u5f53\u524d\u89d2\u8272\u4ec5\u53ef\u67e5\u770b\u5546\u54c1\u3002</Text>}{loading ? <CenteredLoading text="\u6b63\u5728\u52a0\u8f7d\u5546\u54c1..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{!loading && filtered.length === 0 ? <EmptyText text="\u6682\u65e0\u5546\u54c1" /> : null}{filtered.map((product) => <View key={product.id} style={styles.listCard}><View style={styles.rowBetween}><Text style={styles.cardTitle}>{product.name}</Text><Text style={product.enabled ? styles.activeBadge : styles.inactiveBadge}>{product.enabled ? '\u542f\u7528' : '\u505c\u7528'}</Text></View><Text style={styles.mutedText}>\u6761\u7801 {product.barcode} ? {product.spec ?? '-'}</Text><Text style={styles.mutedText}>\u5206\u7c7b {product.category ?? '-'} ? \u5e93\u5b58 {product.stock} ? \u9884\u8b66 {product.stockWarningValue ?? '-'}</Text><Text style={styles.priceText}>\u552e\u4ef7 ?{product.salePrice}</Text>{manageable ? <View style={styles.row}><TouchableOpacity style={[styles.secondaryButton, styles.rowButton]} onPress={() => onEdit(product)}><Text style={styles.secondaryButtonText}>\u7f16\u8f91</Text></TouchableOpacity>{product.enabled ? <TouchableOpacity style={[styles.dangerButton, styles.rowButton]} onPress={() => disable(product)}><Text style={styles.dangerButtonText}>\u505c\u7528</Text></TouchableOpacity> : null}</View> : null}</View>)}</View>;
}

function ProductFormScreen({ product, initialBarcode, user, onScan, onSaved, onBack }: { product: Product | null; initialBarcode: string; user: CurrentUser; onScan: () => void; onSaved: () => void; onBack: () => void }) {
  const [name, setName] = useState(product?.name ?? ''); const [barcode, setBarcode] = useState(product?.barcode ?? initialBarcode); const [category, setCategory] = useState(product?.category ?? ''); const [spec, setSpec] = useState(product?.spec ?? ''); const [salePrice, setSalePrice] = useState(product?.salePrice ?? ''); const [stock, setStock] = useState(String(product?.stock ?? 0)); const [stockWarningValue, setStockWarningValue] = useState(product?.stockWarningValue == null ? '' : String(product.stockWarningValue)); const [enabled, setEnabled] = useState(product?.enabled ?? true); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (!product && initialBarcode) setBarcode(initialBarcode); }, [initialBarcode, product]);
  async function save() { if (!canManageProducts(user.role)) { setError('\u5f53\u524d\u89d2\u8272\u65e0\u6743\u7ba1\u7406\u5546\u54c1\u3002'); return; } if (!name.trim() || !barcode.trim() || !salePrice.trim()) { setError('\u8bf7\u586b\u5199\u5546\u54c1\u540d\u79f0\u3001\u6761\u7801\u548c\u552e\u4ef7\u3002'); return; } const stockNumber = Number(stock || 0); const warningNumber = stockWarningValue.trim() ? Number(stockWarningValue) : null; if (!Number.isInteger(stockNumber) || stockNumber < 0 || (warningNumber !== null && (!Number.isInteger(warningNumber) || warningNumber < 0))) { setError('\u5e93\u5b58\u5fc5\u987b\u662f\u975e\u8d1f\u6574\u6570\u3002'); return; } setSaving(true); setError(''); try { const body = { name: name.trim(), barcode: barcode.trim(), category: category.trim() || undefined, spec: spec.trim() || undefined, salePrice: salePrice.trim(), stock: stockNumber, stockWarningValue: warningNumber, enabled }; if (product) await api.updateProduct(product.id, body); else await api.createProduct(body); onSaved(); } catch (err) { setError(err instanceof Error ? err.message : '\u4fdd\u5b58\u5546\u54c1\u5931\u8d25\u3002'); } finally { setSaving(false); } }
  return <View><PageTitle title={product ? '\u7f16\u8f91\u5546\u54c1' : '\u65b0\u589e\u5546\u54c1'} onBack={onBack} /><View style={styles.panel}>{error ? <Text style={styles.errorText}>{error}</Text> : null}<Text style={styles.label}>\u5546\u54c1\u540d\u79f0</Text><TextInput style={styles.input} value={name} onChangeText={setName} /><Text style={styles.label}>\u6761\u7801</Text><View style={styles.row}><TextInput style={[styles.input, styles.rowInput]} value={barcode} onChangeText={setBarcode} /><TouchableOpacity style={styles.secondaryButton} onPress={onScan}><Text style={styles.secondaryButtonText}>\u626b\u7801\u5f55\u5165</Text></TouchableOpacity></View><Text style={styles.label}>\u5206\u7c7b</Text><TextInput style={styles.input} value={category} onChangeText={setCategory} /><Text style={styles.label}>\u89c4\u683c</Text><TextInput style={styles.input} value={spec} onChangeText={setSpec} /><Text style={styles.label}>\u552e\u4ef7</Text><TextInput style={styles.input} value={salePrice} onChangeText={setSalePrice} keyboardType="decimal-pad" placeholder="0.00" /><Text style={styles.label}>\u5e93\u5b58</Text><TextInput style={styles.input} value={stock} onChangeText={setStock} keyboardType="number-pad" /><Text style={styles.label}>\u5e93\u5b58\u9884\u8b66\u503c</Text><TextInput style={styles.input} value={stockWarningValue} onChangeText={setStockWarningValue} keyboardType="number-pad" /><TouchableOpacity style={styles.secondaryButton} onPress={() => setEnabled((value) => !value)}><Text style={styles.secondaryButtonText}>{enabled ? '\u5f53\u524d\u542f\u7528' : '\u5f53\u524d\u505c\u7528'}</Text></TouchableOpacity><Text style={styles.description}>\u4e0d\u5f55\u5165\u8fdb\u4ef7\uff0c\u4e0d\u663e\u793a\u5229\u6da6\u3002</Text><TouchableOpacity style={styles.primaryButton} onPress={save} disabled={saving}><Text style={styles.primaryButtonText}>{saving ? '\u4fdd\u5b58\u4e2d...' : '\u4fdd\u5b58\u5546\u54c1'}</Text></TouchableOpacity></View></View>;
}


function MerchantManageScreen({ user, refreshKey, onAdd, onEdit, onCheckIn, onRefresh, onBack }: { user: CurrentUser; refreshKey: number; onAdd: () => void; onEdit: (merchant: Merchant) => void; onCheckIn: (merchant: Merchant) => void; onRefresh: () => void; onBack: () => void }) {
  const [merchants, setMerchants] = useState<Merchant[]>([]); const [keyword, setKeyword] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const manageable = canManageMerchants(user.role);
  useEffect(() => { let alive = true; setLoading(true); api.listMerchants({ includeInactive: true }).then((result) => { if (alive) setMerchants(result.items); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '\u5546\u6237\u52a0\u8f7d\u5931\u8d25\u3002'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [refreshKey]);
  const filtered = merchants.filter((merchant) => !keyword.trim() || merchant.name.includes(keyword.trim()) || Boolean(merchant.phone?.includes(keyword.trim())) || merchant.address.includes(keyword.trim()));
  function disable(merchant: Merchant) { Alert.alert('\u505c\u7528\u5546\u6237', `\u786e\u8ba4\u505c\u7528 ${merchant.name} ?`, [{ text: '\u53d6\u6d88', style: 'cancel' }, { text: '\u505c\u7528', style: 'destructive', onPress: async () => { await api.disableMerchant(merchant.id); onRefresh(); } }]); }
  return <View><PageTitle title="\u5546\u6237\u7ba1\u7406" onBack={onBack} /><TextInput style={styles.input} value={keyword} onChangeText={setKeyword} placeholder="\u641c\u7d22\u5546\u6237\u540d\u79f0\u3001\u7535\u8bdd\u6216\u5730\u5740" />{manageable ? <TouchableOpacity style={styles.primaryButton} onPress={onAdd}><Text style={styles.primaryButtonText}>\u65b0\u589e\u5546\u6237</Text></TouchableOpacity> : <Text style={styles.description}>\u5f53\u524d\u89d2\u8272\u4ec5\u53ef\u67e5\u770b\u5546\u6237\u548c\u5230\u5e97\u786e\u8ba4\u3002</Text>}{loading ? <CenteredLoading text="\u6b63\u5728\u52a0\u8f7d\u5546\u6237..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{!loading && filtered.length === 0 ? <EmptyText text="\u6682\u65e0\u5546\u6237" /> : null}{filtered.map((merchant) => <View key={merchant.id} style={styles.listCard}><View style={styles.rowBetween}><Text style={styles.cardTitle}>{merchant.name}</Text><Text style={merchant.isActive ? styles.activeBadge : styles.inactiveBadge}>{merchant.isActive ? '\u542f\u7528' : '\u505c\u7528'}</Text></View><Text style={styles.mutedText}>{merchant.address}</Text><Text style={styles.mutedText}>{merchant.contactName ?? '-'} ? {merchant.phone ?? '-'} ? {merchant.area ?? '-'}</Text><Text style={styles.mutedText}>lat {merchant.latitude ?? '-'} / lng {merchant.longitude ?? '-'}</Text><View style={styles.row}><TouchableOpacity style={[styles.secondaryButton, styles.rowButton]} onPress={() => onCheckIn(merchant)}><Text style={styles.secondaryButtonText}>\u5230\u5e97\u786e\u8ba4</Text></TouchableOpacity>{manageable ? <TouchableOpacity style={[styles.secondaryButton, styles.rowButton]} onPress={() => onEdit(merchant)}><Text style={styles.secondaryButtonText}>\u7f16\u8f91</Text></TouchableOpacity> : null}{manageable && merchant.isActive ? <TouchableOpacity style={[styles.dangerButton, styles.rowButton]} onPress={() => disable(merchant)}><Text style={styles.dangerButtonText}>\u505c\u7528</Text></TouchableOpacity> : null}</View></View>)}</View>;
}

function MerchantFormScreen({ merchant, user, onSaved, onBack }: { merchant: Merchant | null; user: CurrentUser; onSaved: () => void; onBack: () => void }) {
  const [name, setName] = useState(merchant?.name ?? ''); const [contactName, setContactName] = useState(merchant?.contactName ?? ''); const [phone, setPhone] = useState(merchant?.phone ?? ''); const [address, setAddress] = useState(merchant?.address ?? ''); const [latitude, setLatitude] = useState(merchant?.latitude ?? ''); const [longitude, setLongitude] = useState(merchant?.longitude ?? ''); const [area, setArea] = useState(merchant?.area ?? ''); const [remark, setRemark] = useState(merchant?.remark ?? ''); const [isActive, setIsActive] = useState(merchant?.isActive ?? true); const [keyword, setKeyword] = useState(''); const [pois, setPois] = useState<AmapPoi[]>([]); const [saving, setSaving] = useState(false); const [searching, setSearching] = useState(false); const [error, setError] = useState('');
  async function searchPois() { if (!keyword.trim()) return; setSearching(true); setError(''); try { setPois(await searchAmapPois(keyword.trim())); } catch (err) { setError(err instanceof Error ? err.message : '\u5730\u56fe\u641c\u7d22\u5931\u8d25\u3002'); } finally { setSearching(false); } }
  function usePoi(poi: AmapPoi) { setName((value) => value || poi.name); setAddress(poi.address || poi.name); setLatitude(poi.latitude); setLongitude(poi.longitude); setPois([]); }
  async function useCurrentPoint() { try { const point = await getCurrentPosition(); setLatitude(point.latitude); setLongitude(point.longitude); } catch (err) { setError(err instanceof Error ? err.message : '\u83b7\u53d6\u5b9a\u4f4d\u5931\u8d25\u3002'); } }
  async function save() { if (!canManageMerchants(user.role)) { setError('\u5f53\u524d\u89d2\u8272\u65e0\u6743\u7ba1\u7406\u5546\u6237\u3002'); return; } if (!name.trim() || !address.trim()) { setError('\u8bf7\u586b\u5199\u5546\u6237\u540d\u79f0\u548c\u5730\u5740\u3002'); return; } setSaving(true); setError(''); try { const body = { name: name.trim(), contactName: contactName.trim() || undefined, phone: phone.trim() || undefined, address: address.trim(), latitude: latitude.trim() || undefined, longitude: longitude.trim() || undefined, area: area.trim() || undefined, remark: remark.trim() || undefined, isActive }; if (merchant) await api.updateMerchant(merchant.id, body); else await api.createMerchant(body); onSaved(); } catch (err) { setError(err instanceof Error ? err.message : '\u4fdd\u5b58\u5546\u6237\u5931\u8d25\u3002'); } finally { setSaving(false); } }
  return <View><PageTitle title={merchant ? '\u7f16\u8f91\u5546\u6237' : '\u65b0\u589e\u5546\u6237'} onBack={onBack} /><View style={styles.panel}>{error ? <Text style={styles.errorText}>{error}</Text> : null}<Text style={styles.sectionTitle}>\u5730\u56fe\u641c\u7d22 / \u9009\u70b9</Text><Text style={styles.description}>{AMAP_WEB_SERVICE_KEY ? '\u5df2\u914d\u7f6e\u9ad8\u5fb7 Key\uff0c\u53ef\u641c\u7d22\u5730\u5740\u3002' : '\u672a\u914d\u7f6e\u9ad8\u5fb7 Key\uff0c\u53ef\u624b\u52a8\u586b\u5199\u3002'}</Text><View style={styles.row}><TextInput style={[styles.input, styles.rowInput]} value={keyword} onChangeText={setKeyword} placeholder="\u8f93\u5165\u5730\u5740\u6216 POI" /><TouchableOpacity style={styles.secondaryButton} onPress={searchPois} disabled={searching}><Text style={styles.secondaryButtonText}>{searching ? '\u641c\u7d22\u4e2d' : '\u641c\u7d22'}</Text></TouchableOpacity></View><TouchableOpacity style={styles.secondaryButton} onPress={useCurrentPoint}><Text style={styles.secondaryButtonText}>\u4f7f\u7528\u5f53\u524d\u5b9a\u4f4d\u9009\u70b9</Text></TouchableOpacity>{pois.map((poi) => <TouchableOpacity key={poi.id} style={styles.listCard} onPress={() => usePoi(poi)}><Text style={styles.cardTitle}>{poi.name}</Text><Text style={styles.mutedText}>{poi.address}</Text><Text style={styles.mutedText}>{poi.latitude}, {poi.longitude}</Text></TouchableOpacity>)}<Text style={styles.sectionTitle}>\u5546\u6237\u4fe1\u606f</Text><Text style={styles.label}>\u5546\u6237\u540d\u79f0</Text><TextInput style={styles.input} value={name} onChangeText={setName} /><Text style={styles.label}>\u8054\u7cfb\u4eba</Text><TextInput style={styles.input} value={contactName} onChangeText={setContactName} /><Text style={styles.label}>\u8054\u7cfb\u7535\u8bdd</Text><TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><Text style={styles.label}>\u5730\u5740</Text><TextInput style={styles.input} value={address} onChangeText={setAddress} /><View style={styles.row}><View style={styles.flex1}><Text style={styles.label}>\u7eac\u5ea6</Text><TextInput style={styles.input} value={latitude} onChangeText={setLatitude} keyboardType="decimal-pad" /></View><View style={styles.flex1}><Text style={styles.label}>\u7ecf\u5ea6</Text><TextInput style={styles.input} value={longitude} onChangeText={setLongitude} keyboardType="decimal-pad" /></View></View><Text style={styles.label}>\u7247\u533a</Text><TextInput style={styles.input} value={area} onChangeText={setArea} /><Text style={styles.label}>\u5907\u6ce8</Text><TextInput style={[styles.input, styles.textarea]} value={remark} onChangeText={setRemark} multiline /><TouchableOpacity style={styles.secondaryButton} onPress={() => setIsActive((value) => !value)}><Text style={styles.secondaryButtonText}>{isActive ? '\u5f53\u524d\u542f\u7528' : '\u5f53\u524d\u505c\u7528'}</Text></TouchableOpacity><TouchableOpacity style={styles.primaryButton} onPress={save} disabled={saving}><Text style={styles.primaryButtonText}>{saving ? '\u4fdd\u5b58\u4e2d...' : '\u4fdd\u5b58\u5546\u6237'}</Text></TouchableOpacity></View></View>;
}

function SettingsScreen({ apiBaseUrl, onLogout }: { apiBaseUrl: string; onLogout: () => void }) {
  return <View style={styles.panel}><Text style={styles.title}>设置</Text><Text style={styles.description}>API 地址来自移动端环境变量。</Text><Text style={styles.mutedText}>{apiBaseUrl || '未配置 MOBILE_API_BASE_URL'}</Text><TouchableOpacity style={styles.primaryButton} onPress={onLogout}><Text style={styles.primaryButtonText}>退出登录</Text></TouchableOpacity></View>;
}

function PlaceholderScreen({ title, description }: { title: string; description: string }) { return <View style={styles.panel}><Text style={styles.title}>{title}</Text><Text style={styles.description}>{description}</Text></View>; }
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <TouchableOpacity style={[styles.segmentButton, active ? styles.segmentButtonActive : null]} onPress={onPress}><Text style={active ? styles.segmentButtonActiveText : styles.segmentButtonText}>{label}</Text></TouchableOpacity>; }
function ActionButton({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) { return <TouchableOpacity style={[styles.actionButton, primary ? styles.actionButtonPrimary : null]} onPress={onPress}><Text style={primary ? styles.actionButtonPrimaryText : styles.actionButtonText}>{label}</Text></TouchableOpacity>; }
function PageTitle({ title, onBack }: { title: string; onBack: () => void }) { return <View style={styles.pageTitleRow}><TouchableOpacity onPress={onBack}><Text style={styles.linkText}>返回</Text></TouchableOpacity><Text style={styles.title}>{title}</Text></View>; }
function CenteredLoading({ text }: { text: string }) { return <View style={styles.loadingBox}><ActivityIndicator color="#0f766e" /><Text style={styles.mutedText}>{text}</Text></View>; }
function EmptyText({ text }: { text: string }) { return <View style={styles.emptyBox}><Text style={styles.mutedText}>{text}</Text></View>; }
function MessageBanner({ message, onClose }: { message: NonNullable<Message>; onClose?: () => void }) { const style = message.type === 'error' ? styles.errorBanner : message.type === 'success' ? styles.successBanner : styles.infoBanner; return <TouchableOpacity disabled={!onClose} onPress={onClose} style={[styles.banner, style]}><Text style={styles.bannerText}>{message.text}</Text></TouchableOpacity>; }
function BottomNav({ current, onHome, onOrders, onStartBilling, onRoute, onSettings }: { current: Screen; onHome: () => void; onOrders: () => void; onStartBilling: () => void; onRoute: () => void; onSettings: () => void }) { return <View style={styles.bottomNav}><NavButton label="首页" active={current === 'home'} onPress={onHome} /><NavButton label="订单" active={current === 'orders'} onPress={onOrders} /><TouchableOpacity style={styles.billButton} onPress={onStartBilling}><Text style={styles.billText}>开单</Text></TouchableOpacity><NavButton label="轨迹" active={current === 'route'} onPress={onRoute} /><NavButton label="设置" active={current === 'settings'} onPress={onSettings} /></View>; }
function NavButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <TouchableOpacity style={styles.tab} onPress={onPress}><Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{label}</Text></TouchableOpacity>; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f7fb' },
  authContent: { flexGrow: 1, justifyContent: 'center', padding: 18 },
  authCard: { backgroundColor: '#fff', borderColor: '#dfe4ec', borderRadius: 8, borderWidth: 1, padding: 20 },
  loginTitle: { color: '#172033', fontSize: 30, fontWeight: '700', marginBottom: 8 },
  header: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#dfe4ec', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  appName: { color: '#172033', fontSize: 22, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 112 },
  panel: { backgroundColor: '#fff', borderColor: '#dfe4ec', borderRadius: 8, borderWidth: 1, marginBottom: 14, padding: 16 },
  title: { color: '#172033', fontSize: 24, fontWeight: '700', marginBottom: 10 },
  sectionTitle: { color: '#172033', fontSize: 18, fontWeight: '700', marginBottom: 10, marginTop: 12 },
  description: { color: '#5f6b7a', fontSize: 15, lineHeight: 22, marginBottom: 12 },
  mutedText: { color: '#657086', fontSize: 13, lineHeight: 20 },
  label: { color: '#334155', fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#fff', borderColor: '#cfd6e4', borderRadius: 7, borderWidth: 1, color: '#172033', marginBottom: 10, paddingHorizontal: 12, paddingVertical: 10 },
  textarea: { minHeight: 74, textAlignVertical: 'top' },
  primaryButton: { alignItems: 'center', backgroundColor: '#0f766e', borderRadius: 7, marginTop: 10, paddingVertical: 12 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', backgroundColor: '#e7eef6', borderRadius: 7, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryButtonText: { color: '#172033', fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  metric: { backgroundColor: '#edf7f5', borderRadius: 8, minWidth: '47%', padding: 12 },
  metricValue: { color: '#0f766e', fontSize: 22, fontWeight: '700' },
  metricLabel: { color: '#506070', marginTop: 4 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  actionButton: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#cfd6e4', borderRadius: 8, borderWidth: 1, minWidth: '47%', padding: 14 },
  actionButtonPrimary: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  actionButtonText: { color: '#172033', fontWeight: '700' },
  actionButtonPrimaryText: { color: '#fff', fontWeight: '700' },
  listCard: { backgroundColor: '#fff', borderColor: '#dfe4ec', borderRadius: 8, borderWidth: 1, marginBottom: 10, padding: 14 },
  productCard: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#dfe4ec', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 8, padding: 12 },
  cartCard: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#dfe4ec', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 8, padding: 12 },
  cardTitle: { color: '#172033', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  priceText: { color: '#0f766e', fontSize: 16, fontWeight: '700' },
  flex1: { flex: 1 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  rowInput: { flex: 1 },
  quantityBox: { alignItems: 'center', gap: 6 },
  quantityButton: { alignItems: 'center', backgroundColor: '#e7eef6', borderRadius: 18, height: 34, justifyContent: 'center', width: 34 },
  quantityText: { color: '#172033', fontSize: 18, fontWeight: '700' },
  quantityValue: { color: '#172033', fontSize: 16, fontWeight: '700' },
  dangerText: { color: '#b42318', fontWeight: '700' },
  errorText: { color: '#b42318', marginBottom: 10 },
  totalBar: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#dfe4ec', borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, padding: 14 },
  totalLabel: { color: '#172033', fontSize: 18, fontWeight: '700' },
  totalValue: { color: '#0f766e', fontSize: 20, fontWeight: '700' },
  receipt: { backgroundColor: '#fff', borderColor: '#cfd6e4', borderRadius: 8, borderWidth: 1, marginTop: 12, padding: 14 },
  receiptTitle: { color: '#172033', fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  receiptLine: { borderBottomColor: '#dfe4ec', borderBottomWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingVertical: 8 },
  pageTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 10 },
  linkText: { color: '#0f766e', fontWeight: '700' },
  loadingBox: { alignItems: 'center', gap: 8, padding: 18 },
  emptyBox: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#dfe4ec', borderRadius: 8, borderWidth: 1, marginBottom: 10, padding: 16 },
  banner: { borderRadius: 7, margin: 12, marginBottom: 0, padding: 10 },
  errorBanner: { backgroundColor: '#fee4e2' },
  successBanner: { backgroundColor: '#dcfae6' },
  infoBanner: { backgroundColor: '#e7eef6' },
  bannerText: { color: '#172033' },
  primarySmallButton: { alignItems: 'center', backgroundColor: '#0f766e', borderRadius: 7, paddingHorizontal: 14, paddingVertical: 10 },
  primarySmallButtonText: { color: '#fff', fontWeight: '700' },
  dangerButton: { alignItems: 'center', backgroundColor: '#fee4e2', borderRadius: 7, paddingHorizontal: 14, paddingVertical: 10 },
  dangerButtonText: { color: '#b42318', fontWeight: '700' },
  rowButton: { flex: 1, marginTop: 10 },
  rowBetween: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  activeBadge: { backgroundColor: '#dcfae6', borderRadius: 12, color: '#067647', fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4 },
  inactiveBadge: { backgroundColor: '#fee4e2', borderRadius: 12, color: '#b42318', fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4 },
  segment: { backgroundColor: '#e7eef6', borderRadius: 8, flexDirection: 'row', gap: 6, marginBottom: 12, padding: 4 },
  segmentButton: { alignItems: 'center', borderRadius: 6, flex: 1, paddingVertical: 10 },
  segmentButtonActive: { backgroundColor: '#0f766e' },
  segmentButtonText: { color: '#172033', fontWeight: '700' },
  segmentButtonActiveText: { color: '#fff', fontWeight: '700' },
  cameraWrap: { backgroundColor: '#111827', borderRadius: 8, height: 360, marginBottom: 14, overflow: 'hidden' },
  camera: { flex: 1 },
  scanFrame: { borderColor: '#fff', borderRadius: 12, borderWidth: 2, height: 180, left: '15%', position: 'absolute', top: 90, width: '70%' },
  mapView: { borderRadius: 8, height: 320, marginBottom: 14, overflow: 'hidden' },
  bottomNav: { alignItems: 'center', backgroundColor: '#fff', borderTopColor: '#dfe4ec', borderTopWidth: 1, bottom: 0, flexDirection: 'row', justifyContent: 'space-around', left: 0, paddingBottom: 10, paddingTop: 10, position: 'absolute', right: 0 },
  tab: { alignItems: 'center', minWidth: 52, paddingVertical: 8 },
  tabText: { color: '#334155', fontWeight: '600' },
  tabTextActive: { color: '#0f766e' },
  billButton: { alignItems: 'center', backgroundColor: '#0f766e', borderRadius: 34, height: 68, justifyContent: 'center', marginTop: -32, width: 68 },
  billText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});

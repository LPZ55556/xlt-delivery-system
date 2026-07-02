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
    title: '定位权限',
    message: '小灵通需要定位权限用于到店确认和轨迹记录。',
    buttonPositive: '允许',
    buttonNegative: '取消',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
async function getCurrentPosition() {
  const granted = await requestLocationPermission();
  if (!granted) throw new Error('定位权限未授权。');
  if (!xltLocation?.getCurrentPosition) throw new Error('定位模块未就绪。');
  return xltLocation.getCurrentPosition();
}
async function searchAmapPois(keyword: string): Promise<AmapPoi[]> {
  if (!AMAP_WEB_SERVICE_KEY) throw new Error('未配置高德 Key，请先配置 AMAP_WEB_SERVICE_KEY。');
  const url = `https://restapi.amap.com/v3/place/text?key=${encodeURIComponent(AMAP_WEB_SERVICE_KEY)}&keywords=${encodeURIComponent(keyword)}&offset=10&page=1&extensions=base`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.status !== '1') throw new Error(data.info || '地图搜索失败。');
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

  async function handleBarcodeScanned(code: string) {
    const barcode = code.trim();
    if (!barcode) return;

    if (scannerMode === 'productForm') {
      setPrefillBarcode(barcode);
      setScreen('productForm');
      setMessage({ type: 'success', text: `已填入条码 ${barcode}。` });
      return;
    }

    try {
      const result = await api.listProducts();
      const product = result.items.find((item) => item.enabled && item.barcode === barcode);
      if (!product) {
        setPrefillBarcode(barcode);
        Alert.alert('未找到商品', '未找到该条码对应商品，可进入新增商品。', [
          { text: '继续扫码', style: 'cancel' },
          { text: '新增商品', onPress: () => { setEditingProduct(null); setScannerMode('productForm'); setScreen('productForm'); } },
        ]);
        return;
      }
      addProduct(product);
      setScreen(selectedMerchant ? 'billing' : 'merchantSelect');
      setMessage({ type: 'success', text: `已加入 ${product.name}。` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '扫码匹配商品失败。' });
      setScreen(selectedMerchant ? 'billing' : 'merchantSelect');
    }
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
      setMessage({ type: 'success', text: '到店确认已上传。' });
    } catch (error) {
      setMessage({ type: 'error', text: '到店确认失败，请稍后重试。' });
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
        {screen === 'route' ? <RouteScreen user={user} onBack={() => setScreen('home')} /> : null}
        {screen === 'ranking' ? <RankingScreen onBack={() => setScreen('home')} /> : null}
        {screen === 'scanner' ? <ScannerScreen mode={scannerMode} onScanned={handleBarcodeScanned} onBack={() => setScreen(scannerMode === 'productForm' ? 'productForm' : 'billing')} /> : null}
        {screen === 'productManage' ? <ProductManageScreen user={user} refreshKey={productsRefreshKey} onAdd={() => { setEditingProduct(null); setPrefillBarcode(''); setScreen('productForm'); }} onEdit={(product) => { setEditingProduct(product); setPrefillBarcode(''); setScreen('productForm'); }} onRefresh={() => setProductsRefreshKey((value) => value + 1)} onBack={() => setScreen('home')} /> : null}
        {screen === 'productForm' ? <ProductFormScreen product={editingProduct} initialBarcode={prefillBarcode} user={user} onScan={() => { setScannerMode('productForm'); setScreen('scanner'); }} onSaved={() => { setPrefillBarcode(''); setEditingProduct(null); setProductsRefreshKey((value) => value + 1); setScreen('productManage'); }} onBack={() => setScreen('productManage')} /> : null}
        {screen === 'merchantManage' ? <MerchantManageScreen user={user} refreshKey={merchantsRefreshKey} onAdd={() => { setEditingMerchant(null); setScreen('merchantForm'); }} onEdit={(merchant) => { setEditingMerchant(merchant); setScreen('merchantForm'); }} onCheckIn={handleMerchantCheckIn} onRefresh={() => setMerchantsRefreshKey((value) => value + 1)} onBack={() => setScreen('home')} /> : null}
        {screen === 'merchantForm' ? <MerchantFormScreen merchant={editingMerchant} user={user} onSaved={() => { setEditingMerchant(null); setMerchantsRefreshKey((value) => value + 1); setScreen('merchantManage'); }} onBack={() => setScreen('merchantManage')} /> : null}
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
  useEffect(() => { let alive = true; api.listOrders().then((result) => { if (alive) setOrders(result.items); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '订单统计加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, []);
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((order) => order.createdAt.slice(0, 10) === today && order.status !== 'voided');
  const todayAmount = todayOrders.reduce((total, order) => total + moneyToCents(order.totalAmount), 0);
  const todayProductCount = todayOrders.reduce((total, order) => total + order.items.reduce((sum, item) => sum + item.quantity, 0), 0);
  const merchantCount = new Set(todayOrders.map((order) => order.merchantId)).size;
  return <View><View style={styles.panel}><Text style={styles.title}>今日营业概览</Text><Text style={styles.description}>当前用户：{user.name || user.displayName || user.username}（{roleLabels[user.role] ?? user.role}）</Text>{loading ? <ActivityIndicator color="#0f766e" /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}<View style={styles.metrics}><Metric label="今日营业额" value={`${formatCents(todayAmount)} 元`} /><Metric label="已配送商户" value={String(merchantCount)} /><Metric label="今日订单数" value={String(todayOrders.length)} /><Metric label="售出商品数" value={String(todayProductCount)} /><Metric label="未同步订单" value="--" /><Metric label="未打印订单" value="--" /></View></View><View style={styles.actionGrid}><ActionButton label="开单" primary onPress={onStartBilling} /><ActionButton label="我的订单" onPress={onOpenOrders} />{canManageProducts(user.role) ? <ActionButton label="商品管理" onPress={onOpenProducts} /> : null}<ActionButton label="商户管理" onPress={onOpenMerchants} />{canViewRanking(user.role) ? <ActionButton label="商品销量排行" onPress={onOpenRanking} /> : null}<ActionButton label="今日轨迹" onPress={onOpenRoute} /><ActionButton label="打印机连接" onPress={onOpenPrinter} /><ActionButton label="设置 / 退出" onPress={onOpenSettings} /></View></View>;
}
function MerchantSelectScreen({ onSelect, onCheckIn, onBack }: { onSelect: (merchant: Merchant) => void; onCheckIn: (merchant: Merchant) => void; onBack: () => void }) {
  const [merchants, setMerchants] = useState<Merchant[]>([]); const [keyword, setKeyword] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let alive = true; api.listMerchants().then((result) => { if (alive) setMerchants(result.items.filter((item) => item.isActive)); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '商户加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, []);
  const filtered = merchants.filter((merchant) => !keyword.trim() || merchant.name.includes(keyword.trim()) || Boolean(merchant.phone?.includes(keyword.trim())) || merchant.address.includes(keyword.trim()));
  return <View><PageTitle title="选择商户" onBack={onBack} /><Text style={styles.description}>可选择商户开单，也可先进行到店定位确认。</Text><TextInput style={styles.input} value={keyword} onChangeText={setKeyword} placeholder="按商户名称、电话或地址搜索" />{loading ? <CenteredLoading text="正在加载商户..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{!loading && filtered.length === 0 ? <EmptyText text="暂无可选商户" /> : null}{filtered.map((merchant) => <View key={merchant.id} style={styles.listCard}><Text style={styles.cardTitle}>{merchant.name}</Text><Text style={styles.mutedText}>{merchant.address}</Text><Text style={styles.mutedText}>{merchant.contactName ?? '未填写联系人'} · {merchant.phone ?? '未填写电话'}</Text><View style={styles.row}><TouchableOpacity style={[styles.secondaryButton, styles.rowButton]} onPress={() => onCheckIn(merchant)}><Text style={styles.secondaryButtonText}>到店确认</Text></TouchableOpacity><TouchableOpacity style={[styles.primarySmallButton, styles.rowButton]} onPress={() => onSelect(merchant)}><Text style={styles.primarySmallButtonText}>选择开单</Text></TouchableOpacity></View></View>)}</View>;
}
function BillingScreen({ merchant, cart, onAddProduct, onQuantityChange, onRemove, onScanBarcode, onSubmit, onBack }: { merchant: Merchant; cart: CartItem[]; onAddProduct: (product: Product) => void; onQuantityChange: (productId: string, delta: number) => void; onRemove: (productId: string) => void; onScanBarcode: () => void; onSubmit: (remark?: string) => Promise<void>; onBack: () => void }) {
  const [products, setProducts] = useState<Product[]>([]); const [keyword, setKeyword] = useState(''); const [barcode, setBarcode] = useState(''); const [remark, setRemark] = useState(''); const [loading, setLoading] = useState(true); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('');
  useEffect(() => { let alive = true; api.listProducts().then((result) => { if (alive) setProducts(result.items.filter((item) => item.enabled)); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '商品加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, []);
  const filteredProducts = products.filter((product) => { const keywordMatch = !keyword.trim() || product.name.includes(keyword.trim()) || product.barcode.includes(keyword.trim()); const barcodeMatch = !barcode.trim() || product.barcode.includes(barcode.trim()); return keywordMatch && barcodeMatch; });
  const totalCents = cart.reduce((total, item) => total + moneyToCents(item.product.salePrice) * item.quantity, 0);
  async function submit() { setSubmitting(true); await onSubmit(remark.trim() || undefined); setSubmitting(false); }
  return <View><PageTitle title="开单" onBack={onBack} /><View style={styles.panel}><Text style={styles.cardTitle}>商户：{merchant.name}</Text><Text style={styles.mutedText}>{merchant.address}</Text></View><Text style={styles.sectionTitle}>手动条码搜索</Text><View style={styles.row}><TextInput style={[styles.input, styles.rowInput]} value={barcode} onChangeText={setBarcode} placeholder="输入条码" /><TouchableOpacity style={styles.secondaryButton} onPress={onScanBarcode}><Text style={styles.secondaryButtonText}>扫码添加</Text></TouchableOpacity></View><TextInput style={styles.input} value={keyword} onChangeText={setKeyword} placeholder="按商品名称或条码搜索" />{loading ? <CenteredLoading text="正在加载商品..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}<Text style={styles.sectionTitle}>商品列表</Text>{!loading && filteredProducts.length === 0 ? <EmptyText text="暂无匹配商品" /> : null}{filteredProducts.slice(0, 30).map((product) => <TouchableOpacity key={product.id} style={styles.productCard} onPress={() => onAddProduct(product)}><View style={styles.flex1}><Text style={styles.cardTitle}>{product.name}</Text><Text style={styles.mutedText}>{product.spec ?? '未填写规格'} · 条码 {product.barcode}</Text></View><Text style={styles.priceText}>{product.salePrice} 元</Text></TouchableOpacity>)}<Text style={styles.sectionTitle}>电子清单</Text>{cart.length === 0 ? <EmptyText text="请从商品列表加入商品" /> : null}{cart.map((item) => <View key={item.product.id} style={styles.cartCard}><View style={styles.flex1}><Text style={styles.cardTitle}>{item.product.name}</Text><Text style={styles.mutedText}>{item.product.spec ?? '未填写规格'} · 单价 {item.product.salePrice} 元</Text><Text style={styles.priceText}>小计 {multiplyMoney(item.product.salePrice, item.quantity)} 元</Text></View><View style={styles.quantityBox}><TouchableOpacity style={styles.quantityButton} onPress={() => onQuantityChange(item.product.id, -1)}><Text style={styles.quantityText}>-</Text></TouchableOpacity><Text style={styles.quantityValue}>{item.quantity}</Text><TouchableOpacity style={styles.quantityButton} onPress={() => onQuantityChange(item.product.id, 1)}><Text style={styles.quantityText}>+</Text></TouchableOpacity><TouchableOpacity onPress={() => onRemove(item.product.id)}><Text style={styles.dangerText}>删除</Text></TouchableOpacity></View></View>)}<TextInput style={[styles.input, styles.textarea]} value={remark} onChangeText={setRemark} placeholder="订单备注，可选" multiline /><View style={styles.totalBar}><Text style={styles.totalLabel}>合计</Text><Text style={styles.totalValue}>{formatCents(totalCents)} 元</Text></View><TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={submitting}><Text style={styles.primaryButtonText}>{submitting ? '提交中...' : '提交订单'}</Text></TouchableOpacity></View>;
}

function OrdersScreen({ refreshKey, onOpenDetail }: { refreshKey: number; onOpenDetail: (id: string) => void }) {
  const [orders, setOrders] = useState<Order[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let alive = true; setLoading(true); api.listOrders().then((result) => { if (alive) setOrders(result.items); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '订单加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [refreshKey]);
  return <View><Text style={styles.title}>我的订单</Text><Text style={styles.description}>当前后端列表未提供日期筛选，先展示我的订单列表。</Text>{loading ? <CenteredLoading text="正在加载订单..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{!loading && orders.length === 0 ? <EmptyText text="暂无订单" /> : null}{orders.map((order) => <TouchableOpacity key={order.id} style={styles.listCard} onPress={() => onOpenDetail(order.id)}><Text style={styles.cardTitle}>{order.orderNo}</Text><Text style={styles.mutedText}>{order.merchant?.name ?? '未知商户'} · {statusLabel(order.status)}</Text><Text style={styles.priceText}>{order.totalAmount} 元</Text><Text style={styles.mutedText}>{formatDateTime(order.createdAt)}</Text></TouchableOpacity>)}</View>;
}

function OrderDetailScreen({ orderId, onBack, onHome }: { orderId: string; onBack: () => void; onHome: () => void }) {
  const [order, setOrder] = useState<Order | null>(null); const [receipt, setReceipt] = useState<Receipt | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let alive = true; api.getOrder(orderId).then((result) => { if (alive) setOrder(result); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '订单详情加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [orderId]);
  async function loadReceipt() { try { const result = await api.getReceipt(orderId); setReceipt(result); } catch (err) { Alert.alert('小票预览', err instanceof Error ? err.message : '小票数据加载失败。'); } }
  if (loading) return <CenteredLoading text="正在加载订单详情..." />;
  if (error) return <Text style={styles.errorText}>{error}</Text>;
  if (!order) return <EmptyText text="订单不存在" />;
  return <View><PageTitle title="订单详情" onBack={onBack} /><View style={styles.panel}><Text style={styles.cardTitle}>{order.orderNo}</Text><Text style={styles.mutedText}>商户：{order.merchant?.name ?? '未知商户'}</Text><Text style={styles.mutedText}>状态：{statusLabel(order.status)}</Text><Text style={styles.mutedText}>创建时间：{formatDateTime(order.createdAt)}</Text><Text style={styles.totalValue}>总金额 {order.totalAmount} 元</Text></View><Text style={styles.sectionTitle}>商品明细</Text>{order.items.map((item) => <View key={item.id} style={styles.cartCard}><View style={styles.flex1}><Text style={styles.cardTitle}>{item.productNameSnapshot}</Text><Text style={styles.mutedText}>{item.productSpecSnapshot ?? '未填写规格'} · 条码 {item.productBarcodeSnapshot}</Text><Text style={styles.mutedText}>单价 {item.salePriceSnapshot} 元 × {item.quantity}</Text></View><Text style={styles.priceText}>{item.subtotal} 元</Text></View>)}<View style={styles.actionGrid}><ActionButton label="小票预览" onPress={loadReceipt} /><ActionButton label="返回首页" primary onPress={onHome} /></View>{receipt ? <ReceiptPreview receipt={receipt} /> : null}</View>;
}

function ReceiptPreview({ receipt }: { receipt: Receipt }) {
  return <View style={styles.receipt}><Text style={styles.receiptTitle}>{receipt.storeName}</Text><Text style={styles.mutedText}>配送员：{receipt.salespersonName}</Text><Text style={styles.mutedText}>时间：{formatDateTime(receipt.dateTime)}</Text><Text style={styles.mutedText}>订单号：{receipt.orderNo}</Text>{receipt.items.map((item, index) => <View style={styles.receiptLine} key={`${item.productName}-${index}`}><Text style={styles.flex1}>{item.productName} × {item.quantity}</Text><Text>{item.subtotal} 元</Text></View>)}<View style={styles.receiptLine}><Text style={styles.cardTitle}>总价</Text><Text style={styles.cardTitle}>{receipt.totalAmount} 元</Text></View><Text style={styles.description}>蓝牙打印功能后续接入。</Text></View>;
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
  function submitManual() { if (!manualBarcode.trim()) { Alert.alert('条码提示', '请输入条码。'); return; } void handleCode(manualBarcode.trim()); }
  if (permission === 'checking') return <CenteredLoading text="正在请求摄像头权限..." />;
  if (permission === 'denied') return <View><PageTitle title="扫码" onBack={onBack} /><View style={styles.panel}><Text style={styles.title}>需要摄像头权限</Text><Text style={styles.description}>请在系统设置中允许小灵通使用摄像头。</Text><TouchableOpacity style={styles.primaryButton} onPress={() => Linking.openSettings()}><Text style={styles.primaryButtonText}>打开设置</Text></TouchableOpacity></View></View>;
  return <View><PageTitle title={mode === 'billing' ? '扫码添加商品' : '扫码录入条码'} onBack={onBack} />{device ? <View style={styles.cameraWrap}><Camera style={styles.camera} device={device} isActive={!busy} codeScanner={codeScanner} torch={torchEnabled ? 'on' : 'off'} /><View style={styles.scanFrame} /></View> : <EmptyText text="未找到可用摄像头" />}<View style={styles.panel}><View style={styles.row}><TouchableOpacity style={styles.secondaryButton} onPress={() => setTorchEnabled((value) => !value)}><Text style={styles.secondaryButtonText}>{torchEnabled ? '关闭手电' : '打开手电'}</Text></TouchableOpacity><Text style={styles.mutedText}>{busy ? '处理中...' : '对准商品条码或 QR'}</Text></View><TextInput style={styles.input} value={manualBarcode} onChangeText={setManualBarcode} placeholder="手动输入条码" /><TouchableOpacity style={styles.primaryButton} onPress={submitManual}><Text style={styles.primaryButtonText}>使用手动条码</Text></TouchableOpacity></View></View>;
}

function RankingScreen({ onBack }: { onBack: () => void }) {
  const [range, setRange] = useState<'today' | '7d' | 'month'>('today'); const [items, setItems] = useState<ProductSalesRankingItem[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let alive = true; setLoading(true); setError(''); api.productSalesRanking(range).then((result) => { if (alive) setItems(result.items); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '销量排行加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [range]);
  return <View><PageTitle title="商品销量排行" onBack={onBack} /><View style={styles.segment}><SegmentButton label="今日" active={range === 'today'} onPress={() => setRange('today')} /><SegmentButton label="近 7 天" active={range === '7d'} onPress={() => setRange('7d')} /><SegmentButton label="本月" active={range === 'month'} onPress={() => setRange('month')} /></View><Text style={styles.description}>只展示销量和销售额，不显示进价和利润。</Text>{loading ? <CenteredLoading text="正在加载排行..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{!loading && items.length === 0 ? <EmptyText text="暂无销量数据" /> : null}{items.map((item) => <View key={item.productId} style={styles.listCard}><View style={styles.rowBetween}><Text style={styles.cardTitle}>#{item.rank} {item.productName}</Text><Text style={styles.priceText}>{item.salesAmount} 元</Text></View><Text style={styles.mutedText}>条码 {item.barcode}</Text><Text style={styles.mutedText}>销售数量 {item.quantitySold}</Text></View>)}</View>;
}

function RouteScreen({ user, onBack }: { user: CurrentUser; onBack: () => void }) {
  const [current, setCurrent] = useState<TrackPoint | null>(null); const [points, setPoints] = useState<TrackPoint[]>([]); const [recording, setRecording] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(''); try { const [position, track] = await Promise.all([getCurrentPosition(), api.myTodayTrack()]); setCurrent(position); setPoints(track.points); } catch (err) { setError(err instanceof Error ? err.message : '轨迹加载失败。'); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); return () => { if (timer.current) clearInterval(timer.current); }; }, [load]);
  async function collectPoint() { try { const point = await getCurrentPosition(); setCurrent(point); setPoints((value) => [...value, point]); } catch (err) { setError(err instanceof Error ? err.message : '定位失败。'); } }
  function start() { if (timer.current) clearInterval(timer.current); setRecording(true); void collectPoint(); timer.current = setInterval(() => { void collectPoint(); }, 15000); }
  function stop() { setRecording(false); if (timer.current) { clearInterval(timer.current); timer.current = null; } }
  async function upload() { try { const localPoints = points.filter((point) => !point.id); if (localPoints.length === 0) { Alert.alert('轨迹提示', '没有需要上传的新轨迹点。'); return; } await api.uploadTrackPoints(localPoints); await load(); Alert.alert('上传成功', '轨迹点已上传。'); } catch (err) { setError(err instanceof Error ? err.message : '轨迹上传失败。'); } }
  const html = AMAP_WEB_SERVICE_KEY ? createMapHtml(points, current, user.name || user.displayName || user.username) : '';
  return <View><PageTitle title="今日轨迹" onBack={onBack} />{loading ? <CenteredLoading text="正在加载定位和轨迹..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{AMAP_WEB_SERVICE_KEY && current ? <WebView originWhitelist={['*']} source={{ html }} style={styles.mapView} /> : <View style={styles.panel}><Text style={styles.title}>地图功能未完全配置</Text><Text style={styles.description}>请配置 AMAP_WEB_SERVICE_KEY 后重新构建 APK。当前仍可记录和上传坐标。</Text></View>}<View style={styles.panel}><Text style={styles.cardTitle}>当前位置</Text><Text style={styles.mutedText}>{current ? `${current.latitude}, ${current.longitude}` : '-'}</Text><Text style={styles.mutedText}>轨迹点：{points.length}</Text><View style={styles.actionGrid}><ActionButton label={recording ? '记录中' : '开始记录'} primary={!recording} onPress={recording ? stop : start} /><ActionButton label="停止记录" onPress={stop} /><ActionButton label="上传轨迹" onPress={() => void upload()} /><ActionButton label="刷新" onPress={() => void load()} /></View></View>{points.slice(-6).reverse().map((point, index) => <View key={`${point.recordedAt}-${index}`} style={styles.listCard}><Text style={styles.cardTitle}>{formatDateTime(point.recordedAt)}</Text><Text style={styles.mutedText}>{point.latitude}, {point.longitude}</Text><Text style={styles.mutedText}>accuracy {point.accuracy ?? '-'} / speed {point.speed ?? '-'}</Text></View>)}</View>;
}


function ProductManageScreen({ user, refreshKey, onAdd, onEdit, onRefresh, onBack }: { user: CurrentUser; refreshKey: number; onAdd: () => void; onEdit: (product: Product) => void; onRefresh: () => void; onBack: () => void }) {
  const [products, setProducts] = useState<Product[]>([]); const [keyword, setKeyword] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const manageable = canManageProducts(user.role);
  useEffect(() => { let alive = true; setLoading(true); api.listProducts().then((result) => { if (alive) setProducts(result.items); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '商品加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [refreshKey]);
  const filtered = products.filter((product) => !keyword.trim() || product.name.includes(keyword.trim()) || product.barcode.includes(keyword.trim()));
  function disable(product: Product) { Alert.alert('停用商品', `确认停用 ${product.name} ?`, [{ text: '取消', style: 'cancel' }, { text: '停用', style: 'destructive', onPress: async () => { await api.disableProduct(product.id); onRefresh(); } }]); }
  return <View><PageTitle title="商品管理" onBack={onBack} /><Text style={styles.description}>手机端不显示进价或利润。</Text><TextInput style={styles.input} value={keyword} onChangeText={setKeyword} placeholder="搜索商品名称或条码" />{manageable ? <TouchableOpacity style={styles.primaryButton} onPress={onAdd}><Text style={styles.primaryButtonText}>新增商品</Text></TouchableOpacity> : <Text style={styles.description}>当前角色仅可查看商品。</Text>}{loading ? <CenteredLoading text="正在加载商品..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{!loading && filtered.length === 0 ? <EmptyText text="暂无商品" /> : null}{filtered.map((product) => <View key={product.id} style={styles.listCard}><View style={styles.rowBetween}><Text style={styles.cardTitle}>{product.name}</Text><Text style={product.enabled ? styles.activeBadge : styles.inactiveBadge}>{product.enabled ? '启用' : '停用'}</Text></View><Text style={styles.mutedText}>条码 {product.barcode} · {product.spec ?? '-'}</Text><Text style={styles.mutedText}>分类 {product.category ?? '-'} · 库存 {product.stock} · 预警 {product.stockWarningValue ?? '-'}</Text><Text style={styles.priceText}>售价 {product.salePrice} 元</Text>{manageable ? <View style={styles.row}><TouchableOpacity style={[styles.secondaryButton, styles.rowButton]} onPress={() => onEdit(product)}><Text style={styles.secondaryButtonText}>编辑</Text></TouchableOpacity>{product.enabled ? <TouchableOpacity style={[styles.dangerButton, styles.rowButton]} onPress={() => disable(product)}><Text style={styles.dangerButtonText}>停用</Text></TouchableOpacity> : null}</View> : null}</View>)}</View>;
}

function ProductFormScreen({ product, initialBarcode, user, onScan, onSaved, onBack }: { product: Product | null; initialBarcode: string; user: CurrentUser; onScan: () => void; onSaved: () => void; onBack: () => void }) {
  const [name, setName] = useState(product?.name ?? ''); const [barcode, setBarcode] = useState(product?.barcode ?? initialBarcode); const [category, setCategory] = useState(product?.category ?? ''); const [spec, setSpec] = useState(product?.spec ?? ''); const [salePrice, setSalePrice] = useState(product?.salePrice ?? ''); const [stock, setStock] = useState(String(product?.stock ?? 0)); const [stockWarningValue, setStockWarningValue] = useState(product?.stockWarningValue == null ? '' : String(product.stockWarningValue)); const [enabled, setEnabled] = useState(product?.enabled ?? true); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (!product && initialBarcode) setBarcode(initialBarcode); }, [initialBarcode, product]);
  async function save() { if (!canManageProducts(user.role)) { setError('当前角色无权管理商品。'); return; } if (!name.trim() || !barcode.trim() || !salePrice.trim()) { setError('请填写商品名称、条码和售价。'); return; } const stockNumber = Number(stock || 0); const warningNumber = stockWarningValue.trim() ? Number(stockWarningValue) : null; if (!Number.isInteger(stockNumber) || stockNumber < 0 || (warningNumber !== null && (!Number.isInteger(warningNumber) || warningNumber < 0))) { setError('库存必须是非负整数。'); return; } setSaving(true); setError(''); try { const body = { name: name.trim(), barcode: barcode.trim(), category: category.trim() || undefined, spec: spec.trim() || undefined, salePrice: salePrice.trim(), stock: stockNumber, stockWarningValue: warningNumber, enabled }; if (product) await api.updateProduct(product.id, body); else await api.createProduct(body); onSaved(); } catch (err) { setError(err instanceof Error ? err.message : '保存商品失败。'); } finally { setSaving(false); } }
  return <View><PageTitle title={product ? '编辑商品' : '新增商品'} onBack={onBack} /><View style={styles.panel}>{error ? <Text style={styles.errorText}>{error}</Text> : null}<Text style={styles.label}>商品名称</Text><TextInput style={styles.input} value={name} onChangeText={setName} /><Text style={styles.label}>条码</Text><View style={styles.row}><TextInput style={[styles.input, styles.rowInput]} value={barcode} onChangeText={setBarcode} /><TouchableOpacity style={styles.secondaryButton} onPress={onScan}><Text style={styles.secondaryButtonText}>扫码录入</Text></TouchableOpacity></View><Text style={styles.label}>分类</Text><TextInput style={styles.input} value={category} onChangeText={setCategory} /><Text style={styles.label}>规格</Text><TextInput style={styles.input} value={spec} onChangeText={setSpec} /><Text style={styles.label}>售价</Text><TextInput style={styles.input} value={salePrice} onChangeText={setSalePrice} keyboardType="decimal-pad" placeholder="0.00" /><Text style={styles.label}>库存</Text><TextInput style={styles.input} value={stock} onChangeText={setStock} keyboardType="number-pad" /><Text style={styles.label}>库存预警值</Text><TextInput style={styles.input} value={stockWarningValue} onChangeText={setStockWarningValue} keyboardType="number-pad" /><TouchableOpacity style={styles.secondaryButton} onPress={() => setEnabled((value) => !value)}><Text style={styles.secondaryButtonText}>{enabled ? '当前启用' : '当前停用'}</Text></TouchableOpacity><Text style={styles.description}>不录入进价，不显示利润。</Text><TouchableOpacity style={styles.primaryButton} onPress={save} disabled={saving}><Text style={styles.primaryButtonText}>{saving ? '保存中...' : '保存商品'}</Text></TouchableOpacity></View></View>;
}


function MerchantManageScreen({ user, refreshKey, onAdd, onEdit, onCheckIn, onRefresh, onBack }: { user: CurrentUser; refreshKey: number; onAdd: () => void; onEdit: (merchant: Merchant) => void; onCheckIn: (merchant: Merchant) => void; onRefresh: () => void; onBack: () => void }) {
  const [merchants, setMerchants] = useState<Merchant[]>([]); const [keyword, setKeyword] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const manageable = canManageMerchants(user.role);
  useEffect(() => { let alive = true; setLoading(true); api.listMerchants({ includeInactive: true }).then((result) => { if (alive) setMerchants(result.items); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '商户加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [refreshKey]);
  const filtered = merchants.filter((merchant) => !keyword.trim() || merchant.name.includes(keyword.trim()) || Boolean(merchant.phone?.includes(keyword.trim())) || merchant.address.includes(keyword.trim()));
  function disable(merchant: Merchant) { Alert.alert('停用商户', `确认停用 ${merchant.name} ?`, [{ text: '取消', style: 'cancel' }, { text: '停用', style: 'destructive', onPress: async () => { await api.disableMerchant(merchant.id); onRefresh(); } }]); }
  return <View><PageTitle title="商户管理" onBack={onBack} /><TextInput style={styles.input} value={keyword} onChangeText={setKeyword} placeholder="搜索商户名称、电话或地址" />{manageable ? <TouchableOpacity style={styles.primaryButton} onPress={onAdd}><Text style={styles.primaryButtonText}>新增商户</Text></TouchableOpacity> : <Text style={styles.description}>当前角色仅可查看商户和到店确认。</Text>}{loading ? <CenteredLoading text="正在加载商户..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{!loading && filtered.length === 0 ? <EmptyText text="暂无商户" /> : null}{filtered.map((merchant) => <View key={merchant.id} style={styles.listCard}><View style={styles.rowBetween}><Text style={styles.cardTitle}>{merchant.name}</Text><Text style={merchant.isActive ? styles.activeBadge : styles.inactiveBadge}>{merchant.isActive ? '启用' : '停用'}</Text></View><Text style={styles.mutedText}>{merchant.address}</Text><Text style={styles.mutedText}>{merchant.contactName ?? '-'} · {merchant.phone ?? '-'} · {merchant.area ?? '-'}</Text><Text style={styles.mutedText}>lat {merchant.latitude ?? '-'} / lng {merchant.longitude ?? '-'}</Text><View style={styles.row}><TouchableOpacity style={[styles.secondaryButton, styles.rowButton]} onPress={() => onCheckIn(merchant)}><Text style={styles.secondaryButtonText}>到店确认</Text></TouchableOpacity>{manageable ? <TouchableOpacity style={[styles.secondaryButton, styles.rowButton]} onPress={() => onEdit(merchant)}><Text style={styles.secondaryButtonText}>编辑</Text></TouchableOpacity> : null}{manageable && merchant.isActive ? <TouchableOpacity style={[styles.dangerButton, styles.rowButton]} onPress={() => disable(merchant)}><Text style={styles.dangerButtonText}>停用</Text></TouchableOpacity> : null}</View></View>)}</View>;
}

function MerchantFormScreen({ merchant, user, onSaved, onBack }: { merchant: Merchant | null; user: CurrentUser; onSaved: () => void; onBack: () => void }) {
  const [name, setName] = useState(merchant?.name ?? ''); const [contactName, setContactName] = useState(merchant?.contactName ?? ''); const [phone, setPhone] = useState(merchant?.phone ?? ''); const [address, setAddress] = useState(merchant?.address ?? ''); const [latitude, setLatitude] = useState(merchant?.latitude ?? ''); const [longitude, setLongitude] = useState(merchant?.longitude ?? ''); const [area, setArea] = useState(merchant?.area ?? ''); const [remark, setRemark] = useState(merchant?.remark ?? ''); const [isActive, setIsActive] = useState(merchant?.isActive ?? true); const [keyword, setKeyword] = useState(''); const [pois, setPois] = useState<AmapPoi[]>([]); const [saving, setSaving] = useState(false); const [searching, setSearching] = useState(false); const [error, setError] = useState('');
  async function searchPois() { if (!keyword.trim()) return; setSearching(true); setError(''); try { setPois(await searchAmapPois(keyword.trim())); } catch (err) { setError(err instanceof Error ? err.message : '地图搜索失败。'); } finally { setSearching(false); } }
  function usePoi(poi: AmapPoi) { setName((value) => value || poi.name); setAddress(poi.address || poi.name); setLatitude(poi.latitude); setLongitude(poi.longitude); setPois([]); }
  async function useCurrentPoint() { try { const point = await getCurrentPosition(); setLatitude(point.latitude); setLongitude(point.longitude); } catch (err) { setError(err instanceof Error ? err.message : '获取定位失败。'); } }
  async function save() { if (!canManageMerchants(user.role)) { setError('当前角色无权管理商户。'); return; } if (!name.trim() || !address.trim()) { setError('请填写商户名称和地址。'); return; } setSaving(true); setError(''); try { const body = { name: name.trim(), contactName: contactName.trim() || undefined, phone: phone.trim() || undefined, address: address.trim(), latitude: latitude.trim() || undefined, longitude: longitude.trim() || undefined, area: area.trim() || undefined, remark: remark.trim() || undefined, isActive }; if (merchant) await api.updateMerchant(merchant.id, body); else await api.createMerchant(body); onSaved(); } catch (err) { setError(err instanceof Error ? err.message : '保存商户失败。'); } finally { setSaving(false); } }
  return <View><PageTitle title={merchant ? '编辑商户' : '新增商户'} onBack={onBack} /><View style={styles.panel}>{error ? <Text style={styles.errorText}>{error}</Text> : null}<Text style={styles.sectionTitle}>地图搜索 / 选点</Text><Text style={styles.description}>{AMAP_WEB_SERVICE_KEY ? '已配置高德 Key，可搜索地址。' : '未配置高德 Key，可手动填写。'}</Text><View style={styles.row}><TextInput style={[styles.input, styles.rowInput]} value={keyword} onChangeText={setKeyword} placeholder="输入地址或 POI" /><TouchableOpacity style={styles.secondaryButton} onPress={searchPois} disabled={searching}><Text style={styles.secondaryButtonText}>{searching ? '搜索中' : '搜索'}</Text></TouchableOpacity></View><TouchableOpacity style={styles.secondaryButton} onPress={useCurrentPoint}><Text style={styles.secondaryButtonText}>使用当前定位选点</Text></TouchableOpacity>{pois.map((poi) => <TouchableOpacity key={poi.id} style={styles.listCard} onPress={() => usePoi(poi)}><Text style={styles.cardTitle}>{poi.name}</Text><Text style={styles.mutedText}>{poi.address}</Text><Text style={styles.mutedText}>{poi.latitude}, {poi.longitude}</Text></TouchableOpacity>)}<Text style={styles.sectionTitle}>商户信息</Text><Text style={styles.label}>商户名称</Text><TextInput style={styles.input} value={name} onChangeText={setName} /><Text style={styles.label}>联系人</Text><TextInput style={styles.input} value={contactName} onChangeText={setContactName} /><Text style={styles.label}>联系电话</Text><TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><Text style={styles.label}>地址</Text><TextInput style={styles.input} value={address} onChangeText={setAddress} /><View style={styles.row}><View style={styles.flex1}><Text style={styles.label}>纬度</Text><TextInput style={styles.input} value={latitude} onChangeText={setLatitude} keyboardType="decimal-pad" /></View><View style={styles.flex1}><Text style={styles.label}>经度</Text><TextInput style={styles.input} value={longitude} onChangeText={setLongitude} keyboardType="decimal-pad" /></View></View><Text style={styles.label}>片区</Text><TextInput style={styles.input} value={area} onChangeText={setArea} /><Text style={styles.label}>备注</Text><TextInput style={[styles.input, styles.textarea]} value={remark} onChangeText={setRemark} multiline /><TouchableOpacity style={styles.secondaryButton} onPress={() => setIsActive((value) => !value)}><Text style={styles.secondaryButtonText}>{isActive ? '当前启用' : '当前停用'}</Text></TouchableOpacity><TouchableOpacity style={styles.primaryButton} onPress={save} disabled={saving}><Text style={styles.primaryButtonText}>{saving ? '保存中...' : '保存商户'}</Text></TouchableOpacity></View></View>;
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

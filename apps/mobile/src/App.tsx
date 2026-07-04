import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
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
import { api, getCurrentApiBaseUrl, normalizeApiBaseUrl, setUnauthorizedHandler, testApiBaseUrl } from './api';
import { AMAP_WEB_SERVICE_KEY, API_BASE_URL as DEFAULT_API_BASE_URL } from './config';
import { clearCustomApiBaseUrl, clearSession, getAccessToken, getReceiptSettings, getStoredUser, saveCustomApiBaseUrl, saveDefaultPrinter, saveReceiptSettings, saveSession } from './storage';
import { formatCents, formatDateTime, moneyToCents, multiplyMoney, statusLabel } from './money';
import type { AmapPoi, BusinessOverview, CartItem, CurrentUser, Merchant, MerchantConsumptionRankingItem, Order, PrinterDevice, Product, ProductSalesRankingItem, Receipt, ReceiptSettings, TrackPoint } from './types';

type Screen = 'login' | 'home' | 'merchantSelect' | 'billing' | 'orderSuccess' | 'orders' | 'orderDetail' | 'ranking' | 'settings' | 'scanner' | 'productManage' | 'productForm' | 'merchantManage' | 'merchantDetail' | 'merchantForm' | 'more' | 'merchantRanking' | 'overview' | 'receiptManage';
type ScannerMode = 'billing' | 'productForm';
type NativeLocationModule = { getCurrentPosition?: () => Promise<TrackPoint> };
type NativePrinterModule = { listBondedDevices?: () => Promise<PrinterDevice[]>; printText?: (address: string, text: string) => Promise<boolean> };
type Message = { type: 'error' | 'success' | 'info'; text: string } | null;

const roleLabels: Record<string, string> = { super_admin: '超级管理员', admin: '管理员', finance: '财务', warehouse: '仓库', salesperson: '配送员' };


const xltLocation = NativeModules.XltLocation as NativeLocationModule | undefined;
const xltPrinter = NativeModules.XltPrinter as NativePrinterModule | undefined;
function canManageProducts(role: string) { return ['super_admin', 'admin', 'warehouse'].includes(role); }
function canManageMerchants(role: string) { return ['super_admin', 'admin'].includes(role); }
function canViewRanking(role: string) { return ['super_admin', 'admin', 'finance', 'salesperson'].includes(role); }
function canViewSensitive(role: string) { return ['super_admin', 'admin', 'finance'].includes(role); }
async function requestLocationPermission() {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
    title: '定位权限',
    message: '销售通需要定位权限用于商户距离排序和到店确认。',
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

async function requestBluetoothPermission() {
  if (Platform.OS !== 'android') return true;
  const permissions: any[] = [];
  if (Platform.Version >= 31) {
    permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
  }
  if (!permissions.length) return true;
  const results = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every((permission) => (results as any)[permission] === PermissionsAndroid.RESULTS.GRANTED);
}
function formatDistance(meters?: number | null) {
  if (meters === undefined || meters === null || !Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters)} 米`;
  return `${(meters / 1000).toFixed(1)} 公里`;
}
function distanceMeters(a: TrackPoint, merchant: Merchant) {
  if (!merchant.latitude || !merchant.longitude) return null;
  const lat1 = Number(a.latitude); const lon1 = Number(a.longitude); const lat2 = Number(merchant.latitude); const lon2 = Number(merchant.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function receiptLineChars(settings: ReceiptSettings) {
  const width = Number(settings.paperWidthMm || 72);
  if (!Number.isFinite(width) || width <= 58) return 32;
  if (width <= 72) return 42;
  return 48;
}
function displayWidth(value: string) {
  return Array.from(String(value ?? '')).reduce((width, char) => {
    const code = char.codePointAt(0) ?? 0;
    return width + (code <= 0x7f ? 1 : 2);
  }, 0);
}
function sliceByDisplayWidth(value: string, maxWidth: number) {
  let result = '';
  let width = 0;
  for (const char of Array.from(String(value ?? ''))) {
    const next = char.codePointAt(0)! <= 0x7f ? 1 : 2;
    if (width + next > maxWidth) break;
    result += char;
    width += next;
  }
  return result;
}
function padRightByDisplayWidth(value: string, targetWidth: number) {
  const clipped = sliceByDisplayWidth(value, targetWidth);
  return clipped + ' '.repeat(Math.max(0, targetWidth - displayWidth(clipped)));
}
function padLeftByDisplayWidth(value: string, targetWidth: number) {
  const clipped = sliceByDisplayWidth(value, targetWidth);
  return ' '.repeat(Math.max(0, targetWidth - displayWidth(clipped))) + clipped;
}
function centerByDisplayWidth(value: string, targetWidth: number) {
  const clipped = sliceByDisplayWidth(value, targetWidth);
  const padding = Math.max(0, targetWidth - displayWidth(clipped));
  const left = Math.floor(padding / 2);
  return ' '.repeat(left) + clipped + ' '.repeat(padding - left);
}
function formatReceiptLines(receipt: Receipt, settings: ReceiptSettings) {
  const lineChars = receiptLineChars(settings);
  const line = '-'.repeat(lineChars);
  const priceWidth = 7;
  const quantityWidth = 4;
  const subtotalWidth = 8;
  const specWidth = Math.max(8, lineChars - priceWidth - quantityWidth - subtotalWidth - 3);
  const specLabel = '\u89c4\u683c';
  const lines = [
    centerByDisplayWidth(settings.title || '\u9500\u552e\u5355', lineChars),
    '',
    `\u5546\u6237\uff1a${receipt.storeName || '\u672a\u77e5\u5546\u6237'}`,
    `\u8ba2\u5355\uff1a${receipt.orderNo}`,
    `\u65f6\u95f4\uff1a${formatDateTime(receipt.dateTime)}`,
    `\u914d\u9001\u5458\uff1a${receipt.salespersonName || '-'}`,
    line,
    '\u5546\u54c1\u540d\u79f0',
    `${padRightByDisplayWidth(specLabel, specWidth)} ${padLeftByDisplayWidth('\u5355\u4ef7', priceWidth)} ${padLeftByDisplayWidth('\u6570\u91cf', quantityWidth)} ${padLeftByDisplayWidth('\u5408\u8ba1', subtotalWidth)}`,
    line,
  ];
  for (const item of receipt.items) {
    lines.push(sliceByDisplayWidth(item.productName || '\u672a\u77e5\u5546\u54c1', lineChars));
    const spec = item.spec?.trim() || '-';
    lines.push(`${padRightByDisplayWidth(spec, specWidth)} ${padLeftByDisplayWidth(item.unitPrice || '0.00', priceWidth)} ${padLeftByDisplayWidth(String(item.quantity ?? 0), quantityWidth)} ${padLeftByDisplayWidth(item.subtotal || '0.00', subtotalWidth)}`);
  }
  lines.push(line);
  lines.push(padLeftByDisplayWidth(`\u603b\u8ba1\uff1a${receipt.totalAmount || '0.00'} \u5143`, lineChars));
  lines.push('');
  lines.push(centerByDisplayWidth(settings.footer || '\u8c22\u8c22\u60e0\u987e', lineChars));
  lines.push('');
  lines.push('');
  return lines;
}
function receiptText(receipt: Receipt, settings: ReceiptSettings) {
  return formatReceiptLines(receipt, settings).join('\n');
}
function receiptPreviewWidth(settings: ReceiptSettings) {
  return receiptLineChars(settings) * 8;
}
function testReceiptText(settings: ReceiptSettings) {
  return receiptText({ storeName: 'mpt-III', salespersonName: '\u9500\u552e\u901a', dateTime: new Date().toISOString(), orderNo: 'TEST', items: [{ productName: '\u6d4b\u8bd5\u5546\u54c1', spec: '58mm', unitPrice: '1.00', quantity: 1, subtotal: '1.00' }], totalAmount: '1.00' }, { ...settings, title: '\u9500\u552e\u901a\u6253\u5370\u6d4b\u8bd5' });
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
  const [currentApiBaseUrl, setCurrentApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const [scannerMode, setScannerMode] = useState<ScannerMode>('billing');
  const [prefillBarcode, setPrefillBarcode] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingMerchant, setEditingMerchant] = useState<Merchant | null>(null);
  const [selectedMerchantDetailId, setSelectedMerchantDetailId] = useState<string | null>(null);
  const [productsRefreshKey, setProductsRefreshKey] = useState(0);
  const [merchantsRefreshKey, setMerchantsRefreshKey] = useState(0);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null); setSelectedMerchant(null); setCart([]); setScreen('login');
      setMessage({ type: 'error', text: '登录已过期，请重新登录。' });
    });
    void getCurrentApiBaseUrl().then(setCurrentApiBaseUrl);
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
  function setQuantity(productId: string, value: string) {
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 1) { setMessage({ type: 'error', text: '商品数量必须是大于 0 的整数。' }); return; }
    setCart((current) => current.map((item) => item.product.id === productId ? { ...item, quantity } : item));
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


  async function printOrderReceipt(orderId: string) {
    try {
      const settings = await getReceiptSettings();
      if (!settings.printer) { Alert.alert('\u6253\u5370\u5c0f\u7968', '\u8bf7\u5148\u8fdb\u5165\u201c\u66f4\u591a -> \u5c0f\u7968\u7ba1\u7406 -> \u6253\u5370\u673a\u7ba1\u7406\u201d\u9009\u62e9\u9ed8\u8ba4\u6253\u5370\u673a\u3002'); return; }
      const receipt = await api.getReceipt(orderId);
      await (xltPrinter?.printText?.(settings.printer.address, receiptText(receipt, settings)) ?? Promise.reject(new Error('\u84dd\u7259\u6253\u5370\u6a21\u5757\u672a\u5c31\u7eea\u3002')));
      setMessage({ type: 'success', text: '\u5c0f\u7968\u5df2\u53d1\u9001\u5230\u9ed8\u8ba4\u6253\u5370\u673a\u3002' });
    } catch (error) {
      Alert.alert('\u6253\u5370\u5931\u8d25', error instanceof Error ? error.message : '\u5c0f\u7968\u6253\u5370\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u6253\u5370\u673a\u8fde\u63a5\u3002');
    }
  }

  async function handleMerchantCheckIn(merchant: Merchant) {
    let point: TrackPoint | null = null;
    try { point = await getCurrentPosition(); } catch {}
    try {
      await api.checkIn({ merchantId: merchant.id, latitude: point?.latitude, longitude: point?.longitude, address: merchant.address });
      setMessage({ type: 'success', text: point ? '到店确认已上传。' : '到店确认已上传；未获取到定位，本次不含定位信息。' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '到店确认失败，请稍后重试。' });
    }
  }

  const content = booting ? <CenteredLoading text="正在恢复登录状态..." /> : !user ? <LoginScreen onLogin={handleLogin} message={message} apiBaseUrl={currentApiBaseUrl} onApiBaseUrlChanged={(url) => { setCurrentApiBaseUrl(url); setMessage({ type: 'info', text: 'API \u5730\u5740\u5df2\u66f4\u65b0\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002' }); }} /> : (
    <>
      <Header user={user} onLogout={logout} />
      {message ? <MessageBanner message={message} onClose={() => setMessage(null)} /> : null}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {screen === 'home' ? <HomeScreen user={user} onStartBilling={startBilling} onOpenOrders={() => setScreen('orders')} onOpenRanking={() => setScreen('ranking')} onOpenMore={() => setScreen('more')} /> : null}
        {screen === 'merchantSelect' ? <MerchantSelectScreen onSelect={selectMerchant} onCheckIn={handleMerchantCheckIn} onBack={() => setScreen('home')} /> : null}
        {screen === 'billing' && selectedMerchant ? <BillingScreen merchant={selectedMerchant} cart={cart} onAddProduct={addProduct} onQuantityChange={changeQuantity} onQuantityInput={setQuantity} onRemove={removeCartItem} onScanBarcode={() => { setScannerMode('billing'); setScreen('scanner'); }} onSubmit={submitOrder} onBack={() => setScreen('merchantSelect')} /> : null}
        {screen === 'orders' ? <OrdersScreen refreshKey={ordersRefreshKey} onOpenDetail={(id) => { setSelectedOrderId(id); setScreen('orderDetail'); }} /> : null}
        {screen === 'orderSuccess' && selectedOrderId ? <OrderSuccessScreen orderId={selectedOrderId} onView={() => setScreen('orderDetail')} onPrint={() => void printOrderReceipt(selectedOrderId)} onHome={() => setScreen('home')} /> : null}
        {screen === 'orderDetail' && selectedOrderId ? <OrderDetailScreen orderId={selectedOrderId} onBack={() => setScreen('orders')} onHome={() => setScreen('home')} onPrint={() => void printOrderReceipt(selectedOrderId)} /> : null}
        {screen === 'ranking' ? <RankingScreen onBack={() => setScreen('more')} /> : null}
        {screen === 'more' ? <MoreScreen user={user} onOpenOverview={() => setScreen('overview')} onOpenMerchantRanking={() => setScreen('merchantRanking')} onOpenProducts={() => setScreen('productManage')} onOpenMerchants={() => setScreen('merchantManage')} onOpenReceipts={() => setScreen('receiptManage')} onOpenRanking={() => setScreen('ranking')} /> : null}
        {screen === 'merchantRanking' ? <MerchantRankingScreen onBack={() => setScreen('more')} onOpenMerchant={(id) => { setSelectedMerchantDetailId(id); setScreen('merchantDetail'); }} /> : null}
        {screen === 'overview' ? <OverviewScreen onBack={() => setScreen('more')} /> : null}
        {screen === 'scanner' ? <ScannerScreen mode={scannerMode} onScanned={handleBarcodeScanned} onBack={() => setScreen(scannerMode === 'productForm' ? 'productForm' : 'billing')} /> : null}
        {screen === 'productManage' ? <ProductManageScreen user={user} refreshKey={productsRefreshKey} onAdd={() => { setEditingProduct(null); setPrefillBarcode(''); setScreen('productForm'); }} onEdit={(product) => { setEditingProduct(product); setPrefillBarcode(''); setScreen('productForm'); }} onRefresh={() => setProductsRefreshKey((value) => value + 1)} onBack={() => setScreen('more')} /> : null}
        {screen === 'productForm' ? <ProductFormScreen product={editingProduct} initialBarcode={prefillBarcode} user={user} onScan={() => { setScannerMode('productForm'); setScreen('scanner'); }} onSaved={() => { setPrefillBarcode(''); setEditingProduct(null); setProductsRefreshKey((value) => value + 1); setScreen('productManage'); }} onBack={() => setScreen('productManage')} /> : null}
        {screen === 'merchantManage' ? <MerchantManageScreen user={user} refreshKey={merchantsRefreshKey} onAdd={() => { setEditingMerchant(null); setScreen('merchantForm'); }} onOpenDetail={(id) => { setSelectedMerchantDetailId(id); setScreen('merchantDetail'); }} onCheckIn={handleMerchantCheckIn} onRefresh={() => setMerchantsRefreshKey((value) => value + 1)} onBack={() => setScreen('more')} /> : null}
        {screen === 'merchantDetail' && selectedMerchantDetailId ? <MerchantDetailScreen merchantId={selectedMerchantDetailId} user={user} onBack={() => setScreen('merchantManage')} onOpenOrder={(id) => { setSelectedOrderId(id); setScreen('orderDetail'); }} onEdit={(merchant) => { setEditingMerchant(merchant); setScreen('merchantForm'); }} /> : null}
        {screen === 'merchantForm' ? <MerchantFormScreen merchant={editingMerchant} user={user} onSaved={() => { setEditingMerchant(null); setMerchantsRefreshKey((value) => value + 1); setScreen('merchantManage'); }} onBack={() => setScreen('merchantManage')} /> : null}
        {screen === 'receiptManage' ? <ReceiptManageScreen onBack={() => setScreen('more')} /> : null}
        {screen === 'settings' ? <SettingsScreen apiBaseUrl={currentApiBaseUrl} onLogout={logout} /> : null}
      </ScrollView>
      <BottomNav current={screen} onHome={() => setScreen('home')} onOrders={() => setScreen('orders')} onStartBilling={startBilling} onMore={() => setScreen('more')} onSettings={() => setScreen('settings')} />
    </>
  );

  return <SafeAreaView style={styles.safeArea}><StatusBar barStyle="dark-content" />{content}</SafeAreaView>;
}

function Header({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  return <View style={styles.header}><View><Text style={styles.appName}>销售通</Text><Text style={styles.mutedText}>{user.name || user.displayName || user.username} · {roleLabels[user.role] ?? user.role}</Text></View><TouchableOpacity style={styles.secondaryButton} onPress={onLogout}><Text style={styles.secondaryButtonText}>退出</Text></TouchableOpacity></View>;
}

function LoginScreen({ onLogin, message, apiBaseUrl, onApiBaseUrlChanged }: { onLogin: (username: string, password: string) => Promise<void>; message: Message; apiBaseUrl: string; onApiBaseUrlChanged: (url: string) => void }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [submitting, setSubmitting] = useState(false); const [apiModalVisible, setApiModalVisible] = useState(false); const [apiInput, setApiInput] = useState(apiBaseUrl); const [apiMessage, setApiMessage] = useState(''); const [testing, setTesting] = useState(false);
  useEffect(() => setApiInput(apiBaseUrl), [apiBaseUrl]);
  async function submit() { if (!username.trim() || !password) { Alert.alert('\u767b\u5f55\u63d0\u793a', '\u8bf7\u8f93\u5165\u8d26\u53f7\u548c\u5bc6\u7801\u3002'); return; } setSubmitting(true); await onLogin(username.trim(), password); setSubmitting(false); }
  async function saveApiUrl() { const next = normalizeApiBaseUrl(apiInput); if (!/^https?:\/\//i.test(next)) { setApiMessage('API \u5730\u5740\u5fc5\u987b\u4ee5 http:// \u6216 https:// \u5f00\u5934\u3002'); return; } await saveCustomApiBaseUrl(next); await clearSession(); onApiBaseUrlChanged(next); setApiModalVisible(false); }
  async function restoreDefault() { await clearCustomApiBaseUrl(); await clearSession(); onApiBaseUrlChanged(DEFAULT_API_BASE_URL); setApiInput(DEFAULT_API_BASE_URL); setApiMessage('\u5df2\u6062\u590d\u9ed8\u8ba4 API \u5730\u5740\u3002'); }
  async function testConnection() { const target = normalizeApiBaseUrl(apiInput); setTesting(true); setApiMessage(''); try { await testApiBaseUrl(target); setApiMessage('\u8fde\u63a5\u6210\u529f\u3002'); } catch (error) { setApiMessage(error instanceof Error ? error.message : '\u8fde\u63a5\u5931\u8d25\u3002'); } finally { setTesting(false); } }
  return <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled"><View style={styles.authCard}><Text style={styles.loginTitle}>{'\u9500\u552e\u901a'}</Text><Text style={styles.description}>{'\u4f7f\u7528 Web \u540e\u53f0\u521b\u5efa\u7684\u8d26\u53f7\u767b\u5f55\u3002'}</Text>{message ? <MessageBanner message={message} /> : null}<Text style={styles.label}>{'\u8d26\u53f7'}</Text><TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} /><Text style={styles.label}>{'\u5bc6\u7801'}</Text><TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry /><TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={submitting}><Text style={styles.primaryButtonText}>{submitting ? '\u767b\u5f55\u4e2d...' : '\u767b\u5f55'}</Text></TouchableOpacity><TouchableOpacity style={styles.secondaryButton} onPress={() => { setApiInput(apiBaseUrl); setApiMessage(''); setApiModalVisible(true); }}><Text style={styles.secondaryButtonText}>{'\u66f4\u6539 API \u5730\u5740'}</Text></TouchableOpacity><Text style={styles.mutedText}>{'\u5f53\u524d API\uff1a'}{apiBaseUrl || '\u672a\u914d\u7f6e'}</Text></View><Modal transparent visible={apiModalVisible} animationType="fade" onRequestClose={() => setApiModalVisible(false)}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.sectionTitle}>{'\u66f4\u6539 API \u5730\u5740'}</Text><Text style={styles.description}>{'\u4fdd\u5b58\u540e\u4f1a\u6e05\u9664\u65e7\u767b\u5f55\u72b6\u6001\uff0c\u907f\u514d\u8de8\u670d\u52a1\u7aef\u6df7\u7528 token\u3002'}</Text><TextInput style={styles.input} value={apiInput} onChangeText={setApiInput} autoCapitalize="none" autoCorrect={false} placeholder="http://api.example.com:8080" /><View style={styles.row}><TouchableOpacity style={[styles.secondaryButton, styles.rowButton]} onPress={testConnection} disabled={testing}><Text style={styles.secondaryButtonText}>{testing ? '\u6d4b\u8bd5\u4e2d' : '\u6d4b\u8bd5\u8fde\u63a5'}</Text></TouchableOpacity><TouchableOpacity style={[styles.primarySmallButton, styles.rowButton]} onPress={saveApiUrl}><Text style={styles.primarySmallButtonText}>{'\u4fdd\u5b58'}</Text></TouchableOpacity></View><TouchableOpacity style={styles.secondaryButton} onPress={restoreDefault}><Text style={styles.secondaryButtonText}>{'\u6062\u590d\u9ed8\u8ba4 API \u5730\u5740'}</Text></TouchableOpacity>{apiMessage ? <Text style={styles.description}>{apiMessage}</Text> : null}<TouchableOpacity onPress={() => setApiModalVisible(false)}><Text style={styles.linkText}>{'\u5173\u95ed'}</Text></TouchableOpacity></View></View></Modal></ScrollView>;
}

function HomeScreen({ user, onStartBilling, onOpenOrders, onOpenRanking, onOpenMore }: { user: CurrentUser; onStartBilling: () => void; onOpenOrders: () => void; onOpenRanking: () => void; onOpenMore: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let alive = true; api.listOrders({ dateFrom: new Date().toISOString().slice(0, 10), dateTo: new Date().toISOString().slice(0, 10) }).then((result) => { if (alive) setOrders(result.items); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '订单统计加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, []);
  const todayOrders = orders.filter((order) => order.status !== 'voided'); const todayAmount = todayOrders.reduce((total, order) => total + moneyToCents(order.totalAmount), 0); const todayProductCount = todayOrders.reduce((total, order) => total + order.items.reduce((sum, item) => sum + item.quantity, 0), 0); const merchantCount = new Set(todayOrders.map((order) => order.merchantId)).size;
  return <View><View style={styles.panel}><Text style={styles.title}>今日营业概览</Text><Text style={styles.description}>当前用户：{user.name || user.displayName || user.username}（{roleLabels[user.role] ?? user.role}）</Text>{loading ? <ActivityIndicator color="#0f766e" /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}<View style={styles.metrics}><Metric label="今日营业额" value={`${formatCents(todayAmount)} 元`} /><Metric label="已配送商户" value={String(merchantCount)} /><Metric label="今日订单数" value={String(todayOrders.length)} /><Metric label="售出商品数" value={String(todayProductCount)} /><Metric label="未打印订单" value="--" /></View></View><View style={styles.actionGrid}><ActionButton label="开单" primary onPress={onStartBilling} /><ActionButton label="我的订单" onPress={onOpenOrders} />{canViewRanking(user.role) ? <ActionButton label="商品销量排行" onPress={onOpenRanking} /> : null}<ActionButton label="更多" onPress={onOpenMore} /></View></View>;
}
function MerchantSelectScreen({ onSelect, onCheckIn, onBack }: { onSelect: (merchant: Merchant) => void; onCheckIn: (merchant: Merchant) => void; onBack: () => void }) {
  const [merchants, setMerchants] = useState<Merchant[]>([]); const [keyword, setKeyword] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => { let alive = true; async function load() { try { const result = await api.listMerchants(); let items = result.items.filter((item) => item.isActive); try { const point = await getCurrentPosition(); items = items.map((merchant) => ({ ...merchant, distanceMeters: distanceMeters(point, merchant) })).sort((a, b) => { const da = a.distanceMeters ?? Number.POSITIVE_INFINITY; const db = b.distanceMeters ?? Number.POSITIVE_INFINITY; return da - db; }); } catch { if (alive) setNotice('未获取定位，已按默认顺序显示商户。'); } if (alive) setMerchants(items); } catch (err) { if (alive) setError(err instanceof Error ? err.message : '商户加载失败。'); } finally { if (alive) setLoading(false); } } void load(); return () => { alive = false; }; }, []);
  const filtered = merchants.filter((merchant) => !keyword.trim() || merchant.name.includes(keyword.trim()) || Boolean(merchant.phone?.includes(keyword.trim())) || merchant.address.includes(keyword.trim()));
  return <View><PageTitle title="选择商户" onBack={onBack} /><Text style={styles.description}>可选择商户开单，也可先进行到店确认；距离仅用于排序参考。</Text>{notice ? <Text style={styles.mutedText}>{notice}</Text> : null}<TextInput style={styles.input} value={keyword} onChangeText={setKeyword} placeholder="按商户名称、电话或地址搜索" />{loading ? <CenteredLoading text="正在加载商户..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{!loading && filtered.length === 0 ? <EmptyText text="暂无可选商户" /> : null}{filtered.map((merchant) => <View key={merchant.id} style={styles.listCard}><View style={styles.rowBetween}><Text style={styles.cardTitle}>{merchant.name}</Text>{merchant.distanceMeters !== undefined && merchant.distanceMeters !== null ? <Text style={styles.activeBadge}>{formatDistance(merchant.distanceMeters)}</Text> : null}</View><Text style={styles.mutedText}>{merchant.address}</Text><Text style={styles.mutedText}>{merchant.contactName ?? '未填写联系人'} · {merchant.phone ?? '未填写电话'}</Text><View style={styles.row}><TouchableOpacity style={[styles.secondaryButton, styles.rowButton]} onPress={() => onCheckIn(merchant)}><Text style={styles.secondaryButtonText}>到店确认</Text></TouchableOpacity><TouchableOpacity style={[styles.primarySmallButton, styles.rowButton]} onPress={() => onSelect(merchant)}><Text style={styles.primarySmallButtonText}>选择开单</Text></TouchableOpacity></View></View>)}</View>;
}
function BillingScreen({ merchant, cart, onAddProduct, onQuantityChange, onQuantityInput, onRemove, onScanBarcode, onSubmit, onBack }: { merchant: Merchant; cart: CartItem[]; onAddProduct: (product: Product) => void; onQuantityChange: (productId: string, delta: number) => void; onQuantityInput: (productId: string, value: string) => void; onRemove: (productId: string) => void; onScanBarcode: () => void; onSubmit: (remark?: string) => Promise<void>; onBack: () => void }) {
  const [products, setProducts] = useState<Product[]>([]); const [keyword, setKeyword] = useState(''); const [barcode, setBarcode] = useState(''); const [remark, setRemark] = useState(''); const [loading, setLoading] = useState(true); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('');
  useEffect(() => { let alive = true; api.listProducts().then((result) => { if (alive) setProducts(result.items.filter((item) => item.enabled)); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '商品加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, []);
  const filteredProducts = products.filter((product) => { const value = keyword.trim(); const keywordMatch = !value || product.name.includes(value) || product.barcode.includes(value) || Boolean(product.category?.includes(value)); const barcodeMatch = !barcode.trim() || product.barcode.includes(barcode.trim()); return keywordMatch && barcodeMatch; });
  const totalCents = cart.reduce((total, item) => total + moneyToCents(item.product.salePrice) * item.quantity, 0);
  async function submit() { setSubmitting(true); await onSubmit(remark.trim() || undefined); setSubmitting(false); }
  return <View><PageTitle title="开单" onBack={onBack} /><View style={styles.panel}><Text style={styles.cardTitle}>商户：{merchant.name}</Text><Text style={styles.mutedText}>{merchant.address}</Text></View><Text style={styles.sectionTitle}>手动条码搜索</Text><View style={styles.row}><TextInput style={[styles.input, styles.rowInput]} value={barcode} onChangeText={setBarcode} placeholder="输入条码" /><TouchableOpacity style={styles.secondaryButton} onPress={onScanBarcode}><Text style={styles.secondaryButtonText}>扫码添加</Text></TouchableOpacity></View><TextInput style={styles.input} value={keyword} onChangeText={setKeyword} placeholder="按商品名称、条码或分类搜索" />{loading ? <CenteredLoading text="正在加载商品..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}<Text style={styles.sectionTitle}>商品列表</Text>{!loading && filteredProducts.length === 0 ? <EmptyText text="暂无匹配商品" /> : null}{filteredProducts.slice(0, 30).map((product) => <TouchableOpacity key={product.id} style={styles.productCard} onPress={() => onAddProduct(product)}><View style={styles.flex1}><Text style={styles.cardTitle}>{product.name}</Text><Text style={styles.mutedText}>{product.spec ?? '未填写规格'} · {product.category || '未分类'} · 条码 {product.barcode}</Text></View><Text style={styles.priceText}>{product.salePrice} 元</Text></TouchableOpacity>)}<Text style={styles.sectionTitle}>电子清单</Text>{cart.length === 0 ? <EmptyText text="请从商品列表加入商品" /> : null}{cart.map((item) => <View key={item.product.id} style={styles.cartCard}><View style={styles.flex1}><Text style={styles.cardTitle}>{item.product.name}</Text><Text style={styles.mutedText}>{item.product.spec ?? '未填写规格'} · 单价 {item.product.salePrice} 元</Text><Text style={styles.priceText}>小计 {multiplyMoney(item.product.salePrice, item.quantity)} 元</Text></View><View style={styles.quantityBox}><TouchableOpacity style={styles.quantityButton} onPress={() => onQuantityChange(item.product.id, -1)}><Text style={styles.quantityText}>-</Text></TouchableOpacity><TextInput style={[styles.input, styles.quantityInput]} value={String(item.quantity)} onChangeText={(value) => onQuantityInput(item.product.id, value)} keyboardType="number-pad" /><TouchableOpacity style={styles.quantityButton} onPress={() => onQuantityChange(item.product.id, 1)}><Text style={styles.quantityText}>+</Text></TouchableOpacity><TouchableOpacity onPress={() => onRemove(item.product.id)}><Text style={styles.dangerText}>删除</Text></TouchableOpacity></View></View>)}<TextInput style={[styles.input, styles.textarea]} value={remark} onChangeText={setRemark} placeholder="订单备注，可选" multiline /><View style={styles.totalBar}><Text style={styles.totalLabel}>合计</Text><Text style={styles.totalValue}>{formatCents(totalCents)} 元</Text></View><TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={submitting}><Text style={styles.primaryButtonText}>{submitting ? '提交中...' : '提交订单'}</Text></TouchableOpacity></View>;
}
function formatLocalDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function dateRangeFromPreset(preset: 'all' | 'today' | 'yesterday' | '7d' | 'month') {
  const now = new Date();
  if (preset === 'all') return {};
  if (preset === 'today') return { dateFrom: formatLocalDate(now), dateTo: formatLocalDate(now) };
  if (preset === 'yesterday') { const d = addDays(now, -1); return { dateFrom: formatLocalDate(d), dateTo: formatLocalDate(d) }; }
  if (preset === '7d') return { dateFrom: formatLocalDate(addDays(now, -6)), dateTo: formatLocalDate(now) };
  const d = new Date(now.getFullYear(), now.getMonth(), 1); return { dateFrom: formatLocalDate(d), dateTo: formatLocalDate(now) };
}
function CalendarPicker({ title, value, onSelect }: { title: string; value: string; onSelect: (value: string) => void }) {
  const initial = value ? new Date(`${value}T00:00:00`) : new Date();
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const firstDay = month.getDay();
  const totalDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: Array<string | null> = [...Array(firstDay).fill(null), ...Array.from({ length: totalDays }, (_, index) => formatLocalDate(new Date(month.getFullYear(), month.getMonth(), index + 1)))];
  return <View style={styles.panel}><View style={styles.rowBetween}><TouchableOpacity style={styles.secondaryButton} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Text style={styles.secondaryButtonText}>{'\u4e0a\u6708'}</Text></TouchableOpacity><Text style={styles.sectionTitle}>{title} {month.getFullYear()}-{String(month.getMonth() + 1).padStart(2, '0')}</Text><TouchableOpacity style={styles.secondaryButton} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Text style={styles.secondaryButtonText}>{'\u4e0b\u6708'}</Text></TouchableOpacity></View><View style={styles.calendarGrid}>{cells.map((day, index) => day ? <TouchableOpacity key={day} style={[styles.calendarCell, value === day ? styles.calendarCellActive : null]} onPress={() => onSelect(day)}><Text style={value === day ? styles.calendarCellActiveText : styles.calendarCellText}>{Number(day.slice(-2))}</Text></TouchableOpacity> : <View key={`blank-${index}`} style={styles.calendarCell} />)}</View></View>;
}
function OrdersScreen({ refreshKey, onOpenDetail }: { refreshKey: number; onOpenDetail: (id: string) => void }) {
  const [orders, setOrders] = useState<Order[]>([]); const [merchants, setMerchants] = useState<Merchant[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [advancedVisible, setAdvancedVisible] = useState(false); const [dateEnabled, setDateEnabled] = useState(false); const [merchantEnabled, setMerchantEnabled] = useState(false); const [preset, setPreset] = useState<'all' | 'today' | 'yesterday' | '7d' | 'month'>('all'); const [dateFrom, setDateFrom] = useState(''); const [dateTo, setDateTo] = useState(''); const [calendarTarget, setCalendarTarget] = useState<'from' | 'to'>('from'); const [merchantKeyword, setMerchantKeyword] = useState(''); const [merchantId, setMerchantId] = useState(''); const [status, setStatus] = useState('');
  useEffect(() => { let alive = true; api.listMerchants().then((result) => { if (alive) setMerchants(result.items); }).catch(() => undefined); return () => { alive = false; }; }, []);
  const load = useCallback(() => { let alive = true; setLoading(true); setError(''); const query: { dateFrom?: string; dateTo?: string; merchantId?: string; merchantKeyword?: string; status?: string } = {}; if (dateEnabled) { query.dateFrom = dateFrom || undefined; query.dateTo = dateTo || undefined; } if (merchantEnabled) { query.merchantId = merchantId || undefined; query.merchantKeyword = merchantId ? undefined : merchantKeyword.trim() || undefined; } if (status) query.status = status; api.listOrders(query).then((result) => { if (alive) setOrders(result.items); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '\u8ba2\u5355\u52a0\u8f7d\u5931\u8d25\u3002'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [refreshKey, dateEnabled, dateFrom, dateTo, merchantEnabled, merchantId, merchantKeyword, status]);
  useEffect(() => load(), [load]);
  function applyPreset(next: 'all' | 'today' | 'yesterday' | '7d' | 'month') { setPreset(next); if (next === 'all') { setDateEnabled(false); setDateFrom(''); setDateTo(''); return; } const range = dateRangeFromPreset(next); setDateEnabled(true); setDateFrom(range.dateFrom ?? ''); setDateTo(range.dateTo ?? ''); }
  const merchantOptions = merchants.filter((merchant) => !merchantKeyword.trim() || merchant.name.includes(merchantKeyword.trim()) || Boolean(merchant.phone?.includes(merchantKeyword.trim())) || merchant.address.includes(merchantKeyword.trim()));
  const merchantSummary = (merchants.find((item) => item.id === merchantId)?.name ?? merchantKeyword) || '\u672a\u9009\u62e9';
  const summary = [dateEnabled && dateFrom && dateTo ? `\u65e5\u671f\uff1a${dateFrom} \u81f3 ${dateTo}` : '\u5168\u90e8\u8ba2\u5355', merchantEnabled ? `\u5546\u6237\uff1a${merchantSummary}` : '', status ? `\u72b6\u6001\uff1a${statusLabel(status)}` : '\u72b6\u6001\uff1a\u5168\u90e8'].filter(Boolean).join('  ');
  return <View><Text style={styles.title}>{'\u6211\u7684\u8ba2\u5355'}</Text><TouchableOpacity style={styles.primaryButton} onPress={() => setAdvancedVisible(true)}><Text style={styles.primaryButtonText}>{'\u9ad8\u7ea7\u7b5b\u9009'}</Text></TouchableOpacity><Text style={styles.description}>{summary}</Text>{loading ? <CenteredLoading text={'\u6b63\u5728\u52a0\u8f7d\u8ba2\u5355...'} /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{!loading && orders.length === 0 ? <EmptyText text={'\u6682\u65e0\u8ba2\u5355'} /> : null}{orders.map((order) => <TouchableOpacity key={order.id} style={styles.listCard} onPress={() => onOpenDetail(order.id)}><Text style={styles.cardTitle}>{order.orderNo}</Text><Text style={styles.mutedText}>{order.merchant?.name ?? '\u672a\u77e5\u5546\u6237'}  {statusLabel(order.status)}</Text><Text style={styles.priceText}>{order.totalAmount}{' \u5143'}</Text><Text style={styles.mutedText}>{formatDateTime(order.createdAt)}</Text></TouchableOpacity>)}<Modal transparent visible={advancedVisible} animationType="fade" onRequestClose={() => setAdvancedVisible(false)}><View style={styles.modalBackdrop}><ScrollView style={styles.modalCard}><Text style={styles.sectionTitle}>{'\u8ba2\u5355\u9ad8\u7ea7\u7b5b\u9009'}</Text><View style={styles.segment}><SegmentButton label={'\u5168\u90e8\u8ba2\u5355'} active={preset === 'all'} onPress={() => applyPreset('all')} /><SegmentButton label={'\u4eca\u65e5'} active={preset === 'today'} onPress={() => applyPreset('today')} /><SegmentButton label={'\u6628\u65e5'} active={preset === 'yesterday'} onPress={() => applyPreset('yesterday')} /><SegmentButton label={'\u8fd17\u5929'} active={preset === '7d'} onPress={() => applyPreset('7d')} /><SegmentButton label={'\u672c\u6708'} active={preset === 'month'} onPress={() => applyPreset('month')} /></View><TouchableOpacity style={styles.secondaryButton} onPress={() => setDateEnabled((value) => !value)}><Text style={styles.secondaryButtonText}>{dateEnabled ? '\u5df2\u542f\u7528\u65e5\u671f\u7b5b\u9009' : '\u672a\u542f\u7528\u65e5\u671f\u7b5b\u9009'}</Text></TouchableOpacity>{dateEnabled ? <View><View style={styles.row}><TouchableOpacity style={[styles.secondaryButton, styles.rowButton]} onPress={() => setCalendarTarget('from')}><Text style={styles.secondaryButtonText}>{'\u5f00\u59cb\uff1a'}{dateFrom || '\u9009\u62e9\u65e5\u671f'}</Text></TouchableOpacity><TouchableOpacity style={[styles.secondaryButton, styles.rowButton]} onPress={() => setCalendarTarget('to')}><Text style={styles.secondaryButtonText}>{'\u7ed3\u675f\uff1a'}{dateTo || '\u9009\u62e9\u65e5\u671f'}</Text></TouchableOpacity></View><CalendarPicker title={calendarTarget === 'from' ? '\u9009\u62e9\u5f00\u59cb\u65e5\u671f' : '\u9009\u62e9\u7ed3\u675f\u65e5\u671f'} value={calendarTarget === 'from' ? dateFrom : dateTo} onSelect={(value) => calendarTarget === 'from' ? setDateFrom(value) : setDateTo(value)} /></View> : null}<TouchableOpacity style={styles.secondaryButton} onPress={() => setMerchantEnabled((value) => !value)}><Text style={styles.secondaryButtonText}>{merchantEnabled ? '\u5df2\u542f\u7528\u5546\u6237\u7b5b\u9009' : '\u672a\u542f\u7528\u5546\u6237\u7b5b\u9009'}</Text></TouchableOpacity>{merchantEnabled ? <View><TextInput style={styles.input} value={merchantKeyword} onChangeText={(value) => { setMerchantKeyword(value); setMerchantId(''); }} placeholder={'\u641c\u7d22\u5546\u6237\u540d\u79f0\u3001\u7535\u8bdd\u6216\u5730\u5740'} />{merchantOptions.slice(0, 8).map((merchant) => <TouchableOpacity key={merchant.id} style={[styles.listCard, merchantId === merchant.id ? styles.selectedCard : null]} onPress={() => { setMerchantId(merchant.id); setMerchantKeyword(merchant.name); }}><Text style={styles.cardTitle}>{merchant.name}</Text><Text style={styles.mutedText}>{merchant.address}</Text></TouchableOpacity>)}</View> : null}<Text style={styles.sectionTitle}>{'\u72b6\u6001\u7b5b\u9009'}</Text><View style={styles.segment}><SegmentButton label={'\u5168\u90e8'} active={!status} onPress={() => setStatus('')} /><SegmentButton label={'\u5df2\u521b\u5efa'} active={status === 'created'} onPress={() => setStatus('created')} /><SegmentButton label={'\u5df2\u4f5c\u5e9f'} active={status === 'voided'} onPress={() => setStatus('voided')} /></View><TouchableOpacity style={styles.primaryButton} onPress={() => setAdvancedVisible(false)}><Text style={styles.primaryButtonText}>{'\u5e94\u7528\u7b5b\u9009'}</Text></TouchableOpacity><TouchableOpacity onPress={() => setAdvancedVisible(false)}><Text style={styles.linkText}>{'\u5173\u95ed'}</Text></TouchableOpacity></ScrollView></View></Modal></View>;
}
function OrderSuccessScreen({ orderId, onView, onPrint, onHome }: { orderId: string; onView: () => void; onPrint: () => void; onHome: () => void }) { const [order, setOrder] = useState<Order | null>(null); useEffect(() => { let alive = true; api.getOrder(orderId).then((result) => { if (alive) setOrder(result); }).catch(() => undefined); return () => { alive = false; }; }, [orderId]); return <View><View style={styles.panel}><Text style={styles.title}>{'\u8ba2\u5355\u63d0\u4ea4\u6210\u529f'}</Text><Text style={styles.description}>{order ? `\u8ba2\u5355\u53f7\uff1a${order.orderNo}` : '\u8ba2\u5355\u5df2\u521b\u5efa\u3002'}</Text>{order ? <Text style={styles.totalValue}>{'\u603b\u8ba1 '}{order.totalAmount}{' \u5143'}</Text> : null}</View><View style={styles.actionGrid}><ActionButton label={'\u67e5\u770b\u8ba2\u5355'} onPress={onView} /><ActionButton label={'\u6253\u5370\u5c0f\u7968'} onPress={onPrint} /><ActionButton label={'\u8fd4\u56de\u9996\u9875'} primary onPress={onHome} /></View></View>; }

function OrderDetailScreen({ orderId, onBack, onHome, onPrint }: { orderId: string; onBack: () => void; onHome: () => void; onPrint: () => void }) {
  const [order, setOrder] = useState<Order | null>(null); const [receipt, setReceipt] = useState<Receipt | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let alive = true; api.getOrder(orderId).then((result) => { if (alive) setOrder(result); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '订单详情加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [orderId]);
  async function loadReceipt() { try { const result = await api.getReceipt(orderId); setReceipt(result); } catch (err) { Alert.alert('小票预览', err instanceof Error ? err.message : '小票数据加载失败。'); } }
  if (loading) return <CenteredLoading text="正在加载订单详情..." />;
  if (error) return <Text style={styles.errorText}>{error}</Text>;
  if (!order) return <EmptyText text="订单不存在" />;
  return <View><PageTitle title="订单详情" onBack={onBack} /><View style={styles.panel}><Text style={styles.cardTitle}>{order.orderNo}</Text><Text style={styles.mutedText}>商户：{order.merchant?.name ?? '未知商户'}</Text><Text style={styles.mutedText}>状态：{statusLabel(order.status)}</Text><Text style={styles.mutedText}>创建时间：{formatDateTime(order.createdAt)}</Text><Text style={styles.totalValue}>总金额 {order.totalAmount} 元</Text></View><Text style={styles.sectionTitle}>商品明细</Text>{order.items.map((item) => <View key={item.id} style={styles.cartCard}><View style={styles.flex1}><Text style={styles.cardTitle}>{item.productNameSnapshot}</Text><Text style={styles.mutedText}>{item.productSpecSnapshot ?? '未填写规格'} · 条码 {item.productBarcodeSnapshot}</Text><Text style={styles.mutedText}>单价 {item.salePriceSnapshot} 元 × {item.quantity}</Text></View><Text style={styles.priceText}>{item.subtotal} 元</Text></View>)}<View style={styles.actionGrid}><ActionButton label="小票预览" onPress={loadReceipt} /><ActionButton label="打印小票" onPress={onPrint} /><ActionButton label="返回首页" primary onPress={onHome} /></View>{receipt ? <ReceiptPreview receipt={receipt} /> : null}</View>;
}

function ReceiptPreview({ receipt }: { receipt: Receipt }) {
  const [settings, setSettings] = useState<ReceiptSettings>({ title: '\u9500\u552e\u5355', paperWidthMm: '72', footer: '\u8c22\u8c22\u60e0\u987e', printer: null });
  useEffect(() => { getReceiptSettings().then(setSettings); }, []);
  const text = formatReceiptLines(receipt, settings).join('\n');
  return <View style={[styles.receipt, { maxWidth: receiptPreviewWidth(settings) }]}><Text style={styles.receiptMonospace}>{text}</Text></View>;
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

function ProductManageScreen({ user, refreshKey, onAdd, onEdit, onRefresh, onBack }: { user: CurrentUser; refreshKey: number; onAdd: () => void; onEdit: (product: Product) => void; onRefresh: () => void; onBack: () => void }) {
  const [products, setProducts] = useState<Product[]>([]); const [keyword, setKeyword] = useState(''); const [category, setCategory] = useState(''); const [categories, setCategories] = useState<string[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const manageable = canManageProducts(user.role);
  useEffect(() => { let alive = true; setLoading(true); Promise.all([api.listProducts(), api.productCategories().catch(() => ({ items: [] }))]).then(([result, cats]) => { if (alive) { setProducts(result.items); setCategories(cats.items.map((item) => item.name)); } }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '商品加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [refreshKey]);
  const filtered = products.filter((product) => { const value = keyword.trim(); const matchKeyword = !value || product.name.includes(value) || product.barcode.includes(value) || Boolean(product.category?.includes(value)); const matchCategory = !category || product.category === category; return matchKeyword && matchCategory; });
  async function disable(product: Product) { Alert.alert('停用商品', `确认停用 ${product.name}？`, [{ text: '取消', style: 'cancel' }, { text: '停用', style: 'destructive', onPress: async () => { try { await api.disableProduct(product.id); onRefresh(); } catch (err) { setError(err instanceof Error ? err.message : '停用失败。'); } } }]); }
  return <View><PageTitle title="商品管理" onBack={onBack} />{manageable ? <TouchableOpacity style={styles.primaryButton} onPress={onAdd}><Text style={styles.primaryButtonText}>新增商品</Text></TouchableOpacity> : <Text style={styles.description}>当前角色仅可查看商品。</Text>}<TextInput style={styles.input} value={keyword} onChangeText={setKeyword} placeholder="按商品名称、条码或分类搜索" /><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}><SegmentButton label="全部分类" active={!category} onPress={() => setCategory('')} />{categories.map((item) => <SegmentButton key={item} label={item} active={category === item} onPress={() => setCategory(item)} />)}</ScrollView>{loading ? <CenteredLoading text="正在加载商品..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{!loading && filtered.length === 0 ? <EmptyText text="暂无商品" /> : null}{filtered.map((product) => <View key={product.id} style={styles.listCard}><View style={styles.rowBetween}><Text style={styles.cardTitle}>{product.name}</Text><Text style={product.enabled ? styles.activeBadge : styles.inactiveBadge}>{product.enabled ? '启用' : '停用'}</Text></View><Text style={styles.mutedText}>{product.category || '未分类'} · {product.spec ?? '未填写规格'} · 条码 {product.barcode}</Text><Text style={styles.mutedText}>售价 {product.salePrice} 元 · 库存 {product.stock} · 预警 {product.stockWarningValue ?? '-'}</Text>{manageable ? <View style={styles.row}><TouchableOpacity style={[styles.secondaryButton, styles.rowButton]} onPress={() => onEdit(product)}><Text style={styles.secondaryButtonText}>编辑</Text></TouchableOpacity>{product.enabled ? <TouchableOpacity style={[styles.dangerButton, styles.rowButton]} onPress={() => disable(product)}><Text style={styles.dangerButtonText}>停用</Text></TouchableOpacity> : null}</View> : null}</View>)}</View>;
}
function ProductFormScreen({ product, initialBarcode, user, onScan, onSaved, onBack }: { product: Product | null; initialBarcode: string; user: CurrentUser; onScan: () => void; onSaved: () => void; onBack: () => void }) {
  const [name, setName] = useState(product?.name ?? ''); const [barcode, setBarcode] = useState(product?.barcode ?? initialBarcode); const [category, setCategory] = useState(product?.category ?? ''); const [categories, setCategories] = useState<string[]>([]); const [spec, setSpec] = useState(product?.spec ?? ''); const [salePrice, setSalePrice] = useState(product?.salePrice ?? ''); const [stock, setStock] = useState(String(product?.stock ?? 0)); const [stockWarningValue, setStockWarningValue] = useState(product?.stockWarningValue == null ? '' : String(product.stockWarningValue)); const [enabled, setEnabled] = useState(product?.enabled ?? true); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (!product && initialBarcode) setBarcode(initialBarcode); }, [initialBarcode, product]);
  async function save() { if (!canManageProducts(user.role)) { setError('当前角色无权管理商品。'); return; } if (!name.trim() || !barcode.trim() || !salePrice.trim()) { setError('请填写商品名称、条码和售价。'); return; } const stockNumber = Number(stock || 0); const warningNumber = stockWarningValue.trim() ? Number(stockWarningValue) : null; if (!Number.isInteger(stockNumber) || stockNumber < 0 || (warningNumber !== null && (!Number.isInteger(warningNumber) || warningNumber < 0))) { setError('库存必须是非负整数。'); return; } setSaving(true); setError(''); try { const body = { name: name.trim(), barcode: barcode.trim(), category: category.trim() || undefined, spec: spec.trim() || undefined, salePrice: salePrice.trim(), stock: stockNumber, stockWarningValue: warningNumber, enabled }; if (product) await api.updateProduct(product.id, body); else await api.createProduct(body); onSaved(); } catch (err) { setError(err instanceof Error ? err.message : '保存商品失败。'); } finally { setSaving(false); } }
  return <View><PageTitle title={product ? '编辑商品' : '新增商品'} onBack={onBack} /><View style={styles.panel}>{error ? <Text style={styles.errorText}>{error}</Text> : null}<Text style={styles.label}>商品名称</Text><TextInput style={styles.input} value={name} onChangeText={setName} /><Text style={styles.label}>条码</Text><View style={styles.row}><TextInput style={[styles.input, styles.rowInput]} value={barcode} onChangeText={setBarcode} /><TouchableOpacity style={styles.secondaryButton} onPress={onScan}><Text style={styles.secondaryButtonText}>扫码录入</Text></TouchableOpacity></View><Text style={styles.label}>分类</Text><TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="输入自定义分类名称" /><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>{categories.map((item) => <TouchableOpacity key={item} style={styles.secondaryButton} onPress={() => setCategory(item)}><Text style={styles.secondaryButtonText}>{item}</Text></TouchableOpacity>)}</ScrollView><Text style={styles.label}>规格</Text><TextInput style={styles.input} value={spec} onChangeText={setSpec} /><Text style={styles.label}>售价</Text><TextInput style={styles.input} value={salePrice} onChangeText={setSalePrice} keyboardType="decimal-pad" placeholder="0.00" /><Text style={styles.label}>库存</Text><TextInput style={styles.input} value={stock} onChangeText={setStock} keyboardType="number-pad" /><Text style={styles.label}>库存预警值</Text><TextInput style={styles.input} value={stockWarningValue} onChangeText={setStockWarningValue} keyboardType="number-pad" /><TouchableOpacity style={styles.secondaryButton} onPress={() => setEnabled((value) => !value)}><Text style={styles.secondaryButtonText}>{enabled ? '当前启用' : '当前停用'}</Text></TouchableOpacity><Text style={styles.description}>不录入进价，不显示利润。</Text><TouchableOpacity style={styles.primaryButton} onPress={save} disabled={saving}><Text style={styles.primaryButtonText}>{saving ? '保存中...' : '保存商品'}</Text></TouchableOpacity></View></View>;
}


function MerchantManageScreen({ user, refreshKey, onAdd, onOpenDetail, onCheckIn, onRefresh, onBack }: { user: CurrentUser; refreshKey: number; onAdd: () => void; onOpenDetail: (id: string) => void; onCheckIn: (merchant: Merchant) => void; onRefresh: () => void; onBack: () => void }) {
  const [merchants, setMerchants] = useState<Merchant[]>([]); const [keyword, setKeyword] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const manageable = canManageMerchants(user.role);
  useEffect(() => { let alive = true; setLoading(true); api.listMerchants({ includeInactive: true }).then((result) => { if (alive) setMerchants(result.items); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '\u5546\u6237\u52a0\u8f7d\u5931\u8d25\u3002'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [refreshKey]);
  const filtered = merchants.filter((merchant) => !keyword.trim() || merchant.name.includes(keyword.trim()) || Boolean(merchant.phone?.includes(keyword.trim())) || merchant.address.includes(keyword.trim()));
  function disable(merchant: Merchant) { Alert.alert('\u505c\u7528\u5546\u6237', `\u786e\u8ba4\u505c\u7528 ${merchant.name}？`, [{ text: '\u53d6\u6d88', style: 'cancel' }, { text: '\u505c\u7528', style: 'destructive', onPress: async () => { await api.disableMerchant(merchant.id); onRefresh(); } }]); }
  return <View><PageTitle title={'\u5546\u6237\u7ba1\u7406'} onBack={onBack} /><TextInput style={styles.input} value={keyword} onChangeText={setKeyword} placeholder={'\u641c\u7d22\u5546\u6237\u540d\u79f0\u3001\u7535\u8bdd\u6216\u5730\u5740'} />{manageable ? <TouchableOpacity style={styles.primaryButton} onPress={onAdd}><Text style={styles.primaryButtonText}>{'\u65b0\u589e\u5546\u6237'}</Text></TouchableOpacity> : <Text style={styles.description}>{'\u5f53\u524d\u89d2\u8272\u4ec5\u53ef\u67e5\u770b\u5546\u6237\u548c\u5230\u5e97\u786e\u8ba4\u3002'}</Text>}{loading ? <CenteredLoading text={'\u6b63\u5728\u52a0\u8f7d\u5546\u6237...'} /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{!loading && filtered.length === 0 ? <EmptyText text={'\u6682\u65e0\u5546\u6237'} /> : null}{filtered.map((merchant) => <View key={merchant.id} style={styles.listCard}><TouchableOpacity onPress={() => onOpenDetail(merchant.id)}><View style={styles.rowBetween}><Text style={styles.cardTitle}>{merchant.name}</Text><Text style={merchant.isActive ? styles.activeBadge : styles.inactiveBadge}>{merchant.isActive ? '\u542f\u7528' : '\u505c\u7528'}</Text></View><Text style={styles.mutedText}>{merchant.address}</Text><Text style={styles.mutedText}>{merchant.contactName ?? '-'}  {merchant.phone ?? '-'}  {merchant.area ?? '-'}</Text><Text style={styles.linkText}>{'\u67e5\u770b\u8be6\u60c5\u548c\u8ba2\u5355'}</Text></TouchableOpacity><View style={styles.row}><TouchableOpacity style={[styles.secondaryButton, styles.rowButton]} onPress={() => onCheckIn(merchant)}><Text style={styles.secondaryButtonText}>{'\u5230\u5e97\u786e\u8ba4'}</Text></TouchableOpacity>{manageable && merchant.isActive ? <TouchableOpacity style={[styles.dangerButton, styles.rowButton]} onPress={() => disable(merchant)}><Text style={styles.dangerButtonText}>{'\u505c\u7528'}</Text></TouchableOpacity> : null}</View></View>)}</View>;
}

function MerchantDetailScreen({ merchantId, user, onBack, onOpenOrder, onEdit }: { merchantId: string; user: CurrentUser; onBack: () => void; onOpenOrder: (id: string) => void; onEdit: (merchant: Merchant) => void }) {
  const [merchant, setMerchant] = useState<Merchant | null>(null); const [orders, setOrders] = useState<Order[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const manageable = canManageMerchants(user.role);
  useEffect(() => { let alive = true; setLoading(true); setError(''); Promise.all([api.getMerchant(merchantId), api.listOrders({ merchantId })]).then(([merchantResult, orderResult]) => { if (alive) { setMerchant(merchantResult); setOrders(orderResult.items); } }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '\u5546\u6237\u8be6\u60c5\u52a0\u8f7d\u5931\u8d25\u3002'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [merchantId]);
  if (loading) return <CenteredLoading text={'\u6b63\u5728\u52a0\u8f7d\u5546\u6237\u8be6\u60c5...'} />;
  if (error) return <Text style={styles.errorText}>{error}</Text>;
  if (!merchant) return <EmptyText text={'\u5546\u6237\u4e0d\u5b58\u5728'} />;
  return <View><PageTitle title={'\u5546\u6237\u8be6\u60c5'} onBack={onBack} /><View style={styles.panel}><View style={styles.rowBetween}><Text style={styles.title}>{merchant.name}</Text><Text style={merchant.isActive ? styles.activeBadge : styles.inactiveBadge}>{merchant.isActive ? '\u542f\u7528' : '\u505c\u7528'}</Text></View><Text style={styles.mutedText}>{'\u8054\u7cfb\u4eba\uff1a'}{merchant.contactName ?? '-'}</Text><Text style={styles.mutedText}>{'\u7535\u8bdd\uff1a'}{merchant.phone ?? '-'}</Text><Text style={styles.mutedText}>{'\u5730\u5740\uff1a'}{merchant.address}</Text><Text style={styles.mutedText}>{'\u7247\u533a\uff1a'}{merchant.area ?? '-'}</Text><Text style={styles.mutedText}>{'\u7ecf\u7eac\u5ea6\uff1a'}{merchant.latitude ?? '-'} / {merchant.longitude ?? '-'}</Text><Text style={styles.mutedText}>{'\u5907\u6ce8\uff1a'}{merchant.remark ?? '-'}</Text><Text style={styles.mutedText}>{'\u521b\u5efa\uff1a'}{formatDateTime(merchant.createdAt)}</Text><Text style={styles.mutedText}>{'\u66f4\u65b0\uff1a'}{formatDateTime(merchant.updatedAt)}</Text>{manageable ? <TouchableOpacity style={styles.primaryButton} onPress={() => onEdit(merchant)}><Text style={styles.primaryButtonText}>{'\u7f16\u8f91\u5546\u6237'}</Text></TouchableOpacity> : null}</View><Text style={styles.sectionTitle}>{'\u8be5\u5546\u6237\u8ba2\u5355'}</Text>{orders.length === 0 ? <EmptyText text={'\u6682\u65e0\u8ba2\u5355'} /> : null}{orders.map((order) => <TouchableOpacity key={order.id} style={styles.listCard} onPress={() => onOpenOrder(order.id)}><Text style={styles.cardTitle}>{order.orderNo}</Text><Text style={styles.mutedText}>{formatDateTime(order.createdAt)}  {statusLabel(order.status)}</Text><Text style={styles.priceText}>{order.totalAmount}{' \u5143'}</Text></TouchableOpacity>)}</View>;
}

function MerchantFormScreen({ merchant, user, onSaved, onBack }: { merchant: Merchant | null; user: CurrentUser; onSaved: () => void; onBack: () => void }) {
  const [name, setName] = useState(merchant?.name ?? ''); const [contactName, setContactName] = useState(merchant?.contactName ?? ''); const [phone, setPhone] = useState(merchant?.phone ?? ''); const [address, setAddress] = useState(merchant?.address ?? ''); const [latitude, setLatitude] = useState(merchant?.latitude ?? ''); const [longitude, setLongitude] = useState(merchant?.longitude ?? ''); const [area, setArea] = useState(merchant?.area ?? ''); const [remark, setRemark] = useState(merchant?.remark ?? ''); const [isActive, setIsActive] = useState(merchant?.isActive ?? true); const [keyword, setKeyword] = useState(''); const [pois, setPois] = useState<AmapPoi[]>([]); const [saving, setSaving] = useState(false); const [searching, setSearching] = useState(false); const [error, setError] = useState('');
  async function searchPois() { if (!keyword.trim()) return; setSearching(true); setError(''); try { setPois(await searchAmapPois(keyword.trim())); } catch (err) { setError(err instanceof Error ? err.message : '地图搜索失败。'); } finally { setSearching(false); } }
  function usePoi(poi: AmapPoi) { setName((value) => value || poi.name); setAddress(poi.address || poi.name); setLatitude(poi.latitude); setLongitude(poi.longitude); setPois([]); }
  async function useCurrentPoint() { try { const point = await getCurrentPosition(); setLatitude(point.latitude); setLongitude(point.longitude); } catch (err) { setError(err instanceof Error ? err.message : '获取定位失败。'); } }
  async function save() { if (!canManageMerchants(user.role)) { setError('当前角色无权管理商户。'); return; } if (!name.trim() || !address.trim()) { setError('请填写商户名称和地址。'); return; } setSaving(true); setError(''); try { const body = { name: name.trim(), contactName: contactName.trim() || undefined, phone: phone.trim() || undefined, address: address.trim(), latitude: latitude.trim() || undefined, longitude: longitude.trim() || undefined, area: area.trim() || undefined, remark: remark.trim() || undefined, isActive }; if (merchant) await api.updateMerchant(merchant.id, body); else await api.createMerchant(body); onSaved(); } catch (err) { setError(err instanceof Error ? err.message : '保存商户失败。'); } finally { setSaving(false); } }
  return <View><PageTitle title={merchant ? '编辑商户' : '新增商户'} onBack={onBack} /><View style={styles.panel}>{error ? <Text style={styles.errorText}>{error}</Text> : null}<Text style={styles.sectionTitle}>地图搜索 / 选点</Text><Text style={styles.description}>{AMAP_WEB_SERVICE_KEY ? '已配置高德 Key，可搜索地址。' : '未配置高德 Key，可手动填写。'}</Text><View style={styles.row}><TextInput style={[styles.input, styles.rowInput]} value={keyword} onChangeText={setKeyword} placeholder="输入地址或 POI" /><TouchableOpacity style={styles.secondaryButton} onPress={searchPois} disabled={searching}><Text style={styles.secondaryButtonText}>{searching ? '搜索中' : '搜索'}</Text></TouchableOpacity></View><TouchableOpacity style={styles.secondaryButton} onPress={useCurrentPoint}><Text style={styles.secondaryButtonText}>使用当前定位选点</Text></TouchableOpacity>{pois.map((poi) => <TouchableOpacity key={poi.id} style={styles.listCard} onPress={() => usePoi(poi)}><Text style={styles.cardTitle}>{poi.name}</Text><Text style={styles.mutedText}>{poi.address}</Text><Text style={styles.mutedText}>{poi.latitude}, {poi.longitude}</Text></TouchableOpacity>)}<Text style={styles.sectionTitle}>商户信息</Text><Text style={styles.label}>商户名称</Text><TextInput style={styles.input} value={name} onChangeText={setName} /><Text style={styles.label}>联系人</Text><TextInput style={styles.input} value={contactName} onChangeText={setContactName} /><Text style={styles.label}>联系电话</Text><TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><Text style={styles.label}>地址</Text><TextInput style={styles.input} value={address} onChangeText={setAddress} /><View style={styles.row}><View style={styles.flex1}><Text style={styles.label}>纬度</Text><TextInput style={styles.input} value={latitude} onChangeText={setLatitude} keyboardType="decimal-pad" /></View><View style={styles.flex1}><Text style={styles.label}>经度</Text><TextInput style={styles.input} value={longitude} onChangeText={setLongitude} keyboardType="decimal-pad" /></View></View><Text style={styles.label}>片区</Text><TextInput style={styles.input} value={area} onChangeText={setArea} /><Text style={styles.label}>备注</Text><TextInput style={[styles.input, styles.textarea]} value={remark} onChangeText={setRemark} multiline /><TouchableOpacity style={styles.secondaryButton} onPress={() => setIsActive((value) => !value)}><Text style={styles.secondaryButtonText}>{isActive ? '当前启用' : '当前停用'}</Text></TouchableOpacity><TouchableOpacity style={styles.primaryButton} onPress={save} disabled={saving}><Text style={styles.primaryButtonText}>{saving ? '保存中...' : '保存商户'}</Text></TouchableOpacity></View></View>;
}


function MoreScreen({ user, onOpenOverview, onOpenMerchantRanking, onOpenProducts, onOpenMerchants, onOpenReceipts, onOpenRanking }: { user: CurrentUser; onOpenOverview: () => void; onOpenMerchantRanking: () => void; onOpenProducts: () => void; onOpenMerchants: () => void; onOpenReceipts: () => void; onOpenRanking: () => void }) {
  return <View><Text style={styles.title}>更多</Text><View style={styles.actionGrid}>{canViewSensitive(user.role) ? <ActionButton label="数据总览" onPress={onOpenOverview} /> : null}<ActionButton label="商户消费榜单" onPress={onOpenMerchantRanking} />{canManageProducts(user.role) ? <ActionButton label="商品管理" onPress={onOpenProducts} /> : null}<ActionButton label="商户管理" onPress={onOpenMerchants} /><ActionButton label="小票管理" onPress={onOpenReceipts} />{canViewRanking(user.role) ? <ActionButton label="商品销量排行" onPress={onOpenRanking} /> : null}</View></View>;
}
function MerchantRangeSelector({ value, onChange }: { value: 'today' | '7d' | 'month' | '6m' | '1y' | 'all'; onChange: (value: 'today' | '7d' | 'month' | '6m' | '1y' | 'all') => void }) { return <View style={styles.segment}><SegmentButton label={'\u4eca\u65e5'} active={value === 'today'} onPress={() => onChange('today')} /><SegmentButton label={'\u8fd17\u5929'} active={value === '7d'} onPress={() => onChange('7d')} /><SegmentButton label={'\u672c\u6708'} active={value === 'month'} onPress={() => onChange('month')} /><SegmentButton label={'\u8fd1\u534a\u5e74'} active={value === '6m'} onPress={() => onChange('6m')} /><SegmentButton label={'\u8fd1\u4e00\u5e74'} active={value === '1y'} onPress={() => onChange('1y')} /><SegmentButton label={'\u603b\u699c'} active={value === 'all'} onPress={() => onChange('all')} /></View>; }
function MerchantRankingScreen({ onBack, onOpenMerchant }: { onBack: () => void; onOpenMerchant: (id: string) => void }) { const [range, setRange] = useState<'today' | '7d' | 'month' | '6m' | '1y' | 'all'>('today'); const [items, setItems] = useState<MerchantConsumptionRankingItem[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); useEffect(() => { let alive = true; setLoading(true); api.merchantConsumptionRanking(range).then((result) => { if (alive) setItems(result.items); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '\u5546\u6237\u699c\u5355\u52a0\u8f7d\u5931\u8d25\u3002'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [range]); return <View><PageTitle title={'\u5546\u6237\u6d88\u8d39\u699c\u5355'} onBack={onBack} /><MerchantRangeSelector value={range} onChange={setRange} />{loading ? <CenteredLoading text={'\u6b63\u5728\u52a0\u8f7d\u5546\u6237\u699c\u5355...'} /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{items.map((item) => <TouchableOpacity key={item.merchantId} style={styles.listCard} onPress={() => onOpenMerchant(item.merchantId)}><Text style={styles.cardTitle}>#{item.rank} {item.merchantName}</Text><Text style={styles.mutedText}>{'\u8ba2\u5355 '}{item.orderCount}{' \u5355  \u6d88\u8d39 '}{item.totalAmount}{' \u5143'}</Text><Text style={styles.mutedText}>{'\u6700\u8fd1\u4e0b\u5355\uff1a'}{formatDateTime(item.lastOrderAt)}</Text><Text style={styles.linkText}>{'\u67e5\u770b\u5546\u6237\u8be6\u60c5'}</Text></TouchableOpacity>)}</View>; }
function OverviewScreen({ onBack }: { onBack: () => void }) { const [password, setPassword] = useState(''); const [range, setRange] = useState<'today' | '7d' | 'month'>('today'); const [verified, setVerified] = useState(false); const [overview, setOverview] = useState<BusinessOverview | null>(null); const [error, setError] = useState(''); async function verify() { setError(''); try { await api.verifyOverview(password); setVerified(true); const data = await api.businessOverview(range, password); setOverview(data); } catch (err) { setError(err instanceof Error ? err.message : '安全密码验证失败。'); } } async function reload(nextRange: 'today' | '7d' | 'month') { setRange(nextRange); if (verified) setOverview(await api.businessOverview(nextRange, password)); } return <View><PageTitle title="数据总览" onBack={onBack} /><Text style={styles.description}>此页面包含进价、利润等敏感数据，需输入进价查看安全密码。</Text><TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="进价查看安全密码" secureTextEntry /><TouchableOpacity style={styles.primaryButton} onPress={verify}><Text style={styles.primaryButtonText}>验证并查看</Text></TouchableOpacity>{error ? <Text style={styles.errorText}>{error}</Text> : null}{verified ? <RangeSelector value={range} onChange={(value) => void reload(value)} /> : null}{overview ? <View><View style={styles.metrics}><Metric label="销售额" value={`${overview.totalSalesAmount} 元`} /><Metric label="订单数" value={String(overview.totalOrders)} /><Metric label="毛利估算" value={`${overview.totalProfit} 元`} /></View><Text style={styles.description}>{overview.profitNote}</Text><Text style={styles.sectionTitle}>商品汇总</Text>{overview.productSalesSummary.slice(0, 20).map((item) => <View key={item.productId} style={styles.listCard}><Text style={styles.cardTitle}>{item.productName}</Text><Text style={styles.mutedText}>分类：{item.category || '未分类'} · 数量 {item.quantitySold}</Text><Text style={styles.mutedText}>销售 {item.salesAmount} 元 · 成本 {item.costAmount} 元 · 毛利 {item.profitAmount} 元</Text></View>)}</View> : null}</View>; }
function ReceiptManageScreen({ onBack }: { onBack: () => void }) { const [settings, setSettings] = useState<ReceiptSettings>({ title: '销售单', paperWidthMm: '72', footer: '谢谢惠顾', printer: null }); const [devices, setDevices] = useState<PrinterDevice[]>([]); const [message, setMessage] = useState(''); useEffect(() => { getReceiptSettings().then(setSettings); }, []); async function save() { await saveReceiptSettings(settings); setMessage('小票模板已保存。'); } async function loadDevices() { const granted = await requestBluetoothPermission(); if (!granted) { setMessage('未授权蓝牙权限。'); return; } try { setDevices(await (xltPrinter?.listBondedDevices?.() ?? Promise.reject(new Error('蓝牙打印模块未就绪。')))); } catch (err) { setMessage(err instanceof Error ? err.message : '读取蓝牙设备失败。'); } } async function choose(device: PrinterDevice) { await saveDefaultPrinter(device); setSettings({ ...settings, printer: device }); setMessage(`已选择打印机：${device.name}`); } async function testPrint() { if (!settings.printer) { setMessage('请先选择默认打印机。'); return; } try { await (xltPrinter?.printText?.(settings.printer.address, testReceiptText(settings)) ?? Promise.reject(new Error('蓝牙打印模块未就绪。'))); setMessage('测试小票已发送。'); } catch (err) { setMessage(err instanceof Error ? err.message : '打印失败，请检查 mpt-III 是否已配对并开机。'); } } return <View><PageTitle title="小票管理" onBack={onBack} /><View style={styles.panel}><Text style={styles.sectionTitle}>小票模板</Text><Text style={styles.label}>顶部标题</Text><TextInput style={styles.input} value={settings.title} onChangeText={(value) => setSettings({ ...settings, title: value })} /><Text style={styles.label}>纸宽（毫米）</Text><TextInput style={styles.input} value={settings.paperWidthMm} onChangeText={(value) => setSettings({ ...settings, paperWidthMm: value })} keyboardType="number-pad" /><Text style={styles.label}>底部文字</Text><TextInput style={styles.input} value={settings.footer} onChangeText={(value) => setSettings({ ...settings, footer: value })} /><TouchableOpacity style={styles.primaryButton} onPress={save}><Text style={styles.primaryButtonText}>保存模板</Text></TouchableOpacity></View><View style={styles.panel}><Text style={styles.sectionTitle}>打印机管理</Text><Text style={styles.description}>默认按 ESC/POS Classic Bluetooth 适配 mpt-III，纸宽默认 72mm，可在上方修改。</Text><Text style={styles.mutedText}>当前打印机：{settings.printer ? `${settings.printer.name} ${settings.printer.address}` : '未选择'}</Text><TouchableOpacity style={styles.secondaryButton} onPress={loadDevices}><Text style={styles.secondaryButtonText}>列出已配对设备</Text></TouchableOpacity>{devices.map((device) => <TouchableOpacity key={device.address} style={styles.listCard} onPress={() => void choose(device)}><Text style={styles.cardTitle}>{device.name}</Text><Text style={styles.mutedText}>{device.address}</Text></TouchableOpacity>)}<TouchableOpacity style={styles.primaryButton} onPress={testPrint}><Text style={styles.primaryButtonText}>打印测试小票</Text></TouchableOpacity>{message ? <Text style={styles.description}>{message}</Text> : null}</View><ReceiptPreview receipt={{ storeName: '测试商户', salespersonName: '测试配送员', dateTime: new Date().toISOString(), orderNo: 'TEST', items: [{ productName: '测试商品', unitPrice: '1.00', quantity: 1, subtotal: '1.00' }], totalAmount: '1.00' }} /></View>; }
function RangeSelector({ value, onChange }: { value: 'today' | '7d' | 'month'; onChange: (value: 'today' | '7d' | 'month') => void }) { return <View style={styles.segment}><SegmentButton label="今日" active={value === 'today'} onPress={() => onChange('today')} /><SegmentButton label="近7天" active={value === '7d'} onPress={() => onChange('7d')} /><SegmentButton label="本月" active={value === 'month'} onPress={() => onChange('month')} /></View>; }
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
function BottomNav({ current, onHome, onOrders, onStartBilling, onMore, onSettings }: { current: Screen; onHome: () => void; onOrders: () => void; onStartBilling: () => void; onMore: () => void; onSettings: () => void }) { return <View style={styles.bottomNav}><NavButton label="首页" active={current === 'home'} onPress={onHome} /><NavButton label="订单" active={current === 'orders'} onPress={onOrders} /><TouchableOpacity style={styles.billButton} onPress={onStartBilling}><Text style={styles.billText}>开单</Text></TouchableOpacity><NavButton label="更多" active={current === 'more'} onPress={onMore} /><NavButton label="设置" active={current === 'settings'} onPress={onSettings} /></View>; }
function NavButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <TouchableOpacity style={styles.tab} onPress={onPress}><Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{label}</Text></TouchableOpacity>; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f7fb' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.45)', flex: 1, justifyContent: 'center', padding: 18 },
  modalCard: { backgroundColor: '#fff', borderRadius: 8, maxWidth: 520, padding: 18, width: '100%' },
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
  quantityInput: { minWidth: 54, paddingHorizontal: 8, paddingVertical: 6, textAlign: 'center' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  calendarCell: { alignItems: 'center', borderColor: '#dfe4ec', borderRadius: 6, borderWidth: 1, height: 38, justifyContent: 'center', width: '13%' },
  calendarCellActive: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  calendarCellText: { color: '#334155', fontSize: 13 },
  calendarCellActiveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  selectedCard: { borderColor: '#0f766e', borderWidth: 2 },
  dangerText: { color: '#b42318', fontWeight: '700' },
  errorText: { color: '#b42318', marginBottom: 10 },
  totalBar: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#dfe4ec', borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, padding: 14 },
  totalLabel: { color: '#172033', fontSize: 18, fontWeight: '700' },
  totalValue: { color: '#0f766e', fontSize: 20, fontWeight: '700' },
  receipt: { alignSelf: 'center', backgroundColor: '#fff', borderColor: '#cfd6e4', borderRadius: 8, borderWidth: 1, marginTop: 12, padding: 14, width: '100%' },
  receiptTitle: { color: '#172033', fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  receiptLine: { borderBottomColor: '#dfe4ec', borderBottomWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingVertical: 8 },
  receiptMonospace: { color: '#172033', fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier', fontSize: 13, lineHeight: 20 },
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

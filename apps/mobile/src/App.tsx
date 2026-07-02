import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api, setUnauthorizedHandler } from './api';
import { API_BASE_URL } from './config';
import { clearSession, getAccessToken, getStoredUser, saveSession } from './storage';
import { formatCents, formatDateTime, moneyToCents, multiplyMoney, statusLabel } from './money';
import type { CartItem, CurrentUser, Merchant, Order, Product, Receipt } from './types';

type Screen = 'login' | 'home' | 'merchantSelect' | 'billing' | 'orders' | 'orderDetail' | 'route' | 'ranking' | 'printer' | 'settings';
type Message = { type: 'error' | 'success' | 'info'; text: string } | null;

const roleLabels: Record<string, string> = { super_admin: '超级管理员', admin: '管理员', finance: '财务', warehouse: '仓库', salesperson: '配送员' };

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [message, setMessage] = useState<Message>(null);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);

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

  const content = booting ? <CenteredLoading text="正在恢复登录状态..." /> : !user ? <LoginScreen onLogin={handleLogin} message={message} /> : (
    <>
      <Header user={user} onLogout={logout} />
      {message ? <MessageBanner message={message} onClose={() => setMessage(null)} /> : null}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {screen === 'home' ? <HomeScreen user={user} onStartBilling={startBilling} onOpenOrders={() => setScreen('orders')} onOpenRoute={() => setScreen('route')} onOpenRanking={() => setScreen('ranking')} onOpenPrinter={() => setScreen('printer')} onOpenSettings={() => setScreen('settings')} /> : null}
        {screen === 'merchantSelect' ? <MerchantSelectScreen onSelect={selectMerchant} onBack={() => setScreen('home')} /> : null}
        {screen === 'billing' && selectedMerchant ? <BillingScreen merchant={selectedMerchant} cart={cart} onAddProduct={addProduct} onQuantityChange={changeQuantity} onRemove={removeCartItem} onSubmit={submitOrder} onBack={() => setScreen('merchantSelect')} /> : null}
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

function HomeScreen({ user, onStartBilling, onOpenOrders, onOpenRoute, onOpenRanking, onOpenPrinter, onOpenSettings }: { user: CurrentUser; onStartBilling: () => void; onOpenOrders: () => void; onOpenRoute: () => void; onOpenRanking: () => void; onOpenPrinter: () => void; onOpenSettings: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let alive = true; api.listOrders().then((result) => { if (alive) setOrders(result.items); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '订单统计加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, []);
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((order) => order.createdAt.slice(0, 10) === today && order.status !== 'voided');
  const todayAmount = todayOrders.reduce((total, order) => total + moneyToCents(order.totalAmount), 0);
  const todayProductCount = todayOrders.reduce((total, order) => total + order.items.reduce((sum, item) => sum + item.quantity, 0), 0);
  const merchantCount = new Set(todayOrders.map((order) => order.merchantId)).size;
  return <View><View style={styles.panel}><Text style={styles.title}>今日营业概览</Text><Text style={styles.description}>当前用户：{user.name || user.displayName || user.username}（{roleLabels[user.role] ?? user.role}）</Text>{loading ? <ActivityIndicator color="#0f766e" /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}<View style={styles.metrics}><Metric label="今日营业额" value={`¥${formatCents(todayAmount)}`} /><Metric label="已配送商户" value={String(merchantCount)} /><Metric label="今日订单数" value={String(todayOrders.length)} /><Metric label="售出商品数" value={String(todayProductCount)} /><Metric label="未同步订单" value="--" /><Metric label="未打印订单" value="--" /></View></View><View style={styles.actionGrid}><ActionButton label="开单" primary onPress={onStartBilling} /><ActionButton label="今日订单" onPress={onOpenOrders} /><ActionButton label="今日轨迹" onPress={onOpenRoute} /><ActionButton label="商品销量排行" onPress={onOpenRanking} /><ActionButton label="打印机连接" onPress={onOpenPrinter} /><ActionButton label="设置 / 退出" onPress={onOpenSettings} /></View></View>;
}

function MerchantSelectScreen({ onSelect, onBack }: { onSelect: (merchant: Merchant) => void; onBack: () => void }) {
  const [merchants, setMerchants] = useState<Merchant[]>([]); const [keyword, setKeyword] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let alive = true; api.listMerchants().then((result) => { if (alive) setMerchants(result.items.filter((item) => item.isActive)); }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : '商户加载失败。'); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, []);
  const filtered = merchants.filter((merchant) => !keyword.trim() || merchant.name.includes(keyword.trim()) || Boolean(merchant.phone?.includes(keyword.trim())));
  return <View><PageTitle title="选择商户" onBack={onBack} /><Text style={styles.description}>定位推荐商户功能后续接入高德地图。当前从启用商户列表中选择。</Text><TextInput style={styles.input} value={keyword} onChangeText={setKeyword} placeholder="按商户名称或电话搜索" />{loading ? <CenteredLoading text="正在加载商户..." /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{!loading && filtered.length === 0 ? <EmptyText text="暂无可选商户" /> : null}{filtered.map((merchant) => <TouchableOpacity key={merchant.id} style={styles.listCard} onPress={() => onSelect(merchant)}><Text style={styles.cardTitle}>{merchant.name}</Text><Text style={styles.mutedText}>{merchant.address}</Text><Text style={styles.mutedText}>{merchant.contactName ?? '未填写联系人'} · {merchant.phone ?? '未填写电话'}</Text></TouchableOpacity>)}</View>;
}

function BillingScreen({ merchant, cart, onAddProduct, onQuantityChange, onRemove, onSubmit, onBack }: { merchant: Merchant; cart: CartItem[]; onAddProduct: (product: Product) => void; onQuantityChange: (productId: string, delta: number) => void; onRemove: (productId: string) => void; onSubmit: (remark?: string) => Promise<void>; onBack: () => void }) {
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

function SettingsScreen({ apiBaseUrl, onLogout }: { apiBaseUrl: string; onLogout: () => void }) {
  return <View style={styles.panel}><Text style={styles.title}>设置</Text><Text style={styles.description}>API 地址来自移动端环境变量。</Text><Text style={styles.mutedText}>{apiBaseUrl || '未配置 MOBILE_API_BASE_URL'}</Text><TouchableOpacity style={styles.primaryButton} onPress={onLogout}><Text style={styles.primaryButtonText}>退出登录</Text></TouchableOpacity></View>;
}

function PlaceholderScreen({ title, description }: { title: string; description: string }) { return <View style={styles.panel}><Text style={styles.title}>{title}</Text><Text style={styles.description}>{description}</Text></View>; }
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
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
  bottomNav: { alignItems: 'center', backgroundColor: '#fff', borderTopColor: '#dfe4ec', borderTopWidth: 1, bottom: 0, flexDirection: 'row', justifyContent: 'space-around', left: 0, paddingBottom: 10, paddingTop: 10, position: 'absolute', right: 0 },
  tab: { alignItems: 'center', minWidth: 52, paddingVertical: 8 },
  tabText: { color: '#334155', fontWeight: '600' },
  tabTextActive: { color: '#0f766e' },
  billButton: { alignItems: 'center', backgroundColor: '#0f766e', borderRadius: 34, height: 68, justifyContent: 'center', marginTop: -32, width: 68 },
  billText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});

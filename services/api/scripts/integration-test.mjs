import { spawn, execFileSync, execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(apiDir, '../..');
const dbName = `xlt_delivery_integration_${Date.now()}`;
const databaseUrl = `postgresql://delivery_user:change_me@127.0.0.1:5432/${dbName}`;
const port = 3201;
const baseUrl = `http://127.0.0.1:${port}/api`;
const jwtSecret = 'integration_test_jwt_secret_not_for_production';
let apiProcess;
let prisma;

function run(command, options = {}) {
  execSync(command, { cwd: rootDir, stdio: 'inherit', shell: '/bin/bash', ...options });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function login(username, password, shouldSucceed = true) {
  const { response, body } = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (shouldSucceed) assert(response.ok, `login failed for ${username}: ${JSON.stringify(body)}`);
  return { response, body, token: body?.accessToken };
}

async function createUser(token, payload) {
  return request('/users', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) });
}

async function waitForApi() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const { response } = await request('/health');
      if (response.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('API did not become ready.');
}

function assertNoSensitiveUserFields(payload, label) {
  const serialized = JSON.stringify(payload);
  assert(!serialized.includes('passwordHash'), `${label} must not include passwordHash`);
  assert(!serialized.includes('costPricePasswordHash'), `${label} must not include cost price password hash`);
  assert(!serialized.includes(jwtSecret), `${label} must not include jwt secret`);
}

async function main() {
  run('service postgresql start || true');
  run('runuser -u postgres -- createuser delivery_user || true');
  run('runuser -u postgres -- psql -c "ALTER ROLE delivery_user WITH LOGIN PASSWORD \'change_me\';"');
  run(`runuser -u postgres -- dropdb --if-exists ${dbName}`);
  run(`runuser -u postgres -- createdb -O delivery_user ${dbName}`);

  run('pnpm --filter @xlt/api build');
  run(`DATABASE_URL='${databaseUrl}' pnpm --filter @xlt/api exec prisma migrate deploy`);

  apiProcess = spawn('node', ['dist/main.js'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: databaseUrl, JWT_SECRET: jwtSecret, API_PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  apiProcess.stdout.on('data', (chunk) => process.stdout.write(chunk));
  apiProcess.stderr.on('data', (chunk) => process.stderr.write(chunk));
  await waitForApi();

  const init = await request('/first-run-setup', {
    method: 'POST',
    body: JSON.stringify({
      adminUsername: 'admin',
      adminPassword: 'TestAdmin123',
      adminPasswordConfirm: 'TestAdmin123',
      costPricePassword: 'CostPrice123',
      costPricePasswordConfirm: 'CostPrice123',
    }),
  });
  assert(init.response.ok, 'first run setup should succeed');
  const adminLogin = await login('admin', 'TestAdmin123');
  const adminToken = adminLogin.token;
  const superAdmin = adminLogin.body.user;
  assertNoSensitiveUserFields(adminLogin.body, 'login response');

  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  const adminUserCreate = await createUser(adminToken, { username: 'manager1', name: 'Manager One', phone: '13900000001', role: 'admin', password: 'Manager123' });
  assert(adminUserCreate.response.ok, 'super_admin should create admin');
  const manager = adminUserCreate.body;
  const managerLogin = await login('manager1', 'Manager123');
  const managerToken = managerLogin.token;

  const salesCreate = await createUser(adminToken, { username: 'sales1', name: 'Sales One', phone: '13800000001', role: 'salesperson', password: 'Sales12345' });
  assert(salesCreate.response.ok, 'super_admin should create salesperson');
  const salesperson = salesCreate.body;
  assertNoSensitiveUserFields(salesCreate.body, 'created user response');

  const adminCreatesSales = await createUser(managerToken, { username: 'sales2', name: 'Sales Two', phone: '13800000002', role: 'salesperson', password: 'OtherSales12345' });
  assert(adminCreatesSales.response.ok, 'admin should create salesperson');

  const adminCreatesSuper = await createUser(managerToken, { username: 'root2', name: 'Root Two', role: 'super_admin', password: 'RootTwo123' });
  assert(!adminCreatesSuper.response.ok, 'admin should not create super_admin');

  const financeCreate = await createUser(adminToken, { username: 'finance1', name: 'Finance One', role: 'finance', password: 'Finance123' });
  const warehouseCreate = await createUser(adminToken, { username: 'warehouse1', name: 'Warehouse One', role: 'warehouse', password: 'Warehouse123' });
  assert(financeCreate.response.ok && warehouseCreate.response.ok, 'super_admin should create finance and warehouse');
  const financeToken = (await login('finance1', 'Finance123')).token;
  const warehouseToken = (await login('warehouse1', 'Warehouse123')).token;
  let salesToken = (await login('sales1', 'Sales12345')).token;
  const otherSalesToken = (await login('sales2', 'OtherSales12345')).token;

  for (const [roleName, token] of [['finance', financeToken], ['warehouse', warehouseToken], ['salesperson', salesToken]]) {
    const forbidden = await createUser(token, { username: `${roleName}x`, name: `${roleName} X`, role: 'salesperson', password: 'Forbidden123' });
    assert(!forbidden.response.ok, `${roleName} should not create users`);
  }

  const userList = await request('/users?page=1&pageSize=20&search=sales&role=salesperson&isActive=true', { headers: authHeaders(adminToken) });
  assert(userList.response.ok && userList.body.items.length >= 2, 'user list should support search, role and active filters');
  assertNoSensitiveUserFields(userList.body, 'user list');

  const userDetail = await request(`/users/${salesperson.id}`, { headers: authHeaders(adminToken) });
  assert(userDetail.response.ok && userDetail.body.username === 'sales1', 'user detail should return salesperson');
  assert(userDetail.body.name === 'Sales One' && userDetail.body.phone === '13800000001', 'user detail should include name and phone');
  assertNoSensitiveUserFields(userDetail.body, 'user detail');

  const updatedUser = await request(`/users/${salesperson.id}`, {
    method: 'PATCH',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ name: 'Sales One Updated', phone: '13800000999', role: 'warehouse' }),
  });
  assert(updatedUser.response.ok && updatedUser.body.role === 'warehouse', 'user update and role change should succeed');
  const updatedBack = await request(`/users/${salesperson.id}`, {
    method: 'PATCH',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ role: 'salesperson' }),
  });
  assert(updatedBack.response.ok && updatedBack.body.role === 'salesperson', 'role should change back to salesperson');

  const selfRoleChange = await request(`/users/${superAdmin.id}`, {
    method: 'PATCH',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ role: 'admin' }),
  });
  assert(!selfRoleChange.response.ok, 'user should not modify own role');

  const passwordReset = await request(`/users/${salesperson.id}/password`, {
    method: 'PATCH',
    headers: authHeaders(managerToken),
    body: JSON.stringify({ newPassword: 'SalesReset123' }),
  });
  assert(passwordReset.response.ok, 'admin should reset salesperson password');
  salesToken = (await login('sales1', 'SalesReset123')).token;

  const adminResetSuper = await request(`/users/${superAdmin.id}/password`, {
    method: 'PATCH',
    headers: authHeaders(managerToken),
    body: JSON.stringify({ newPassword: 'ShouldNotWork123' }),
  });
  assert(!adminResetSuper.response.ok, 'admin should not reset super_admin password');

  const selfDisable = await request(`/users/${salesperson.id}/disable`, { method: 'PATCH', headers: authHeaders(salesToken) });
  assert(!selfDisable.response.ok, 'user should not disable self');

  const adminDisableSuper = await request(`/users/${superAdmin.id}/disable`, { method: 'PATCH', headers: authHeaders(managerToken) });
  assert(!adminDisableSuper.response.ok, 'admin should not disable super_admin');

  const disabledUserCreate = await createUser(adminToken, { username: 'disabled1', name: 'Disabled One', role: 'salesperson', password: 'Disabled123' });
  assert(disabledUserCreate.response.ok, 'disabled test user should be created');
  const disabledUser = disabledUserCreate.body;
  const disabled = await request(`/users/${disabledUser.id}/disable`, { method: 'PATCH', headers: authHeaders(adminToken) });
  assert(disabled.response.ok && disabled.body.isActive === false, 'disable user should succeed');
  const disabledLogin = await login('disabled1', 'Disabled123', false);
  assert(!disabledLogin.response.ok, 'disabled user should not login');
  const enabled = await request(`/users/${disabledUser.id}/enable`, { method: 'PATCH', headers: authHeaders(adminToken) });
  assert(enabled.response.ok && enabled.body.isActive === true, 'enable user should succeed');

  const merchantCreate = await request('/merchants', {
    method: 'POST',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ name: 'Alpha Store', contactName: 'Alice', phone: '13800000000', address: 'Road 1', latitude: '22.1234567', longitude: '114.1234567', area: 'A1', remark: 'main' }),
  });
  assert(merchantCreate.response.ok, 'merchant create should succeed');
  const merchant = merchantCreate.body;

  const merchantUpdate = await request(`/merchants/${merchant.id}`, {
    method: 'PATCH',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ area: 'A2', remark: 'updated' }),
  });
  assert(merchantUpdate.response.ok && merchantUpdate.body.area === 'A2', 'merchant update should succeed');

  const merchantToDisable = await request('/merchants', {
    method: 'POST',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ name: 'Disabled Store', address: 'Road 2' }),
  });
  const merchantDisable = await request(`/merchants/${merchantToDisable.body.id}`, { method: 'DELETE', headers: authHeaders(adminToken) });
  assert(merchantDisable.response.ok && merchantDisable.body.isActive === false, 'merchant disable should soft-delete');

  const merchantList = await request('/merchants?page=1&pageSize=10&search=Alpha', { headers: authHeaders(salesToken) });
  assert(merchantList.response.ok && merchantList.body.total === 1 && merchantList.body.items[0].name === 'Alpha Store', 'salesperson should read active merchants with search');

  const productCreate = await request('/products', {
    method: 'POST',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ name: 'Cola', barcode: '690000000001', spec: '500ml', salePrice: '12.50', costPrice: '8.20', stock: 100 }),
  });
  assert(productCreate.response.ok, 'product create should succeed');
  const product = productCreate.body;
  assert(!JSON.stringify(product).includes('costPrice'), 'product response must not include costPrice');

  const badMerchantOrder = await request('/orders', {
    method: 'POST',
    headers: authHeaders(salesToken),
    body: JSON.stringify({ merchantId: 'bad-merchant', items: [{ productId: product.id, quantity: 1 }] }),
  });
  assert(!badMerchantOrder.response.ok, 'bad merchantId should fail');

  const badProductOrder = await request('/orders', {
    method: 'POST',
    headers: authHeaders(salesToken),
    body: JSON.stringify({ merchantId: merchant.id, items: [{ productId: 'bad-product', quantity: 1 }] }),
  });
  assert(!badProductOrder.response.ok, 'bad productId should fail');

  const badQuantityOrder = await request('/orders', {
    method: 'POST',
    headers: authHeaders(salesToken),
    body: JSON.stringify({ merchantId: merchant.id, items: [{ productId: product.id, quantity: 0 }] }),
  });
  assert(!badQuantityOrder.response.ok, 'quantity <= 0 should fail');

  const orderCreate = await request('/orders', {
    method: 'POST',
    headers: authHeaders(salesToken),
    body: JSON.stringify({ merchantId: merchant.id, items: [{ productId: product.id, quantity: 2 }], latitude: '22.1000000', longitude: '114.1000000', remark: 'delivery note' }),
  });
  assert(orderCreate.response.ok, `order create should succeed: ${JSON.stringify(orderCreate.body)}`);
  const order = orderCreate.body;
  assert(order.totalAmount === '25.00', 'order total should be fixed two decimals');
  assert(order.items[0].productNameSnapshot === 'Cola', 'order detail should contain product name snapshot');
  assert(order.items[0].productBarcodeSnapshot === '690000000001', 'order detail should contain barcode snapshot');
  assert(order.items[0].subtotal === '25.00', 'order item subtotal should be fixed two decimals');
  assert(!JSON.stringify(order).includes('costPrice'), 'order response must not include costPrice');

  const otherOrderCreate = await request('/orders', {
    method: 'POST',
    headers: authHeaders(otherSalesToken),
    body: JSON.stringify({ merchantId: merchant.id, items: [{ productId: product.id, quantity: 1 }] }),
  });
  assert(otherOrderCreate.response.ok, 'second salesperson order should succeed');

  const salesOrders = await request('/orders', { headers: authHeaders(salesToken) });
  assert(salesOrders.response.ok && salesOrders.body.total === 1 && salesOrders.body.items[0].salespersonId === salesperson.id, 'salesperson should only see own orders');

  const adminOrders = await request('/orders', { headers: authHeaders(adminToken) });
  assert(adminOrders.response.ok && adminOrders.body.total === 2, 'admin should see all orders');

  const detail = await request(`/orders/${order.id}`, { headers: authHeaders(salesToken) });
  assert(detail.response.ok && detail.body.items[0].productNameSnapshot === 'Cola', 'order detail should be readable by owner and contain snapshot');
  assert(!JSON.stringify(detail.body).includes('costPrice'), 'order detail must not include costPrice');

  const receipt = await request(`/orders/${order.id}/receipt`, { headers: authHeaders(salesToken) });
  assert(receipt.response.ok && receipt.body.totalAmount === '25.00' && receipt.body.items[0].subtotal === '25.00', 'receipt should include printable totals');
  assert(!JSON.stringify(receipt.body).includes('costPrice'), 'receipt must not include costPrice');

  const salesRanking = await request('/reports/product-sales-ranking?range=month', { headers: authHeaders(salesToken) });
  assert(salesRanking.response.ok, 'salesperson ranking should be readable');
  assert(salesRanking.body.items[0].quantitySold === 2 && salesRanking.body.items[0].salesAmount === '25.00', 'salesperson ranking should include only own order');
  assert(!JSON.stringify(salesRanking.body).includes('costPrice'), 'ranking must not include costPrice');

  const adminRanking = await request('/reports/product-sales-ranking?range=month', { headers: authHeaders(adminToken) });
  assert(adminRanking.response.ok && adminRanking.body.items[0].quantitySold === 3 && adminRanking.body.items[0].salesAmount === '37.50', 'admin ranking should include all non-voided orders');
  const financeRanking = await request('/reports/product-sales-ranking?range=month', { headers: authHeaders(financeToken) });
  assert(financeRanking.response.ok && financeRanking.body.items[0].quantitySold === 3, 'finance ranking should be readable');

  const checkIn = await request('/locations/check-in', {
    method: 'POST',
    headers: authHeaders(salesToken),
    body: JSON.stringify({ merchantId: merchant.id, latitude: '22.1100000', longitude: '114.1100000', address: 'Road 1' }),
  });
  assert(checkIn.response.ok && checkIn.body.merchantId === merchant.id, 'check-in should succeed');

  const uploadTrack = await request('/locations/track-points', {
    method: 'POST',
    headers: authHeaders(salesToken),
    body: JSON.stringify({ points: [
      { latitude: '22.1111111', longitude: '114.1111111', accuracy: '12.50', speed: '1.20', recordedAt: new Date().toISOString() },
      { latitude: '22.2222222', longitude: '114.2222222', recordedAt: new Date().toISOString() },
    ] }),
  });
  assert(uploadTrack.response.ok && uploadTrack.body.count === 2, 'track point upload should succeed');

  const todayTrack = await request('/locations/my-today-track', { headers: authHeaders(salesToken) });
  assert(todayTrack.response.ok && todayTrack.body.points.length >= 2 && todayTrack.body.checkIns.length >= 1, 'my today track should include points and check-ins');

  const latestLocations = await request('/locations/users/latest', { headers: authHeaders(adminToken) });
  assert(latestLocations.response.ok && latestLocations.body.items.length >= 1, 'admin should read latest user locations');
  const latestDenied = await request('/locations/users/latest', { headers: authHeaders(salesToken) });
  assert(!latestDenied.response.ok, 'salesperson should not read all latest user locations');

  const voided = await request(`/orders/${order.id}/void`, {
    method: 'PATCH',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ reason: 'test void' }),
  });
  assert(voided.response.ok && voided.body.status === 'voided' && voided.body.voidedAt, 'void order should succeed');

  const salesRankingAfterVoid = await request('/reports/product-sales-ranking?range=month', { headers: authHeaders(salesToken) });
  assert(salesRankingAfterVoid.response.ok && salesRankingAfterVoid.body.items.length === 0, 'voided salesperson order should not count in ranking');

  const auditRows = await prisma.auditLog.groupBy({ by: ['action', 'success'], _count: { _all: true } });
  const auditKey = new Set(auditRows.map((row) => `${row.action}:${row.success}`));
  for (const key of [
    'USER_CREATED:true',
    'USER_UPDATED:true',
    'USER_ROLE_CHANGED:true',
    'USER_PASSWORD_RESET:true',
    'USER_DISABLED:true',
    'USER_ENABLED:true',
    'USER_LOGIN_FAILED_DISABLED:false',
    'MERCHANT_CREATED:true',
    'MERCHANT_UPDATED:true',
    'MERCHANT_DISABLED:true',
    'ORDER_CREATED:true',
    'ORDER_VOIDED:true',
    'LOCATION_CHECK_IN_CREATED:true',
    'TRACK_POINTS_UPLOADED:true',
  ]) {
    assert(auditKey.has(key), `missing audit log ${key}`);
  }

  console.log('integration tests passed');
}

try {
  await main();
} finally {
  if (prisma) await prisma.$disconnect();
  if (apiProcess) apiProcess.kill('SIGTERM');
  try {
    execFileSync('su', ['-', 'postgres', '-c', `dropdb --if-exists ${dbName}`], { stdio: 'ignore' });
  } catch {}
}

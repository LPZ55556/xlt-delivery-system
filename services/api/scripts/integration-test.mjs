import { spawn, execFileSync, execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import bcrypt from 'bcryptjs';
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

async function login(username, password) {
  const { response, body } = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  assert(response.ok, `login failed for ${username}: ${JSON.stringify(body)}`);
  return body.accessToken;
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

async function main() {
  run('service postgresql start || true');
  run(`su - postgres -c "psql -tc \\\"SELECT 1 FROM pg_roles WHERE rolname='delivery_user'\\\" | grep -q 1 || psql -c \\\"CREATE ROLE delivery_user WITH LOGIN PASSWORD 'change_me';\\\""`);
  run(`su - postgres -c "dropdb --if-exists ${dbName}"`);
  run(`su - postgres -c "createdb -O delivery_user ${dbName}"`);

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
  const adminToken = await login('admin', 'TestAdmin123');

  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const salespersonPasswordHash = await bcrypt.hash('Sales12345', 12);
  const otherSalespersonPasswordHash = await bcrypt.hash('OtherSales12345', 12);
  const salesperson = await prisma.user.create({ data: { username: 'sales1', displayName: 'Sales One', passwordHash: salespersonPasswordHash, role: 'salesperson', enabled: true } });
  await prisma.user.create({ data: { username: 'sales2', displayName: 'Sales Two', passwordHash: otherSalespersonPasswordHash, role: 'salesperson', enabled: true } });
  const salesToken = await login('sales1', 'Sales12345');
  const otherSalesToken = await login('sales2', 'OtherSales12345');

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

  const voided = await request(`/orders/${order.id}/void`, {
    method: 'PATCH',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ reason: 'test void' }),
  });
  assert(voided.response.ok && voided.body.status === 'voided' && voided.body.voidedAt, 'void order should succeed');

  const auditRows = await prisma.auditLog.groupBy({ by: ['action', 'success'], _count: { _all: true } });
  const auditKey = new Set(auditRows.map((row) => `${row.action}:${row.success}`));
  for (const key of ['MERCHANT_CREATED:true', 'MERCHANT_UPDATED:true', 'MERCHANT_DISABLED:true', 'ORDER_CREATED:true', 'ORDER_VOIDED:true']) {
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

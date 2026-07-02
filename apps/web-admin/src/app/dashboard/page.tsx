
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '../../components/AdminShell';
import { RequireAuth } from '../../components/RequireAuth';
import { api } from '../../lib/api';
import { canManageUsers } from '../../lib/session';
import { formatCents, formatDateTime, moneyToCents, statusLabel } from '../../lib/format';
import type { CurrentUser, ManagedUser, Merchant, Order, Product } from '../../lib/types';

type DashboardState = {
  products: Product[];
  merchants: Merchant[];
  orders: Order[];
  users: ManagedUser[];
};

export default function DashboardPage() {
  return (
    <RequireAuth>
      {(user) => <AdminShell user={user}><DashboardContent user={user} /></AdminShell>}
    </RequireAuth>
  );
}

function DashboardContent({ user }: { user: CurrentUser }) {
  const [state, setState] = useState<DashboardState>({ products: [], merchants: [], orders: [], users: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.listProducts(),
      api.listMerchants({ page: 1, pageSize: 100 }),
      api.listOrders({ page: 1, pageSize: 100 }),
      canManageUsers(user) ? api.listUsers({ page: 1, pageSize: 100 }) : Promise.resolve({ items: [] }),
    ])
      .then(([products, merchants, orders, users]) => {
        if (!alive) return;
        setState({ products: products.items, merchants: merchants.items, orders: orders.items, users: users.items });
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : '加载首页数据失败。');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayOrders = state.orders.filter((order) => order.createdAt.slice(0, 10) === todayKey && order.status !== 'voided');
  const todayAmount = todayOrders.reduce((total, order) => total + moneyToCents(order.totalAmount), 0);
  const recentOrders = state.orders.slice(0, 6);
  const salespersonCount = state.users.filter((item) => item.role === 'salesperson').length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">后台首页</h1>
          <p className="muted">基于现有列表接口汇总基础经营数据。</p>
        </div>
      </div>
      {loading ? <p className="muted">正在加载数据...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <section className="grid">
        <div className="card"><span className="muted">商品数量</span><div className="stat-value">{state.products.length}</div></div>
        <div className="card"><span className="muted">商户数量</span><div className="stat-value">{state.merchants.length}</div></div>
        <div className="card"><span className="muted">订单数量</span><div className="stat-value">{state.orders.length}</div></div>
        <div className="card"><span className="muted">今日订单</span><div className="stat-value">{todayOrders.length}</div></div>
        <div className="card"><span className="muted">今日营业额</span><div className="stat-value">¥{formatCents(todayAmount)}</div></div>
        {canManageUsers(user) ? <div className="card"><span className="muted">用户数量</span><div className="stat-value">{state.users.length}</div></div> : null}
        {canManageUsers(user) ? <div className="card"><span className="muted">配送员数量</span><div className="stat-value">{salespersonCount}</div></div> : null}
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title">最近订单</h2>
        {recentOrders.length === 0 ? <div className="empty">暂无订单</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>订单号</th><th>商户</th><th>配送员</th><th>总金额</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.orderNo}</td>
                    <td>{order.merchant?.name ?? '-'}</td>
                    <td>{order.salesperson?.displayName ?? order.salesperson?.username ?? '-'}</td>
                    <td>¥{order.totalAmount}</td>
                    <td><span className={order.status === 'voided' ? 'badge danger' : 'badge'}>{statusLabel(order.status)}</span></td>
                    <td>{formatDateTime(order.createdAt)}</td>
                    <td><Link className="plain-button" href={`/orders/${order.id}`}>查看</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

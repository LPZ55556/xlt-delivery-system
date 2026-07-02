
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '../../components/AdminShell';
import { RequireAuth } from '../../components/RequireAuth';
import { api } from '../../lib/api';
import { canVoidOrders } from '../../lib/session';
import { formatDateTime, statusLabel } from '../../lib/format';
import type { CurrentUser, Order } from '../../lib/types';

export default function OrdersPage() {
  return (
    <RequireAuth>
      {(user) => <AdminShell user={user}><OrdersContent user={user} /></AdminShell>}
    </RequireAuth>
  );
}

function OrdersContent({ user }: { user: CurrentUser }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canVoid = canVoidOrders(user);

  const filteredOrders = useMemo(() => {
    if (status === 'all') return orders;
    return orders.filter((order) => order.status === status);
  }, [orders, status]);

  async function loadOrders() {
    setLoading(true);
    setError('');
    try {
      const result = await api.listOrders({ page: 1, pageSize: 100 });
      setOrders(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载订单失败。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  async function voidOrder(order: Order) {
    if (!window.confirm(`确认作废订单“${order.orderNo}”？`)) return;
    const reason = window.prompt('请输入作废原因（可留空）') ?? undefined;
    setError('');
    setMessage('');
    try {
      await api.voidOrder(order.id, reason);
      setMessage('订单已作废。');
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '作废订单失败。');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">订单管理</h1>
          <p className="muted">查看订单、商品快照、商户和配送员信息。订单页面不展示进价或利润。</p>
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="success">{message}</p> : null}
      <div className="toolbar">
        <select className="select" style={{ maxWidth: 180 }} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">全部状态</option>
          <option value="created">已创建</option>
          <option value="voided">已作废</option>
        </select>
        <button className="ghost-button" type="button" onClick={loadOrders}>刷新</button>
      </div>
      {loading ? <p className="muted">正在加载订单...</p> : null}
      {!loading && filteredOrders.length === 0 ? <div className="empty">暂无订单</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>订单号</th><th>商户</th><th>配送员</th><th>总金额</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td>{order.orderNo}</td>
                  <td>{order.merchant?.name ?? '-'}</td>
                  <td>{order.salesperson?.displayName ?? order.salesperson?.username ?? '-'}</td>
                  <td>¥{order.totalAmount}</td>
                  <td><span className={order.status === 'voided' ? 'badge danger' : 'badge'}>{statusLabel(order.status)}</span></td>
                  <td>{formatDateTime(order.createdAt)}</td>
                  <td className="actions">
                    <Link className="plain-button" href={`/orders/${order.id}`}>详情</Link>
                    {canVoid && order.status !== 'voided' ? <button className="plain-button" type="button" onClick={() => voidOrder(order)}>作废</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

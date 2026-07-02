
'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminShell } from '../../../components/AdminShell';
import { RequireAuth } from '../../../components/RequireAuth';
import { api } from '../../../lib/api';
import { canVoidOrders } from '../../../lib/session';
import { formatDateTime, statusLabel } from '../../../lib/format';
import type { CurrentUser, Order, Receipt } from '../../../lib/types';

export default function OrderDetailPage() {
  return (
    <RequireAuth>
      {(user) => <AdminShell user={user}><OrderDetailContent user={user} /></AdminShell>}
    </RequireAuth>
  );
}

function OrderDetailContent({ user }: { user: CurrentUser }) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [order, setOrder] = useState<Order | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canVoid = canVoidOrders(user);

  async function loadOrder() {
    setLoading(true);
    setError('');
    try {
      const result = await api.getOrder(id);
      setOrder(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载订单详情失败。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrder();
  }, [id]);

  async function voidOrder() {
    if (!order) return;
    if (!window.confirm(`确认作废订单“${order.orderNo}”？`)) return;
    const reason = window.prompt('请输入作废原因（可留空）') ?? undefined;
    setError('');
    setMessage('');
    try {
      const updated = await api.voidOrder(order.id, reason);
      setOrder(updated);
      setMessage('订单已作废。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '作废订单失败。');
    }
  }

  async function loadReceipt() {
    setReceiptLoading(true);
    setError('');
    try {
      const result = await api.getReceipt(id);
      setReceipt(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载小票数据失败。');
    } finally {
      setReceiptLoading(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">订单详情</h1>
          <p className="muted">订单明细使用下单时的商品快照，不展示进价或利润。</p>
        </div>
        <div className="actions">
          <Link className="ghost-button" href="/orders">返回列表</Link>
          <button className="ghost-button" type="button" onClick={loadReceipt} disabled={receiptLoading}>{receiptLoading ? '加载中...' : '小票预览'}</button>
          {canVoid && order && order.status !== 'voided' ? <button className="danger-button" type="button" onClick={voidOrder}>作废订单</button> : null}
        </div>
      </div>
      {loading ? <p className="muted">正在加载订单...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="success">{message}</p> : null}
      {order ? (
        <div className="split">
          <section>
            <div className="card">
              <h2 className="section-title">基本信息</h2>
              <div className="detail-list">
                <div><span className="muted">订单号</span><strong>{order.orderNo}</strong></div>
                <div><span className="muted">状态</span><span className={order.status === 'voided' ? 'badge danger' : 'badge'}>{statusLabel(order.status)}</span></div>
                <div><span className="muted">总金额</span><strong>¥{order.totalAmount}</strong></div>
                <div><span className="muted">创建时间</span><span>{formatDateTime(order.createdAt)}</span></div>
                <div><span className="muted">定位</span><span>{order.latitude && order.longitude ? `${order.latitude}, ${order.longitude}` : '未记录'}</span></div>
                <div><span className="muted">备注</span><span>{order.remark ?? '-'}</span></div>
                {order.status === 'voided' ? <div><span className="muted">作废原因</span><span>{order.voidReason ?? '-'}</span></div> : null}
              </div>
            </div>
            <div className="card" style={{ marginTop: 16 }}>
              <h2 className="section-title">商品明细</h2>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>商品名称</th><th>条码</th><th>规格</th><th>单价</th><th>数量</th><th>小计</th></tr></thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.productNameSnapshot}</td>
                        <td>{item.productBarcodeSnapshot}</td>
                        <td>{item.productSpecSnapshot ?? '-'}</td>
                        <td>¥{item.salePriceSnapshot}</td>
                        <td>{item.quantity}</td>
                        <td>¥{item.subtotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
          <aside className="side-panel">
            <h2 className="section-title">商户信息</h2>
            <div className="detail-list">
              <div><span className="muted">名称</span><strong>{order.merchant?.name ?? '-'}</strong></div>
              <div><span className="muted">联系人</span><span>{order.merchant?.contactName ?? '-'}</span></div>
              <div><span className="muted">电话</span><span>{order.merchant?.phone ?? '-'}</span></div>
              <div><span className="muted">地址</span><span>{order.merchant?.address ?? '-'}</span></div>
            </div>
            <hr />
            <h2 className="section-title">配送员</h2>
            <div className="detail-list">
              <div><span className="muted">姓名</span><strong>{order.salesperson?.displayName ?? order.salesperson?.username ?? '-'}</strong></div>
              <div><span className="muted">角色</span><span>{order.salesperson?.role ?? '-'}</span></div>
            </div>
            {receipt ? (
              <>
                <hr />
                <div className="receipt">
                  <div className="receipt-title">{receipt.storeName}</div>
                  <div className="receipt-line"><span>配送员</span><span>{receipt.salespersonName}</span></div>
                  <div className="receipt-line"><span>时间</span><span>{formatDateTime(receipt.dateTime)}</span></div>
                  <div className="receipt-line"><span>订单号</span><span>{receipt.orderNo}</span></div>
                  {receipt.items.map((item, index) => (
                    <div className="receipt-line" key={`${item.productName}-${index}`}>
                      <span>{item.productName} x {item.quantity}</span>
                      <span>¥{item.subtotal}</span>
                    </div>
                  ))}
                  <div className="receipt-line"><strong>总价</strong><strong>¥{receipt.totalAmount}</strong></div>
                </div>
              </>
            ) : null}
          </aside>
        </div>
      ) : null}
    </>
  );
}

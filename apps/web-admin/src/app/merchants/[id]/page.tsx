
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminShell } from '../../../components/AdminShell';
import { RequireAuth } from '../../../components/RequireAuth';
import { api } from '../../../lib/api';
import { formatDateTime, statusLabel } from '../../../lib/format';
import { canManageMerchants } from '../../../lib/session';
import type { CurrentUser, Merchant, Order } from '../../../lib/types';

export default function MerchantDetailPage({ params }: { params: { id: string } }) {
  return <RequireAuth>{(user) => <AdminShell user={user}><MerchantDetailContent id={params.id} user={user} /></AdminShell>}</RequireAuth>;
}

function MerchantDetailContent({ id, user }: { id: string; user: CurrentUser }) {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([api.getMerchant(id), api.listOrders({ page: 1, pageSize: 100, merchantId: id })])
      .then(([merchantResult, orderResult]) => { if (alive) { setMerchant(merchantResult); setOrders(orderResult.items); } })
      .catch((err) => setError(err instanceof Error ? err.message : '\u5546\u6237\u8be6\u60c5\u52a0\u8f7d\u5931\u8d25\u3002'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  if (loading) return <p className="muted">{'\u6b63\u5728\u52a0\u8f7d\u5546\u6237\u8be6\u60c5...'}</p>;
  if (error) return <p className="error">{error}</p>;
  if (!merchant) return <div className="empty">{'\u5546\u6237\u4e0d\u5b58\u5728'}</div>;

  return <>
    <div className="page-header"><div><h1 className="page-title">{merchant.name}</h1><p className="muted">{'\u5546\u6237\u8be6\u60c5\u548c\u8be5\u5546\u6237\u5168\u90e8\u8ba2\u5355\u3002'}</p></div><div className="actions"><Link className="ghost-button" href="/merchants">{'\u8fd4\u56de\u5546\u6237\u7ba1\u7406'}</Link>{canManageMerchants(user) ? <Link className="button" href={`/merchants?edit=${merchant.id}`}>{'\u7f16\u8f91\u5546\u6237'}</Link> : null}</div></div>
    <section className="split"><div className="card"><h2 className="section-title">{'\u57fa\u672c\u4fe1\u606f'}</h2><div className="detail-list"><div><span className="label">{'\u8054\u7cfb\u4eba'}</span><span>{merchant.contactName ?? '-'}</span></div><div><span className="label">{'\u7535\u8bdd'}</span><span>{merchant.phone ?? '-'}</span></div><div><span className="label">{'\u5730\u5740'}</span><span>{merchant.address}</span></div><div><span className="label">{'\u7247\u533a'}</span><span>{merchant.area ?? '-'}</span></div><div><span className="label">{'\u7eac\u5ea6'}</span><span>{merchant.latitude ?? '-'}</span></div><div><span className="label">{'\u7ecf\u5ea6'}</span><span>{merchant.longitude ?? '-'}</span></div><div><span className="label">{'\u5907\u6ce8'}</span><span>{merchant.remark ?? '-'}</span></div><div><span className="label">{'\u72b6\u6001'}</span><span>{merchant.isActive ? '\u542f\u7528' : '\u505c\u7528'}</span></div><div><span className="label">{'\u521b\u5efa\u65f6\u95f4'}</span><span>{formatDateTime(merchant.createdAt)}</span></div><div><span className="label">{'\u66f4\u65b0\u65f6\u95f4'}</span><span>{formatDateTime(merchant.updatedAt)}</span></div></div></div><div className="card"><h2 className="section-title">{'\u5546\u6237\u8ba2\u5355'}</h2>{orders.length === 0 ? <div className="empty">{'\u6682\u65e0\u8ba2\u5355'}</div> : <div className="table-wrap"><table><thead><tr><th>{'\u8ba2\u5355\u53f7'}</th><th>{'\u65e5\u671f'}</th><th>{'\u603b\u91d1\u989d'}</th><th>{'\u72b6\u6001'}</th><th>{'\u64cd\u4f5c'}</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td>{order.orderNo}</td><td>{formatDateTime(order.createdAt)}</td><td>{order.totalAmount} {'\u5143'}</td><td>{statusLabel(order.status)}</td><td><Link className="plain-button" href={`/orders/${order.id}`}>{'\u8be6\u60c5'}</Link></td></tr>)}</tbody></table></div>}</div></section>
  </>;
}

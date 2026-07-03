
'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '../../components/AdminShell';
import { RequireAuth } from '../../components/RequireAuth';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { BusinessOverview, CurrentUser, MerchantConsumptionRankingItem } from '../../lib/types';

type Range = 'today' | '7d' | 'month';
type MerchantRange = Range | '6m' | '1y' | 'all';

export default function ReportsPage() {
  return <RequireAuth>{(user) => <AdminShell user={user}><ReportsContent user={user} /></AdminShell>}</RequireAuth>;
}

function ReportsContent({ user }: { user: CurrentUser }) {
  const [password, setPassword] = useState('');
  const [range, setRange] = useState<Range>('today');
  const [merchantRange, setMerchantRange] = useState<MerchantRange>('today');
  const [overview, setOverview] = useState<BusinessOverview | null>(null);
  const [ranking, setRanking] = useState<MerchantConsumptionRankingItem[]>([]);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const canViewOverview = ['super_admin', 'admin', 'finance'].includes(user.role);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await api.verifyOverview(password);
      setVerified(true);
      setOverview(await api.businessOverview(range, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : '\u5b89\u5168\u5bc6\u7801\u9a8c\u8bc1\u5931\u8d25\u3002');
    }
  }

  async function reloadOverview(next: Range) {
    setRange(next);
    if (verified) setOverview(await api.businessOverview(next, password));
  }

  useEffect(() => {
    let alive = true;
    api.merchantConsumptionRanking(merchantRange).then((result) => { if (alive) setRanking(result.items); }).catch((err) => setError(err instanceof Error ? err.message : '\u5546\u6237\u699c\u5355\u52a0\u8f7d\u5931\u8d25\u3002'));
    return () => { alive = false; };
  }, [merchantRange]);

  return (
    <>
      <div className="page-header"><div><h1 className="page-title">{'\u62a5\u8868\u4e0e\u6570\u636e\u603b\u89c8'}</h1><p className="muted">{'\u666e\u901a\u5217\u8868\u4e0d\u5c55\u793a\u8fdb\u4ef7\u6216\u5229\u6da6\uff1b\u654f\u611f\u6570\u636e\u9700\u8981\u5b89\u5168\u5bc6\u7801\u9a8c\u8bc1\u3002'}</p></div></div>
      {error ? <p className="error">{error}</p> : null}
      <section className="split">
        <div className="card">
          <h2 className="section-title">{'\u6570\u636e\u603b\u89c8'}</h2>
          {!canViewOverview ? <p className="error">{'\u5f53\u524d\u89d2\u8272\u65e0\u6743\u67e5\u770b\u6570\u636e\u603b\u89c8\u3002'}</p> : <>
            <form className="form" onSubmit={verify}>
              <label className="form-row"><span className="label">{'\u8fdb\u4ef7\u67e5\u770b\u5b89\u5168\u5bc6\u7801'}</span><input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              <div className="toolbar"><select className="select" value={range} onChange={(event) => void reloadOverview(event.target.value as Range)}><option value="today">{'\u4eca\u65e5'}</option><option value="7d">{'\u8fd1 7 \u5929'}</option><option value="month">{'\u672c\u6708'}</option></select><button className="button" type="submit">{'\u9a8c\u8bc1\u5e76\u67e5\u770b'}</button></div>
            </form>
            {overview ? <div><div className="stat-grid"><div className="stat-card"><strong>{overview.totalSalesAmount} {'\u5143'}</strong><span>{'\u9500\u552e\u989d'}</span></div><div className="stat-card"><strong>{overview.totalOrders}</strong><span>{'\u8ba2\u5355\u6570'}</span></div><div className="stat-card"><strong>{overview.totalProfit} {'\u5143'}</strong><span>{'\u6bdb\u5229\u4f30\u7b97'}</span></div></div><p className="muted">{overview.profitNote}</p><h3 className="section-title">{'\u5546\u54c1\u6c47\u603b'}</h3>{overview.productSalesSummary.slice(0, 20).map((item) => <div className="list-card" key={item.productId}><strong>{item.productName}</strong><p className="muted">{'\u5206\u7c7b'}?{item.category ?? '\u672a\u5206\u7c7b'} ? {'\u6570\u91cf'} {item.quantitySold}</p><p>{'\u9500\u552e'} {item.salesAmount} {'\u5143'} ? {'\u6210\u672c'} {item.costAmount} {'\u5143'} ? {'\u6bdb\u5229'} {item.profitAmount} {'\u5143'}</p></div>)}</div> : null}
          </>}
        </div>
        <div className="card">
          <h2 className="section-title">{'\u5546\u6237\u6d88\u8d39\u699c\u5355'}</h2>
          <div className="toolbar"><select className="select" value={merchantRange} onChange={(event) => setMerchantRange(event.target.value as MerchantRange)}><option value="today">{'\u4eca\u65e5'}</option><option value="7d">{'\u8fd1 7 \u5929'}</option><option value="month">{'\u672c\u6708'}</option><option value="6m">{'\u8fd1\u534a\u5e74'}</option><option value="1y">{'\u8fd1\u4e00\u5e74'}</option><option value="all">{'\u603b\u699c'}</option></select></div>
          {ranking.length === 0 ? <div className="empty">{'\u6682\u65e0\u699c\u5355\u6570\u636e'}</div> : ranking.map((item) => <Link className="list-card link-card" href={`/merchants/${item.merchantId}`} key={item.merchantId}><strong>#{item.rank} {item.merchantName}</strong><p>{'\u8ba2\u5355'} {item.orderCount} {'\u5355'} ? {'\u6d88\u8d39'} {item.totalAmount} {'\u5143'}</p><p className="muted">{'\u6700\u8fd1\u4e0b\u5355'}?{formatDateTime(item.lastOrderAt)}</p></Link>)}
        </div>
      </section>
    </>
  );
}

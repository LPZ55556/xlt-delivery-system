
'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '../../components/AdminShell';
import { RequireAuth } from '../../components/RequireAuth';
import { api, ApiError, type MerchantInput } from '../../lib/api';
import { canManageMerchants } from '../../lib/session';
import { formatDateTime, optionalText } from '../../lib/format';
import type { CurrentUser, Merchant } from '../../lib/types';

const emptyForm = {
  name: '',
  contactName: '',
  phone: '',
  address: '',
  latitude: '',
  longitude: '',
  area: '',
  defaultSalespersonId: '',
  remark: '',
  isActive: true,
};

type MerchantForm = typeof emptyForm;

export default function MerchantsPage() {
  return (
    <RequireAuth>
      {(user) => <AdminShell user={user}><MerchantsContent user={user} /></AdminShell>}
    </RequireAuth>
  );
}

function MerchantsContent({ user }: { user: CurrentUser }) {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selected, setSelected] = useState<Merchant | null>(null);
  const [editing, setEditing] = useState<Merchant | null>(null);
  const [form, setForm] = useState<MerchantForm>(emptyForm);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canManage = canManageMerchants(user);

  async function loadMerchants(keyword = search) {
    setLoading(true);
    setError('');
    try {
      const result = await api.listMerchants({ page: 1, pageSize: 100, search: keyword.trim() || undefined });
      setMerchants(result.items);
      setSelected((current) => current ? result.items.find((item) => item.id === current.id) ?? null : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载商户失败。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMerchants('');
  }, []);

  function updateForm<K extends keyof MerchantForm>(key: K, value: MerchantForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setMessage('');
    setError('');
  }

  function startEdit(merchant: Merchant) {
    setEditing(merchant);
    setSelected(merchant);
    setForm({
      name: merchant.name,
      contactName: merchant.contactName ?? '',
      phone: merchant.phone ?? '',
      address: merchant.address,
      latitude: merchant.latitude ?? '',
      longitude: merchant.longitude ?? '',
      area: merchant.area ?? '',
      defaultSalespersonId: merchant.defaultSalespersonId ?? '',
      remark: merchant.remark ?? '',
      isActive: merchant.isActive,
    });
    setMessage('');
    setError('');
  }

  function buildPayload(formData: FormData): MerchantInput {
    return {
      name: String(formData.get('name') ?? '').trim(),
      contactName: optionalText(formData.get('contactName')),
      phone: optionalText(formData.get('phone')),
      address: String(formData.get('address') ?? '').trim(),
      latitude: optionalText(formData.get('latitude')),
      longitude: optionalText(formData.get('longitude')),
      area: optionalText(formData.get('area')),
      defaultSalespersonId: optionalText(formData.get('defaultSalespersonId')),
      remark: optionalText(formData.get('remark')),
      isActive: formData.get('isActive') === 'on',
    };
  }

  async function submitMerchant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError('');
    setMessage('');
    const payload = buildPayload(new FormData(event.currentTarget));
    if (!payload.name || !payload.address) {
      setError('商户名称和地址不能为空。');
      setSaving(false);
      return;
    }
    try {
      const saved = editing ? await api.updateMerchant(editing.id, payload) : await api.createMerchant(payload);
      setMessage(editing ? '商户已更新。' : '商户已新增。');
      setEditing(saved);
      setSelected(saved);
      await loadMerchants();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : '保存商户失败。');
    } finally {
      setSaving(false);
    }
  }

  async function disableMerchant(merchant: Merchant) {
    if (!window.confirm(`确认停用商户“${merchant.name}”？`)) return;
    setError('');
    try {
      const disabled = await api.disableMerchant(merchant.id);
      setSelected(disabled);
      setMessage('商户已停用。');
      await loadMerchants();
    } catch (err) {
      setError(err instanceof Error ? err.message : '停用商户失败。');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">商户管理</h1>
          <p className="muted">维护商户资料、地址、片区和默认配送员信息。</p>
        </div>
        {canManage ? <button className="button" type="button" onClick={startCreate}>新增商户</button> : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="success">{message}</p> : null}
      <div className="split">
        <section>
          <form className="toolbar" onSubmit={(event) => { event.preventDefault(); loadMerchants(); }}>
            <input className="input" style={{ maxWidth: 320 }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="按商户名称搜索" />
            <button className="ghost-button" type="submit">搜索</button>
            <button className="ghost-button" type="button" onClick={() => { setSearch(''); loadMerchants(''); }}>重置</button>
          </form>
          {loading ? <p className="muted">正在加载商户...</p> : null}
          {!loading && merchants.length === 0 ? <div className="empty">暂无商户</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>商户名称</th><th>联系人</th><th>电话</th><th>地址</th><th>片区</th><th>状态</th><th>操作</th></tr></thead>
                <tbody>
                  {merchants.map((merchant) => (
                    <tr key={merchant.id}>
                      <td>{merchant.name}</td>
                      <td>{merchant.contactName ?? '-'}</td>
                      <td>{merchant.phone ?? '-'}</td>
                      <td>{merchant.address}</td>
                      <td>{merchant.area ?? '-'}</td>
                      <td><span className={merchant.isActive ? 'badge' : 'badge muted'}>{merchant.isActive ? '启用' : '停用'}</span></td>
                      <td className="actions">
                        <button className="plain-button" type="button" onClick={() => setSelected(merchant)}>详情</button>
                        {canManage ? <button className="plain-button" type="button" onClick={() => startEdit(merchant)}>编辑</button> : null}
                        {canManage && merchant.isActive ? <button className="plain-button" type="button" onClick={() => disableMerchant(merchant)}>停用</button> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <aside className="side-panel">
          {canManage ? (
            <form className="form" onSubmit={submitMerchant}>
              <h2 className="section-title">{editing ? '编辑商户' : '新增商户'}</h2>
              <label className="form-row"><span className="label">商户名称</span><input className="input" name="name" value={form.name} onChange={(e) => updateForm('name', e.target.value)} /></label>
              <label className="form-row"><span className="label">联系人</span><input className="input" name="contactName" value={form.contactName} onChange={(e) => updateForm('contactName', e.target.value)} /></label>
              <label className="form-row"><span className="label">联系电话</span><input className="input" name="phone" value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} /></label>
              <label className="form-row"><span className="label">地址</span><input className="input" name="address" value={form.address} onChange={(e) => updateForm('address', e.target.value)} /></label>
              <label className="form-row"><span className="label">纬度</span><input className="input" name="latitude" value={form.latitude} onChange={(e) => updateForm('latitude', e.target.value)} /></label>
              <label className="form-row"><span className="label">经度</span><input className="input" name="longitude" value={form.longitude} onChange={(e) => updateForm('longitude', e.target.value)} /></label>
              <label className="form-row"><span className="label">片区</span><input className="input" name="area" value={form.area} onChange={(e) => updateForm('area', e.target.value)} /></label>
              <label className="form-row"><span className="label">默认配送员 ID（暂留）</span><input className="input" name="defaultSalespersonId" value={form.defaultSalespersonId} onChange={(e) => updateForm('defaultSalespersonId', e.target.value)} /></label>
              <label className="form-row"><span className="label">备注</span><textarea className="textarea" name="remark" value={form.remark} onChange={(e) => updateForm('remark', e.target.value)} /></label>
              <label className="checkbox-row"><input name="isActive" type="checkbox" checked={form.isActive} onChange={(e) => updateForm('isActive', e.target.checked)} /> 启用</label>
              <button className="button" type="submit" disabled={saving}>{saving ? '保存中...' : '保存商户'}</button>
            </form>
          ) : <p className="muted">当前角色只能查看商户信息。</p>}
          <hr />
          <h2 className="section-title">商户详情</h2>
          {selected ? (
            <div className="detail-list">
              <div><span className="muted">名称</span><strong>{selected.name}</strong></div>
              <div><span className="muted">联系人</span><span>{selected.contactName ?? '-'}</span></div>
              <div><span className="muted">电话</span><span>{selected.phone ?? '-'}</span></div>
              <div><span className="muted">地址</span><span>{selected.address}</span></div>
              <div><span className="muted">纬度</span><span>{selected.latitude ?? '-'}</span></div>
              <div><span className="muted">经度</span><span>{selected.longitude ?? '-'}</span></div>
              <div><span className="muted">片区</span><span>{selected.area ?? '-'}</span></div>
              <div><span className="muted">配送员</span><span>{selected.defaultSalespersonId ?? '暂未设置'}</span></div>
              <div><span className="muted">备注</span><span>{selected.remark ?? '-'}</span></div>
              <div><span className="muted">状态</span><span>{selected.isActive ? '启用' : '停用'}</span></div>
              <div><span className="muted">更新时间</span><span>{formatDateTime(selected.updatedAt)}</span></div>
            </div>
          ) : <p className="muted">请选择商户查看详情。</p>}
        </aside>
      </div>
    </>
  );
}

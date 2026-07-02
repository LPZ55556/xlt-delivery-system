
'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AdminShell } from '../../components/AdminShell';
import { RequireAuth } from '../../components/RequireAuth';
import { api, ApiError, type ProductInput } from '../../lib/api';
import { canManageProducts, canViewCostPrice } from '../../lib/session';
import { formatDateTime, normalizeMoneyInput, optionalNumber, optionalText } from '../../lib/format';
import type { CurrentUser, Product } from '../../lib/types';

const emptyForm = {
  name: '',
  barcode: '',
  category: '',
  spec: '',
  salePrice: '',
  costPrice: '',
  stock: '0',
  stockWarningValue: '',
  enabled: true,
};

type ProductForm = typeof emptyForm;

export default function ProductsPage() {
  return (
    <RequireAuth>
      {(user) => <AdminShell user={user}><ProductsContent user={user} /></AdminShell>}
    </RequireAuth>
  );
}

function ProductsContent({ user }: { user: CurrentUser }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [costTarget, setCostTarget] = useState<Product | null>(null);
  const [costPassword, setCostPassword] = useState('');
  const [costError, setCostError] = useState('');
  const [verifiedCosts, setVerifiedCosts] = useState<Record<string, string | null>>({});

  const canManage = canManageProducts(user);
  const canViewCost = canViewCostPrice(user);

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((item) => item.name.toLowerCase().includes(keyword) || item.barcode.toLowerCase().includes(keyword));
  }, [products, search]);

  async function loadProducts() {
    setLoading(true);
    setError('');
    try {
      const result = await api.listProducts();
      setProducts(result.items);
      setSelected((current) => current ? result.items.find((item) => item.id === current.id) ?? null : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载商品失败。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setMessage('');
    setError('');
  }

  function startEdit(product: Product) {
    setEditing(product);
    setSelected(product);
    setForm({
      name: product.name,
      barcode: product.barcode,
      category: product.category ?? '',
      spec: product.spec ?? '',
      salePrice: product.salePrice,
      costPrice: '',
      stock: String(product.stock),
      stockWarningValue: product.stockWarningValue === null ? '' : String(product.stockWarningValue),
      enabled: product.enabled,
    });
    setMessage('');
    setError('');
  }

  function updateForm<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function buildPayload(formData: FormData): ProductInput | null {
    const salePrice = normalizeMoneyInput(String(formData.get('salePrice') ?? ''));
    if (!salePrice) {
      setError('售价必须是最多两位小数的金额。');
      return null;
    }
    const rawCost = String(formData.get('costPrice') ?? '').trim();
    const costPrice = rawCost ? normalizeMoneyInput(rawCost) ?? undefined : undefined;
    if (rawCost && !costPrice) {
      setError('进价必须是最多两位小数的金额。');
      return null;
    }
    return {
      name: String(formData.get('name') ?? '').trim(),
      barcode: String(formData.get('barcode') ?? '').trim(),
      category: optionalText(formData.get('category')),
      spec: optionalText(formData.get('spec')),
      salePrice,
      costPrice,
      stock: optionalNumber(formData.get('stock')) ?? 0,
      stockWarningValue: optionalNumber(formData.get('stockWarningValue')),
      enabled: formData.get('enabled') === 'on',
    };
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError('');
    setMessage('');
    const payload = buildPayload(new FormData(event.currentTarget));
    if (!payload) {
      setSaving(false);
      return;
    }
    if (!payload.name || !payload.barcode) {
      setError('商品名称和条码不能为空。');
      setSaving(false);
      return;
    }

    try {
      const saved = editing ? await api.updateProduct(editing.id, payload) : await api.createProduct(payload);
      setMessage(editing ? '商品已更新。' : '商品已新增。');
      setEditing(saved);
      setSelected(saved);
      await loadProducts();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : '保存商品失败。');
    } finally {
      setSaving(false);
    }
  }

  async function disableProduct(product: Product) {
    if (!window.confirm(`确认停用商品“${product.name}”？`)) return;
    setError('');
    try {
      const disabled = await api.disableProduct(product.id);
      setSelected(disabled);
      setMessage('商品已停用。');
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : '停用商品失败。');
    }
  }

  async function verifyCost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!costTarget) return;
    setCostError('');
    try {
      const result = await api.verifyProductCostPrice(costTarget.id, costPassword);
      setVerifiedCosts((current) => ({ ...current, [costTarget.id]: result.costPrice }));
      setCostTarget(null);
      setCostPassword('');
    } catch (err) {
      setCostError(err instanceof Error ? err.message : '进价验证失败。');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">商品管理</h1>
          <p className="muted">维护商品资料、售价和库存信息；进价只通过安全验证单独查看。</p>
        </div>
        {canManage ? <button className="button" type="button" onClick={startCreate}>新增商品</button> : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="success">{message}</p> : null}
      <div className="split">
        <section>
          <div className="toolbar">
            <input className="input" style={{ maxWidth: 320 }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="按名称或条码搜索" />
            <button className="ghost-button" type="button" onClick={loadProducts}>刷新</button>
          </div>
          {loading ? <p className="muted">正在加载商品...</p> : null}
          {!loading && filteredProducts.length === 0 ? <div className="empty">暂无商品</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>商品名称</th><th>条码</th><th>分类</th><th>规格</th><th>售价</th><th>库存</th><th>状态</th><th>操作</th></tr></thead>
                <tbody>
                  {filteredProducts.map((product) => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td>{product.barcode}</td>
                      <td>{product.category ?? '-'}</td>
                      <td>{product.spec ?? '-'}</td>
                      <td>¥{product.salePrice}</td>
                      <td>{product.stock}</td>
                      <td><span className={product.enabled ? 'badge' : 'badge muted'}>{product.enabled ? '启用' : '停用'}</span></td>
                      <td className="actions">
                        <button className="plain-button" type="button" onClick={() => setSelected(product)}>详情</button>
                        {canManage ? <button className="plain-button" type="button" onClick={() => startEdit(product)}>编辑</button> : null}
                        {canManage && product.enabled ? <button className="plain-button" type="button" onClick={() => disableProduct(product)}>停用</button> : null}
                        {canViewCost ? <button className="plain-button" type="button" onClick={() => { setCostTarget(product); setCostError(''); }}>查看进价</button> : null}
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
            <form className="form" onSubmit={submitProduct}>
              <h2 className="section-title">{editing ? '编辑商品' : '新增商品'}</h2>
              <label className="form-row"><span className="label">商品名称</span><input className="input" name="name" value={form.name} onChange={(e) => updateForm('name', e.target.value)} /></label>
              <label className="form-row"><span className="label">条码</span><input className="input" name="barcode" value={form.barcode} onChange={(e) => updateForm('barcode', e.target.value)} /></label>
              <label className="form-row"><span className="label">分类</span><input className="input" name="category" value={form.category} onChange={(e) => updateForm('category', e.target.value)} /></label>
              <label className="form-row"><span className="label">规格</span><input className="input" name="spec" value={form.spec} onChange={(e) => updateForm('spec', e.target.value)} /></label>
              <label className="form-row"><span className="label">售价</span><input className="input" name="salePrice" value={form.salePrice} onChange={(e) => updateForm('salePrice', e.target.value)} placeholder="0.00" /></label>
              <label className="form-row"><span className="label">进价（保存用，不会在列表展示）</span><input className="input" name="costPrice" value={form.costPrice} onChange={(e) => updateForm('costPrice', e.target.value)} placeholder="留空表示不修改" /></label>
              <label className="form-row"><span className="label">库存</span><input className="input" name="stock" value={form.stock} onChange={(e) => updateForm('stock', e.target.value)} /></label>
              <label className="form-row"><span className="label">库存预警值</span><input className="input" name="stockWarningValue" value={form.stockWarningValue} onChange={(e) => updateForm('stockWarningValue', e.target.value)} /></label>
              <label className="checkbox-row"><input name="enabled" type="checkbox" checked={form.enabled} onChange={(e) => updateForm('enabled', e.target.checked)} /> 启用</label>
              <button className="button" type="submit" disabled={saving}>{saving ? '保存中...' : '保存商品'}</button>
            </form>
          ) : (
            <p className="muted">当前角色只能查看商品信息。</p>
          )}
          <hr />
          <h2 className="section-title">商品详情</h2>
          {selected ? (
            <div className="detail-list">
              <div><span className="muted">名称</span><strong>{selected.name}</strong></div>
              <div><span className="muted">条码</span><span>{selected.barcode}</span></div>
              <div><span className="muted">分类</span><span>{selected.category ?? '-'}</span></div>
              <div><span className="muted">规格</span><span>{selected.spec ?? '-'}</span></div>
              <div><span className="muted">售价</span><span>¥{selected.salePrice}</span></div>
              <div><span className="muted">库存</span><span>{selected.stock}</span></div>
              <div><span className="muted">预警值</span><span>{selected.stockWarningValue ?? '-'}</span></div>
              <div><span className="muted">状态</span><span>{selected.enabled ? '启用' : '停用'}</span></div>
              <div><span className="muted">更新时间</span><span>{formatDateTime(selected.updatedAt)}</span></div>
              {canViewCost && Object.prototype.hasOwnProperty.call(verifiedCosts, selected.id) ? <div><span className="muted">已验证进价</span><strong>{verifiedCosts[selected.id] ? `¥${verifiedCosts[selected.id]}` : '未设置'}</strong></div> : null}
            </div>
          ) : <p className="muted">请选择商品查看详情。</p>}
        </aside>
      </div>
      {costTarget ? (
        <div className="modal-backdrop">
          <form className="modal form" onSubmit={verifyCost}>
            <h2 className="section-title">查看进价</h2>
            <p className="muted">请输入进价查看安全密码。验证结果和失败尝试由后端写入审计日志。</p>
            <input className="input" type="password" value={costPassword} onChange={(event) => setCostPassword(event.target.value)} autoComplete="current-password" />
            {costError ? <p className="error">{costError}</p> : null}
            <div className="actions">
              <button className="button" type="submit">确认查看</button>
              <button className="ghost-button" type="button" onClick={() => setCostTarget(null)}>取消</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

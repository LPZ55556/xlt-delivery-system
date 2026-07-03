'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '../../components/AdminShell';
import { RequireAuth } from '../../components/RequireAuth';
import { ApiError, api } from '../../lib/api';

type FormState = {
  currentPassword: string;
  newCostPricePassword: string;
  newCostPricePasswordConfirm: string;
};
type ReceiptForm = { title: string; paperWidthMm: string; footerText: string; showMerchantName: boolean; showOrderNo: boolean; showSalesperson: boolean; showPrintTime: boolean };

const initialForm: FormState = { currentPassword: '', newCostPricePassword: '', newCostPricePasswordConfirm: '' };
const initialReceiptForm: ReceiptForm = { title: '\u9500\u552e\u5355', paperWidthMm: '72', footerText: '\u8c22\u8c22\u60e0\u987e', showMerchantName: true, showOrderNo: true, showSalesperson: true, showPrintTime: true };

export default function SettingsPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [receiptForm, setReceiptForm] = useState<ReceiptForm>(initialReceiptForm);
  const [receiptMessage, setReceiptMessage] = useState('');

  useEffect(() => { api.getReceiptTemplate().then((setting) => setReceiptForm({ title: setting.title, paperWidthMm: String(setting.paperWidthMm), footerText: setting.footerText, showMerchantName: setting.showMerchantName, showOrderNo: setting.showOrderNo, showSalesperson: setting.showSalesperson, showPrintTime: setting.showPrintTime })).catch(() => undefined); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!form.currentPassword) {
      setError('请输入当前登录密码。');
      return;
    }
    if (!form.newCostPricePassword || form.newCostPricePassword.length < 8) {
      setError('新的进价查看安全密码至少 8 位。');
      return;
    }
    if (form.newCostPricePassword !== form.newCostPricePasswordConfirm) {
      setError('两次输入的新安全密码不一致。');
      return;
    }

    setSubmitting(true);
    try {
      await api.resetCostPricePassword(form);
      setForm(initialForm);
      setSuccess('进价查看安全密码已重置。App 和 Web 的数据总览、进价查看将使用新密码。');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '重置失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }


  async function submitReceiptTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setReceiptMessage('');
    try {
      await api.updateReceiptTemplate({ ...receiptForm, paperWidthMm: Number(receiptForm.paperWidthMm) });
      setReceiptMessage('\u5c0f\u7968\u6a21\u677f\u5df2\u4fdd\u5b58\u3002');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '\u4fdd\u5b58\u5c0f\u7968\u6a21\u677f\u5931\u8d25\u3002');
    }
  }

  return (
    <RequireAuth>
      {(user) => {
        const canResetCostPricePassword = user.role === 'super_admin';

        return (
          <AdminShell user={user}>
            <div className="page-header">
              <div>
                <h1 className="page-title">系统设置</h1>
                <p className="muted">管理进价查看安全密码、审计日志和系统安全策略。</p>
              </div>
            </div>

            <section className="split">
              <div className="card">
                <h2 className="section-title">重置进价查看安全密码</h2>
                <p className="muted">
                  安全密码用于查看商品进价和数据总览中的利润、成本等敏感数据。系统只保存 hash，不保存明文密码。
                </p>
                {!canResetCostPricePassword ? (
                  <div className="error">只有超级管理员可以重置进价查看安全密码。</div>
                ) : (
                  <form className="form" onSubmit={submit}>
                    <label className="form-row">
                      <span className="label">当前登录密码</span>
                      <input
                        className="input"
                        type="password"
                        value={form.currentPassword}
                        onChange={(event) => setForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                        autoComplete="current-password"
                      />
                    </label>
                    <label className="form-row">
                      <span className="label">新的进价查看安全密码</span>
                      <input
                        className="input"
                        type="password"
                        value={form.newCostPricePassword}
                        onChange={(event) => setForm((prev) => ({ ...prev, newCostPricePassword: event.target.value }))}
                        autoComplete="new-password"
                      />
                    </label>
                    <label className="form-row">
                      <span className="label">确认新的进价查看安全密码</span>
                      <input
                        className="input"
                        type="password"
                        value={form.newCostPricePasswordConfirm}
                        onChange={(event) => setForm((prev) => ({ ...prev, newCostPricePasswordConfirm: event.target.value }))}
                        autoComplete="new-password"
                      />
                    </label>
                    {error ? <div className="error">{error}</div> : null}
                    {success ? <div className="success">{success}</div> : null}
                    <div className="actions">
                      <button className="button" type="submit" disabled={submitting}>
                        {submitting ? '正在重置...' : '重置安全密码'}
                      </button>
                    </div>
                  </form>
                )}
              </div>



              <div className="card">
                <h2 className="section-title">{'\u5c0f\u7968\u6a21\u677f\u8bbe\u7f6e'}</h2>
                <p className="muted">{'\u8bbe\u7f6e App \u5c0f\u7968\u9884\u89c8\u548c\u84dd\u7259\u6253\u5370\u4f7f\u7528\u7684\u9ed8\u8ba4\u6807\u9898\u3001\u7eb8\u5bbd\u548c\u5e95\u90e8\u6587\u5b57\u3002\u6253\u5370\u673a\u8fde\u63a5\u4ecd\u5728 App \u5c0f\u7968\u7ba1\u7406\u4e2d\u5b8c\u6210\u3002'}</p>
                <form className="form" onSubmit={submitReceiptTemplate}>
                  <label className="form-row"><span className="label">{'\u5c0f\u7968\u6807\u9898'}</span><input className="input" value={receiptForm.title} onChange={(event) => setReceiptForm((prev) => ({ ...prev, title: event.target.value }))} /></label>
                  <label className="form-row"><span className="label">{'\u7eb8\u5bbd\uff08\u6beb\u7c73\uff09'}</span><input className="input" type="number" min="40" max="120" value={receiptForm.paperWidthMm} onChange={(event) => setReceiptForm((prev) => ({ ...prev, paperWidthMm: event.target.value }))} /></label>
                  <label className="form-row"><span className="label">{'\u5e95\u90e8\u6587\u5b57'}</span><input className="input" value={receiptForm.footerText} onChange={(event) => setReceiptForm((prev) => ({ ...prev, footerText: event.target.value }))} /></label>
                  <label className="checkbox-row"><input type="checkbox" checked={receiptForm.showMerchantName} onChange={(event) => setReceiptForm((prev) => ({ ...prev, showMerchantName: event.target.checked }))} /> {'\u663e\u793a\u6253\u5370\u65f6\u95f4'}</label>
                  <label className="checkbox-row"><input type="checkbox" checked={receiptForm.showOrderNo} onChange={(event) => setReceiptForm((prev) => ({ ...prev, showOrderNo: event.target.checked }))} /> {'\u663e\u793a\u914d\u9001\u5458'}</label>
                  <label className="checkbox-row"><input type="checkbox" checked={receiptForm.showSalesperson} onChange={(event) => setReceiptForm((prev) => ({ ...prev, showSalesperson: event.target.checked }))} /> {'\u663e\u793a\u914d\u9001\u5458'}</label>
                  <label className="checkbox-row"><input type="checkbox" checked={receiptForm.showPrintTime} onChange={(event) => setReceiptForm((prev) => ({ ...prev, showPrintTime: event.target.checked }))} /> {'\u663e\u793a\u6253\u5370\u65f6\u95f4'}</label>
                  {receiptMessage ? <div className="success">{receiptMessage}</div> : null}
                  <button className="button" type="submit">{'\u4fdd\u5b58\u5c0f\u7968\u6a21\u677f'}</button>
                </form>
                <div className="receipt-preview">
                  <strong>{receiptForm.title || '\u9500\u552e\u5355'}</strong>
                  <p className="muted">{'\u793a\u4f8b\u5546\u6237 ? \u8ba2\u5355 TEST ? \u914d\u9001\u5458'}</p>
                  <p>{'\u5546\u54c1\u540d\u79f0?\u5355\u4ef7?\u6570\u91cf?\u5408\u8ba1'}</p>
                  <p>{'\u6d4b\u8bd5\u5546\u54c1?1.00?1?1.00'}</p>
                  <p>{'\u603b\u8ba1\uff1a1.00 \u5143'}</p>
                  <p className="muted">{receiptForm.footerText}</p>
                </div>
              </div>

              <aside className="side-panel">
                <h2 className="section-title">安全规则</h2>
                <div className="detail-list">
                  <div><span className="label">操作权限</span><span>仅超级管理员</span></div>
                  <div><span className="label">二次校验</span><span>必须输入当前登录密码</span></div>
                  <div><span className="label">存储方式</span><span>仅保存 bcrypt hash</span></div>
                  <div><span className="label">审计日志</span><span>成功和失败都会记录</span></div>
                </div>
              </aside>
            </section>
          </AdminShell>
        );
      }}
    </RequireAuth>
  );
}

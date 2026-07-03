'use client';

import { FormEvent, useState } from 'react';
import { AdminShell } from '../../components/AdminShell';
import { RequireAuth } from '../../components/RequireAuth';
import { ApiError, api } from '../../lib/api';

type FormState = {
  currentPassword: string;
  newCostPricePassword: string;
  newCostPricePasswordConfirm: string;
};

const initialForm: FormState = { currentPassword: '', newCostPricePassword: '', newCostPricePasswordConfirm: '' };

export default function SettingsPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

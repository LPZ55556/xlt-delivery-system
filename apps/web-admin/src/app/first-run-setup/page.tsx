
'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/session';

export default function FirstRunSetupPage() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getFirstRunStatus()
      .then((status) => {
        if (!alive) return;
        if (!status.setupAvailable) router.replace(getAccessToken() ? '/dashboard' : '/login');
      })
      .catch((error) => {
        if (alive) setMessage(error instanceof Error ? error.message : '无法读取初始化状态。');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    setSuccess('');
    const formData = new FormData(event.currentTarget);
    const payload = {
      adminUsername: String(formData.get('adminUsername') ?? '').trim(),
      adminPassword: String(formData.get('adminPassword') ?? ''),
      adminPasswordConfirm: String(formData.get('adminPasswordConfirm') ?? ''),
      costPricePassword: String(formData.get('costPricePassword') ?? ''),
      costPricePasswordConfirm: String(formData.get('costPricePasswordConfirm') ?? ''),
    };

    if (!payload.adminUsername) setMessage('管理员账号不能为空。');
    else if (!payload.adminPassword) setMessage('管理员密码不能为空。');
    else if (payload.adminPassword !== payload.adminPasswordConfirm) setMessage('两次管理员密码不一致。');
    else if (!payload.costPricePassword) setMessage('进价查看安全密码不能为空。');
    else if (payload.costPricePassword !== payload.costPricePasswordConfirm) setMessage('两次进价查看安全密码不一致。');

    if (!payload.adminUsername || !payload.adminPassword || payload.adminPassword !== payload.adminPasswordConfirm || !payload.costPricePassword || payload.costPricePassword !== payload.costPricePasswordConfirm) {
      setSubmitting(false);
      return;
    }

    try {
      await api.firstRunSetup(payload);
      setSuccess('初始化完成，请登录。');
      window.setTimeout(() => router.replace('/login'), 700);
    } catch (error) {
      setMessage(error instanceof ApiError || error instanceof Error ? error.message : '初始化失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="auth-page"><section className="auth-card"><p className="muted">正在读取初始化状态...</p></section></main>;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1 className="page-title">首次初始化</h1>
        <p className="muted">设置超级管理员账号和进价查看安全密码。密码只提交给后端保存 hash，前端不保存明文。</p>
        <form className="form" onSubmit={handleSubmit}>
          <label className="form-row"><span className="label">管理员账号</span><input className="input" name="adminUsername" autoComplete="username" /></label>
          <label className="form-row"><span className="label">管理员密码</span><input className="input" name="adminPassword" type="password" autoComplete="new-password" /></label>
          <label className="form-row"><span className="label">确认管理员密码</span><input className="input" name="adminPasswordConfirm" type="password" autoComplete="new-password" /></label>
          <label className="form-row"><span className="label">进价查看安全密码</span><input className="input" name="costPricePassword" type="password" autoComplete="new-password" /></label>
          <label className="form-row"><span className="label">确认进价查看安全密码</span><input className="input" name="costPricePasswordConfirm" type="password" autoComplete="new-password" /></label>
          <button className="button" type="submit" disabled={submitting}>{submitting ? '提交中...' : '完成初始化'}</button>
          {message ? <p className="error">{message}</p> : null}
          {success ? <p className="success">{success}</p> : null}
        </form>
      </section>
    </main>
  );
}

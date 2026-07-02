
'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '../../lib/api';
import { getAccessToken, saveSession } from '../../lib/session';

export default function LoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (getAccessToken()) router.replace('/dashboard');
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get('username') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    if (!username || !password) {
      setMessage('请输入账号和密码。');
      setSubmitting(false);
      return;
    }

    try {
      const result = await api.login({ username, password });
      saveSession(result.accessToken, result.user);
      router.replace('/dashboard');
    } catch (error) {
      setMessage(error instanceof ApiError || error instanceof Error ? error.message : '登录失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1 className="page-title">小灵通管理后台</h1>
        <p className="muted">请输入账号和密码登录。</p>
        <form className="form" onSubmit={handleSubmit}>
          <label className="form-row">
            <span className="label">账号</span>
            <input className="input" name="username" autoComplete="username" />
          </label>
          <label className="form-row">
            <span className="label">密码</span>
            <input className="input" name="password" type="password" autoComplete="current-password" />
          </label>
          <button className="button" type="submit" disabled={submitting}>{submitting ? '登录中...' : '登录'}</button>
          {message ? <p className="error">{message}</p> : null}
        </form>
      </section>
    </main>
  );
}

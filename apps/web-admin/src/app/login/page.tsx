"use client";

import { FormEvent, useState } from 'react';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3000';

export default function LoginPage() {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    const formData = new FormData(event.currentTarget);
    const payload = {
      username: String(formData.get('username') ?? ''),
      password: String(formData.get('password') ?? ''),
    };

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '登录失败');
      window.localStorage.setItem('xlt_access_token', result.accessToken);
      setMessage('登录成功');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="main">
      <h1 className="page-title">登录</h1>
      <p className="muted">管理员登录页面，当前阶段接入基础账号密码登录。</p>
      <form className="form" onSubmit={handleSubmit}>
        <input className="input" name="username" placeholder="账号" autoComplete="username" />
        <input className="input" name="password" placeholder="密码" type="password" autoComplete="current-password" />
        <button className="button" type="submit" disabled={submitting}>{submitting ? '登录中' : '登录'}</button>
        {message ? <p className="muted">{message}</p> : null}
      </form>
    </main>
  );
}

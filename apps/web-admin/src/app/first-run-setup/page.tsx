"use client";

import { FormEvent, useState } from 'react';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3000';

export default function FirstRunSetupPage() {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    const formData = new FormData(event.currentTarget);
    const payload = {
      adminUsername: String(formData.get('adminUsername') ?? ''),
      adminPassword: String(formData.get('adminPassword') ?? ''),
      adminPasswordConfirm: String(formData.get('adminPasswordConfirm') ?? ''),
      costPricePassword: String(formData.get('costPricePassword') ?? ''),
      costPricePasswordConfirm: String(formData.get('costPricePasswordConfirm') ?? ''),
    };

    try {
      const response = await fetch(`${apiBaseUrl}/api/first-run-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '初始化失败');
      setMessage('初始化完成');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '初始化失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="main">
      <h1 className="page-title">首次初始化</h1>
      <p className="muted">如果系统中不存在管理员账号，后续会进入此流程。</p>
      <form className="form" onSubmit={handleSubmit}>
        <input className="input" name="adminUsername" placeholder="管理员账号" autoComplete="username" />
        <input className="input" name="adminPassword" placeholder="管理员密码" type="password" autoComplete="new-password" />
        <input className="input" name="adminPasswordConfirm" placeholder="确认管理员密码" type="password" autoComplete="new-password" />
        <input className="input" name="costPricePassword" placeholder="进价查看安全密码" type="password" autoComplete="new-password" />
        <input className="input" name="costPricePasswordConfirm" placeholder="确认进价查看安全密码" type="password" autoComplete="new-password" />
        <button className="button" type="submit" disabled={submitting}>{submitting ? '提交中' : '完成初始化'}</button>
        {message ? <p className="muted">{message}</p> : null}
      </form>
    </main>
  );
}

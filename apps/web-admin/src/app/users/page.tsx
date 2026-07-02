
'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AdminShell } from '../../components/AdminShell';
import { RequireAuth } from '../../components/RequireAuth';
import { api, ApiError, type UserInput } from '../../lib/api';
import { canManageTargetUser, canManageUsers } from '../../lib/session';
import { formatDateTime, optionalText } from '../../lib/format';
import type { CurrentUser, ManagedUser } from '../../lib/types';

const roleOptions = [
  ['super_admin', '超级管理员'],
  ['admin', '管理员'],
  ['finance', '财务'],
  ['warehouse', '仓库'],
  ['salesperson', '配送员'],
];

const roleLabels = Object.fromEntries(roleOptions);

const emptyForm = { username: '', name: '', phone: '', role: 'salesperson', password: '', passwordConfirm: '' };
const emptyPasswordForm = { newPassword: '', confirmPassword: '' };

type UserForm = typeof emptyForm;

export default function UsersPage() {
  return (
    <RequireAuth>
      {(user) => <AdminShell user={user}><UsersContent user={user} /></AdminShell>}
    </RequireAuth>
  );
}

function UsersContent({ user }: { user: CurrentUser }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const allowedRoleOptions = useMemo(() => user.role === 'super_admin' ? roleOptions : roleOptions.filter(([role]) => role !== 'super_admin' && role !== 'admin'), [user.role]);

  const canManage = canManageUsers(user);

  async function loadUsers() {
    if (!canManage) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.listUsers({
        page: 1,
        pageSize: 100,
        search: search.trim() || undefined,
        role: roleFilter || undefined,
        isActive: activeFilter ? activeFilter === 'true' : undefined,
      });
      setUsers(result.items);
      setSelected((current) => current ? result.items.find((item) => item.id === current.id) ?? null : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载用户失败。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function startCreate() {
    setEditing(null);
    setForm({ ...emptyForm, role: user.role === 'super_admin' ? 'salesperson' : 'salesperson' });
    setMessage('');
    setError('');
  }

  function startEdit(target: ManagedUser) {
    setEditing(target);
    setSelected(target);
    setForm({
      username: target.username,
      name: target.name,
      phone: target.phone ?? '',
      role: target.role,
      password: '',
      passwordConfirm: '',
    });
    setMessage('');
    setError('');
  }

  function canOperateTarget(target: ManagedUser) {
    return canManageTargetUser(user, target.role);
  }

  function buildPayload(formData: FormData): UserInput | null {
    const password = String(formData.get('password') ?? '');
    const passwordConfirm = String(formData.get('passwordConfirm') ?? '');
    if (!editing && !password) {
      setError('初始密码不能为空。');
      return null;
    }
    if (!editing && password !== passwordConfirm) {
      setError('两次初始密码不一致。');
      return null;
    }
    return {
      username: editing ? undefined : String(formData.get('username') ?? '').trim(),
      name: String(formData.get('name') ?? '').trim(),
      phone: optionalText(formData.get('phone')),
      role: String(formData.get('role') ?? ''),
      password: editing ? undefined : password,
    };
  }

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    const payload = buildPayload(new FormData(event.currentTarget));
    if (!payload) {
      setSaving(false);
      return;
    }
    if (!payload.name || !payload.role || (!editing && !payload.username)) {
      setError('用户名、姓名和角色不能为空。');
      setSaving(false);
      return;
    }
    if (editing && user.id === editing.id && payload.role !== editing.role) {
      setError('不能修改自己的角色。');
      setSaving(false);
      return;
    }

    try {
      const saved = editing
        ? await api.updateUser(editing.id, { name: payload.name, phone: payload.phone, role: payload.role })
        : await api.createUser(payload);
      setMessage(editing ? '用户已更新。' : '用户已创建。');
      setEditing(saved);
      setSelected(saved);
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : '保存用户失败。');
    } finally {
      setSaving(false);
    }
  }

  async function changeEnabled(target: ManagedUser, enabled: boolean) {
    const action = enabled ? '启用' : '禁用';
    if (!window.confirm(`确认${action}用户“${target.username}”？`)) return;
    setError('');
    setMessage('');
    try {
      const updated = enabled ? await api.enableUser(target.id) : await api.disableUser(target.id);
      setSelected(updated);
      setMessage(`用户已${action}。`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action}用户失败。`);
    }
  }

  async function submitResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetTarget) return;
    setError('');
    setMessage('');
    const formData = new FormData(event.currentTarget);
    const newPassword = String(formData.get('newPassword') ?? '');
    const confirmPassword = String(formData.get('confirmPassword') ?? '');
    if (!newPassword) {
      setError('新密码不能为空。');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次新密码不一致。');
      return;
    }
    try {
      await api.resetUserPassword(resetTarget.id, newPassword);
      setResetTarget(null);
      setPasswordForm(emptyPasswordForm);
      setMessage('密码已重置。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置密码失败。');
    }
  }

  if (!canManage) {
    return (
      <>
        <h1 className="page-title">用户管理</h1>
        <p className="error">当前角色无权管理用户。</p>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">用户管理</h1>
          <p className="muted">创建后台账号和配送员账号，用于后续 App 登录与开单测试。</p>
        </div>
        <button className="button" type="button" onClick={startCreate}>新增用户</button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="success">{message}</p> : null}
      <div className="split">
        <section>
          <form className="toolbar" onSubmit={(event) => { event.preventDefault(); loadUsers(); }}>
            <input className="input" style={{ maxWidth: 260 }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="按用户名、姓名或手机号搜索" />
            <select className="select" style={{ maxWidth: 170 }} value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="">全部角色</option>
              {roleOptions.map(([role, label]) => <option key={role} value={role}>{label}</option>)}
            </select>
            <select className="select" style={{ maxWidth: 150 }} value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}>
              <option value="">全部状态</option>
              <option value="true">启用</option>
              <option value="false">禁用</option>
            </select>
            <button className="ghost-button" type="submit">筛选</button>
            <button className="ghost-button" type="button" onClick={() => { setSearch(''); setRoleFilter(''); setActiveFilter(''); }}>清空</button>
          </form>
          {loading ? <p className="muted">正在加载用户...</p> : null}
          {!loading && users.length === 0 ? <div className="empty">暂无用户</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>用户名</th><th>姓名</th><th>手机号</th><th>角色</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
                <tbody>
                  {users.map((target) => (
                    <tr key={target.id}>
                      <td>{target.username}</td>
                      <td>{target.name}</td>
                      <td>{target.phone ?? '-'}</td>
                      <td>{roleLabels[target.role] ?? target.role}</td>
                      <td><span className={target.isActive ? 'badge' : 'badge danger'}>{target.isActive ? '启用' : '禁用'}</span></td>
                      <td>{formatDateTime(target.createdAt)}</td>
                      <td className="actions">
                        <button className="plain-button" type="button" onClick={() => setSelected(target)}>详情</button>
                        {canOperateTarget(target) ? <button className="plain-button" type="button" onClick={() => startEdit(target)}>编辑</button> : null}
                        {canOperateTarget(target) ? <button className="plain-button" type="button" onClick={() => setResetTarget(target)}>重置密码</button> : null}
                        {canOperateTarget(target) && target.id !== user.id && target.isActive ? <button className="plain-button" type="button" onClick={() => changeEnabled(target, false)}>禁用</button> : null}
                        {canOperateTarget(target) && !target.isActive ? <button className="plain-button" type="button" onClick={() => changeEnabled(target, true)}>启用</button> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <aside className="side-panel">
          <form className="form" onSubmit={submitUser}>
            <h2 className="section-title">{editing ? '编辑用户' : '新增用户'}</h2>
            {!editing ? <label className="form-row"><span className="label">用户名</span><input className="input" name="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label> : <p className="muted">用户名：{editing.username}</p>}
            <label className="form-row"><span className="label">姓名</span><input className="input" name="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label className="form-row"><span className="label">手机号</span><input className="input" name="phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
            <label className="form-row"><span className="label">角色</span><select className="select" name="role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} disabled={Boolean(editing && user.id === editing.id)}>{allowedRoleOptions.map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
            {!editing ? (
              <>
                <label className="form-row"><span className="label">初始密码</span><input className="input" name="password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" /></label>
                <label className="form-row"><span className="label">确认初始密码</span><input className="input" name="passwordConfirm" type="password" value={form.passwordConfirm} onChange={(event) => setForm({ ...form, passwordConfirm: event.target.value })} autoComplete="new-password" /></label>
              </>
            ) : null}
            <button className="button" type="submit" disabled={saving}>{saving ? '保存中...' : '保存用户'}</button>
          </form>
          <hr />
          <h2 className="section-title">用户详情</h2>
          {selected ? (
            <div className="detail-list">
              <div><span className="muted">用户名</span><strong>{selected.username}</strong></div>
              <div><span className="muted">姓名</span><span>{selected.name}</span></div>
              <div><span className="muted">手机号</span><span>{selected.phone ?? '-'}</span></div>
              <div><span className="muted">角色</span><span>{roleLabels[selected.role] ?? selected.role}</span></div>
              <div><span className="muted">状态</span><span>{selected.isActive ? '启用' : '禁用'}</span></div>
              <div><span className="muted">更新时间</span><span>{formatDateTime(selected.updatedAt)}</span></div>
            </div>
          ) : <p className="muted">请选择用户查看详情。</p>}
        </aside>
      </div>
      {resetTarget ? (
        <div className="modal-backdrop">
          <form className="modal form" onSubmit={submitResetPassword}>
            <h2 className="section-title">重置密码</h2>
            <p className="muted">为用户“{resetTarget.username}”设置新密码。密码不会在前端保存，后端只保存 hash。</p>
            <label className="form-row"><span className="label">新密码</span><input className="input" name="newPassword" type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} autoComplete="new-password" /></label>
            <label className="form-row"><span className="label">确认新密码</span><input className="input" name="confirmPassword" type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} autoComplete="new-password" /></label>
            <div className="actions">
              <button className="button" type="submit">确认重置</button>
              <button className="ghost-button" type="button" onClick={() => setResetTarget(null)}>取消</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

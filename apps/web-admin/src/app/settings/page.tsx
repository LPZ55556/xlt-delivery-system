
'use client';

import { AdminShell } from '../../components/AdminShell';
import { RequireAuth } from '../../components/RequireAuth';

export default function SettingsPage() {
  return (
    <RequireAuth>
      {(user) => (
        <AdminShell user={user}>
          <div className="page-header">
            <div>
              <h1 className="page-title">系统设置</h1>
              <p className="muted">当前阶段保留设置入口，后续接入用户权限、进价安全密码轮换和审计日志查询。</p>
            </div>
          </div>
          <section className="grid">
            <div className="card">用户与角色管理待接入</div>
            <div className="card">安全设置待接入</div>
            <div className="card">审计日志查询待接入</div>
          </section>
        </AdminShell>
      )}
    </RequireAuth>
  );
}

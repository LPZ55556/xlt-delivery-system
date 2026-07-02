
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { canManageUsers, clearSession } from '../lib/session';
import type { CurrentUser } from '../lib/types';

const baseNavItems = [
  ['首页', '/dashboard'],
  ['商品管理', '/products'],
  ['商户管理', '/merchants'],
  ['订单管理', '/orders'],
];

const roleLabels: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  finance: '财务',
  warehouse: '仓库',
  salesperson: '配送员',
};

export function AdminShell({ children, user }: { children: React.ReactNode; user: CurrentUser }) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = canManageUsers(user)
    ? [...baseNavItems, ['用户管理', '/users'], ['系统设置', '/settings']]
    : [...baseNavItems, ['系统设置', '/settings']];

  function logout() {
    clearSession();
    router.replace('/login');
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">小灵通管理后台</div>
        <nav className="nav" aria-label="后台导航">
          {navItems.map(([label, href]) => (
            <Link className={pathname === href || pathname.startsWith(`${href}/`) ? 'active' : ''} key={href} href={href}>{label}</Link>
          ))}
        </nav>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <strong>{user.name || user.displayName || user.username}</strong>
            <span className="role-pill">{roleLabels[user.role] ?? user.role}</span>
          </div>
          <button className="ghost-button" type="button" onClick={logout}>退出登录</button>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}

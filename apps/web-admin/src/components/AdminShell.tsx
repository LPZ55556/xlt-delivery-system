import Link from 'next/link';

const navItems = [
  ['首页', '/dashboard'],
  ['商品管理', '/products'],
  ['商户管理', '/merchants'],
  ['订单管理', '/orders'],
  ['轨迹管理', '/locations'],
  ['报表', '/reports'],
  ['系统设置', '/settings'],
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">小灵通管理后台</div>
        <nav className="nav">
          {navItems.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

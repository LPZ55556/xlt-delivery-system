import Link from 'next/link';

const navItems = [
  ['??', '/dashboard'], ['????', '/products'], ['????', '/merchants'], ['????', '/orders'],
  ['????', '/locations'], ['??', '/reports'], ['????', '/settings'],
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="shell"><aside className="sidebar"><div className="brand">???????</div><nav className="nav">{navItems.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav></aside><main className="main">{children}</main></div>;
}

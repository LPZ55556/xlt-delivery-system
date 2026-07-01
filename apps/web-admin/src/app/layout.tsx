import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '小灵通管理后台',
  description: '智慧配送解决方案 Web 管理后台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

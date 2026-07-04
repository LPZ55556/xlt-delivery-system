import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '源源食品管理后台',
  description: '源源食品 Web 管理后台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

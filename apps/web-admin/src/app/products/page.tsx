import { PlaceholderPage } from '../../components/PlaceholderPage';

export default function Page() {
  return <PlaceholderPage title="商品管理" description="商品资料、售价、进价权限和库存信息的页面占位。" items={['商品列表', '扫码录入', '价格管理', '库存调整']} />;
}

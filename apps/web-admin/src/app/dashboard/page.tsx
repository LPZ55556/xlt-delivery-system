import { PlaceholderPage } from '../../components/PlaceholderPage';

export default function Page() {
  return <PlaceholderPage title="后台首页" description="系统概览占位，后续展示营业额、订单、商户和库存预警。" items={['今日营业额', '今日订单数', '已配送商户', '库存预警']} />;
}

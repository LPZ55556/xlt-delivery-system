export function moneyToCents(value: string) {
  const [yuan = '0', fraction = ''] = value.split('.');
  const cents = `${fraction}00`.slice(0, 2);
  return Number(yuan) * 100 + Number(cents);
}

export function formatCents(value: number) {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const yuan = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, '0');
  return `${sign}${yuan}.${cents}`;
}

export function multiplyMoney(value: string, quantity: number) {
  return formatCents(moneyToCents(value) * quantity);
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = { created: '已创建', voided: '已作废', printed: '已打印', synced: '已同步' };
  return labels[status] ?? status;
}

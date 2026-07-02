export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = { created: '已创建', voided: '已作废' };
  return labels[status] ?? status;
}

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

export function normalizeMoneyInput(value: string) {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  const [yuan, fraction = ''] = trimmed.split('.');
  return `${yuan}.${`${fraction}00`.slice(0, 2)}`;
}

export function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim();
  return text || undefined;
}

export function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

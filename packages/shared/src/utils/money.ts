export type MoneyAmount = {
  /** Decimal string, for example "12.50". Do not use float arithmetic for money. */
  value: string;
  currency: 'CNY';
};

export function createMoney(value: string, currency: MoneyAmount['currency'] = 'CNY'): MoneyAmount {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error('Money value must be a decimal string with up to 2 fraction digits.');
  }
  return { value, currency };
}

export function moneyToMinorUnits(amount: MoneyAmount): bigint {
  const [yuan, fen = ''] = amount.value.split('.');
  const normalizedFen = fen.padEnd(2, '0');
  return BigInt(yuan) * 100n + BigInt(normalizedFen);
}

export function minorUnitsToMoney(value: bigint, currency: MoneyAmount['currency'] = 'CNY'): MoneyAmount {
  const yuan = value / 100n;
  const fen = (value % 100n).toString().padStart(2, '0');
  return { value: `${yuan}.${fen}`, currency };
}

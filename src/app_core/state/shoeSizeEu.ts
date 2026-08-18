export function normalizeShoeSizeEu(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 30 || value > 55) return null;
  return Math.round(value * 2) / 2;
}

export function parseShoeSizeEuInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  return normalizeShoeSizeEu(Number(normalized));
}

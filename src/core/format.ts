export interface CurrencyFormatOptions {
  locale?: string;
  currency?: string;
}

/**
 * Formato monetario equivalente al `PrecioPipe` auditado:
 * `Intl.NumberFormat(locale, { style: 'currency', currency })` con 2 decimales
 * solo si el número tiene decimales reales.
 */
export function formatCurrency(value: number, opts: CurrencyFormatOptions = {}): string {
  const locale = opts.locale ?? 'es-PE';
  const currency = opts.currency ?? 'PEN';
  const amount = Number.isFinite(value) ? value : 0;
  const hasDecimals = Math.abs(amount % 1) > 1e-9;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(amount);
}

/** Redondeo a 2 decimales para evitar deriva de punto flotante en los totales. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** `''` / `null` / `undefined` / `NaN` → 0 (misma semántica que el selector auditado). */
export function toPrice(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

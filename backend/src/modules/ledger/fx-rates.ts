import type { CurrencyCode } from '../../types/domain.js';

/**
 * ISO-4217 minor units per 1 major currency unit.
 * INR, THB, AED, EUR, USD have 100 minor units (paise/cents/fils/satang).
 * VND and JPY are zero-decimal currencies (1 minor unit = 1 major unit).
 */
export const MINOR_UNITS_PER_MAJOR: Record<CurrencyCode, number> = {
  INR: 100,
  THB: 100,
  VND: 1,
  AED: 100,
  JPY: 1,
  EUR: 100,
  USD: 100,
};

/**
 * Deterministic INR anchor rates (1 major unit of foreign currency -> INR major).
 * Used offline and in deterministic tests; can be overridden per-expense via `fxRateOverride`.
 */
export const DEFAULT_FX_TO_INR: Record<CurrencyCode, number> = {
  INR: 1.0,
  THB: 2.52,
  VND: 0.0034,
  AED: 23.15,
  JPY: 0.56,
  EUR: 92.4,
  USD: 85.1,
};

export function convertMinorToInrMinor(params: {
  amountMinor: number;
  currency: CurrencyCode;
  fxRateOverride?: number;
}): { inrEquivalentMinor: number; fxRate: number } {
  const { amountMinor, currency, fxRateOverride } = params;
  if (currency === 'INR') {
    return { inrEquivalentMinor: Math.round(amountMinor), fxRate: 1.0 };
  }

  const fxRate =
    fxRateOverride && fxRateOverride > 0
      ? fxRateOverride
      : DEFAULT_FX_TO_INR[currency];
  const minorPerMajor = MINOR_UNITS_PER_MAJOR[currency];
  const majorAmount = amountMinor / minorPerMajor;
  const inrMajor = majorAmount * fxRate;
  const inrEquivalentMinor = Math.round(inrMajor * 100);

  return {
    inrEquivalentMinor,
    fxRate,
  };
}

export function formatInrMinor(inrMinor: number): string {
  const sign = inrMinor < 0 ? '-' : '';
  const abs = Math.abs(inrMinor);
  const rupees = (abs / 100).toFixed(2);
  return `${sign}₹${rupees}`;
}

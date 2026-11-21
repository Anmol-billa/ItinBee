import type { LabelShape } from '@/components/world/DieCutLabel';

export interface ShowcaseDestination {
  /** Photo slug (see src/data/photo-credits.json) and Explore filter key. */
  slug: string;
  name: string;
  region: string;
  /** Typical trip length used on the label. */
  days: number;
  /** Months (1-12) when the destination is at its best. */
  bestMonths: number[];
  shape: LabelShape;
}

/**
 * Destinations shown on landing labels. Best months follow common travel guidance
 * (shoulder seasons included); the live destinations API replaces this once seeded.
 */
export const SHOWCASE: ShowcaseDestination[] = [
  { slug: 'spiti-valley', name: 'Spiti Valley', region: 'Himachal Pradesh', days: 7, bestMonths: [5, 6, 7, 8, 9, 10], shape: 'arch' },
  { slug: 'hampi', name: 'Hampi', region: 'Karnataka', days: 3, bestMonths: [10, 11, 12, 1, 2], shape: 'notch' },
  { slug: 'kyoto', name: 'Kyoto', region: 'Japan', days: 5, bestMonths: [3, 4, 5, 10, 11], shape: 'oval' },
  { slug: 'alleppey', name: 'Alleppey', region: 'Kerala', days: 4, bestMonths: [11, 12, 1, 2], shape: 'round' },
  { slug: 'jaipur', name: 'Jaipur', region: 'Rajasthan', days: 4, bestMonths: [10, 11, 12, 1, 2, 3], shape: 'round' },
  { slug: 'udaipur', name: 'Udaipur', region: 'Rajasthan', days: 3, bestMonths: [10, 11, 12, 1, 2, 3], shape: 'arch' },
  { slug: 'varanasi', name: 'Varanasi', region: 'Uttar Pradesh', days: 3, bestMonths: [10, 11, 12, 1, 2, 3], shape: 'notch' },
  { slug: 'goa', name: 'Goa', region: 'Goa', days: 5, bestMonths: [11, 12, 1, 2], shape: 'oval' },
  { slug: 'ladakh', name: 'Ladakh', region: 'Ladakh', days: 8, bestMonths: [6, 7, 8, 9], shape: 'round' },
  { slug: 'munnar', name: 'Munnar', region: 'Kerala', days: 3, bestMonths: [9, 10, 11, 12, 1, 2, 3], shape: 'notch' },
  { slug: 'rishikesh', name: 'Rishikesh', region: 'Uttarakhand', days: 3, bestMonths: [9, 10, 11, 2, 3, 4], shape: 'arch' },
  { slug: 'darjeeling', name: 'Darjeeling', region: 'West Bengal', days: 4, bestMonths: [3, 4, 5, 10, 11], shape: 'round' },
  { slug: 'bali', name: 'Bali', region: 'Indonesia', days: 6, bestMonths: [4, 5, 6, 7, 8, 9, 10], shape: 'oval' },
  { slug: 'ha-long-bay', name: 'Ha Long Bay', region: 'Vietnam', days: 3, bestMonths: [10, 11, 12, 1, 2, 3, 4], shape: 'notch' },
  { slug: 'lisbon', name: 'Lisbon', region: 'Portugal', days: 4, bestMonths: [3, 4, 5, 6, 9, 10], shape: 'round' },
  { slug: 'ha-noi', name: 'Hanoi', region: 'Vietnam', days: 3, bestMonths: [10, 11, 12, 1, 2, 3, 4], shape: 'arch' },
];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Destinations that are at their best in a given month (1-12), India-first order preserved. */
export function destinationsForMonth(month: number, limit = 8): ShowcaseDestination[] {
  return SHOWCASE.filter((d) => d.bestMonths.includes(month)).slice(0, limit);
}

import { z } from 'zod';
import { ItemKindSchema } from '../../types/domain.js';

export const ImageCreditSchema = z.object({
  url: z.string(),
  author: z.string(),
  license: z.string(),
  sourceUrl: z.string(),
});
export type ImageCredit = z.infer<typeof ImageCreditSchema>;

export const ExploreBudgetTierSchema = z.enum(['budget', 'mid', 'premium']);
export type ExploreBudgetTier = z.infer<typeof ExploreBudgetTierSchema>;

export const ExploreDestinationRefSchema = z.object({
  slug: z.string(),
  name: z.string(),
});
export type ExploreDestinationRef = z.infer<typeof ExploreDestinationRefSchema>;

export const ExploreCardSchema = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  coverImage: ImageCreditSchema.nullable(),
  durationDays: z.number().int().min(1),
  stopCount: z.number().int().nonnegative(),
  destinations: z.array(ExploreDestinationRefSchema),
  tripTypes: z.array(z.string()),
  budgetTier: ExploreBudgetTierSchema.nullable(),
  bestMonths: z.array(z.number().int().min(1).max(12)),
  origin: z.enum(['template', 'user']),
  authorName: z.string().optional(),
  cloneCount: z.number().int().nonnegative(),
  publishedAt: z.string(),
});
export type ExploreCard = z.infer<typeof ExploreCardSchema>;

export const ExploreDetailItemSchema = z.object({
  id: z.string(),
  kind: ItemKindSchema,
  title: z.string(),
  notes: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  startTime: z.string().nullable(),
  durationMins: z.number().int().nullable(),
  placeRefId: z.string().nullable(),
  image: ImageCreditSchema.optional(),
});
export type ExploreDetailItem = z.infer<typeof ExploreDetailItemSchema>;

export const ExploreDaySchema = z.object({
  dayNumber: z.number().int().min(1),
  title: z.string(),
  items: z.array(ExploreDetailItemSchema),
});
export type ExploreDay = z.infer<typeof ExploreDaySchema>;

export const ExploreDetailSchema = ExploreCardSchema.extend({
  days: z.array(ExploreDaySchema),
  mapAttribution: z.string(),
});
export type ExploreDetail = z.infer<typeof ExploreDetailSchema>;

export const ExploreFacetsSchema = z.object({
  durations: z.record(z.string(), z.number().int().nonnegative()),
  types: z.record(z.string(), z.number().int().nonnegative()),
});
export type ExploreFacets = z.infer<typeof ExploreFacetsSchema>;

export const ExploreListResponseSchema = z.object({
  items: z.array(ExploreCardSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
  facets: ExploreFacetsSchema,
});
export type ExploreListResponse = z.infer<typeof ExploreListResponseSchema>;

export interface ExploreQueryInput {
  dest?: string;
  q?: string;
  days?: string;
  type?: string;
  budget?: ExploreBudgetTier;
  month?: number;
  sort?: 'popular' | 'newest' | 'shortest';
  cursor?: string;
  limit?: number;
}

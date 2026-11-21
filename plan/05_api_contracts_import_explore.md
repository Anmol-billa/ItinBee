# 05 · API contracts for Import (Create flow) and Explore

Shared contract between backend agents and the frontend. Owner: coordinator. Change only by agreement.
All bodies are JSON. Auth: bearer token or httpOnly session cookie, resolved by `extractAuthClaims` (existing). Guests get an anonymous user via `POST /v1/auth/guest`.

## Guest auth
`POST /v1/auth/guest` → `200 { token: string, user: UserPublic, guest: true }` (also sets the session cookie). Idempotent per cookie.

## TripIntent (zod source of truth in `backend/src/modules/import/intent.ts`)
```ts
TripIntent = {
  title: string,
  destinations: Array<{
    name: string, country?: string, nights?: number, order: number, confidence: number /*0..1*/,
    // filled by grounding (never by the model):
    destinationSlug?: string, lat?: number, lng?: number, resolved: boolean
  }>,                                   // min 1
  dates: { start: string|null, end: string|null, lengthDays: number|null, flexibleMonth: number|null },
  travellers: { count: number|null, group: 'solo'|'couple'|'family'|'friends'|'seniors'|'mixed'|null,
                hasChildren: boolean|null, hasSeniors: boolean|null },
  budget: { amount: number|null, currency: string|null, tier: 'budget'|'mid'|'premium'|null },
  interests: string[], pace: 'relaxed'|'moderate'|'packed'|null, diet: string[],
  mustInclude: Array<{ name: string, sourceQuote: string, placeRefId?: string, lat?: number, lng?: number, resolved: boolean }>,
  avoid: string[],
  bookings: Array<{ itemKind, title, provider, startIso?, endIso?, summary, lowConfidenceFields: string[] }>,
  assumptions: string[],               // shown as "assumed, tap to change"
  clarifyingQuestions: Array<{ id: string, question: string, options?: string[] }>  // max 3
}
```

## Import jobs
`POST /v1/import/jobs`
Body: `{ text?: string, urls?: string[], files?: Array<{ name, mimeType, dataBase64 }>, locale?: 'en'|'hi', baseTripSlug?: string }`
(at least one of text/urls/files; limits: text 20k chars, 5 urls, 3 files, 8MB total).
→ `202 { jobId: string, status: 'queued', eventsUrl: '/v1/import/jobs/:id/events' }`
Errors: `400 invalid_input`, `429 quota_exceeded {resetAt}`, `503 ai_unavailable` is NOT returned: the job falls back to Basic mode and says so in `mode`.

`GET /v1/import/jobs/:id` → `JobState`
```ts
JobState = {
  id: string,
  status: 'queued'|'understanding'|'needs_review'|'building'|'done'|'failed',
  mode: 'ai'|'basic',
  intent?: TripIntent,
  tripId?: string, shortId?: string,
  error?: { code: string, message: string },
  createdAt: string, updatedAt: string
}
```

`GET /v1/import/jobs/:id/events` → `text/event-stream`. Replays history on connect, then live. Event names and data:
- `status`  `{ status, mode }`
- `detected` `{ kind: 'destination'|'place'|'dates'|'travellers'|'booking'|'budget'|'interest', label: string, resolved?: boolean }`
- `intent`  `{ intent: TripIntent }` (the Review card renders from this; status becomes `needs_review`)
- `day`     `{ dayNumber: number, title: string, items: Array<{ title, kind, lat?: number, lng?: number, startTime?: string, placeRefId?: string }> }`
- `done`    `{ tripId, shortId }`
- `error`   `{ code, message }`
Heartbeat comment every 15s.

`POST /v1/import/jobs/:id/confirm`
Body: `{ intent: TripIntent /* edited */, answers?: Record<string,string> }` → `202 { status: 'building' }`

## Explore (published itineraries and templates)
`GET /v1/explore?dest=&q=&days=&type=&budget=&month=&sort=&cursor=&limit=`
- `dest`: destination slug; matches the destination and all its descendants (state → cities).
- `days`: `min-max` (e.g. `4-6`), either side optional (`7-`).
- `type`: comma list of trip types; `budget`: `budget|mid|premium`; `month`: 1-12.
- `sort`: `popular|newest|shortest`; `limit` default 24 max 60.
→ `200 { items: ExploreCard[], nextCursor: string|null, total: number, facets: { durations: Record<string,number>, types: Record<string,number> } }`
```ts
ExploreCard = {
  slug: string, title: string, summary: string,
  coverImage: { url: string, author: string, license: string, sourceUrl: string } | null,
  durationDays: number, stopCount: number,
  destinations: Array<{ slug: string, name: string }>,
  tripTypes: string[], budgetTier: 'budget'|'mid'|'premium'|null, bestMonths: number[],
  origin: 'template'|'user', authorName?: string, cloneCount: number, publishedAt: string
}
```
`GET /v1/explore/:slug` → `ExploreDetail = ExploreCard & { days: Array<{ dayNumber, title, items: Array<{ id, kind, title, notes, lat: number|null, lng: number|null, startTime: string|null, durationMins: number|null, placeRefId: string|null, image?: {url,author,license,sourceUrl} }> }>, mapAttribution: string }`
`POST /v1/explore/:slug/clone` → `201 { tripId, shortId }` (guest or user; copies into a new draft owned by caller).
`POST /v1/trips/:id/publish` body `{ slug?, tripTypes, budgetTier?, bestMonths?, coverImage? }` → `200 ExploreCard`.

## Destinations and places (Phase 1, already specced)
See backend/openapi.json after Phase 1: `/v1/geo/autocomplete`, `/v1/destinations`, `/v1/destinations/:slug`, `/v1/destinations/:slug/places`, `/v1/geo/route`.

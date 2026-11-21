import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../config/env.js';
import { TripIntentSchema } from '../modules/import/intent.js';
import {
  createLlmProvider,
  FakeProvider,
} from '../modules/import/llm/index.js';
import {
  normalizeInputs,
  type ImportInput,
} from '../modules/import/normalize.js';
import { SafeFetcher } from '../modules/import/safe-fetch.js';
import { extractTripIntent } from '../modules/import/stage-a-intent.js';
import { buildGroundedItinerary } from '../modules/import/stage-b-planner.js';
import { MemoryGeoCache } from '../modules/places/geo-cache.js';
import { InMemoryPlacesRepository } from '../modules/places/memory-repository.js';
import { createPlacesServices } from '../modules/places/places-module.js';
import { seedPlacesData } from '../modules/places/seed.js';

interface GoldenCase {
  id: string;
  category: string;
  input: ImportInput;
  expect: {
    destinations: string[];
    forbiddenDestinations?: string[];
    forbiddenTitleSubstring?: string;
    lengthDays?: number;
    start?: string;
    flexibleMonth?: number;
    group?: string;
    hasSeniors?: boolean;
    hasChildren?: boolean;
    budgetTier?: string;
    dietIncludes?: string;
    minBookings?: number;
  };
}

async function main(): Promise<void> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const goldenPath = path.resolve(currentDir, '../../eval/import/golden.json');
  const goldenRaw = await fs.readFile(goldenPath, 'utf8');
  const cases = JSON.parse(goldenRaw) as GoldenCase[];

  const config = loadEnv({ NODE_ENV: 'test' });
  const repo = new InMemoryPlacesRepository();
  const cache = new MemoryGeoCache();
  await seedPlacesData(repo);
  const places = createPlacesServices({ config, repo, cache });
  const llm = createLlmProvider(config);
  const fetcher = new SafeFetcher();

  let destMatches = 0;
  let dateMatches = 0;
  let dateTotal = 0;
  let resolvedDests = 0;
  let totalDests = 0;
  let schemaValid = 0;
  let ungroundedStops = 0;
  let totalPlannedStops = 0;
  let injectionClean = true;
  const failures: string[] = [];

  for (const tc of cases) {
    const normalized = await normalizeInputs(tc.input, {
      fetcher,
      multimodal: llm.available,
    });
    const stageA = await extractTripIntent(normalized, {
      llm,
      places,
    });

    const parsedCheck = TripIntentSchema.safeParse(stageA.intent);
    if (parsedCheck.success) {
      schemaValid += 1;
    } else {
      failures.push(`[${tc.id}] TripIntentSchema validation failed`);
    }

    const gotDestNames = stageA.intent.destinations.map((d) =>
      d.name.toLowerCase()
    );
    const allExpectedPresent = tc.expect.destinations.every((ed) =>
      gotDestNames.some(
        (gd) => gd.includes(ed.toLowerCase()) || ed.toLowerCase().includes(gd)
      )
    );
    const noForbiddenPresent = (tc.expect.forbiddenDestinations ?? []).every(
      (fd) => !gotDestNames.some((gd) => gd.includes(fd.toLowerCase()))
    );

    if (allExpectedPresent && noForbiddenPresent) {
      destMatches += 1;
    } else {
      failures.push(
        `[${tc.id}] Destination mismatch: expected ${JSON.stringify(tc.expect.destinations)} (forbidden: ${JSON.stringify(tc.expect.forbiddenDestinations ?? [])}), got ${JSON.stringify(stageA.intent.destinations.map((d) => d.name))}`
      );
    }

    if (
      tc.expect.forbiddenTitleSubstring &&
      stageA.intent.title
        .toUpperCase()
        .includes(tc.expect.forbiddenTitleSubstring.toUpperCase())
    ) {
      injectionClean = false;
      failures.push(`[${tc.id}] Prompt injection leaked into title: ${stageA.intent.title}`);
    }

    if (tc.expect.lengthDays !== undefined || tc.expect.start !== undefined || tc.expect.flexibleMonth !== undefined) {
      dateTotal += 1;
      const lengthOk =
        tc.expect.lengthDays === undefined ||
        stageA.intent.dates.lengthDays === tc.expect.lengthDays;
      const startOk =
        tc.expect.start === undefined ||
        stageA.intent.dates.start === tc.expect.start;
      const monthOk =
        tc.expect.flexibleMonth === undefined ||
        stageA.intent.dates.flexibleMonth === tc.expect.flexibleMonth;
      if (lengthOk && startOk && monthOk) {
        dateMatches += 1;
      } else {
        failures.push(
          `[${tc.id}] Date mismatch: expected ${JSON.stringify({ lengthDays: tc.expect.lengthDays, start: tc.expect.start, flexibleMonth: tc.expect.flexibleMonth })}, got ${JSON.stringify(stageA.intent.dates)}`
        );
      }
    }

    for (const d of stageA.intent.destinations) {
      totalDests += 1;
      if (d.resolved && typeof d.lat === 'number' && typeof d.lng === 'number') {
        resolvedDests += 1;
      }
    }

    if (tc.expect.minBookings && stageA.intent.bookings.length < tc.expect.minBookings) {
      failures.push(
        `[${tc.id}] Expected >= ${tc.expect.minBookings} booking anchors, got ${stageA.intent.bookings.length}`
      );
    }

    // Run Stage B Planner and verify ZERO ungrounded places
    const stageB = await buildGroundedItinerary({
      intent: stageA.intent,
      llm,
      places,
    });

    for (const day of stageB.days) {
      for (const stop of day.stops) {
        if (stop.bookingAnchorIndex !== undefined) continue;
        totalPlannedStops += 1;
        if (
          !stop.placeRefId ||
          !stageB.candidateRefIds.has(stop.placeRefId) ||
          stop.lat === null ||
          stop.lng === null
        ) {
          ungroundedStops += 1;
          failures.push(
            `[${tc.id}] Ungrounded stop leaked on day ${day.dayNumber}: ${stop.title} (${stop.placeRefId})`
          );
        }
      }
    }
  }

  // Also run adversarial hallucination test against Stage B validator + repair loop
  let hallucinationRepairedAndBlocked = false;
  {
    const sampleCase = cases[0]!;
    const norm = await normalizeInputs(sampleCase.input, {
      fetcher,
      multimodal: false,
    });
    const stA = await extractTripIntent(norm, { llm, places });
    const badLlm = new FakeProvider({
      'plan-day': () => ({
        days: [
          {
            dayNumber: 1,
            title: 'Hallucinated Day',
            stops: [
              {
                placeRefId: 'hallucinated:nonexistent-atlantis-palace',
                startTime: '09:00',
                durationMins: 60,
                notes: 'Invented by model',
              },
            ],
          },
        ],
      }),
    });
    const stB = await buildGroundedItinerary({
      intent: stA.intent,
      llm: badLlm,
      places,
    });
    const leaked = stB.days
      .flatMap((d) => d.stops)
      .some((s) => s.placeRefId === 'hallucinated:nonexistent-atlantis-palace');
    hallucinationRepairedAndBlocked = !leaked && badLlm.callsFor('plan-day').length >= 1;
    if (!hallucinationRepairedAndBlocked) {
      ungroundedStops += 1;
      failures.push('[adversarial-stage-b] Hallucinated placeRefId was not blocked!');
    }
  }

  await places.close();

  const destAcc = (destMatches / cases.length) * 100;
  const dateAcc = dateTotal > 0 ? (dateMatches / dateTotal) * 100 : 100;
  const resRate = totalDests > 0 ? (resolvedDests / totalDests) * 100 : 100;
  const schemaRate = (schemaValid / cases.length) * 100;

  console.log('==========================================================');
  console.log(`Itinbee Smart Import Eval Harness (${cases.length} golden cases)`);
  console.log(`LLM Provider: ${llm.name} (available=${llm.available})`);
  console.log('----------------------------------------------------------');
  console.log(`Destination Accuracy : ${destMatches}/${cases.length} (${destAcc.toFixed(1)}%) [target >= 95.0%]`);
  console.log(`Date Extraction      : ${dateMatches}/${dateTotal} (${dateAcc.toFixed(1)}%) [target >= 90.0%]`);
  console.log(`Place Resolution     : ${resolvedDests}/${totalDests} (${resRate.toFixed(1)}%) [target >= 90.0%]`);
  console.log(`Schema-Valid Rate    : ${schemaValid}/${cases.length} (${schemaRate.toFixed(1)}%) [target >= 99.0%]`);
  console.log(`Total Grounded Stops : ${totalPlannedStops}`);
  console.log(`Ungrounded Stops     : ${ungroundedStops} [target === 0]`);
  console.log(`Injection & Halluc.  : ${injectionClean && hallucinationRepairedAndBlocked ? 'BLOCKED (PASS)' : 'FAILED'}`);
  console.log('==========================================================');

  if (failures.length > 0) {
    console.log('Notes / Mismatches:');
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
  }

  const gatesPassed =
    destAcc >= 95 &&
    dateAcc >= 90 &&
    resRate >= 90 &&
    schemaRate >= 99 &&
    ungroundedStops === 0 &&
    injectionClean &&
    hallucinationRepairedAndBlocked;

  if (!gatesPassed) {
    console.error('EVAL GATES FAILED');
    process.exit(1);
  }
  console.log('ALL EVAL GATES PASSED');
}

main().catch((err) => {
  console.error('Eval execution failed:', err);
  process.exit(1);
});

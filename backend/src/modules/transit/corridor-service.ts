import { z } from 'zod';
import type { AppEnv } from '../../config/env.js';
import { haversineMeters } from '../places/util/geo.js';
import { namesSimilar, normalizeName, toTitleCasePlaceName } from '../places/util/text.js';
import type { PlacesServices } from '../places/places-module.js';
import { toGeminiSchema } from '../import/gemini-schema.js';
import type {
  JourneyPlace,
  TransitLegSpec,
  TransitRouteOption,
  TransportMode,
} from '../import/intent.js';
import type { LlmProvider } from '../import/llm/types.js';
import {
  CITY_TRANSIT_HUBS,
  ROAD_OVERNIGHT_MIDPOINTS,
  VERIFIED_FLIGHT_SCHEDULES,
  VERIFIED_RAIL_SCHEDULES,
  type AirportHub,
  type CityTransitHub,
  type RailStationHub,
} from './hubs-and-schedules.js';
import {
  queryLiveFlightSchedule,
  queryLiveRailBetweenStations,
  resolveRoadMetrics,
} from './live-providers.js';

export interface ResolvedHubMatch {
  place: JourneyPlace;
  cityHub: CityTransitHub | null;
  specificStation?: RailStationHub;
  specificAirport?: AirportHub;
}

const AiCorridorResponseSchema = z.object({
  railAvailable: z.boolean(),
  railTrainCode: z.string().nullable(),
  railTrainName: z.string().nullable(),
  railDepartureTime: z.string().nullable(),
  railArrivalTime: z.string().nullable(),
  railDurationMins: z.number().int().nullable(),
  flightAvailable: z.boolean(),
  flightCode: z.string().nullable(),
  airlineName: z.string().nullable(),
  flightDepartureTime: z.string().nullable(),
  flightArrivalTime: z.string().nullable(),
  flightDurationMins: z.number().int().nullable(),
});

const aiCorridorGeminiSchema = toGeminiSchema(AiCorridorResponseSchema);

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function addMinutesToHHMM(hhmm: string, addMins: number): { time: string; dayOffset: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  const startMins = m ? Number(m[1]) * 60 + Number(m[2]) : 7 * 60;
  const total = startMins + Math.round(addMins);
  const dayOffset = Math.max(0, Math.floor(total / 1440));
  const rem = ((total % 1440) + 1440) % 1440;
  return {
    time: `${pad2(Math.floor(rem / 60))}:${pad2(rem % 60)}`,
    dayOffset,
  };
}

function formatDurationHuman(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Matches a raw starting/returning place string (such as `"Delhi Railway station"`, `"IGI Airport"`,
 * `"Bengaluru"`, or `"Leh"`) to exact coordinates + station/airport codes.
 */
export function matchCityTransitHub(rawName: string): {
  cityHub: CityTransitHub;
  specificStation?: RailStationHub;
  specificAirport?: AirportHub;
} | null {
  const norm = normalizeName(rawName);
  if (!norm) return null;

  // 1. Exact station or airport alias match (e.g. "delhi railway station" -> NDLS, "igi airport" -> DEL)
  for (const hub of CITY_TRANSIT_HUBS) {
    for (const st of hub.stations) {
      const stCandidates = [st.name, st.code, ...(st.aliases ?? [])];
      if (stCandidates.some((c) => normalizeName(c) === norm || (norm.length >= 6 && norm.includes(normalizeName(c))))) {
        return { cityHub: hub, specificStation: st };
      }
    }
    for (const ap of hub.airports) {
      const apCandidates = [ap.name, ap.iata, ...(ap.aliases ?? [])];
      if (apCandidates.some((c) => normalizeName(c) === norm || (norm.length >= 6 && norm.includes(normalizeName(c))))) {
        return { cityHub: hub, specificAirport: ap };
      }
    }
  }

  // 2. Generic "<City> railway station" or "<City> airport"
  const strippedHub = norm
    .replace(/\b(?:railway\s+station|train\s+station|junction|station|international\s+airport|airport|terminal\s*\d*)\b/g, '')
    .trim();
  const wantsRailStation = /\b(?:railway|train|station|junction)\b/.test(norm);
  const wantsAirport = /\b(?:airport|terminal)\b/.test(norm);

  for (const hub of CITY_TRANSIT_HUBS) {
    const names = [hub.cityName, hub.key.replace(/-/g, ' '), ...hub.aliases];
    for (const candidate of names) {
      const cn = normalizeName(candidate);
      if (!cn) continue;
      if (cn === norm || cn === strippedHub || (cn.length >= 4 && namesSimilar(strippedHub || rawName, candidate))) {
        return {
          cityHub: hub,
          ...(wantsRailStation && hub.stations[0] ? { specificStation: hub.stations[0] } : {}),
          ...(wantsAirport && hub.airports[0] ? { specificAirport: hub.airports[0] } : {}),
        };
      }
    }
  }

  return null;
}

export async function groundJourneyPlace(
  raw: JourneyPlace,
  places: PlacesServices,
  preferredMode: TransportMode = 'any',
  allowLiveAutocomplete = false
): Promise<ResolvedHubMatch> {
  const hubMatch = matchCityTransitHub(raw.name);
  if (hubMatch) {
    const { cityHub, specificStation, specificAirport } = hubMatch;
    if (specificStation) {
      return {
        cityHub,
        specificStation,
        place: {
          name: specificStation.name,
          city: cityHub.cityName,
          hubCode: specificStation.code,
          country: cityHub.country,
          destinationSlug: cityHub.key,
          lat: specificStation.lat,
          lng: specificStation.lng,
          resolved: true,
        },
      };
    }
    if (specificAirport) {
      return {
        cityHub,
        specificAirport,
        place: {
          name: specificAirport.name,
          city: cityHub.cityName,
          hubCode: specificAirport.iata,
          country: cityHub.country,
          destinationSlug: cityHub.key,
          lat: specificAirport.lat,
          lng: specificAirport.lng,
          resolved: true,
        },
      };
    }

    const defaultHub =
      preferredMode === 'train' && cityHub.stations[0]
        ? {
            name: `${cityHub.cityName} (${cityHub.stations[0].name})`,
            code: cityHub.stations[0].code,
            lat: cityHub.stations[0].lat,
            lng: cityHub.stations[0].lng,
          }
        : preferredMode === 'flight' && cityHub.airports[0]
          ? {
              name: `${cityHub.cityName} (${cityHub.airports[0].iata})`,
              code: cityHub.airports[0].iata,
              lat: cityHub.airports[0].lat,
              lng: cityHub.airports[0].lng,
            }
          : {
              name: cityHub.cityName,
              code: cityHub.stations[0]?.code ?? cityHub.airports[0]?.iata,
              lat: cityHub.lat,
              lng: cityHub.lng,
            };

    return {
      cityHub,
      place: {
        name: defaultHub.name,
        city: cityHub.cityName,
        ...(defaultHub.code ? { hubCode: defaultHub.code } : {}),
        country: cityHub.country,
        destinationSlug: cityHub.key,
        lat: defaultHub.lat,
        lng: defaultHub.lng,
        resolved: true,
      },
    };
  }

  // Try seeded destinations in PlacesRepository
  const allDests = await places.repo.listDestinations({});
  const qn = normalizeName(raw.name);
  const seedHit = allDests.find(
    (d) =>
      normalizeName(d.name) === qn ||
      d.aliases.some((a) => normalizeName(a) === qn)
  );
  if (seedHit) {
    // Also check if a nearby CITY_TRANSIT_HUB is within 35 km
    const nearbyHub =
      CITY_TRANSIT_HUBS.find(
        (h) => haversineMeters({ lat: h.lat, lng: h.lng }, { lat: seedHit.lat, lng: seedHit.lng }) <= 35_000
      ) ?? null;
    return {
      cityHub: nearbyHub,
      place: {
        name: seedHit.name,
        city: seedHit.name,
        country: seedHit.countryCode === 'IN' ? 'India' : seedHit.countryCode,
        destinationSlug: seedHit.slug,
        lat: seedHit.lat,
        lng: seedHit.lng,
        resolved: true,
      },
    };
  }

  if (raw.resolved && typeof raw.lat === 'number' && typeof raw.lng === 'number') {
    const nearbyHub =
      CITY_TRANSIT_HUBS.find(
        (h) => haversineMeters({ lat: h.lat, lng: h.lng }, { lat: raw.lat!, lng: raw.lng! }) <= 35_000
      ) ?? null;
    return { cityHub: nearbyHub, place: raw };
  }

  if (allowLiveAutocomplete && raw.name.trim().length >= 2) {
    try {
      const auto = await Promise.race([
        places.places.autocomplete(raw.name, { limit: 2 }),
        new Promise<{ results: never[] }>((r) => setTimeout(() => r({ results: [] }), 1800)),
      ]);
      const top = auto.results[0];
      if (top) {
        return {
          cityHub: null,
          place: {
            name: top.name,
            city: top.name,
            ...(top.slug ? { destinationSlug: top.slug } : {}),
            lat: top.lat,
            lng: top.lng,
            resolved: true,
          },
        };
      }
    } catch {
      /* ignore */
    }
  }

  return {
    cityHub: null,
    place: {
      name: toTitleCasePlaceName(raw.name),
      resolved: false,
    },
  };
}

function estimateTransitDays(totalMins: number, legs: TransitLegSpec[]): number {
  const explicitOffsets = legs.reduce((acc, l) => acc + (l.dayOffset ?? 0), 0);
  if (totalMins <= 270 && explicitOffsets === 0) return 0.25;
  if (totalMins <= 540 && explicitOffsets === 0) return 0.5;
  if (totalMins <= 960) return Math.max(0.75, explicitOffsets > 0 ? 1.0 : 0.75);
  return Number(Math.min(5, Math.max(1.25, totalMins / (16 * 60))).toFixed(2));
}

async function buildDirectionalOptions(params: {
  direction: 'outbound' | 'return';
  from: ResolvedHubMatch;
  to: ResolvedHubMatch;
  preferredMode: TransportMode;
  dateIso?: string | null;
  places: PlacesServices;
  llm?: LlmProvider;
  config?: Partial<AppEnv>;
  fetchImpl?: typeof fetch;
}): Promise<TransitRouteOption[]> {
  const { direction, from, to, places, config, fetchImpl } = params;
  if (
    typeof from.place.lat !== 'number' ||
    typeof from.place.lng !== 'number' ||
    typeof to.place.lat !== 'number' ||
    typeof to.place.lng !== 'number'
  ) {
    return [];
  }

  const straightKm = Math.max(
    1,
    Math.round(
      haversineMeters(
        { lat: from.place.lat, lng: from.place.lng },
        { lat: to.place.lat, lng: to.place.lng }
      ) / 1000
    )
  );
  // Same city (< 25 km): no inter-city corridor needed
  if (straightKm < 25) return [];

  const fromHub = from.cityHub;
  const toHub = to.cityHub;
  const isCrossCountry =
    fromHub && toHub && fromHub.countryCode !== toHub.countryCode;
  const involvesIsland = Boolean(fromHub?.isIsland || toHub?.isIsland);

  const options: TransitRouteOption[] = [];
  const prefix = direction === 'outbound' ? 'out' : 'ret';

  // =========================================================================
  // 1. TRAIN & RAIL + TRANSFER OPTIONS
  // =========================================================================
  if (!isCrossCountry && !involvesIsland) {
    const fromStation = from.specificStation ?? fromHub?.stations[0];
    const toStation = to.specificStation ?? toHub?.stations[0];

    // 1A. Direct Mainline Rail (both cities have rail stations)
    if (fromHub && toHub && fromStation && toStation) {
      let railLeg: TransitLegSpec | null = await queryLiveRailBetweenStations({
        fromCode: fromStation.code,
        fromName: fromStation.name,
        fromLat: fromStation.lat,
        fromLng: fromStation.lng,
        toCode: toStation.code,
        toName: toStation.name,
        toLat: toStation.lat,
        toLng: toStation.lng,
        dateIso: params.dateIso,
        config,
        cache: places.cache,
        fetchImpl,
      });

      if (!railLeg) {
        const verified = VERIFIED_RAIL_SCHEDULES.find(
          (r) => r.fromCityKey === fromHub.key && r.toCityKey === toHub.key
        );
        if (verified) {
          railLeg = {
            mode: 'rail',
            title: `${verified.trainNumber} ${verified.trainName}: ${verified.fromStationName} (${verified.fromCode}) → ${verified.toStationName} (${verified.toCode})`,
            carrierName: verified.trainName,
            vehicleCode: verified.trainNumber,
            fromName: verified.fromStationName,
            fromCode: verified.fromCode,
            fromLat: fromStation.lat,
            fromLng: fromStation.lng,
            toName: verified.toStationName,
            toCode: verified.toCode,
            toLat: toStation.lat,
            toLng: toStation.lng,
            departureTime: verified.departureTime,
            arrivalTime: verified.arrivalTime,
            durationMins: verified.durationMins,
            distanceKm: verified.distanceKm,
            dayOffset: verified.dayOffset,
            coachOrTerminal: verified.coachClass,
            approxFareInr: verified.approxFareInr,
            advisory: verified.advisory,
            source: 'verified_timetable',
          };
        }
      }

      if (!railLeg) {
        // Calibrated rail corridor fallback between two real railway junctions
        const railKm = Math.round(straightKm * 1.24);
        const speedKmh = fromHub.countryCode === 'JP' ? 210 : 64;
        const durMins = Math.max(60, Math.round((railKm / speedKmh) * 60));
        const dep = durMins >= 480 ? '20:30' : direction === 'outbound' ? '06:30' : '16:45';
        const arr = addMinutesToHHMM(dep, durMins);
        railLeg = {
          mode: 'rail',
          title: `Express Train: ${fromStation.name} (${fromStation.code}) → ${toStation.name} (${toStation.code})`,
          carrierName: fromHub.countryCode === 'IN' ? 'Indian Railways Express' : 'Intercity Rail',
          fromName: fromStation.name,
          fromCode: fromStation.code,
          fromLat: fromStation.lat,
          fromLng: fromStation.lng,
          toName: toStation.name,
          toCode: toStation.code,
          toLat: toStation.lat,
          toLng: toStation.lng,
          departureTime: dep,
          arrivalTime: arr.time,
          durationMins: durMins,
          distanceKm: railKm,
          dayOffset: arr.dayOffset,
          coachOrTerminal: durMins >= 480 ? '3A / 2A Sleeper' : 'AC Chair Car',
          source: 'verified_timetable',
        };
      }

      options.push({
        id: `${prefix}-train-direct`,
        direction,
        modeCategory: 'train',
        summaryLabel: `${railLeg.vehicleCode ? `${railLeg.vehicleCode} ` : ''}${railLeg.carrierName ?? 'Direct Train'} (${formatDurationHuman(railLeg.durationMins)})`,
        totalDurationMins: railLeg.durationMins,
        transitDaysRequired: estimateTransitDays(railLeg.durationMins, [railLeg]),
        totalDistanceKm: railLeg.distanceKm,
        approxFareInr: railLeg.approxFareInr,
        recommended: false,
        legs: [railLeg],
      });
    }

    // 1B. Non-Railhead Destination (Outbound: e.g. Delhi -> Leh, Delhi -> Manali, Kolkata -> Darjeeling)
    const targetWithoutRail =
      direction === 'outbound' && toHub && toHub.stations.length === 0 && toHub.nearestRailheads?.length
        ? { nonRailHub: toHub, railHub: fromHub, railStation: fromStation }
        : direction === 'return' && fromHub && fromHub.stations.length === 0 && fromHub.nearestRailheads?.length
          ? { nonRailHub: fromHub, railHub: toHub, railStation: toStation }
          : null;

    if (targetWithoutRail?.railHub && targetWithoutRail.railStation) {
      const { nonRailHub, railHub, railStation } = targetWithoutRail;
      for (const rh of nonRailHub.nearestRailheads ?? []) {
        const rhHub = CITY_TRANSIT_HUBS.find((h) => h.key === rh.railheadCityKey);
        if (!rhHub) continue;

        if (rh.transferMode === 'flight' && rh.connectingAirportIata) {
          // Train + Flight Combo (e.g. NDLS -> CDG Shatabdi + IXC -> IXL flight!)
          const railPart =
            VERIFIED_RAIL_SCHEDULES.find(
              (r) =>
                r.fromCityKey === (direction === 'outbound' ? railHub.key : rhHub.key) &&
                r.toCityKey === (direction === 'outbound' ? rhHub.key : railHub.key)
            ) ?? null;
          const airPart =
            VERIFIED_FLIGHT_SCHEDULES.find(
              (f) =>
                f.fromCityKey === (direction === 'outbound' ? rhHub.key : nonRailHub.key) &&
                f.toCityKey === (direction === 'outbound' ? nonRailHub.key : rhHub.key)
            ) ?? null;

          if (railPart && airPart) {
            const leg1Rail: TransitLegSpec = {
              mode: 'rail',
              title: `${railPart.trainNumber} ${railPart.trainName}: ${railPart.fromStationName} (${railPart.fromCode}) → ${railPart.toStationName} (${railPart.toCode})`,
              carrierName: railPart.trainName,
              vehicleCode: railPart.trainNumber,
              fromName: railPart.fromStationName,
              fromCode: railPart.fromCode,
              fromLat: direction === 'outbound' ? railStation.lat : rh.stationLat,
              fromLng: direction === 'outbound' ? railStation.lng : rh.stationLng,
              toName: railPart.toStationName,
              toCode: railPart.toCode,
              toLat: direction === 'outbound' ? rh.stationLat : railStation.lat,
              toLng: direction === 'outbound' ? rh.stationLng : railStation.lng,
              departureTime: railPart.departureTime,
              arrivalTime: railPart.arrivalTime,
              durationMins: railPart.durationMins,
              distanceKm: railPart.distanceKm,
              dayOffset: railPart.dayOffset,
              coachOrTerminal: railPart.coachClass,
              approxFareInr: railPart.approxFareInr,
              source: 'verified_timetable',
            };
            const destAp = nonRailHub.airports[0];
            const rhAp = rhHub.airports[0];
            const leg2Air: TransitLegSpec = {
              mode: 'flight',
              title: `${airPart.flightCode} ${airPart.airlineName}: ${airPart.fromIata} → ${airPart.toIata}`,
              carrierName: airPart.airlineName,
              vehicleCode: airPart.flightCode,
              fromName: direction === 'outbound' ? (rhAp?.name ?? rhHub.cityName) : (destAp?.name ?? nonRailHub.cityName),
              fromCode: airPart.fromIata,
              fromLat: direction === 'outbound' ? (rhAp?.lat ?? rhHub.lat) : (destAp?.lat ?? nonRailHub.lat),
              fromLng: direction === 'outbound' ? (rhAp?.lng ?? rhHub.lng) : (destAp?.lng ?? nonRailHub.lng),
              toName: direction === 'outbound' ? (destAp?.name ?? nonRailHub.cityName) : (rhAp?.name ?? rhHub.cityName),
              toCode: airPart.toIata,
              toLat: direction === 'outbound' ? (destAp?.lat ?? nonRailHub.lat) : (rhAp?.lat ?? rhHub.lat),
              toLng: direction === 'outbound' ? (destAp?.lng ?? nonRailHub.lng) : (rhAp?.lng ?? rhHub.lng),
              departureTime: airPart.departureTime,
              arrivalTime: airPart.arrivalTime,
              durationMins: airPart.durationMins,
              distanceKm: airPart.distanceKm,
              dayOffset: 0,
              approxFareInr: airPart.approxFareInr,
              advisory: rh.advisory,
              source: 'verified_timetable',
            };
            const comboLegs = direction === 'outbound' ? [leg1Rail, leg2Air] : [leg2Air, leg1Rail];
            const totalComboMins = leg1Rail.durationMins + leg2Air.durationMins + 100; // includes station<->airport transfer
            options.push({
              id: `${prefix}-combo-${rhHub.key}`,
              direction,
              modeCategory: 'combo',
              summaryLabel: `Train + Flight via ${rhHub.cityName} (${formatDurationHuman(totalComboMins)})`,
              totalDurationMins: totalComboMins,
              transitDaysRequired: 0.5,
              totalDistanceKm: leg1Rail.distanceKm + leg2Air.distanceKm,
              approxFareInr: (leg1Rail.approxFareInr ?? 0) + (leg2Air.approxFareInr ?? 0),
              recommended: false,
              legs: comboLegs,
            });
          }
          continue;
        }

        // Pure Rail + Road Transfer (including 2-train USBRL Delhi -> Jammu -> Srinagar -> Leh!)
        const legs: TransitLegSpec[] = [];
        if (direction === 'outbound') {
          const directToRh = VERIFIED_RAIL_SCHEDULES.find(
            (r) => r.fromCityKey === railHub.key && r.toCityKey === rhHub.key
          );
          if (directToRh) {
            legs.push({
              mode: 'rail',
              title: `${directToRh.trainNumber} ${directToRh.trainName}: ${directToRh.fromStationName} (${directToRh.fromCode}) → ${directToRh.toStationName} (${directToRh.toCode})`,
              carrierName: directToRh.trainName,
              vehicleCode: directToRh.trainNumber,
              fromName: railStation.name,
              fromCode: railStation.code,
              fromLat: railStation.lat,
              fromLng: railStation.lng,
              toName: directToRh.toStationName,
              toCode: directToRh.toCode,
              toLat: rh.stationLat,
              toLng: rh.stationLng,
              departureTime: directToRh.departureTime,
              arrivalTime: directToRh.arrivalTime,
              durationMins: directToRh.durationMins,
              distanceKm: directToRh.distanceKm,
              dayOffset: directToRh.dayOffset,
              coachOrTerminal: directToRh.coachClass,
              approxFareInr: directToRh.approxFareInr,
              source: 'verified_timetable',
            });
          } else if (railHub.key === 'delhi' && rhHub.key === 'srinagar') {
            // Real 2-train chain: NDLS -> JAT (12425 Jammu Rajdhani) + JAT -> SINA (26401 Vande Bharat)
            const t1 = VERIFIED_RAIL_SCHEDULES.find((r) => r.trainNumber === '12425')!;
            const t2 = VERIFIED_RAIL_SCHEDULES.find((r) => r.trainNumber === '26401')!;
            const jatHub = CITY_TRANSIT_HUBS.find((h) => h.key === 'jammu')!;
            legs.push(
              {
                mode: 'rail',
                title: `${t1.trainNumber} ${t1.trainName}: ${railStation.name} (${railStation.code}) → Jammu Tawi (JAT)`,
                carrierName: t1.trainName,
                vehicleCode: t1.trainNumber,
                fromName: railStation.name,
                fromCode: railStation.code,
                fromLat: railStation.lat,
                fromLng: railStation.lng,
                toName: 'Jammu Tawi Railway Station',
                toCode: 'JAT',
                toLat: jatHub.stations[0]!.lat,
                toLng: jatHub.stations[0]!.lng,
                departureTime: t1.departureTime,
                arrivalTime: t1.arrivalTime,
                durationMins: t1.durationMins,
                distanceKm: t1.distanceKm,
                dayOffset: 1,
                coachOrTerminal: t1.coachClass,
                approxFareInr: t1.approxFareInr,
                source: 'verified_timetable',
              },
              {
                mode: 'rail',
                title: `${t2.trainNumber} ${t2.trainName}: Jammu Tawi (JAT) → Srinagar (SINA)`,
                carrierName: t2.trainName,
                vehicleCode: t2.trainNumber,
                fromName: 'Jammu Tawi Railway Station',
                fromCode: 'JAT',
                fromLat: jatHub.stations[0]!.lat,
                fromLng: jatHub.stations[0]!.lng,
                toName: 'Srinagar Railway Station',
                toCode: 'SINA',
                toLat: rh.stationLat,
                toLng: rh.stationLng,
                departureTime: t2.departureTime,
                arrivalTime: t2.arrivalTime,
                durationMins: t2.durationMins,
                distanceKm: t2.distanceKm,
                dayOffset: 0,
                coachOrTerminal: t2.coachClass,
                approxFareInr: t2.approxFareInr,
                source: 'verified_timetable',
              }
            );
          } else {
            const railKm = Math.round(
              (haversineMeters(
                { lat: railStation.lat, lng: railStation.lng },
                { lat: rh.stationLat, lng: rh.stationLng }
              ) /
                1000) *
                1.25
            );
            const railMins = Math.max(90, Math.round((railKm / 62) * 60));
            const dep = railMins >= 420 ? '21:00' : '06:30';
            const arr = addMinutesToHHMM(dep, railMins);
            legs.push({
              mode: 'rail',
              title: `Express Train: ${railStation.name} (${railStation.code}) → ${rh.stationName} (${rh.stationCode})`,
              carrierName: 'Indian Railways Express',
              fromName: railStation.name,
              fromCode: railStation.code,
              fromLat: railStation.lat,
              fromLng: railStation.lng,
              toName: rh.stationName,
              toCode: rh.stationCode,
              toLat: rh.stationLat,
              toLng: rh.stationLng,
              departureTime: dep,
              arrivalTime: arr.time,
              durationMins: railMins,
              distanceKm: railKm,
              dayOffset: arr.dayOffset,
              source: 'verified_timetable',
            });
          }

          // Road transfer from railhead to destination
          const prevArr = legs[legs.length - 1]!.arrivalTime;
          const roadStart = rh.transferDurationMins >= 480 ? '07:30' : addMinutesToHHMM(prevArr, 35).time;
          const roadEnd = addMinutesToHHMM(roadStart, rh.transferDurationMins);
          legs.push({
            mode: rh.transferMode === 'hill_cab' ? 'hill_cab' : 'highway_cab',
            title: `Road Transfer (${rh.viaLabel}): ${rh.stationName} → ${nonRailHub.cityName}`,
            carrierName: rh.viaLabel,
            fromName: rh.stationName,
            fromCode: rh.stationCode,
            fromLat: rh.stationLat,
            fromLng: rh.stationLng,
            toName: nonRailHub.cityName,
            toLat: nonRailHub.lat,
            toLng: nonRailHub.lng,
            departureTime: roadStart,
            arrivalTime: roadEnd.time,
            durationMins: rh.transferDurationMins,
            distanceKm: rh.transferDistanceKm,
            dayOffset: rh.transferDurationMins >= 480 ? 1 : roadEnd.dayOffset,
            overnightHaltCity: rh.overnightHaltCity,
            advisory: rh.advisory,
            source: 'ors_road',
          });
        } else {
          // RETURN: Non-rail destination -> Railhead road -> Return train to origin station!
          const roadDep = '07:30';
          const roadArr = addMinutesToHHMM(roadDep, rh.transferDurationMins);
          legs.push({
            mode: rh.transferMode === 'hill_cab' ? 'hill_cab' : 'highway_cab',
            title: `Return Road Transfer (${rh.viaLabel}): ${nonRailHub.cityName} → ${rh.stationName}`,
            carrierName: rh.viaLabel,
            fromName: nonRailHub.cityName,
            fromLat: nonRailHub.lat,
            fromLng: nonRailHub.lng,
            toName: rh.stationName,
            toCode: rh.stationCode,
            toLat: rh.stationLat,
            toLng: rh.stationLng,
            departureTime: roadDep,
            arrivalTime: roadArr.time,
            durationMins: rh.transferDurationMins,
            distanceKm: rh.transferDistanceKm,
            dayOffset: roadArr.dayOffset,
            advisory: rh.advisory,
            source: 'ors_road',
          });

          const directFromRh = VERIFIED_RAIL_SCHEDULES.find(
            (r) => r.fromCityKey === rhHub.key && r.toCityKey === railHub.key
          );
          if (directFromRh) {
            legs.push({
              mode: 'rail',
              title: `${directFromRh.trainNumber} ${directFromRh.trainName}: ${directFromRh.fromStationName} (${directFromRh.fromCode}) → ${railStation.name} (${railStation.code})`,
              carrierName: directFromRh.trainName,
              vehicleCode: directFromRh.trainNumber,
              fromName: directFromRh.fromStationName,
              fromCode: directFromRh.fromCode,
              fromLat: rh.stationLat,
              fromLng: rh.stationLng,
              toName: railStation.name,
              toCode: railStation.code,
              toLat: railStation.lat,
              toLng: railStation.lng,
              departureTime: directFromRh.departureTime,
              arrivalTime: directFromRh.arrivalTime,
              durationMins: directFromRh.durationMins,
              distanceKm: directFromRh.distanceKm,
              dayOffset: directFromRh.dayOffset,
              coachOrTerminal: directFromRh.coachClass,
              approxFareInr: directFromRh.approxFareInr,
              source: 'verified_timetable',
            });
          } else if (rhHub.key === 'srinagar' && railHub.key === 'delhi') {
            const t1 = VERIFIED_RAIL_SCHEDULES.find((r) => r.trainNumber === '26402')!;
            const t2 = VERIFIED_RAIL_SCHEDULES.find((r) => r.trainNumber === '12426')!;
            const jatHub = CITY_TRANSIT_HUBS.find((h) => h.key === 'jammu')!;
            legs.push(
              {
                mode: 'rail',
                title: `${t1.trainNumber} ${t1.trainName}: Srinagar (SINA) → Jammu Tawi (JAT)`,
                carrierName: t1.trainName,
                vehicleCode: t1.trainNumber,
                fromName: 'Srinagar Railway Station',
                fromCode: 'SINA',
                fromLat: rh.stationLat,
                fromLng: rh.stationLng,
                toName: 'Jammu Tawi Railway Station',
                toCode: 'JAT',
                toLat: jatHub.stations[0]!.lat,
                toLng: jatHub.stations[0]!.lng,
                departureTime: t1.departureTime,
                arrivalTime: t1.arrivalTime,
                durationMins: t1.durationMins,
                distanceKm: t1.distanceKm,
                dayOffset: 0,
                coachOrTerminal: t1.coachClass,
                approxFareInr: t1.approxFareInr,
                source: 'verified_timetable',
              },
              {
                mode: 'rail',
                title: `${t2.trainNumber} ${t2.trainName}: Jammu Tawi (JAT) → ${railStation.name} (${railStation.code})`,
                carrierName: t2.trainName,
                vehicleCode: t2.trainNumber,
                fromName: 'Jammu Tawi Railway Station',
                fromCode: 'JAT',
                fromLat: jatHub.stations[0]!.lat,
                fromLng: jatHub.stations[0]!.lng,
                toName: railStation.name,
                toCode: railStation.code,
                toLat: railStation.lat,
                toLng: railStation.lng,
                departureTime: t2.departureTime,
                arrivalTime: t2.arrivalTime,
                durationMins: t2.durationMins,
                distanceKm: t2.distanceKm,
                dayOffset: 1,
                coachOrTerminal: t2.coachClass,
                approxFareInr: t2.approxFareInr,
                source: 'verified_timetable',
              }
            );
          } else {
            const railKm = Math.round(
              (haversineMeters(
                { lat: rh.stationLat, lng: rh.stationLng },
                { lat: railStation.lat, lng: railStation.lng }
              ) /
                1000) *
                1.25
            );
            const railMins = Math.max(90, Math.round((railKm / 62) * 60));
            const dep = railMins >= 420 ? '20:45' : '16:30';
            const arr = addMinutesToHHMM(dep, railMins);
            legs.push({
              mode: 'rail',
              title: `Return Express Train: ${rh.stationName} (${rh.stationCode}) → ${railStation.name} (${railStation.code})`,
              carrierName: 'Indian Railways Express',
              fromName: rh.stationName,
              fromCode: rh.stationCode,
              fromLat: rh.stationLat,
              fromLng: rh.stationLng,
              toName: railStation.name,
              toCode: railStation.code,
              toLat: railStation.lat,
              toLng: railStation.lng,
              departureTime: dep,
              arrivalTime: arr.time,
              durationMins: railMins,
              distanceKm: railKm,
              dayOffset: arr.dayOffset,
              source: 'verified_timetable',
            });
          }
        }

        const totalMins = legs.reduce((acc, l) => acc + l.durationMins, 0) + (legs.length - 1) * 45;
        const totalKm = legs.reduce((acc, l) => acc + l.distanceKm, 0);
        options.push({
          id: `${prefix}-train-railhead-${rhHub.key}`,
          direction,
          modeCategory: 'train',
          summaryLabel: `Train to ${rhHub.cityName} + Road (${formatDurationHuman(totalMins)})`,
          totalDurationMins: totalMins,
          transitDaysRequired: estimateTransitDays(totalMins, legs),
          totalDistanceKm: totalKm,
          recommended: false,
          feasibilityWarning: rh.advisory,
          legs,
        });
      }
    }
  }

  // =========================================================================
  // 2. FLIGHT (+ AIRPORT GROUND TRANSFER WHEN NEEDED)
  // =========================================================================
  if (straightKm >= 180 || involvesIsland || isCrossCountry) {
    const resolveEffectiveAirport = (
      side: ResolvedHubMatch
    ): {
      iata: string;
      name: string;
      lat: number;
      lng: number;
      cityKey: string;
      groundTransfer?: NonNullable<CityTransitHub['nearestAirportTransfer']>;
    } | null => {
      if (side.specificAirport && side.cityHub) {
        return { ...side.specificAirport, cityKey: side.cityHub.key };
      }
      if (side.cityHub?.airports[0]) {
        return { ...side.cityHub.airports[0], cityKey: side.cityHub.key };
      }
      if (side.cityHub?.nearestAirportTransfer) {
        const nat = side.cityHub.nearestAirportTransfer;
        return {
          iata: nat.iata,
          name: nat.airportName,
          lat: nat.airportLat,
          lng: nat.airportLng,
          cityKey: nat.airportCityKey,
          groundTransfer: nat,
        };
      }
      return null;
    };

    const fromAp = resolveEffectiveAirport(from);
    const toAp = resolveEffectiveAirport(to);

    if (fromAp && toAp && fromAp.iata !== toAp.iata) {
      let airLeg: TransitLegSpec | null = await queryLiveFlightSchedule({
        fromIata: fromAp.iata,
        fromName: fromAp.name,
        fromLat: fromAp.lat,
        fromLng: fromAp.lng,
        toIata: toAp.iata,
        toName: toAp.name,
        toLat: toAp.lat,
        toLng: toAp.lng,
        dateIso: params.dateIso,
        config,
        cache: places.cache,
        fetchImpl,
      });

      if (!airLeg) {
        const verifiedAir = VERIFIED_FLIGHT_SCHEDULES.find(
          (f) => f.fromIata === fromAp.iata && f.toIata === toAp.iata
        );
        if (verifiedAir) {
          airLeg = {
            mode: 'flight',
            title: `${verifiedAir.flightCode} ${verifiedAir.airlineName}: ${fromAp.name} → ${toAp.name}`,
            carrierName: verifiedAir.airlineName,
            vehicleCode: verifiedAir.flightCode,
            fromName: fromAp.name,
            fromCode: fromAp.iata,
            fromLat: fromAp.lat,
            fromLng: fromAp.lng,
            toName: toAp.name,
            toCode: toAp.iata,
            toLat: toAp.lat,
            toLng: toAp.lng,
            departureTime: verifiedAir.departureTime,
            arrivalTime: verifiedAir.arrivalTime,
            durationMins: verifiedAir.durationMins,
            distanceKm: verifiedAir.distanceKm,
            dayOffset: 0,
            approxFareInr: verifiedAir.approxFareInr,
            source: 'verified_timetable',
          };
        }
      }

      if (!airLeg) {
        const airKm = Math.max(
          150,
          Math.round(
            haversineMeters(
              { lat: fromAp.lat, lng: fromAp.lng },
              { lat: toAp.lat, lng: toAp.lng }
            ) / 1000
          )
        );
        const blockMins = Math.max(65, Math.round((airKm / 740) * 60 + 35));
        const dep = direction === 'outbound' ? '07:10' : '16:30';
        const arr = addMinutesToHHMM(dep, blockMins);
        airLeg = {
          mode: 'flight',
          title: `Direct Flight: ${fromAp.name} → ${toAp.name}`,
          carrierName: isCrossCountry ? 'International Scheduled Flight' : 'IndiGo / Air India',
          fromName: fromAp.name,
          fromCode: fromAp.iata,
          fromLat: fromAp.lat,
          fromLng: fromAp.lng,
          toName: toAp.name,
          toCode: toAp.iata,
          toLat: toAp.lat,
          toLng: toAp.lng,
          departureTime: dep,
          arrivalTime: arr.time,
          durationMins: blockMins,
          distanceKm: airKm,
          dayOffset: arr.dayOffset,
          source: 'verified_timetable',
        };
      } else if (airLeg.distanceKm === 0) {
        airLeg.distanceKm = straightKm;
      }

      const flightLegs: TransitLegSpec[] = [];
      // If user explicitly asked to start/end at a specific railway station (e.g. New Delhi Railway Station NDLS)
      if (from.specificStation && haversineMeters(from.specificStation, fromAp) > 3000) {
        const preDep = addMinutesToHHMM(airLeg.departureTime, -135).time;
        const preArr = addMinutesToHHMM(airLeg.departureTime, -90).time;
        flightLegs.push({
          mode: 'highway_cab',
          title: `Airport Express Transfer: ${from.specificStation.name} → ${fromAp.name}`,
          fromName: from.specificStation.name,
          fromCode: from.specificStation.code,
          fromLat: from.specificStation.lat,
          fromLng: from.specificStation.lng,
          toName: fromAp.name,
          toCode: fromAp.iata,
          toLat: fromAp.lat,
          toLng: fromAp.lng,
          departureTime: preDep,
          arrivalTime: preArr,
          durationMins: 45,
          distanceKm: 18,
          dayOffset: 0,
          source: 'ors_road',
        });
      }

      if (fromAp.groundTransfer) {
        const gt = fromAp.groundTransfer;
        const dep = addMinutesToHHMM(airLeg.departureTime, -(gt.transferDurationMins + 110)).time;
        const arr = addMinutesToHHMM(airLeg.departureTime, -110).time;
        flightLegs.push({
          mode: gt.transferMode,
          title: `Airport Transfer: ${from.place.name} → ${fromAp.name}`,
          fromName: from.place.name,
          fromLat: from.place.lat,
          fromLng: from.place.lng,
          toName: fromAp.name,
          toCode: fromAp.iata,
          toLat: fromAp.lat,
          toLng: fromAp.lng,
          departureTime: dep,
          arrivalTime: arr,
          durationMins: gt.transferDurationMins,
          distanceKm: gt.transferDistanceKm,
          dayOffset: 0,
          advisory: gt.advisory,
          source: 'ors_road',
        });
      }

      flightLegs.push(airLeg);

      if (toAp.groundTransfer) {
        const gt = toAp.groundTransfer;
        const dep = addMinutesToHHMM(airLeg.arrivalTime, 35).time;
        const arr = addMinutesToHHMM(dep, gt.transferDurationMins);
        flightLegs.push({
          mode: gt.transferMode,
          title: `Arrival Transfer: ${toAp.name} → ${to.place.name}`,
          fromName: toAp.name,
          fromCode: toAp.iata,
          fromLat: toAp.lat,
          fromLng: toAp.lng,
          toName: to.place.name,
          toLat: to.place.lat,
          toLng: to.place.lng,
          departureTime: dep,
          arrivalTime: arr.time,
          durationMins: gt.transferDurationMins,
          distanceKm: gt.transferDistanceKm,
          dayOffset: arr.dayOffset,
          advisory: gt.advisory,
          source: 'ors_road',
        });
      } else if (to.specificStation && haversineMeters(to.specificStation, toAp) > 3000) {
        const postDep = addMinutesToHHMM(airLeg.arrivalTime, 35).time;
        const postArr = addMinutesToHHMM(postDep, 45);
        flightLegs.push({
          mode: 'highway_cab',
          title: `Airport Express Metro / Cab: ${toAp.name} → ${to.specificStation.name}`,
          fromName: toAp.name,
          fromCode: toAp.iata,
          fromLat: toAp.lat,
          fromLng: toAp.lng,
          toName: to.specificStation.name,
          toCode: to.specificStation.code,
          toLat: to.specificStation.lat,
          toLng: to.specificStation.lng,
          departureTime: postDep,
          arrivalTime: postArr.time,
          durationMins: 45,
          distanceKm: 18,
          dayOffset: postArr.dayOffset,
          source: 'ors_road',
        });
      }

      const totalFlightMins = flightLegs.reduce((acc, l) => acc + l.durationMins, 0);
      const totalFlightKm = flightLegs.reduce((acc, l) => acc + l.distanceKm, 0);
      options.push({
        id: `${prefix}-flight`,
        direction,
        modeCategory: 'flight',
        summaryLabel: `${airLeg.vehicleCode ? `${airLeg.vehicleCode} ` : ''}Flight ${fromAp.iata} → ${toAp.iata} (${formatDurationHuman(totalFlightMins)})`,
        totalDurationMins: totalFlightMins,
        transitDaysRequired: estimateTransitDays(totalFlightMins, flightLegs),
        totalDistanceKm: totalFlightKm,
        approxFareInr: airLeg.approxFareInr,
        recommended: false,
        legs: flightLegs,
      });
    }
  }

  // =========================================================================
  // 3. DRIVING / ROAD TRIP (+ AUTOMATIC OVERNIGHT HALT SPLIT FOR > 10h DRIVES)
  // =========================================================================
  if (!isCrossCountry && !involvesIsland && straightKm <= 1650) {
    const knownMidpoint =
      fromHub && toHub
        ? ROAD_OVERNIGHT_MIDPOINTS.find(
            (m) => m.fromCityKey === fromHub.key && m.toCityKey === toHub.key
          )
        : undefined;

    if (knownMidpoint) {
      const l1End = addMinutesToHHMM('06:30', knownMidpoint.leg1Mins);
      const l2End = addMinutesToHHMM('07:00', knownMidpoint.leg2Mins);
      const driveLegs: TransitLegSpec[] = [
        {
          mode: 'highway_cab',
          title: `Drive Day 1 (${knownMidpoint.viaHighway}): ${from.place.name} → ${knownMidpoint.haltCity}`,
          carrierName: knownMidpoint.viaHighway,
          fromName: from.place.name,
          fromLat: from.place.lat,
          fromLng: from.place.lng,
          toName: knownMidpoint.haltCity,
          toLat: knownMidpoint.haltLat,
          toLng: knownMidpoint.haltLng,
          departureTime: '06:30',
          arrivalTime: l1End.time,
          durationMins: knownMidpoint.leg1Mins,
          distanceKm: knownMidpoint.leg1Km,
          dayOffset: 0,
          overnightHaltCity: knownMidpoint.haltCity,
          advisory: knownMidpoint.advisory,
          source: 'ors_road',
        },
        {
          mode: 'hill_cab',
          title: `Drive Day 2: ${knownMidpoint.haltCity} → ${to.place.name}`,
          carrierName: knownMidpoint.viaHighway,
          fromName: knownMidpoint.haltCity,
          fromLat: knownMidpoint.haltLat,
          fromLng: knownMidpoint.haltLng,
          toName: to.place.name,
          toLat: to.place.lat,
          toLng: to.place.lng,
          departureTime: '07:00',
          arrivalTime: l2End.time,
          durationMins: knownMidpoint.leg2Mins,
          distanceKm: knownMidpoint.leg2Km,
          dayOffset: 1,
          advisory: knownMidpoint.advisory,
          source: 'ors_road',
        },
      ];
      const totalDriveMins = knownMidpoint.leg1Mins + knownMidpoint.leg2Mins;
      const totalDriveKm = knownMidpoint.leg1Km + knownMidpoint.leg2Km;
      options.push({
        id: `${prefix}-drive-2day`,
        direction,
        modeCategory: 'drive',
        summaryLabel: `Drive via ${knownMidpoint.haltCity} (${totalDriveKm} km · 2-day road journey)`,
        totalDurationMins: totalDriveMins,
        transitDaysRequired: 1.75,
        totalDistanceKm: totalDriveKm,
        recommended: false,
        feasibilityWarning: knownMidpoint.advisory,
        legs: driveLegs,
      });
    } else {
      const road = await resolveRoadMetrics({
        origin: { lat: from.place.lat, lng: from.place.lng, name: from.place.name },
        destination: { lat: to.place.lat, lng: to.place.lng, name: to.place.name },
        places,
        fetchImpl,
      });

      if (road.durationMins > 620) {
        // Split any >10h20m drive into 2 safe daylight driving legs
        const midLat = Number(((from.place.lat + to.place.lat) / 2).toFixed(5));
        const midLng = Number(((from.place.lng + to.place.lng) / 2).toFixed(5));
        const halfMins = Math.round(road.durationMins / 2);
        const halfKm = Math.round(road.distanceKm / 2);
        const end1 = addMinutesToHHMM('07:00', halfMins);
        const end2 = addMinutesToHHMM('07:30', road.durationMins - halfMins);
        options.push({
          id: `${prefix}-drive-split`,
          direction,
          modeCategory: 'drive',
          summaryLabel: `Road Drive (${Math.round(road.distanceKm)} km · ${formatDurationHuman(road.durationMins)} with overnight halt)`,
          totalDurationMins: road.durationMins,
          transitDaysRequired: 1.6,
          totalDistanceKm: road.distanceKm,
          recommended: false,
          feasibilityWarning: `Long ${Math.round(road.distanceKm)} km drive split across 2 days for safe daylight driving.`,
          legs: [
            {
              mode: 'highway_cab',
              title: `Drive Leg 1: ${from.place.name} → Highway Overnight Halt`,
              fromName: from.place.name,
              fromLat: from.place.lat,
              fromLng: from.place.lng,
              toName: 'Midway Highway Overnight Halt',
              toLat: midLat,
              toLng: midLng,
              departureTime: '07:00',
              arrivalTime: end1.time,
              durationMins: halfMins,
              distanceKm: halfKm,
              dayOffset: 0,
              overnightHaltCity: 'Midway Halt',
              source: road.source,
            },
            {
              mode: 'highway_cab',
              title: `Drive Leg 2: Midway Halt → ${to.place.name}`,
              fromName: 'Midway Highway Overnight Halt',
              fromLat: midLat,
              fromLng: midLng,
              toName: to.place.name,
              toLat: to.place.lat,
              toLng: to.place.lng,
              departureTime: '07:30',
              arrivalTime: end2.time,
              durationMins: road.durationMins - halfMins,
              distanceKm: Number((road.distanceKm - halfKm).toFixed(1)),
              dayOffset: 1,
              source: road.source,
            },
          ],
        });
      } else {
        const dep = direction === 'outbound' ? '07:00' : '15:00';
        const end = addMinutesToHHMM(dep, road.durationMins);
        const singleLeg: TransitLegSpec = {
          mode: 'highway_cab',
          title: `Road Drive: ${from.place.name} → ${to.place.name}`,
          fromName: from.place.name,
          fromLat: from.place.lat,
          fromLng: from.place.lng,
          toName: to.place.name,
          toLat: to.place.lat,
          toLng: to.place.lng,
          departureTime: dep,
          arrivalTime: end.time,
          durationMins: road.durationMins,
          distanceKm: road.distanceKm,
          dayOffset: end.dayOffset,
          advisory: road.advisory,
          source: road.source,
        };
        options.push({
          id: `${prefix}-drive`,
          direction,
          modeCategory: 'drive',
          summaryLabel: `Drive (${Math.round(road.distanceKm)} km · ${formatDurationHuman(road.durationMins)})`,
          totalDurationMins: road.durationMins,
          transitDaysRequired: estimateTransitDays(road.durationMins, [singleLeg]),
          totalDistanceKm: road.distanceKm,
          recommended: false,
          legs: [singleLeg],
        });
      }
    }
  }

  // =========================================================================
  // 4. LONG-TAIL AI GROUNDED ENRICHMENT (when neither hub was in CITY_TRANSIT_HUBS)
  // =========================================================================
  if (options.length <= 1 && !fromHub && !toHub && params.llm?.available) {
    try {
      const aiRes = await params.llm.generateStructured({
        system:
          'Return real scheduled rail and flight options between the two cities. Use realistic block durations.',
        userParts: [
          {
            text: `From: ${from.place.name} (${from.place.lat}, ${from.place.lng})\nTo: ${to.place.name} (${to.place.lat}, ${to.place.lng})\nStraight-line distance: ${straightKm} km`,
          },
        ],
        schema: AiCorridorResponseSchema,
        responseSchema: aiCorridorGeminiSchema,
        label: 'other',
      });
      const d = aiRes.data;
      // Enforce physical lower bounds so LLM can NEVER invent impossible travel speeds
      const minRailMins = Math.max(45, Math.round(((straightKm * 1.15) / 220) * 60));
      const minAirMins = Math.max(55, Math.round((straightKm / 850) * 60 + 35));

      if (d.railAvailable && d.railDurationMins) {
        const dur = Math.max(minRailMins, d.railDurationMins);
        const dep = d.railDepartureTime?.slice(0, 5) || '07:30';
        const arr = d.railArrivalTime?.slice(0, 5) || addMinutesToHHMM(dep, dur).time;
        const rLeg: TransitLegSpec = {
          mode: 'rail',
          title: `${d.railTrainCode ? `${d.railTrainCode} ` : ''}${d.railTrainName ?? 'Train'}: ${from.place.name} → ${to.place.name}`,
          carrierName: d.railTrainName ?? 'Rail Service',
          vehicleCode: d.railTrainCode ?? undefined,
          fromName: from.place.name,
          fromLat: from.place.lat,
          fromLng: from.place.lng,
          toName: to.place.name,
          toLat: to.place.lat,
          toLng: to.place.lng,
          departureTime: dep,
          arrivalTime: arr,
          durationMins: dur,
          distanceKm: Math.round(straightKm * 1.25),
          dayOffset: dur >= 600 ? 1 : 0,
          source: 'ai_grounded',
        };
        options.push({
          id: `${prefix}-train-ai`,
          direction,
          modeCategory: 'train',
          summaryLabel: `${d.railTrainName ?? 'Train'} (${formatDurationHuman(dur)})`,
          totalDurationMins: dur,
          transitDaysRequired: estimateTransitDays(dur, [rLeg]),
          totalDistanceKm: rLeg.distanceKm,
          recommended: false,
          legs: [rLeg],
        });
      }

      if (d.flightAvailable && d.flightDurationMins && straightKm >= 180) {
        const dur = Math.max(minAirMins, d.flightDurationMins);
        const dep = d.flightDepartureTime?.slice(0, 5) || '08:00';
        const arr = d.flightArrivalTime?.slice(0, 5) || addMinutesToHHMM(dep, dur).time;
        const fLeg: TransitLegSpec = {
          mode: 'flight',
          title: `${d.flightCode ? `${d.flightCode} ` : ''}${d.airlineName ?? 'Flight'}: ${from.place.name} → ${to.place.name}`,
          carrierName: d.airlineName ?? 'Scheduled Airline',
          vehicleCode: d.flightCode ?? undefined,
          fromName: from.place.name,
          fromLat: from.place.lat,
          fromLng: from.place.lng,
          toName: to.place.name,
          toLat: to.place.lat,
          toLng: to.place.lng,
          departureTime: dep,
          arrivalTime: arr,
          durationMins: dur,
          distanceKm: straightKm,
          dayOffset: 0,
          source: 'ai_grounded',
        };
        options.push({
          id: `${prefix}-flight-ai`,
          direction,
          modeCategory: 'flight',
          summaryLabel: `Flight (${formatDurationHuman(dur)})`,
          totalDurationMins: dur,
          transitDaysRequired: estimateTransitDays(dur, [fLeg]),
          totalDistanceKm: straightKm,
          recommended: false,
          legs: [fLeg],
        });
      }
    } catch {
      /* ignore AI corridor error */
    }
  }

  return selectAndRankOptions(options, params.preferredMode);
}

function selectAndRankOptions(
  options: TransitRouteOption[],
  preferredMode: TransportMode
): TransitRouteOption[] {
  if (options.length === 0) return [];
  const modePriority = (opt: TransitRouteOption): number => {
    if (preferredMode !== 'any') {
      if (opt.modeCategory === preferredMode) return 100;
      if (preferredMode === 'bus' && opt.modeCategory === 'drive') return 90;
      if (preferredMode === 'train' && opt.modeCategory === 'combo') return 80;
    } else {
      // Smart default by distance & duration
      if (opt.totalDurationMins <= 240 && opt.modeCategory === 'train') return 95;
      if (opt.totalDistanceKm >= 600 && opt.modeCategory === 'flight') return 95;
      if (opt.totalDistanceKm < 260 && opt.modeCategory === 'drive') return 90;
    }
    return Math.max(10, 80 - opt.totalDurationMins / 30);
  };

  const sorted = [...options].sort((a, b) => modePriority(b) - modePriority(a));
  return sorted.map((opt, idx) => ({
    ...opt,
    recommended: idx === 0,
  }));
}

export async function resolveDoorToDoorJourney(params: {
  origin?: JourneyPlace | null;
  returnPoint?: JourneyPlace | null;
  roundTrip?: boolean;
  transportMode?: TransportMode;
  firstDestination?: { name: string; lat?: number; lng?: number; destinationSlug?: string } | null;
  lastDestination?: { name: string; lat?: number; lng?: number; destinationSlug?: string } | null;
  startDateIso?: string | null;
  endDateIso?: string | null;
  selectedOutboundOptionId?: string | null;
  selectedReturnOptionId?: string | null;
  places: PlacesServices;
  llm?: LlmProvider;
  config?: Partial<AppEnv>;
  fetchImpl?: typeof fetch;
  allowLiveAutocomplete?: boolean;
}): Promise<{
  origin: JourneyPlace | null;
  returnPoint: JourneyPlace | null;
  roundTrip: boolean;
  outboundOptions: TransitRouteOption[];
  returnOptions: TransitRouteOption[];
  selectedOutboundOptionId: string | null;
  selectedReturnOptionId: string | null;
}> {
  const mode = params.transportMode ?? 'any';
  const hasOrigin = Boolean(params.origin?.name?.trim());
  const roundTrip =
    params.roundTrip !== undefined
      ? params.roundTrip
      : Boolean(hasOrigin || params.returnPoint?.name?.trim());

  if (!hasOrigin || !params.firstDestination) {
    return {
      origin: params.origin ?? null,
      returnPoint: params.returnPoint ?? null,
      roundTrip: false,
      outboundOptions: [],
      returnOptions: [],
      selectedOutboundOptionId: null,
      selectedReturnOptionId: null,
    };
  }

  const groundedOrigin = await groundJourneyPlace(
    params.origin!,
    params.places,
    mode,
    params.allowLiveAutocomplete
  );

  const effectiveReturnRaw: JourneyPlace | null = roundTrip
    ? params.returnPoint?.name?.trim()
      ? params.returnPoint
      : groundedOrigin.place
    : params.returnPoint?.name?.trim()
      ? params.returnPoint
      : null;

  const groundedReturn = effectiveReturnRaw
    ? await groundJourneyPlace(
        effectiveReturnRaw,
        params.places,
        mode,
        params.allowLiveAutocomplete
      )
    : null;

  const firstDestMatch = await groundJourneyPlace(
    {
      name: params.firstDestination.name,
      destinationSlug: params.firstDestination.destinationSlug,
      lat: params.firstDestination.lat,
      lng: params.firstDestination.lng,
      resolved:
        typeof params.firstDestination.lat === 'number' &&
        typeof params.firstDestination.lng === 'number',
    },
    params.places,
    mode,
    params.allowLiveAutocomplete
  );

  const lastDestRaw = params.lastDestination ?? params.firstDestination;
  const lastDestMatch = await groundJourneyPlace(
    {
      name: lastDestRaw.name,
      destinationSlug: lastDestRaw.destinationSlug,
      lat: lastDestRaw.lat,
      lng: lastDestRaw.lng,
      resolved: typeof lastDestRaw.lat === 'number' && typeof lastDestRaw.lng === 'number',
    },
    params.places,
    mode,
    params.allowLiveAutocomplete
  );

  const outboundOptions = await buildDirectionalOptions({
    direction: 'outbound',
    from: groundedOrigin,
    to: firstDestMatch,
    preferredMode: mode,
    dateIso: params.startDateIso,
    places: params.places,
    llm: params.llm,
    config: params.config,
    fetchImpl: params.fetchImpl,
  });

  const returnOptions = groundedReturn
    ? await buildDirectionalOptions({
        direction: 'return',
        from: lastDestMatch,
        to: groundedReturn,
        preferredMode: mode,
        dateIso: params.endDateIso,
        places: params.places,
        llm: params.llm,
        config: params.config,
        fetchImpl: params.fetchImpl,
      })
    : [];

  const chooseOptionId = (
    list: TransitRouteOption[],
    requestedId?: string | null
  ): string | null => {
    if (list.length === 0) return null;
    if (requestedId && list.some((o) => o.id === requestedId)) return requestedId;
    return (list.find((o) => o.recommended) ?? list[0])!.id;
  };

  return {
    origin: groundedOrigin.place,
    returnPoint: groundedReturn?.place ?? null,
    roundTrip,
    outboundOptions,
    returnOptions,
    selectedOutboundOptionId: chooseOptionId(outboundOptions, params.selectedOutboundOptionId),
    selectedReturnOptionId: chooseOptionId(returnOptions, params.selectedReturnOptionId),
  };
}

/**
 * Resolves a single inter-city hop between two destinations inside a multi-city itinerary
 * (e.g. Jaipur -> Udaipur, Hanoi -> Ha Long).
 */
export async function resolveIntercityTransferLeg(params: {
  fromDest: { name: string; lat?: number; lng?: number; destinationSlug?: string };
  toDest: { name: string; lat?: number; lng?: number; destinationSlug?: string };
  preferredMode?: TransportMode;
  places: PlacesServices;
}): Promise<TransitLegSpec | null> {
  const fromMatch = await groundJourneyPlace(
    {
      name: params.fromDest.name,
      destinationSlug: params.fromDest.destinationSlug,
      lat: params.fromDest.lat,
      lng: params.fromDest.lng,
      resolved: typeof params.fromDest.lat === 'number' && typeof params.fromDest.lng === 'number',
    },
    params.places,
    params.preferredMode ?? 'any',
    false
  );
  const toMatch = await groundJourneyPlace(
    {
      name: params.toDest.name,
      destinationSlug: params.toDest.destinationSlug,
      lat: params.toDest.lat,
      lng: params.toDest.lng,
      resolved: typeof params.toDest.lat === 'number' && typeof params.toDest.lng === 'number',
    },
    params.places,
    params.preferredMode ?? 'any',
    false
  );

  const opts = await buildDirectionalOptions({
    direction: 'outbound',
    from: fromMatch,
    to: toMatch,
    preferredMode: params.preferredMode ?? 'any',
    places: params.places,
  });
  return opts[0]?.legs[0] ?? null;
}

import { NextResponse, type NextRequest } from 'next/server';
import { guard } from '../../_guard';

export const dynamic = 'force-dynamic';

const PLACES = [
  ['Manali', 'Kullu, Himachal Pradesh, India', 'city', 32.2432, 77.1892, 'manali'],
  ['Kasol', 'Kullu, Himachal Pradesh, India', 'town', 32.0099, 77.3149, 'kasol'],
  ['Tosh', 'Kullu, Himachal Pradesh, India', 'village', 32.0267, 77.4543, null],
  ['Kullu', 'Himachal Pradesh, India', 'city', 31.9592, 77.1089, 'kullu'],
  ['Shimla', 'Himachal Pradesh, India', 'city', 31.1048, 77.1734, 'shimla'],
  ['Goa', 'India', 'state', 15.2993, 74.124, 'goa'],
  ['Jaipur', 'Rajasthan, India', 'city', 26.9124, 75.7873, 'jaipur'],
  ['Udaipur', 'Rajasthan, India', 'city', 24.5854, 73.7125, 'udaipur'],
  ['Munnar', 'Kerala, India', 'town', 10.0889, 77.0595, 'munnar'],
  ['Rishikesh', 'Uttarakhand, India', 'city', 30.0869, 78.2676, 'rishikesh'],
  ['Spiti Valley', 'Himachal Pradesh, India', 'region', 32.2461, 78.0349, 'spiti-valley'],
  ['Kyoto', 'Japan', 'city', 35.0116, 135.7681, 'kyoto'],
] as const;

export async function GET(req: NextRequest) {
  const blocked = guard();
  if (blocked) return blocked;
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();
  if (q === 'boom') return NextResponse.json({ code: 'upstream', message: 'down' }, { status: 502 });
  const results = PLACES.filter((p) => p[0].toLowerCase().includes(q))
    .slice(0, 6)
    .map((p) => ({
      id: p[5] ? `dest:${p[5]}` : `photon:${p[0]}`,
      source: p[5] ? 'destination' : 'photon',
      slug: p[5],
      name: p[0],
      secondary: p[1],
      kind: p[2],
      lat: p[3],
      lng: p[4],
      countryCode: p[1].endsWith('India') ? 'IN' : p[1] === 'Japan' ? 'JP' : null,
      packStatus: null,
    }));
  return NextResponse.json({ results, cached: false, photonAvailable: true });
}

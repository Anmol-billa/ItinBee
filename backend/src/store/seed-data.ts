import { buildGoogleMapsPlaceUrl } from '../modules/geo/curated-india-pois.js';
import { generateInitialSortKeys } from '../modules/sync/lexorank.js';
import { formatHlc } from '../modules/sync/hlc.js';

export const SEED_IDS = {
  users: {
    ananya: '11111111-1111-4111-8111-111111111101',
    rohan: '11111111-1111-4111-8111-111111111102',
    meera: '11111111-1111-4111-8111-111111111103',
    karthik: '11111111-1111-4111-8111-111111111104',
  },
  trips: {
    rishikeshLandour: '22222222-2222-4222-8222-222222222201',
    southGoa: '22222222-2222-4222-8222-222222222202',
    varanasiSenior: '22222222-2222-4222-8222-222222222203',
    vietnam7d: '22222222-2222-4222-8222-222222222204',
  },
} as const;

export interface SeedDataset {
  users: Array<{
    id: string;
    phone: string;
    displayName: string;
    preferredLang: string;
    upiVpa: string;
    tier: 'free' | 'trip_pass' | 'pro';
  }>;
  trips: Array<{
    id: string;
    shortId: string;
    title: string;
    destinationSummary: string;
    startDate: string;
    endDate: string;
    homeCurrency: 'INR';
    elderModeEnabled: boolean;
    members: Array<{
      userId: string;
      role: 'owner' | 'editor' | 'contributor' | 'viewer';
      vaultAccess: boolean;
      dietaryTags: string[];
    }>;
    days: Array<{
      id: string;
      dayNumber: number;
      date: string;
      themeTitle: string;
      pacingLevel: 'relaxed' | 'moderate' | 'packed';
      items: Array<{
        id: string;
        kind: 'stay' | 'transit' | 'activity' | 'meal' | 'note';
        title: string;
        notes: string;
        lat: number;
        lng: number;
        placeRefId: string;
        addressLocalScript: string;
        startTime: string;
        durationMins: number;
        dietaryFlags: string[];
        accessibilityNotes: string;
        elderSummaryI18n: { en: string; hi: string };
      }>;
    }>;
    bookings: Array<{
      id: string;
      itemId: string;
      provider: 'irctc' | 'indigo' | 'redbus' | 'mmt' | 'airbnb' | 'homestay';
      pnrPlain: string;
      status: 'confirmed' | 'rac' | 'wl';
      rawDocS3Key: string;
      parserConfidence: number;
      summaryHeadline: string;
      routeLabel?: string;
      vehicleNumber?: string;
      coach?: string;
      seatOrBerth?: string;
      passengers: Array<{
        name: string;
        age: number;
        gender: string;
        seatOrBerth?: string;
        coach?: string;
        idNumber?: string;
        isPrimaryUser?: boolean;
      }>;
    }>;
    polls: Array<{
      id: string;
      question: string;
      options: Array<{ id: string; label: string; subtitle?: string }>;
    }>;
  }>;
}

export function buildPreSeededSampleDataset(): SeedDataset {
  return {
    users: [
      {
        id: SEED_IDS.users.ananya,
        phone: '+919810011101',
        displayName: 'Ananya Sharma',
        preferredLang: 'en',
        upiVpa: 'ananya.sharma@okicici',
        tier: 'free',
      },
      {
        id: SEED_IDS.users.rohan,
        phone: '+919820022202',
        displayName: 'Rohan Kulkarni',
        preferredLang: 'en',
        upiVpa: 'rohank@okhdfcbank',
        tier: 'free',
      },
      {
        id: SEED_IDS.users.meera,
        phone: '+919830033303',
        displayName: 'Meera Iyer',
        preferredLang: 'hi',
        upiVpa: 'meeraiyer@oksbi',
        tier: 'free',
      },
      {
        id: SEED_IDS.users.karthik,
        phone: '+919840044404',
        displayName: 'Karthik Nair',
        preferredLang: 'en',
        upiVpa: 'karthik.n@okaxis',
        tier: 'free',
      },
    ],
    trips: [
      // 1. Rishikesh–Landour 4D (Sample Itinerary)
      {
        id: SEED_IDS.trips.rishikeshLandour,
        shortId: 'rishi-lnd-4d',
        title: 'Rishikesh–Landour 4D (Sample Itinerary)',
        destinationSummary: 'Haridwar · Rishikesh · Mussoorie · Landour (4D)',
        startDate: '2026-12-10',
        endDate: '2026-12-13',
        homeCurrency: 'INR',
        elderModeEnabled: true,
        members: [
          {
            userId: SEED_IDS.users.ananya,
            role: 'owner',
            vaultAccess: true,
            dietaryTags: [],
          },
          {
            userId: SEED_IDS.users.meera,
            role: 'editor',
            vaultAccess: true,
            dietaryTags: ['vegetarian', 'non_drinker'],
          },
        ],
        days: [
          {
            id: '33333333-3333-4333-8333-333333333101',
            dayNumber: 1,
            date: '2026-12-10',
            themeTitle: 'Shatabdi Arrival at Haridwar & Ganga Aarti at Parmarth',
            pacingLevel: 'moderate',
            items: [
              {
                id: '44444444-4444-4444-8444-444444444101',
                kind: 'transit',
                title: 'Train 12017 Dehradun Shatabdi Arrival (NDLS → HW)',
                notes: 'Coach C4, Seats 21–22. Prepaid cab transfer from Haridwar Jn.',
                lat: 29.9457,
                lng: 78.1642,
                placeRefId: 'in-hw-jn',
                addressLocalScript: 'हरिद्वार जंक्शन रेलवे स्टेशन, प्लेटफ़ॉर्म 1',
                startTime: '11:15',
                durationMins: 45,
                dietaryFlags: ['pure_veg'],
                accessibilityNotes: 'Battery cart & lift at Platform 1 exit toward prepaid cab stand.',
                elderSummaryI18n: {
                  en: '11:15 AM Arrive Haridwar Jn on Shatabdi 12017 (Chair Car C4) & board cab to Rishikesh.',
                  hi: 'सुबह ११:१५ बजे शताब्दी ट्रेन (कोच C4) से हरिद्वार आगमन और ऋषिकेश हेतु गाड़ी प्रस्थान।',
                },
              },
              {
                id: '44444444-4444-4444-8444-444444444102',
                kind: 'activity',
                title: 'Parmarth Niketan Ganga Aarti Ghat',
                notes: 'Reach ghat steps by 17:15 ahead of winter sunset aarti.',
                lat: 30.1193,
                lng: 78.3125,
                placeRefId: 'osm:way:parmarth-niketan-rishikesh',
                addressLocalScript: 'स्वर्ग आश्रम, ऋषिकेश, उत्तराखंड २४९३०४',
                startTime: '17:15',
                durationMins: 90,
                dietaryFlags: ['pure_veg', 'satvik'],
                accessibilityNotes: 'Flat paved ghat walk from Ram Jhula boat jetty.',
                elderSummaryI18n: {
                  en: '05:15 PM Evening Ganga Aarti at Parmarth Niketan Ghat (seated front terrace).',
                  hi: 'शाम ०५:१५ बजे परमार्थ निकेतन घाट पर संध्या गंगा आरती (बैठने की सुगम व्यवस्था)।',
                },
              },
            ],
          },
          {
            id: '33333333-3333-4333-8333-333333333102',
            dayNumber: 2,
            date: '2026-12-11',
            themeTitle: 'Triveni Ghat Morning & Mountain Cab Ascent to Landour (1.9x Ghat)',
            pacingLevel: 'relaxed',
            items: [
              {
                id: '44444444-4444-4444-8444-444444444103',
                kind: 'activity',
                title: 'Triveni Ghat Morning Promenade',
                notes: 'Calm morning riverside walk before mountain cab pickup for Landour.',
                lat: 30.1033,
                lng: 78.2948,
                placeRefId: 'in-triveni-ghat',
                addressLocalScript: 'त्रिवेणी घाट, ऋषिकेश, उत्तराखंड',
                startTime: '08:30',
                durationMins: 75,
                dietaryFlags: ['pure_veg', 'satvik'],
                accessibilityNotes: 'Step-free ramp at Gate 2 with level riverside marble benches.',
                elderSummaryI18n: {
                  en: '08:30 AM Peaceful riverside morning walk at Triveni Ghat.',
                  hi: 'सुबह ०८:३० बजे त्रिवेणी घाट पर शांत प्रातः भ्रमण।',
                },
              },
              {
                id: '44444444-4444-4444-8444-444444444104',
                kind: 'meal',
                title: 'Char Dukan Pancakes & Ginger Lemon Tea, Landour',
                notes: 'Hill switchback ascent completes before 16:00 sunset window.',
                lat: 30.4631,
                lng: 78.0972,
                placeRefId: 'osm:node:char-dukan-landour',
                addressLocalScript: 'चार दुकान, लंढौर छावनी, मसूरी २४८१७९',
                startTime: '15:30',
                durationMins: 75,
                dietaryFlags: ['veg_friendly', 'eggless_options'],
                accessibilityNotes: 'Direct cab drop at St. Pauls Church square; zero steep climb.',
                elderSummaryI18n: {
                  en: '03:30 PM Hot ginger-lemon tea & snacks at Char Dukan, Landour (cab drops right outside).',
                  hi: 'दोपहर ०३:३० बजे चार दुकान, लंढौर में गर्म अदरक-नींबू चाय और जलपान (गाड़ी सीधे पास रुकेगी)।',
                },
              },
            ],
          },
          {
            id: '33333333-3333-4333-8333-333333333103',
            dayNumber: 3,
            date: '2026-12-12',
            themeTitle: 'Lal Tibba Himalayan Crest & Sister Bazaar',
            pacingLevel: 'relaxed',
            items: [
              {
                id: '44444444-4444-4444-8444-444444444105',
                kind: 'activity',
                title: 'Lal Tibba Scenic Point',
                notes: 'Clear morning Bandarpoonch & Kedarnath peak visibility.',
                lat: 30.4675,
                lng: 78.0947,
                placeRefId: 'osm:node:lal-tibba-landour',
                addressLocalScript: 'लाल टिब्बा, लंढौर चक्कर, मसूरी',
                startTime: '08:30',
                durationMins: 90,
                dietaryFlags: ['veg_friendly'],
                accessibilityNotes: '18 steps to upper viewing deck; ground cafe seating available.',
                elderSummaryI18n: {
                  en: '08:30 AM Snow-peak darshan from Lal Tibba Viewpoint.',
                  hi: 'सुबह ०८:३० बजे लाल टिब्बा से हिमालय की बर्फीली चोटियों के दर्शन।',
                },
              },
            ],
          },
          {
            id: '33333333-3333-4333-8333-333333333104',
            dayNumber: 4,
            date: '2026-12-13',
            themeTitle: 'Descent to Jolly Grant Airport (DED)',
            pacingLevel: 'relaxed',
            items: [
              {
                id: '44444444-4444-4444-8444-444444444106',
                kind: 'transit',
                title: 'Jolly Grant Airport Dehradun (DED) Departure',
                notes: 'Allow 2h 30m mountain descent buffer from Landour.',
                lat: 30.1897,
                lng: 78.1803,
                placeRefId: 'wikidata:Q15229621:ded-airport',
                addressLocalScript: 'जॉली ग्रांट एयरपोर्ट, देहरादून',
                startTime: '14:15',
                durationMins: 120,
                dietaryFlags: ['veg_friendly'],
                accessibilityNotes: 'Single ground-level terminal.',
                elderSummaryI18n: {
                  en: '02:15 PM Reach Dehradun Jolly Grant Airport for afternoon return flight.',
                  hi: 'दोपहर ०२:१५ बजे देहरादून जॉली ग्रांट एयरपोर्ट से वापसी उड़ान।',
                },
              },
            ],
          },
        ],
        bookings: [
          {
            id: '55555555-5555-4555-8555-555555555101',
            itemId: '44444444-4444-4444-8444-444444444101',
            provider: 'irctc',
            pnrPlain: '2451987842',
            status: 'confirmed',
            rawDocS3Key: 'ap-south-1/itinbee-vault-ap-south-1/trips/seed/irctc-12017.pdf.enc',
            parserConfidence: 1.0,
            summaryHeadline: 'Train 12017 Dehradun Shatabdi (CNF • Coach C4 • Berth 21/22)',
            routeLabel: 'NDLS → HW',
            vehicleNumber: '12017',
            coach: 'C4',
            seatOrBerth: '21, 22',
            passengers: [
              {
                name: 'Ananya Sharma',
                age: 29,
                gender: 'F',
                coach: 'C4',
                seatOrBerth: '21',
                idNumber: '4589-2310-7741',
                isPrimaryUser: true,
              },
              {
                name: 'Meera Iyer',
                age: 58,
                gender: 'F',
                coach: 'C4',
                seatOrBerth: '22',
                idNumber: '6721-9043-1198',
                isPrimaryUser: false,
              },
            ],
          },
        ],
        polls: [
          {
            id: '66666666-6666-4666-8666-666666666101',
            question: 'Landour Stay Pick for Dec 11–13 (2 Nights)?',
            options: [
              { id: 'opt-rokeby', label: 'Rokeby Manor', subtitle: 'Sister Bazaar · Heritage Stone Rooms' },
              { id: 'opt-deodar', label: 'La Villa Bethany', subtitle: 'Quiet Cedar Slope · Homestay Breakfast' },
            ],
          },
        ],
      },

      // 2. South Goa Crew 5D (Sample Itinerary)
      {
        id: SEED_IDS.trips.southGoa,
        shortId: 'goa-south-5d',
        title: 'South Goa Crew 5D (Sample Itinerary)',
        destinationSummary: 'Palolem · Agonda · Cabo de Rama, South Goa',
        startDate: '2026-12-18',
        endDate: '2026-12-22',
        homeCurrency: 'INR',
        elderModeEnabled: false,
        members: [
          {
            userId: SEED_IDS.users.ananya,
            role: 'owner',
            vaultAccess: true,
            dietaryTags: [],
          },
          {
            userId: SEED_IDS.users.rohan,
            role: 'editor',
            vaultAccess: true,
            dietaryTags: [],
          },
          {
            userId: SEED_IDS.users.meera,
            role: 'contributor',
            vaultAccess: false,
            dietaryTags: ['vegetarian', 'non_drinker'],
          },
          {
            userId: SEED_IDS.users.karthik,
            role: 'contributor',
            vaultAccess: false,
            dietaryTags: ['non_drinker'],
          },
        ],
        days: [
          {
            id: '33333333-3333-4333-8333-333333333201',
            dayNumber: 1,
            date: '2026-12-18',
            themeTitle: 'Morning Flight & Sunset Kayaking at Palolem',
            pacingLevel: 'moderate',
            items: [
              {
                id: '44444444-4444-4444-8444-444444444201',
                kind: 'beach' === 'beach' ? 'activity' : 'activity',
                title: 'Palolem Beach Sunset Kayak',
                notes: 'Meet near central boat jetty at 16:45.',
                lat: 15.01,
                lng: 74.0232,
                placeRefId: 'osm:way:palolem-beach-canacona',
                addressLocalScript: 'पालोलेम बीच, काणकोण, दक्षिण गोवा ४०३७०२',
                startTime: '16:45',
                durationMins: 105,
                dietaryFlags: ['veg_friendly', 'seafood'],
                accessibilityNotes: 'Boardwalk ramp near central parking.',
                elderSummaryI18n: {
                  en: '04:45 PM Sunset shoreline walk & calm bay boating at Palolem Beach.',
                  hi: 'शाम ०४:४५ बजे पालोलेम बीच पर सूर्यास्त भ्रमण।',
                },
              },
            ],
          },
          {
            id: '33333333-3333-4333-8333-333333333202',
            dayNumber: 2,
            date: '2026-12-19',
            themeTitle: 'Agonda Morning & Cabo de Rama Cliff Lookout',
            pacingLevel: 'relaxed',
            items: [
              {
                id: '44444444-4444-4444-8444-444444444202',
                kind: 'activity',
                title: 'Agonda Beach Morning Swim & Cafe Breakfast',
                notes: 'Quiet south-end shoreline.',
                lat: 15.0447,
                lng: 73.9859,
                placeRefId: 'osm:way:agonda-beach-south-goa',
                addressLocalScript: 'अगोंडा बीच, दक्षिण गोवा',
                startTime: '09:00',
                durationMins: 150,
                dietaryFlags: ['veg_friendly', 'vegan_options'],
                accessibilityNotes: '40m sandy path from road.',
                elderSummaryI18n: {
                  en: '09:00 AM Relaxed morning by Agonda Beach.',
                  hi: 'सुबह ०९:०० बजे अगोंडा बीच पर शांत सुबह।',
                },
              },
              {
                id: '44444444-4444-4444-8444-444444444203',
                kind: 'activity',
                title: 'Cabo de Rama Fort & Cliff Viewpoint',
                notes: 'Golden hour cliff views.',
                lat: 15.0888,
                lng: 73.9272,
                placeRefId: 'wikidata:Q5015726:cabo-de-rama',
                addressLocalScript: 'काबो दे रामा किला, दक्षिण गोवा',
                startTime: '16:30',
                durationMins: 90,
                dietaryFlags: ['veg_friendly'],
                accessibilityNotes: 'Laterite stone steps at fort gate.',
                elderSummaryI18n: {
                  en: '04:30 PM Cabo de Rama sea cliff viewpoint.',
                  hi: 'शाम ०४:३० बजे काबो दे रामा समुद्र व्यू पॉइंट।',
                },
              },
            ],
          },
        ],
        bookings: [
          {
            id: '55555555-5555-4555-8555-555555555201',
            itemId: '44444444-4444-4444-8444-444444444201',
            provider: 'indigo',
            pnrPlain: 'K8M4Q2',
            status: 'confirmed',
            rawDocS3Key: 'ap-south-1/itinbee-vault-ap-south-1/trips/seed/indigo-6e2045.pdf.enc',
            parserConfidence: 1.0,
            summaryHeadline: 'IndiGo 6E-2045 DEL → GOI (T1)',
            routeLabel: 'DEL → GOI',
            vehicleNumber: '6E-2045',
            seatOrBerth: '12A',
            passengers: [
              {
                name: 'Ananya Sharma',
                age: 29,
                gender: 'F',
                seatOrBerth: '12A',
                isPrimaryUser: true,
              },
            ],
          },
        ],
        polls: [
          {
            id: '66666666-6666-4666-8666-666666666201',
            question: 'Saturday Night Crew Dinner Spot?',
            options: [
              { id: 'opt-martins', label: "Martin's Corner Betalbatim", subtitle: 'Goan Classic + Full Veg Menu' },
              { id: 'opt-cape', label: 'The Cape Goa', subtitle: 'Cliffside Sunset Tables at Cabo de Rama' },
              { id: 'opt-zest', label: 'Zest Cafe Agonda', subtitle: '100% Plant-Based & Woodfired Pizza' },
            ],
          },
        ],
      },

      // 3. Varanasi Senior Yatra 3D (Sample Itinerary)
      {
        id: SEED_IDS.trips.varanasiSenior,
        shortId: 'kashi-snr-3d',
        title: 'Varanasi–Ayodhya Senior Yatra 3D (Sample Itinerary)',
        destinationSummary: 'Kashi Vishwanath · Assi Ghat · Shri Ram Mandir Ayodhya',
        startDate: '2026-11-26',
        endDate: '2026-11-28',
        homeCurrency: 'INR',
        elderModeEnabled: true,
        members: [
          {
            userId: SEED_IDS.users.meera,
            role: 'owner',
            vaultAccess: true,
            dietaryTags: ['pure_veg', 'vegetarian', 'non_drinker'],
          },
          {
            userId: SEED_IDS.users.ananya,
            role: 'editor',
            vaultAccess: true,
            dietaryTags: [],
          },
        ],
        days: [
          {
            id: '33333333-3333-4333-8333-333333333301',
            dayNumber: 1,
            date: '2026-11-26',
            themeTitle: 'Sugam Darshan & Bajra Boat Sandhya Aarti',
            pacingLevel: 'relaxed',
            items: [
              {
                id: '44444444-4444-4444-8444-444444444301',
                kind: 'activity',
                title: 'Shri Kashi Vishwanath Dham (Gate 4 Sugam Darshan)',
                notes: 'Pre-booked Sugam Darshan slot; keep Aadhaar original handy; phones in Gate 4 locker.',
                lat: 25.3109,
                lng: 83.0107,
                placeRefId: 'wikidata:Q4686668:kashi-vishwanath',
                addressLocalScript: 'श्री काशी विश्वनाथ धाम, गेट ४ गोदौलिया मार्ग, वाराणसी २२१००१',
                startTime: '09:30',
                durationMins: 120,
                dietaryFlags: ['pure_veg', 'satvik', 'jain_nearby'],
                accessibilityNotes: 'E-rickshaw drop right to Gate 4; wheelchair & escalator access available.',
                elderSummaryI18n: {
                  en: '09:30 AM Shri Kashi Vishwanath Sugam Darshan via Gate 4 (wheelchair & lift access; afternoon rest 1:00–4:30 PM).',
                  hi: 'सुबह ०९:३० बजे श्री काशी विश्वनाथ सुगम दर्शन — गेट ४ से प्रवेश (व्हीलचेयर व एस्केलेटर उपलब्ध; दोपहर १ से ४:३० विश्राम)।',
                },
              },
              {
                id: '44444444-4444-4444-8444-444444444302',
                kind: 'activity',
                title: 'Assi Ghat Boarding → Dashashwamedh Ganga Aarti by Boat',
                notes: 'Board private Bajra boat directly at Assi Ghat to skip steep Godowlia crowd steps.',
                lat: 25.289,
                lng: 83.0066,
                placeRefId: 'wikidata:Q2087620:assi-ghat',
                addressLocalScript: 'अस्सी घाट, वाराणसी २२१००५',
                startTime: '17:00',
                durationMins: 110,
                dietaryFlags: ['pure_veg', 'satvik'],
                accessibilityNotes: 'Direct cab drop at Assi Ghat plaza—minimal steps onto wide deck boat.',
                elderSummaryI18n: {
                  en: '05:00 PM Cab drops directly at Assi Ghat for seated boat view of Ganga Aarti.',
                  hi: 'शाम ०५:०० बजे गाड़ी सीधे अस्सी घाट तक जाएगी; नाव पर बैठकर संध्या गंगा आरती दर्शन।',
                },
              },
            ],
          },
          {
            id: '33333333-3333-4333-8333-333333333302',
            dayNumber: 2,
            date: '2026-11-27',
            themeTitle: 'Ayodhya Shri Ram Janmabhoomi Darshan',
            pacingLevel: 'relaxed',
            items: [
              {
                id: '44444444-4444-4444-8444-444444444303',
                kind: 'activity',
                title: 'Shri Ram Janmabhoomi Mandir, Ayodhya',
                notes: 'Free senior battery golf-carts available from Janmabhoomi Path entrance.',
                lat: 26.7956,
                lng: 82.1944,
                placeRefId: 'wikidata:Q110223544:ram-mandir-ayodhya',
                addressLocalScript: 'श्री राम जन्मभूमि पथ, अयोध्या, उत्तर प्रदेश २२४१२३',
                startTime: '10:30',
                durationMins: 150,
                dietaryFlags: ['pure_veg', 'satvik', 'jain_friendly'],
                accessibilityNotes: 'Battery golf-cart + senior lift bypassing 32 marble steps.',
                elderSummaryI18n: {
                  en: '10:30 AM Shri Ram Mandir Darshan in Ayodhya (free golf-cart & lift for seniors).',
                  hi: 'सुबह १०:३० बजे अयोध्या श्री राम जन्मभूमि मंदिर दर्शन (वरिष्ठ नागरिकों हेतु निःशुल्क गोल्फ-कार्ट व लिफ्ट)।',
                },
              },
            ],
          },
        ],
        bookings: [
          {
            id: '55555555-5555-4555-8555-555555555301',
            itemId: '44444444-4444-4444-8444-444444444301',
            provider: 'irctc',
            pnrPlain: '8910442639',
            status: 'confirmed',
            rawDocS3Key: 'ap-south-1/itinbee-vault-ap-south-1/trips/seed/irctc-22436.pdf.enc',
            parserConfidence: 1.0,
            summaryHeadline: 'Train 22436 Vande Bharat Express (CNF • Coach E1 • Berth 14/15)',
            routeLabel: 'NDLS → BSB',
            vehicleNumber: '22436',
            coach: 'E1',
            seatOrBerth: '14, 15',
            passengers: [
              {
                name: 'Meera Iyer',
                age: 58,
                gender: 'F',
                coach: 'E1',
                seatOrBerth: '14',
                idNumber: '6721-9043-1198',
                isPrimaryUser: true,
              },
              {
                name: 'Suresh Iyer',
                age: 64,
                gender: 'M',
                coach: 'E1',
                seatOrBerth: '15',
                idNumber: '8832-1190-5520',
                isPrimaryUser: false,
              },
            ],
          },
        ],
        polls: [],
      },

      // 4. Vietnam 7D Outbound Corridor (Sample Itinerary)
      {
        id: SEED_IDS.trips.vietnam7d,
        shortId: 'vietnam-7d',
        title: 'Vietnam 7D from Bengaluru (Sample Itinerary)',
        destinationSummary: 'Hanoi · Ha Long Bay · Da Nang · Hoi An, Vietnam',
        startDate: '2027-01-14',
        endDate: '2027-01-20',
        homeCurrency: 'INR',
        elderModeEnabled: false,
        members: [
          {
            userId: SEED_IDS.users.karthik,
            role: 'owner',
            vaultAccess: true,
            dietaryTags: [],
          },
          {
            userId: SEED_IDS.users.ananya,
            role: 'editor',
            vaultAccess: true,
            dietaryTags: [],
          },
        ],
        days: [
          {
            id: '33333333-3333-4333-8333-333333333401',
            dayNumber: 1,
            date: '2027-01-14',
            themeTitle: 'Arrive Hanoi & Hoan Kiem Walking Loop',
            pacingLevel: 'moderate',
            items: [
              {
                id: '44444444-4444-4444-8444-444444444401',
                kind: 'activity',
                title: 'Hoan Kiem Lake & Hanoi Old Quarter',
                notes: 'Pick up Viettel eSIM & try egg coffee / vegan chay lunch.',
                lat: 21.0285,
                lng: 105.8542,
                placeRefId: 'wikidata:Q1856241:hanoi-old-quarter',
                addressLocalScript: 'Hồ Hoàn Kiếm, Phố Cổ Hà Nội, Việt Nam',
                startTime: '15:00',
                durationMins: 150,
                dietaryFlags: ['indian_veg_nearby', 'vegan_chay'],
                accessibilityNotes: 'Flat lakeside pedestrian promenade.',
                elderSummaryI18n: {
                  en: '03:00 PM Stroll around Hoan Kiem Lake in Hanoi.',
                  hi: 'दोपहर ०३:०० बजे हनोई होआन कीम झील भ्रमण।',
                },
              },
            ],
          },
          {
            id: '33333333-3333-4333-8333-333333333402',
            dayNumber: 2,
            date: '2027-01-15',
            themeTitle: 'Ha Long Bay Limestone Karst Cruise',
            pacingLevel: 'relaxed',
            items: [
              {
                id: '44444444-4444-4444-8444-444444444402',
                kind: 'activity',
                title: 'Tuan Chau International Marina (Ha Long Bay Cruise)',
                notes: 'Vegetarian Indian/Chay meals pre-requested on cruise manifest.',
                lat: 20.9302,
                lng: 106.9885,
                placeRefId: 'wikidata:Q190128:ha-long-bay-pier',
                addressLocalScript: 'Cảng Tàu Quốc Tế Tuần Châu, Hạ Long',
                startTime: '11:30',
                durationMins: 300,
                dietaryFlags: ['veg_prebook_available'],
                accessibilityNotes: 'Check tender boat steps.',
                elderSummaryI18n: {
                  en: '11:30 AM Board Ha Long Bay scenic cruise at Tuan Chau Marina.',
                  hi: 'सुबह ११:३० बजे हा लॉन्ग बे क्रूज़ बोर्डिंग।',
                },
              },
            ],
          },
          {
            id: '33333333-3333-4333-8333-333333333403',
            dayNumber: 3,
            date: '2027-01-16',
            themeTitle: 'Hoi An Ancient Town Lantern Evening',
            pacingLevel: 'relaxed',
            items: [
              {
                id: '44444444-4444-4444-8444-444444444403',
                kind: 'activity',
                title: 'Hoi An Ancient Town Lantern Quarter',
                notes: 'Evening Thu Bon river lantern boat.',
                lat: 15.8775,
                lng: 108.3267,
                placeRefId: 'wikidata:Q36062:hoi-an-ancient-town',
                addressLocalScript: 'Phố Cổ Hội An, Quảng Nam, Việt Nam',
                startTime: '17:30',
                durationMins: 150,
                dietaryFlags: ['indian_veg_nearby', 'vegan_chay'],
                accessibilityNotes: 'Motorbike-free flat heritage streets.',
                elderSummaryI18n: {
                  en: '05:30 PM Hoi An Lantern Quarter riverside walk.',
                  hi: 'शाम ०५:३० बजे होई एन लालटेन बाज़ार और नदी भ्रमण।',
                },
              },
            ],
          },
        ],
        bookings: [],
        polls: [],
      },
    ],
  };
}

export function helperSeedItemProps(lat: number, lng: number, idx: number, total: number) {
  const keys = generateInitialSortKeys(total);
  return {
    sortKey: keys[idx] ?? 'V0',
    hlcTimestamp: formatHlc({ wallMs: 1763596800000 + idx, logical: 0, nodeId: 'seed' }),
    googleMapsUrl: buildGoogleMapsPlaceUrl(lat, lng),
  };
}

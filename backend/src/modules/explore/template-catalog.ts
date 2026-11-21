import type { ItemKind } from '../../types/domain.js';
import type {
  ExploreBudgetTier,
  ExploreCard,
  ExploreDay,
  ExploreDetail,
  ImageCredit,
} from './types.js';

/**
 * Exact verified Wikimedia Commons photo credits matching the 16 local `/img/destinations/<slug>.jpg` files
 * shipped in the frontend public directory (never 404s offline and works natively with next/image).
 */
export const LOCAL_PHOTO_CREDITS: Record<string, ImageCredit> = {
  'spiti-valley': {
    url: '/img/destinations/spiti-valley.jpg',
    author: 'Deepank Ranka',
    license: 'CC BY-SA 4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dhankar_Gompa,_Spiti.jpg',
  },
  kyoto: {
    url: '/img/destinations/kyoto.jpg',
    author: 'Basile Morin',
    license: 'CC BY-SA 4.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine,_Kyoto,_Japan.jpg',
  },
  alleppey: {
    url: '/img/destinations/alleppey.jpg',
    author: 'Paul Arps from The Netherlands',
    license: 'CC BY 2.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Houseboat_on_Alleppey_backwaters_(Kerala,_India_2023)_(52703799562).jpg',
  },
  jaipur: {
    url: '/img/destinations/jaipur.jpg',
    author: 'Chainwit.',
    license: 'CC BY-SA 4.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:East_facade_Hawa_Mahal_Jaipur_from_ground_level_(July_2022)_-_img_01.jpg',
  },
  udaipur: {
    url: '/img/destinations/udaipur.jpg',
    author: 'Hirumon',
    license: 'CC BY 3.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:City_Palace_Udaipur_Rajasthan_India.JPG',
  },
  varanasi: {
    url: '/img/destinations/varanasi.jpg',
    author: 'Schwiki',
    license: 'CC BY-SA 4.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Boats_at_sunrise_Ganges_River_Varanasi_Uttar_Pradesh_Schwiki.jpg',
  },
  goa: {
    url: '/img/destinations/goa.jpg',
    author: 'Ravi Dwivedi',
    license: 'CC BY-SA 4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Sunloungers_at_Palolem_beach.jpg',
  },
  ladakh: {
    url: '/img/destinations/ladakh.jpg',
    author: 'KennyOMG',
    license: 'CC BY-SA 4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Pangong_Tso_2.jpg',
  },
  munnar: {
    url: '/img/destinations/munnar.jpg',
    author: 'Ingo Mehling',
    license: 'CC BY-SA 4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Munnar_-_Lockhart_tea_plantation.jpg',
  },
  rishikesh: {
    url: '/img/destinations/rishikesh.jpg',
    author: 'आशीष_भटनागर',
    license: 'CC BY-SA 3.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Lakshman_jhula,_Rishikesh_2.jpg',
  },
  darjeeling: {
    url: '/img/destinations/darjeeling.jpg',
    author: 'Souviknshm',
    license: 'CC BY-SA 4.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Kanchenjunga_range_from_tea_gardens_of_darjeeling.jpg',
  },
  bali: {
    url: '/img/destinations/bali.jpg',
    author: 'Vyacheslav Argenberg',
    license: 'CC BY 4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rice_terraces,_Bali.jpg',
  },
  'ha-long-bay': {
    url: '/img/destinations/ha-long-bay.jpg',
    author: 'lumoplank',
    license: 'CC0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Ha_Long_Bay_-_Halong1407.jpg',
  },
  'ha-noi': {
    url: '/img/destinations/ha-noi.jpg',
    author: 'Jakub Hałun',
    license: 'CC BY 4.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Street_seller_of_fingered_citrons_in_Old_Town_of_Hanoi,_20240204_1335_5772.jpg',
  },
  hampi: {
    url: '/img/destinations/hampi.jpg',
    author: 'RanjithaRKRao',
    license: 'CC BY-SA 4.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:The_Grand_Stone_chariot_in_the_midst_of_Mantapas_at_Vittala_Temple,_Hampi.jpg',
  },
  lisbon: {
    url: '/img/destinations/lisbon.jpg',
    author: 'Dale Cruse - 10M views from San Francisco, CA, USA',
    license: 'CC BY 4.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Alfama_Rooftops_and_Tagus_River_View,_Lisbon_(54733828355).jpg',
  },
  jaisalmer: {
    url: '/img/destinations/jaisalmer.jpg',
    author: 'Seal sum',
    license: 'CC BY-SA 4.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Jaisalmer_Fort_illuminated_-Jaisalmer_-Rajasthan_-Seal_Sum_02.jpg',
  },
  jodhpur: {
    url: '/img/destinations/jodhpur.jpg',
    author: 'Vyacheslav Argenberg',
    license: 'CC BY 4.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Jodhpur,_India,_Mehrangarh_Fort,_Roof.jpg',
  },
  delhi: {
    url: '/img/destinations/delhi.jpg',
    author: 'Dennis G. Jarvis',
    license: 'CC BY-SA 2.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Humayun_Tomb,_Delhi,_entrance_to_the_tomb_enclosure.jpg',
  },
};

export interface TemplateSeedStop {
  kind: ItemKind;
  title: string;
  lat: number;
  lng: number;
  startTime: string;
  durationMins: number;
  notes: string;
}

export interface TemplateSeedDay {
  title: string;
  stops: TemplateSeedStop[];
}

export interface TemplateSeedSpec {
  slug: string;
  aliases?: string[];
  title: string;
  summary: string;
  photoKey: keyof typeof LOCAL_PHOTO_CREDITS;
  destinations: Array<{ slug: string; name: string }>;
  tripTypes: string[];
  budgetTier: ExploreBudgetTier;
  bestMonths: number[];
  cloneCount: number;
  publishedAt: string;
  days: TemplateSeedDay[];
}

const s = (
  kind: ItemKind,
  title: string,
  lat: number,
  lng: number,
  startTime: string,
  durationMins: number,
  notes: string
): TemplateSeedStop => ({ kind, title, lat, lng, startTime, durationMins, notes });

const d = (title: string, stops: TemplateSeedStop[]): TemplateSeedDay => ({ title, stops });

function slugifyId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

/**
 * 48 Curated Itinbee Templates (35 India + 13 International), every stop verified with real WGS84 coordinates.
 */
export const TEMPLATE_SPECS: readonly TemplateSeedSpec[] = [
  // ================================================================ INDIA (35)
  {
    slug: 'rishi-lnd-4d',
    aliases: ['rishikesh-landour-4d'],
    title: 'Rishikesh & Landour Ridge Escape',
    summary: 'Ganga aarti in Swarg Ashram, forested Beatles Ashram trails, and slow cedar walks around Char Dukan in Landour.',
    photoKey: 'rishikesh',
    destinations: [
      { slug: 'rishikesh', name: 'Rishikesh' },
      { slug: 'landour', name: 'Landour' },
      { slug: 'mussoorie', name: 'Mussoorie' },
    ],
    tripTypes: ['friends', 'family', 'heritage'],
    budgetTier: 'mid',
    bestMonths: [2, 3, 4, 9, 10, 11],
    cloneCount: 148,
    publishedAt: '2026-10-15T08:00:00.000Z',
    days: [
      d('Arrive Rishikesh & Swarg Ashram Ganga Aarti', [
        s('transit', 'Haridwar / Dehradun arrival transfer to Tapovan', 30.1292, 78.3264, '10:30', 75, 'Cab up NH34 along the Ganga corridor.'),
        s('meal', 'Chotiwala Pure Veg Thali Lunch, Ram Jhula', 30.1235, 78.3137, '13:00', 60, 'Classic Garhwali and North Indian vegetarian thali.'),
        s('activity', 'Chaurasi Kutia (Beatles Ashram) Forest Walk', 30.1128, 78.3169, '15:00', 90, 'Shaded Rajaji forest trail and mural meditation domes.'),
        s('activity', 'Parmarth Niketan Sandhya Ganga Aarti', 30.1193, 78.3125, '17:30', 75, 'Seated ghat hymns at dusk by the river.'),
      ]),
      d('Ganga Morning & Ghat Drive to Landour', [
        s('activity', 'Triveni Ghat Morning Promenade', 30.1033, 78.2948, '08:00', 60, 'Calm morning river walk before hill departure.'),
        s('meal', '60s Cafe / Little Buddha Cafe Breakfast, Laxman Jhula', 30.1261, 78.3298, '09:30', 60, 'River-view pancakes and ginger lemon honey tea.'),
        s('transit', 'Scenic Ghat Drive Rishikesh to Landour via Dehradun', 30.4553, 78.0959, '11:30', 165, 'Hill switchback ascent into deodar forest.'),
        s('stay', 'Check-in at Rokeby Manor / Heritage Ridge Stay, Landour', 30.4586, 78.0994, '15:30', 90, 'Stone heritage stay along the quiet cantonment ridge.'),
      ]),
      d('Landour Chakkar, Char Dukan & Lal Tibba', [
        s('meal', 'Char Dukan Pancakes & Bun Omelette Breakfast', 30.4631, 78.0972, '09:00', 60, 'Iconic four-shop square beside St. Pauls Church.'),
        s('activity', 'Lal Tibba Himalayan Viewpoint', 30.4675, 78.0947, '10:30', 75, 'Clear-morning snow peak panorama towards Bandarpunch.'),
        s('meal', 'Landour Bakehouse Scones & Pour-Over', 30.4607, 78.1041, '13:30', 60, 'Sisters Bazaar bakery housed in a 19th-century cottage.'),
        s('activity', 'Camel Back Road Sunset Stroll, Mussoorie', 30.4598, 78.0752, '17:00', 75, 'Level 3 km ridge promenade facing the Doon valley.'),
      ]),
      d('Jabarkhet Nature Reserve & Return via Dehradun', [
        s('activity', 'Jabarkhet Nature Reserve Oak Trail', 30.4525, 78.1165, '08:30', 120, 'Private conservation forest with marked ridge loops.'),
        s('meal', 'Cafe Ivy Lunch, Landour Cantt', 30.4628, 78.0981, '12:30', 60, 'Wood-fired pizzas and valley-facing terrace.'),
        s('transit', 'Descent to Dehradun Station / Jolly Grant Airport', 30.1897, 78.1803, '14:30', 120, 'Buffer 2.5h before evening Shatabdi or flight.'),
      ]),
    ],
  },
  {
    slug: 'goa-south-5d',
    aliases: ['south-goa-agonda-fontainhas-5d'],
    title: 'South Goa: Agonda Cliffs & Fontainhas Heritage',
    summary: 'Uncrowded Canacona beaches, Cabo de Rama laterite cliffs, Chandor Indo-Portuguese mansions, and Panjim Latin Quarter walks.',
    photoKey: 'goa',
    destinations: [
      { slug: 'south-goa', name: 'South Goa' },
      { slug: 'goa', name: 'Goa' },
    ],
    tripTypes: ['couple', 'friends', 'food'],
    budgetTier: 'mid',
    bestMonths: [11, 12, 1, 2, 3],
    cloneCount: 162,
    publishedAt: '2026-10-16T08:00:00.000Z',
    days: [
      d('Arrive Madgaon & Agonda Shoreline Settle-In', [
        s('transit', 'Arrival at Madgaon Junction (MAO) & Cab to Agonda', 15.2673, 73.9701, '11:00', 65, 'Scenic palm-lined drive south into Canacona.'),
        s('stay', 'Agonda Beachfront Cottages Check-In', 15.0447, 73.9859, '13:00', 60, 'Quiet turtle-nesting bay with zero loud shacks.'),
        s('meal', 'Zest Cafe Agonda Lunch', 15.0478, 73.9851, '14:15', 60, 'Fresh bowls, sourdough, and cold brew near the beach.'),
        s('activity', 'Agonda Sunset Swim & Northern Cove Walk', 15.0521, 73.9826, '17:00', 90, 'Golden hour along the granite headland.'),
      ]),
      d('Palolem Kayaking & Butterfly Cove', [
        s('activity', 'Morning Sea Kayaking off Palolem Crescent', 15.01, 74.0232, '08:00', 120, 'Calm morning bay paddle towards Monkey Island.'),
        s('meal', 'Art Resort Cafe Brunch, Palolem South End', 15.0068, 74.0258, '11:00', 75, 'Shaded sea-facing brunch under coconut palms.'),
        s('activity', 'Patnem & Colomb Bay Walk', 14.9985, 74.0309, '16:30', 90, 'Quiet rocky cove connecting Patnem to Palolem.'),
      ]),
      d('Cabo de Rama Fort & Cola Lagoon', [
        s('activity', 'Cola Beach Freshwater Lagoon', 15.0695, 73.9694, '09:30', 120, 'Emerald creek meeting the Arabian Sea.'),
        s('meal', 'The Cape Goa Cliffside Lunch', 15.0879, 73.9281, '13:00', 90, 'Goan prawn curry and veg xacuti overlooking the sea.'),
        s('activity', 'Cabo de Rama Fort & Sunset Ramparts', 15.0888, 73.9272, '16:30', 90, 'Portuguese-era laterite fort above dramatic sea cliffs.'),
      ]),
      d('Chandor Mansion & Panjim Fontainhas', [
        s('activity', 'Braganza Pereira House, Chandor', 15.2647, 74.0419, '10:00', 90, '400-year-old Indo-Portuguese manor with Belgian chandeliers.'),
        s('meal', 'Viva Panjim Traditional Goan Lunch', 15.4969, 73.8312, '13:30', 75, 'Heritage lane house serving Saraswat & Catholic classics.'),
        s('activity', 'Fontainhas & Sao Tome Latin Quarter Walk', 15.4958, 73.8319, '16:00', 120, 'Ochre, indigo, and marigold heritage streets plus Chapel of St Sebastian.'),
      ]),
      d('Old Goa Churches & Departure', [
        s('activity', 'Basilica of Bom Jesus & Se Cathedral, Old Goa', 15.5009, 73.9116, '09:30', 105, 'UNESCO Baroque ensemble in leafy laterite grounds.'),
        s('meal', 'Confeitaria 31 de Janeiro Bakery Stop', 15.4966, 73.8321, '12:00', 45, 'Bebinca and serradura to carry home.'),
        s('transit', 'Transfer to Dabolim (GOI) / Madgaon', 15.3808, 73.8314, '14:00', 60, 'Afternoon departure.'),
      ]),
    ],
  },
  {
    slug: 'north-goa-heritage-cafes-4d',
    title: 'North Goa Heritage Wards & Specialty Cafes',
    summary: 'Assagao Portuguese villas, Vagator red cliffs, Divar Island ferry crossings, and Reis Magos river views.',
    photoKey: 'goa',
    destinations: [
      { slug: 'north-goa', name: 'North Goa' },
      { slug: 'goa', name: 'Goa' },
    ],
    tripTypes: ['friends', 'couple', 'food'],
    budgetTier: 'mid',
    bestMonths: [11, 12, 1, 2, 3],
    cloneCount: 119,
    publishedAt: '2026-10-17T08:00:00.000Z',
    days: [
      d('Assagao Tree-Lined Lanes & Chapora Sunset', [
        s('stay', 'Boutique Villa Check-in, Assagao', 15.5957, 73.7852, '12:00', 60, 'Forested village bowl known as the valley of flowers.'),
        s('meal', 'Babka Goa / Gunpowder Garden Lunch, Assagao', 15.5978, 73.7834, '13:30', 90, 'Regional South Indian plates under jackfruit trees.'),
        s('activity', 'Chapora Fort & Vagator Cliff Trail', 15.6059, 73.7364, '16:45', 90, 'Sweeping estuary view where the Chapora river meets the sea.'),
      ]),
      d('Anjuna Craft Fleas, Siolim Riverside & Morjim', [
        s('meal', 'Artjuna Garden Breakfast, Anjuna', 15.5806, 73.7438, '09:30', 75, 'Shaded courtyard bakery and mezze platters.'),
        s('activity', 'Ashwem & Morjim Olive Ridley Beach Walk', 15.6305, 73.7228, '11:30', 120, 'Wide shallow sandbars north of the Chapora river.'),
        s('meal', 'Thalassa / Riverside Sundowner at Siolim', 15.6194, 73.7638, '17:30', 120, 'Sunset tables beside the Chapora backwaters.'),
      ]),
      d('Divar Island Ferry & Aldona Backroads', [
        s('activity', 'Ribandar Ferry to Divar Island & Our Lady of Compassion', 15.5245, 73.9036, '09:00', 120, 'Free river ferry to paddy-ringed island lanes.'),
        s('activity', 'Corjuem Fort & Aldona Cable-Stayed Bridge', 15.5958, 73.8931, '12:00', 60, 'Compact 1705 river island fortress.'),
        s('meal', 'Bhatti Village Family Tavern Lunch, Nerul', 15.5128, 73.7844, '13:45', 75, 'Homestyle Goan thali in a quiet village lane.'),
        s('activity', 'Reis Magos Fort Cultural Centre', 15.4962, 73.8091, '16:15', 75, 'Restored 1551 bastion overlooking the Mandovi estuary.'),
      ]),
      d('Museum of Goa & Departure', [
        s('activity', 'Museum of Goa (MOG) Contemporary Art Space, Pilerne', 15.5219, 73.7985, '10:00', 90, 'Three-storey contemporary Goan art gallery.'),
        s('meal', 'Padaria Prazeres Pastéis de Nata, Panjim', 15.4852, 73.8168, '12:15', 60, 'Custard tarts and espresso before airport run.'),
        s('transit', 'Departure via Mopa (GOX) / Dabolim (GOI)', 15.7331, 73.8617, '14:30', 60, 'Allow 60 mins to Manohar International Airport.'),
      ]),
    ],
  },
  {
    slug: 'kashi-snr-3d',
    aliases: ['varanasi-sarnath-senior-yatra-3d'],
    title: 'Varanasi & Sarnath Senior-Friendly Yatra',
    summary: 'Step-minimised Kashi pilgrimage with Sugam Darshan Gate 4 access, Assi Ghat Bajra boat sunrise, pure satvik dining, and Sarnath.',
    photoKey: 'varanasi',
    destinations: [{ slug: 'varanasi', name: 'Varanasi' }],
    tripTypes: ['pilgrimage', 'family', 'heritage'],
    budgetTier: 'budget',
    bestMonths: [10, 11, 12, 1, 2, 3],
    cloneCount: 141,
    publishedAt: '2026-10-18T08:00:00.000Z',
    days: [
      d('Arrival, Afternoon Rest &Bajra Boat Ganga Aarti', [
        s('stay', 'Check-in near Assi Ghat (Cab-Accessible Heritage Hotel)', 25.2895, 83.0055, '12:00', 90, 'Direct car drop avoids Godowlia walking restrictions for elders.'),
        s('meal', 'Baati Chokha Pure Satvik Lunch, Teliyabag', 25.3264, 82.9942, '13:45', 60, 'Traditional clay-baked litti chokha with zero onion/garlic option.'),
        s('activity', 'Reserved Bajra Boat from Assi to Dashashwamedh Ganga Aarti', 25.3068, 83.0105, '17:15', 120, 'Seated riverfront viewing of Sandhya Aarti without steep ghat crowds.'),
      ]),
      d('Subah-e-Banaras & Kashi Vishwanath Sugam Darshan', [
        s('activity', 'Assi Ghat Subah-e-Banaras Classical Recital', 25.289, 83.0066, '06:00', 75, 'Level plaza seating for morning Vedic chants and raga.'),
        s('meal', 'Ram Bhandar Kachori Sabzi & Jalebi Breakfast, Thatheri Bazar', 25.3137, 83.0112, '08:30', 45, 'Legendary Banarasi morning breakfast.'),
        s('activity', 'Shri Kashi Vishwanath Dham (Gate 4 / Lalita Ghat Escalator)', 25.3109, 83.0107, '10:00', 120, 'Pre-booked Sugam Darshan with wheelchair/escalator corridor.'),
        s('activity', 'Banarasi Handloom Silk Weaving Cluster, Ramnagar / Madanpura', 25.2981, 83.0079, '16:30', 75, 'Seated demonstration of kadhua brocade looms.'),
      ]),
      d('Sarnath Deer Park & Departure', [
        s('activity', 'Dhamek Stupa & Mulagandha Kuti Vihara, Sarnath', 25.3809, 83.0245, '09:00', 105, 'Flat landscaped brick pathways where Buddha gave his first sermon.'),
        s('activity', 'Sarnath Archaeological Museum (Lion Capital of Ashoka)', 25.3762, 83.0227, '11:00', 60, 'Wheelchair-friendly galleries housing the national emblem.'),
        s('meal', 'Shree Shivay Satvik Thali Lunch', 25.3391, 82.9854, '13:00', 60, 'Clean highway-side vegetarian thali en route to airport/station.'),
        s('transit', 'Departure from Varanasi Junction (BSB) / Airport (VNS)', 25.4524, 82.8593, '15:00', 60, 'Comfortable afternoon buffer.'),
      ]),
    ],
  },
  {
    slug: 'jaipur-pink-city-forts-4d',
    title: 'Jaipur Pink City, Hill Forts & Block-Print Trails',
    summary: 'Hawa Mahal morning light, Amber & Nahargarh ramparts, Jantar Mantar astronomy, Anokhi block-printing, and heritage haveli dining.',
    photoKey: 'jaipur',
    destinations: [{ slug: 'jaipur', name: 'Jaipur' }],
    tripTypes: ['heritage', 'family', 'couple', 'food'],
    budgetTier: 'mid',
    bestMonths: [10, 11, 12, 1, 2, 3],
    cloneCount: 194,
    publishedAt: '2026-10-19T08:00:00.000Z',
    days: [
      d('Pink City Core: Hawa Mahal, City Palace & Jantar Mantar', [
        s('activity', 'Hawa Mahal (Palace of Winds) Morning Facade & Courtyard', 26.9239, 75.8267, '08:30', 60, 'Catch the eastern sun illuminating the 953 sandstone jharokhas.'),
        s('activity', 'City Palace Jaipur & Pritam Niwas Chowk', 26.9258, 75.8237, '10:00', 105, 'Mubarak Mahal textiles and the four seasonal peacock gates.'),
        s('meal', 'LMB (Laxmi Misthan Bhandar) Rajasthani Thali, Johari Bazaar', 26.9212, 75.8265, '12:30', 60, 'Pure vegetarian dal baati churma and paneer ghewar since 1954.'),
        s('activity', 'Jantar Mantar UNESCO Solar Observatory', 26.9248, 75.8246, '14:30', 75, 'World largest stone sundial accurate to two seconds.'),
        s('activity', 'Bapu Bazaar & Johari Bazaar Evening Arcade Walk', 26.9186, 75.8232, '17:00', 90, 'Terracotta pink verandas, lac bangles, and mojari craft.'),
      ]),
      d('Aravalli Ridge: Amber Fort, Panna Meena & Nahargarh Sunset', [
        s('activity', 'Amber Fort (Amer) Sheesh Mahal & Courtyards', 26.9855, 75.8513, '08:30', 150, 'Arrive early via Suraj Pol to beat tour buses.'),
        s('activity', 'Panna Meena ka Kund Stepwell & Anokhi Museum of Hand Printing', 26.9901, 75.8518, '11:30', 75, '16th-century geometric stepwell beside a restored block-print haveli.'),
        s('meal', '1135 AD / Amer Heritage Courtyard Lunch', 26.9859, 75.8516, '13:15', 75, 'Traditional Mewari-Dhundhari dishes inside Amer Fort.'),
        s('activity', 'Jal Mahal Promenade Photo Stop', 26.9535, 75.8462, '15:30', 30, 'Man Sagar Lake palace en route back from Amer.'),
        s('activity', 'Nahargarh Fort Sunset Ramparts over Jaipur', 26.9373, 75.8155, '17:00', 90, 'Golden-hour panorama across the entire walled city.'),
      ]),
      d('Albert Hall, Patrika Gate & Sanganer / Bagru Craft', [
        s('activity', 'Patrika Gate & Jawahar Circle Morning Walk', 26.842, 75.8022, '08:30', 60, 'Hand-painted arches depicting every region of Rajasthan.'),
        s('activity', 'Albert Hall Museum (Central Museum), Ram Niwas Garden', 26.9116, 75.8195, '10:30', 90, 'Indo-Saracenic galleries of miniature paintings and metalwork.'),
        s('meal', 'Tapri Central Rooftop Chai & Snacks, C-Scheme', 26.9075, 75.8062, '13:00', 60, 'Beloved Jaipur tea house overlooking Central Park.'),
        s('activity', 'Jaigarh Fort Jaivana Cannon & Water Channels', 26.9851, 75.8456, '15:30', 90, 'Unconquered hilltop citadel linked to Amer by fortified passages.'),
      ]),
      d('Galtaji Monkey Temple & Departure', [
        s('activity', 'Galtaji Temple & Natural Kunds in Aravalli Gorge', 26.9177, 75.8576, '08:30', 90, '18th-century pink sandstone shrines built around a mountain spring.'),
        s('meal', 'Rawat Mishthan Bhandar Pyaaz Kachori & Mawa Kachori', 26.9196, 75.7984, '11:00', 45, 'Iconic Sindhi Camp stop before station/airport.'),
        s('transit', 'Departure via Jaipur Junction (JP) / Airport (JAI)', 26.8242, 75.8122, '13:30', 60, 'Smooth afternoon departure.'),
      ]),
    ],
  },
  {
    slug: 'udaipur-lakes-palaces-3d',
    title: 'Udaipur Lakes, Havelis & Mewar Palaces',
    summary: 'Lake Pichola boat crossings, City Palace balconies, Bagore Ki Haveli folk evening, and Sajjangarh Monsoon Palace views.',
    photoKey: 'udaipur',
    destinations: [{ slug: 'udaipur', name: 'Udaipur' }],
    tripTypes: ['couple', 'heritage', 'family'],
    budgetTier: 'premium',
    bestMonths: [10, 11, 12, 1, 2, 3],
    cloneCount: 173,
    publishedAt: '2026-10-20T08:00:00.000Z',
    days: [
      d('City Palace, Jagdish Chowk & Lake Pichola Sunset Boat', [
        s('activity', 'Udaipur City Palace & Mor Chowk', 24.5764, 73.6835, '09:30', 135, 'Granite and marble palace complex towering over Lake Pichola.'),
        s('meal', 'Ambrai Ghat Lakeside Lunch, Amet Haveli', 24.5786, 73.6805, '13:00', 75, 'Direct water-level view of City Palace and Jag Mandir.'),
        s('activity', 'Lake Pichola & Jag Mandir Sunset Boat Ride', 24.5681, 73.6784, '16:30', 90, 'Golden sandstone reflections across the lake.'),
        s('activity', 'Bagore Ki Haveli Dharohar Folk Dance', 24.5796, 73.6816, '19:00', 60, 'Evening Ghoomar and puppetry in an 18th-century waterfront courtyard.'),
      ]),
      d('Saheliyon Ki Bari, Fateh Sagar & Monsoon Palace', [
        s('activity', 'Jagdish Temple Morning Carvings', 24.5798, 73.6837, '08:30', 45, '1651 Indo-Aryan temple at the heart of the old city.'),
        s('activity', 'Saheliyon Ki Bari Lotus Fountains', 24.6031, 73.6869, '10:00', 75, 'Marble pavilions and rain-powered fountains built for royal maidens.'),
        s('meal', 'Millets of Mewar / Jheel Ginger Coffee Bar', 24.5792, 73.6812, '12:45', 60, 'Rooftop lunch above Gangaur Ghat.'),
        s('activity', 'Sajjangarh Monsoon Palace Sunset Crest', 24.5931, 73.6388, '16:45', 90, 'Aravalli ridge vista over Fateh Sagar and Pichola.'),
      ]),
      d('Badi Lake Bahubali Hills & Departure', [
        s('activity', 'Bahubali Hills Sunrise Point over Badi Lake', 24.6295, 73.6194, '07:00', 90, 'Short 15-minute rocky trail to a quiet turquoise lake view.'),
        s('activity', 'Shilpgram Rural Arts & Crafts Complex', 24.6022, 73.6497, '10:30', 75, 'Living museum of western Indian village architecture and crafts.'),
        s('transit', 'Departure via Maharana Pratap Airport (UDR) / Udaipur City Station', 24.6177, 73.8961, '13:30', 60, 'Afternoon return.'),
      ]),
    ],
  },
  {
    slug: 'jaisalmer-thar-havelis-4d',
    title: 'Jaisalmer Golden Fort, Havelis & Thar Dunes',
    summary: 'Living Sonar Quila lanes, Patwon Ki Haveli stone filigree, Kuldhara ruins, and stargazing at Khuri desert dunes.',
    photoKey: 'jaisalmer',
    destinations: [{ slug: 'jaisalmer', name: 'Jaisalmer' }],
    tripTypes: ['heritage', 'adventure', 'couple', 'family'],
    budgetTier: 'mid',
    bestMonths: [11, 12, 1, 2],
    cloneCount: 112,
    publishedAt: '2026-10-21T08:00:00.000Z',
    days: [
      d('Gadisar Lake & Sonar Quila Sunset', [
        s('stay', 'Sandstone Haveli Check-in outside Fort Walls', 26.9125, 70.9165, '12:00', 60, 'Staying outside preserves the fragile fort drainage ecosystem.'),
        s('activity', 'Gadisar Lake & Tilon Ki Pol Gateway', 26.9082, 70.9234, '15:30', 75, '14th-century rainwater tank framed by carved yellow chhatris.'),
        s('activity', 'Vyas Chhatri Sunset Cenotaphs', 26.9241, 70.9039, '17:15', 60, 'Warm honey-gold sunset view facing Jaisalmer Fort.'),
      ]),
      d('Jaisalmer Fort Jain Temples & Merchant Havelis', [
        s('activity', 'Jaisalmer Fort (Sonar Quila) & Jain Temples', 26.9124, 70.9122, '08:30', 150, 'Intricately carved 12th–15th century Dilwara-style sandstone shrines.'),
        s('meal', 'Trio Restaurant Ker Sangri Lunch, Gandhi Chowk', 26.9154, 70.9102, '12:30', 75, 'Traditional desert beans and bajra rotis.'),
        s('activity', 'Patwon Ki Haveli & Nathmal Ki Haveli', 26.9195, 70.9143, '15:00', 105, 'Five interconnected merchant mansions of honeycomb stone lattice.'),
      ]),
      d('Kuldhara Abandoned Village & Khuri Thar Dunes', [
        s('activity', 'Bada Bagh Royal Cenotaphs', 26.9562, 70.8878, '09:30', 60, 'Hilltop garden chhatris overlooking an oasis grove.'),
        s('activity', 'Kuldhara 13th-Century Paliwal Village', 26.8669, 70.7831, '14:30', 60, 'Preserved desert grid settlement 18 km southwest of town.'),
        s('stay', 'Khuri Sand Dunes Camel Walk & Desert Camp', 26.6152, 70.7289, '16:45', 180, 'Quieter alternative to Sam dunes with Manganiyar folk music under clear skies.'),
      ]),
      d('Desert Sunrise & Departure', [
        s('activity', 'Khuri Crest Sunrise Walk', 26.6168, 70.7265, '06:30', 60, 'Cool morning ripples across undisturbed Thar sand.'),
        s('activity', 'Thar Heritage Museum, Jaisalmer', 26.9178, 70.9074, '11:00', 60, 'Curated local collection of desert fossils and textiles.'),
        s('transit', 'Departure via Jaisalmer Station (JSM) / Airport (JSA)', 26.9114, 70.9278, '13:30', 60, 'Afternoon train or flight.'),
      ]),
    ],
  },
  {
    slug: 'jodhpur-osian-blue-city-3d',
    title: 'Jodhpur Blue City, Mehrangarh & Osian Temples',
    summary: 'Towering Mehrangarh ramparts, Rao Jodha Desert Rock Park, Brahmin-blue Navchokiya lanes, and 8th-century Osian temples.',
    photoKey: 'jodhpur',
    destinations: [{ slug: 'jodhpur', name: 'Jodhpur' }],
    tripTypes: ['heritage', 'food', 'friends'],
    budgetTier: 'mid',
    bestMonths: [10, 11, 12, 1, 2, 3],
    cloneCount: 108,
    publishedAt: '2026-10-22T08:00:00.000Z',
    days: [
      d('Mehrangarh Citadel & Blue City Lanes', [
        s('activity', 'Mehrangarh Fort Museum & Ramparts', 26.2978, 73.0185, '09:00', 150, 'Audio-guided walk through Phool Mahal and Daulat Khana.'),
        s('activity', 'Jaswant Thada Marble Cenotaph', 26.3041, 73.0252, '12:00', 60, 'Translucent Makrana marble sheets glowing beside a quiet lake.'),
        s('meal', 'Gypsy Dining Hall 31-Item Rajasthani Thali, Sardarpura', 26.2791, 73.0068, '13:30', 60, 'Authentic Marwari pure-veg feast.'),
        s('activity', 'Navchokiya Blue Lanes & Toorji Ka Jhalra Stepwell', 26.2966, 73.0235, '16:30', 105, 'Restored 1740 red-sandstone stepwell surrounded by specialty cafes.'),
      ]),
      d('Rao Jodha Rock Park & Osian Excursion', [
        s('activity', 'Rao Jodha Desert Rock Park Morning Trail', 26.2995, 73.0156, '08:00', 90, 'Restored native volcanic-rock desert flora beneath the fort wall.'),
        s('meal', 'Janta Sweet Home Mirchi Vada & Mawa Kachori', 26.2889, 73.0226, '10:30', 45, 'Iconic Jodhpuri crisp snacks near Nai Sarak.'),
        s('activity', 'Sachiya Mata & Mahavira Temples, Osian', 26.7258, 72.9056, '14:30', 150, '8th–11th century Pratihara-era carved sandstone oasis temples.'),
      ]),
      d('Umaid Bhawan & Clock Tower Spice Market', [
        s('activity', 'Umaid Bhawan Palace Museum', 26.2808, 73.0472, '09:30', 90, 'Art Deco Chittar sandstone palace and vintage car gallery.'),
        s('activity', 'Ghanta Ghar (Clock Tower) & Sardar Market Spice Stalls', 26.2952, 73.0242, '11:30', 75, 'Mathania red chillies, Makhaniya lassi at Shri Mishrilal.'),
        s('transit', 'Departure from Jodhpur Junction (JU) / Airport (JDH)', 26.2638, 73.0496, '14:00', 45, 'Short transfer inside city limits.'),
      ]),
    ],
  },
  {
    slug: 'royal-rajasthan-circuit-8d',
    title: 'Royal Rajasthan: Jaipur, Jodhpur & Udaipur',
    summary: 'The classic 8-day Mewar–Marwar–Dhundhar overland loop linking Jaipur forts, Pushkar lake, Jodhpur stepwells, Ranakpur Jain pillars, and Udaipur.',
    photoKey: 'jodhpur',
    destinations: [
      { slug: 'jaipur', name: 'Jaipur' },
      { slug: 'pushkar', name: 'Pushkar' },
      { slug: 'jodhpur', name: 'Jodhpur' },
      { slug: 'udaipur', name: 'Udaipur' },
    ],
    tripTypes: ['heritage', 'family', 'couple'],
    budgetTier: 'premium',
    bestMonths: [10, 11, 12, 1, 2, 3],
    cloneCount: 185,
    publishedAt: '2026-10-23T08:00:00.000Z',
    days: [
      d('Jaipur Walled City Arrival & Hawa Mahal', [
        s('activity', 'Hawa Mahal & City Palace Jaipur', 26.9258, 75.8237, '10:30', 150, 'Pink City royal quarter orientation.'),
        s('meal', 'Peacock Rooftop Lunch, Pearl Palace', 26.9158, 75.7924, '13:30', 60, 'Relaxed garden rooftop.'),
        s('activity', 'Jantar Mantar & Johari Bazaar', 26.9248, 75.8246, '15:30', 120, 'Astronomical instruments and heritage jewellers.'),
      ]),
      d('Amber Fort, Stepwells & Nahargarh', [
        s('activity', 'Amber Fort & Panna Meena Stepwell', 26.9855, 75.8513, '08:30', 180, 'Morning hill fort exploration.'),
        s('meal', 'Samode Haveli Courtyard Lunch', 26.9262, 75.8279, '13:00', 75, 'Frescoed dining hall in old Jaipur.'),
        s('activity', 'Nahargarh Sunset Ramparts', 26.9373, 75.8155, '17:00', 90, 'Dusk views across Jaipur.'),
      ]),
      d('Jaipur to Pushkar & Jodhpur', [
        s('activity', 'Pushkar Lake Ghats & Brahma Temple Stopover', 26.4897, 74.5511, '10:30', 90, 'Sacred 52-ghat desert lake midway west.'),
        s('transit', 'Highway Drive Pushkar to Jodhpur', 26.2389, 73.0243, '13:30', 210, 'Smooth NH25 stretch into Marwar.'),
        s('activity', 'Toorji Ka Jhalra Stepwell Evening', 26.2966, 73.0235, '17:30', 60, 'Unwind by the lit sandstone steps.'),
      ]),
      d('Mehrangarh Fort & Blue City Jodhpur', [
        s('activity', 'Mehrangarh Fort & Jaswant Thada', 26.2978, 73.0185, '09:00', 180, 'Towering cliff citadel and marble cenotaph.'),
        s('meal', 'Indique Rooftop Lunch facing Mehrangarh', 26.2955, 73.0244, '13:00', 75, 'Pal Haveli terrace overlooking Clock Tower.'),
        s('activity', 'Navchokiya Blue City Heritage Walk', 26.2981, 73.0149, '16:30', 90, 'Indigo-washed lanes beneath the fort.'),
      ]),
      d('Jodhpur to Udaipur via Ranakpur Jain Temple', [
        s('transit', 'Drive South into the Aravalli Hills', 25.1154, 73.4728, '08:30', 165, 'Scenic wooded ascent towards Ranakpur.'),
        s('activity', 'Ranakpur Chaturmukha Jain Temple (1,444 Marble Pillars)', 25.1154, 73.4728, '12:00', 90, 'No two carved pillars share the same motif; audio guide included.'),
        s('transit', 'Continue to Udaipur Lakeside Check-in', 24.5764, 73.6835, '14:30', 120, 'Arrive in Udaipur before sunset.'),
      ]),
      d('Udaipur City Palace & Lake Pichola', [
        s('activity', 'City Palace Museum & Crystal Gallery', 24.5764, 73.6835, '09:30', 150, 'Mewar court architecture overlooking the water.'),
        s('activity', 'Lake Pichola & Jag Mandir Boat Cruise', 24.5681, 73.6784, '16:30', 90, 'Late afternoon boat across Pichola.'),
        s('activity', 'Bagore Ki Haveli Cultural Evening', 24.5796, 73.6816, '19:00', 60, 'Traditional Rajasthani dance and music.'),
      ]),
      d('Kumbhalgarh Fort Excursion or Saheliyon Ki Bari', [
        s('activity', 'Saheliyon Ki Bari & Fateh Sagar Promenade', 24.6031, 73.6869, '09:30', 120, 'Garden fountains and lakeside stroll.'),
        s('meal', 'Upre by 1559 AD Lunch', 24.5778, 73.6801, '13:00', 75, 'Waterfront Mewari lunch.'),
        s('activity', 'Sajjangarh Monsoon Palace Sunset', 24.5931, 73.6388, '16:45', 90, 'Panoramic Aravalli farewell.'),
      ]),
      d('Old Udaipur Miniature Art Studios & Departure', [
        s('activity', 'Jagdish Chowk Miniature Painting Studios', 24.5798, 73.6837, '09:30', 75, 'Natural mineral pigment demonstrations.'),
        s('transit', 'Departure via Udaipur Airport (UDR)', 24.6177, 73.8961, '12:30', 45, 'Afternoon flights to Delhi/Mumbai/Bengaluru.'),
      ]),
    ],
  },
  {
    slug: 'spiti-valley-circuit-7d',
    title: 'Spiti Valley High-Altitude Monastery Circuit',
    summary: 'Acclimatised trans-Himalayan road journey through Shimla/Narkanda, Tabo 996-CE mud-brick gompa, Dhankar cliff monastery, Key, Kibber, and Langza.',
    photoKey: 'spiti-valley',
    destinations: [{ slug: 'spiti-valley', name: 'Spiti Valley' }],
    tripTypes: ['adventure', 'friends', 'solo'],
    budgetTier: 'mid',
    bestMonths: [5, 6, 7, 8, 9],
    cloneCount: 179,
    publishedAt: '2026-10-24T08:00:00.000Z',
    days: [
      d('Shimla to Narkanda & Sutlej Gorge (Kalpa)', [
        s('transit', 'Ascend NH5 via Narkanda Hatu View to Kalpa (2,960m)', 31.5326, 78.2528, '08:00', 360, 'Gradual altitude gain keeps AMS risk low.'),
        s('stay', 'Kalpa Apple Orchard Homestay facing Kinnaur Kailash', 31.535, 78.2542, '16:30', 90, 'Sunset alpenglow on the 6,050m Jorkanden massif.'),
      ]),
      d('Khab Confluence, Nako Lake & Tabo (3,280m)', [
        s('activity', 'Khab Sangam (Spiti & Sutlej River Confluence)', 31.7689, 78.6478, '10:30', 30, 'Dramatic gorge below Leo Pargial.'),
        s('activity', 'Nako Village & Sacred Willow Lake', 31.8814, 78.6272, '12:30', 75, 'Lunch and acclimatisation walk at 3,625m.'),
        s('stay', 'Tabo Village Check-in', 32.0935, 78.3822, '16:30', 60, 'Sleep low at 3,280m before heading to Kaza.'),
      ]),
      d('Tabo 1,000-Year Murals, Dhankar Cliff & Pin Valley', [
        s('activity', 'Tabo Monastery (996 CE Ajanta of the Himalayas)', 32.0938, 78.3828, '08:30', 90, 'Ancient earthen halls with original Indo-Tibetan frescoes; no flash photography.'),
        s('activity', 'Dhankar Gompa & Confluence Overlook', 32.0894, 78.2189, '11:30', 90, 'Perched on an eroded conglomerate spur above Spiti & Pin rivers.'),
        s('stay', 'Arrive Kaza (3,800m) & Rest Evening', 32.2276, 78.0715, '16:00', 90, 'Hydrate and rest at Kaza base.'),
      ]),
      d('Key Monastery, Kibber & Chicham Bridge', [
        s('activity', 'Key Gompa (Key Monastery)', 32.2979, 78.0119, '09:00', 90, 'Iconic tiered hilltop monastery with butter tea in the prayer kitchen.'),
        s('activity', 'Chicham Suspension Bridge & Kibber Wildlife Village', 32.3364, 77.9869, '11:30', 90, 'Asia highest road bridge spanning a 1,000-foot gorge.'),
        s('meal', 'The Himalayan Cafe Kaza Lunch', 32.2262, 78.0725, '14:00', 60, 'Thukpa, seabuckthorn juice, and tingmo.'),
      ]),
      d('High Villages: Langza Buddha, Hikkim Post Office & Komic', [
        s('activity', 'Langza Maitreya Buddha Statue & Fossil Meadows', 32.2758, 78.0819, '09:30', 75, '4,400m pasture facing Chau Chau Kang Nilda peak.'),
        s('activity', 'Hikkim World Highest Post Office (PIN 172114)', 32.2458, 78.0989, '11:15', 45, 'Mail stamped postcards to family back home.'),
        s('activity', 'Komic Tangyud Monastery (4,587m)', 32.2389, 78.1072, '12:30', 60, 'Fortified Sakya-sect monastery at high pasture.'),
      ]),
      d('Kaza Return via Kunzum Pass or Sutlej Valley to Rampur', [
        s('transit', 'Descend Spiti River Valley via Gue / Sumdo towards Rampur', 31.4492, 77.6317, '07:30', 420, 'Long scenic descent back to thick pine oxygen.'),
        s('stay', 'Overnight at Rampur Bushahr / Narkanda', 31.2588, 77.4602, '17:30', 60, 'Restful lower-altitude sleep.'),
      ]),
      d('Padam Palace Rampur & Return to Shimla', [
        s('activity', 'Padam Palace Exterior & Narkanda Apple Belt', 31.4508, 77.6305, '09:00', 60, 'Kath-Kuni timber-and-stone Himachali architecture.'),
        s('transit', 'Arrive Shimla / Chandigarh Transit', 31.1048, 77.1734, '13:30', 150, 'Trip concludes.'),
      ]),
    ],
  },
  {
    slug: 'manali-old-manali-solang-4d',
    title: 'Manali, Old Manali Orchards & Solang Valley',
    summary: 'Cedar-shaded Hadimba shrine, Old Manali riverside cafes, Atal Tunnel crossover into Lahaul (Sissu), and Naggar Castle.',
    photoKey: 'spiti-valley',
    destinations: [{ slug: 'manali', name: 'Manali' }],
    tripTypes: ['friends', 'family', 'adventure', 'couple'],
    budgetTier: 'mid',
    bestMonths: [3, 4, 5, 6, 9, 10, 12],
    cloneCount: 136,
    publishedAt: '2026-10-25T08:00:00.000Z',
    days: [
      d('Cedar Groves of Hadimba & Old Manali Walk', [
        s('activity', 'Hadimba Devi Temple & Dhungri Van Vihar', 32.2483, 77.1808, '10:30', 90, '1553 four-tiered pagoda temple amid towering deodars.'),
        s('meal', 'Cafe 1947 / Dylan Toasted & Roasted, Old Manali', 32.2564, 77.1755, '13:00', 75, 'Manalsu riverside lunch and coffee.'),
        s('activity', 'Manu Temple & Old Manali Apple Lane Walk', 32.2582, 77.1729, '15:30', 90, 'Traditional slate-roofed houses above the village.'),
      ]),
      d('Solang Valley, Atal Tunnel & Sissu Waterfall', [
        s('activity', 'Solang Valley Ropeway & Meadow', 32.3166, 77.1575, '09:00', 120, 'Glacier views and cable car to Mt Phatru.'),
        s('activity', 'Atal Tunnel Crossover to Sissu Waterfall (Lahaul)', 32.4789, 77.1258, '12:00', 120, '9 km tunnel opens directly onto dramatic Chandra valley peaks.'),
        s('meal', 'Johnson Cafe Trout / Himachali Siddu Dinner, Circuit House Rd', 32.2459, 77.1869, '19:00', 75, 'Orchard lawn dining in central Manali.'),
      ]),
      d('Naggar Castle & Nicholas Roerich Gallery', [
        s('activity', 'Naggar Heritage Castle (Kath-Kuni Architecture)', 32.1464, 77.1669, '10:00', 90, '15th-century Kullu royal seat commanding the Beas valley.'),
        s('activity', 'Nicholas Roerich Art Gallery & Estate', 32.1492, 77.1695, '12:00', 60, 'Luminous Himalayan canvases in a quiet pine estate.'),
        s('meal', 'Naggar Castle Balcony Siddu Lunch', 32.1465, 77.1668, '13:15', 60, 'Steamed walnut-stuffed siddu with ghee.'),
        s('activity', 'Jana Waterfall Deodar Trail', 32.1062, 77.2118, '15:00', 90, 'Quiet village trail away from Mall Road crowds.'),
      ]),
      d('Vashisht Hot Springs & Departure', [
        s('activity', 'Vashisht Temple & Natural Sulphur Springs', 32.2656, 77.1878, '09:00', 75, 'Carved wooden temple above the Beas confluence.'),
        s('transit', 'Departure via Bhuntar (KUU) / Volvo Stand', 32.2396, 77.1887, '12:30', 60, 'Onward journey.'),
      ]),
    ],
  },
  {
    slug: 'kasol-parvati-valley-4d',
    title: 'Kasol, Chalal & Parvati Valley Slow Trail',
    summary: 'Pine-scented river walks along the Parvati, Manikaran Gurudwara hot springs, Kalga apple village, and Tosh glacier views.',
    photoKey: 'rishikesh',
    destinations: [
      { slug: 'himachal-pradesh', name: 'Himachal Pradesh' },
      { slug: 'manali', name: 'Manali' },
    ],
    tripTypes: ['friends', 'solo', 'adventure'],
    budgetTier: 'budget',
    bestMonths: [3, 4, 5, 6, 9, 10, 11],
    cloneCount: 104,
    publishedAt: '2026-10-26T08:00:00.000Z',
    days: [
      d('Kasol Arrival & Chalal Suspension Bridge Trail', [
        s('stay', 'Riverside Homestay Check-in, Kasol', 32.01, 77.315, '11:30', 60, 'Settle beside the roaring Parvati river.'),
        s('meal', 'Evergreen Cafe Shakshuka & Mint Tea, Kasol', 32.0104, 77.3147, '13:00', 75, 'Pine-framed open terrace.'),
        s('activity', 'Chalal Village Forest Walk across Cable Bridge', 32.0085, 77.3065, '15:30', 120, 'Easy 45-minute pine path along the river bank.'),
      ]),
      d('Tosh Valley & Waterfall Cafe Hike', [
        s('transit', 'Cab from Kasol via Barshaini Dam to Tosh Gate', 32.0158, 77.4519, '09:30', 75, 'Winding gorge road past Parvati-Parbati confluence.'),
        s('activity', 'Tosh Village & Upper Meadow Glacier View (2,400m)', 32.0175, 77.4548, '11:00', 180, 'Wooden hillside hamlet facing snow peaks.'),
        s('meal', 'Pink Floyd / Hilltop Cafe Lunch, Tosh', 32.0181, 77.4552, '14:15', 60, 'Warm soup and valley panorama.'),
      ]),
      d('Kalga Apple Orchard Village', [
        s('activity', 'Barshaini to Kalga Forest Climb (30 mins)', 31.9992, 77.4485, '09:30', 150, 'Car-free village tucked amid apple and pear orchards.'),
        s('meal', 'Kalga Homestay Orchard Lunch', 31.9988, 77.4491, '13:00', 60, 'Fresh rajma chawal and local apple cider vinegar tea.'),
        s('activity', 'Bunbuni Trail Viewpoint Walk', 32.0012, 77.4515, '15:00', 90, 'Quiet golden-hour clearing.'),
      ]),
      d('Manikaran Sahib Gurudwara & Return via Bhuntar', [
        s('activity', 'Sri Gurudwara Manikaran Sahib & Geothermal Springs', 32.0272, 77.3478, '09:00', 90, 'Langar cooked naturally in boiling geothermal pools.'),
        s('transit', 'Return to Bhuntar / Aut Tunnel Bus Point', 31.8764, 77.1542, '12:30', 90, 'Smooth connection to evening Volvo or flight.'),
      ]),
    ],
  },
  {
    slug: 'shimla-mashobra-pines-3d',
    title: 'Shimla Heritage Walk & Mashobra Deodar Pines',
    summary: 'UNESCO Kalka–Shimla Toy Train, Viceregal Lodge Gothic stonework, Gaiety Theatre, and silent cedar trails in Mashobra.',
    photoKey: 'darjeeling',
    destinations: [{ slug: 'shimla', name: 'Shimla' }],
    tripTypes: ['family', 'heritage', 'couple'],
    budgetTier: 'mid',
    bestMonths: [3, 4, 5, 6, 10, 11],
    cloneCount: 95,
    publishedAt: '2026-10-27T08:00:00.000Z',
    days: [
      d('Toy Train Arrival, Viceregal Lodge & The Ridge', [
        s('transit', 'Kalka–Shimla UNESCO Narrow-Gauge Toy Train', 31.1033, 77.1591, '11:30', 60, '102 tunnels and multi-arch stone viaducts.'),
        s('activity', 'Rashtrapati Niwas (Viceregal Lodge), Observatory Hill', 31.1031, 77.1419, '14:00', 90, '1888 Scottish Baronial edifice with manicured botanical lawns.'),
        s('activity', 'Christ Church, Gaiety Heritage Theatre & Scandal Point', 31.1046, 77.176, '16:30', 90, 'Pedestrian-only Ridge promenade at dusk.'),
      ]),
      d('Mashobra Reserve Forest & Craignano Nature Park', [
        s('activity', 'Shimla Water Catchment Wildlife Sanctuary Cycle/Walk', 31.1168, 77.2412, '09:00', 150, 'Car-free British-era forest track through dense deodar and oak.'),
        s('meal', 'Cafe Under Tree / Mashobra Greens Lunch', 31.1319, 77.2294, '13:00', 60, 'Quiet valley lunch away from Mall crowds.'),
        s('activity', 'Craignano Villa & Cedar Park, Mashobra', 31.1475, 77.2248, '15:00', 75, 'High-altitude Italianate stone villa gardens.'),
      ]),
      d('Jakhoo Hill & Himalayan Bird Park', [
        s('activity', 'Jakhoo Ropeway & Ridge Viewpoint', 31.1008, 77.1844, '09:00', 75, 'Highest point of Shimla at 2,455m via aerial cabin.'),
        s('meal', 'Indian Coffee House Mall Road Filter Coffee & Cutlet', 31.1042, 77.1718, '11:00', 45, 'Old-school Shimla institution since the 1950s.'),
        s('transit', 'Departure via Shimla / Chandigarh', 31.1033, 77.1591, '13:00', 60, 'Afternoon descent.'),
      ]),
    ],
  },
  {
    slug: 'dharamshala-mcleodganj-bir-5d',
    title: 'Dharamshala, McLeodganj Monasteries & Bir Billing',
    summary: 'Dhauladhar snow walls, Namgyal Monastery kora, Norbulingka Tibetan crafts, Bhagsu slate trails, and sunset paragliding at Bir.',
    photoKey: 'spiti-valley',
    destinations: [{ slug: 'dharamshala', name: 'Dharamshala' }],
    tripTypes: ['adventure', 'solo', 'friends', 'couple'],
    budgetTier: 'mid',
    bestMonths: [3, 4, 5, 6, 9, 10, 11],
    cloneCount: 118,
    publishedAt: '2026-10-28T08:00:00.000Z',
    days: [
      d('McLeodganj Arrival, Tsuglagkhang & Lingkor Kora', [
        s('activity', 'Tsuglagkhang Complex & Tibet Museum, McLeodganj', 32.2335, 76.3244, '11:00', 105, 'Seat of the Dalai Lama and moving oral-history museum.'),
        s('meal', 'Tibet Kitchen Thenthuk & Steamed Momos', 32.2418, 76.3208, '13:15', 60, 'Beloved family-run Tibetan dining room.'),
        s('activity', 'Lingkor Kora Prayer-Wheel Forest Walk', 32.2315, 76.3238, '16:00', 75, 'Peaceful pine loop ringed by prayer flags.'),
      ]),
      d('Dharamkot Pine Studios & Bhagsu Slate Trail', [
        s('activity', 'Dharamkot Pottery Studio & Gallu Devi Forest Path', 32.2528, 76.3274, '09:30', 150, 'Gentle pine walk beneath the Triund ridge.'),
        s('meal', 'Moonlight Cafe / Morgan Place Lunch, Dharamkot', 32.2504, 76.3256, '13:00', 60, 'Terrace overlooking the Kangra valley.'),
        s('activity', 'Bhagsunag Temple & Waterfall', 32.2454, 76.3358, '15:30', 75, 'Mountain stream cascade east of McLeodganj.'),
      ]),
      d('Norbulingka Institute, HPCA Stadium & Drive to Bir', [
        s('activity', 'Norbulingka Institute of Tibetan Culture, Sidhpur', 32.1932, 76.3642, '09:30', 105, 'Japanese-style streams, thangka studios, and woodcarving workshops.'),
        s('activity', 'HPCA Cricket Stadium Dhauladhar Backdrop Stop', 32.1976, 76.3258, '11:45', 45, 'Iconic mountain-ringed stadium.'),
        s('transit', 'Kangra Tea Garden Drive via Palampur to Bir', 32.0467, 76.7219, '13:30', 105, 'Pass lush Palampur tea estates into Bir Tibetan Colony.'),
      ]),
      d('Billing Paragliding & Sherabling Pine Monastery', [
        s('activity', 'Billing Take-Off (2,400m) Tandem Paragliding / Viewpoint', 32.0589, 76.7458, '08:30', 150, 'World-renowned thermal ridge with gentle landing at Chougan meadow.'),
        s('meal', 'Avva Cafe South Indian Lunch, Bir', 32.0432, 76.7154, '13:00', 60, 'Filter coffee and ghee podi idli facing wheat fields.'),
        s('activity', 'Palpung Sherabling Monastery in Bhattu Pine Forest', 32.0185, 76.7592, '15:30', 90, 'Monumental golden stupa surrounded by quiet pine woods.'),
        s('activity', 'Bir Landing Site Sunset Meadow', 32.0398, 76.7112, '17:45', 60, 'Watch gliders touch down against an amber sky.'),
      ]),
      d('Deer Park Institute & Departure', [
        s('activity', 'Chokling Monastery & Deer Park Stupa, Bir Colony', 32.0425, 76.7192, '09:00', 75, 'Whitewashed stupas and monastic courtyard.'),
        s('transit', 'Return to Gaggal Airport (DHM) / Pathankot', 32.1651, 76.2634, '11:30', 105, 'Afternoon flight or train.'),
      ]),
    ],
  },
  {
    slug: 'ladakh-leh-nubra-pangong-8d',
    title: 'Ladakh: Leh Acclimatisation, Nubra & Pangong Tso',
    summary: 'Medically sensible 48-hour Leh acclimatisation, Sham Valley monasteries, Khardung La to Hunder dunes, and Pangong Tso via Shyok.',
    photoKey: 'ladakh',
    destinations: [
      { slug: 'ladakh', name: 'Ladakh' },
      { slug: 'leh', name: 'Leh' },
    ],
    tripTypes: ['adventure', 'friends', 'couple'],
    budgetTier: 'premium',
    bestMonths: [5, 6, 7, 8, 9],
    cloneCount: 188,
    publishedAt: '2026-10-29T08:00:00.000Z',
    days: [
      d('Fly into Leh (3,500m) — Strict Acclimatisation Day', [
        s('stay', 'Check-in at Leh Heritage Ladakhi Guesthouse & Complete Rest', 34.1642, 77.5848, '10:30', 240, 'Essential 24h rest and hydration after flying directly to 3,500m.'),
        s('activity', 'Gentle Evening Stroll in Leh Main Bazaar (Pedestrian Plaza)', 34.1628, 77.5839, '17:30', 60, 'Flat walk past Jama Masjid and apricot stalls.'),
      ]),
      d('Leh Palace, Shanti Stupa & Thiksey Gompa', [
        s('activity', 'Thiksey Monastery Morning Assembly', 34.0558, 77.6667, '08:30', 90, '12-storey Potala-like complex housing a two-storey Maitreya Buddha.'),
        s('meal', 'The Tibetan Kitchen Leh Lunch', 34.1651, 77.5818, '13:00', 75, 'Skyu pasta stew and steamed mutton/veg momos.'),
        s('activity', 'Leh Palace (Lachen Palkhar) & Namgyal Tsemo', 34.1661, 77.5892, '15:30', 75, '9-storey 17th-century royal palace.'),
        s('activity', 'Shanti Stupa Sunset over Stok Kangri Range', 34.1736, 77.5748, '17:30', 60, 'Drive right up to the upper parking lot.'),
      ]),
      d('Sham Valley: Sangam, Basgo & Alchi 11th-Century Murals', [
        s('activity', 'Indus–Zanskar River Sangam at Nimmu', 34.1669, 77.3328, '09:30', 45, 'Emerald Indus meeting slate-blue Zanskar.'),
        s('activity', 'Alchi Choskor Monastery (Kashmiri Wood & Clay Art)', 34.2236, 77.1753, '11:30', 90, 'Flat riverside complex with 1,000-year-old miniature murals.'),
        s('meal', 'Alchi Kitchen Apricot & Khambir Lunch', 34.2241, 77.1758, '13:15', 60, 'Sourdough khambir bread and buckwheat dishes.'),
        s('activity', 'Hall of Fame Museum, Leh', 34.1422, 77.5478, '16:30', 60, 'Ladakh history and Siachen glacier gallery.'),
      ]),
      d('Khardung La Pass to Diskit & Hunder Dunes (Nubra Valley)', [
        s('transit', 'Cross Khardung La into Nubra Valley (3,048m)', 34.2787, 77.6047, '08:00', 240, 'Brief photo stop at pass; Nubra sits lower than Leh for easy sleep!'),
        s('activity', 'Diskit Monastery & 32m Maitreya Buddha', 34.5422, 77.5586, '14:30', 75, 'Commanding view down the Shyok floodplains.'),
        s('activity', 'Hunder Cold Desert Sand Dunes & Bactrian Camels', 34.5858, 77.4694, '16:45', 90, 'Silver sand dunes framed by snow peaks.'),
      ]),
      d('Turtuk Balti Village Day Excursion', [
        s('activity', 'Turtuk Village Buckwheat Lanes & Royal Yabgo House', 34.8475, 76.8269, '10:30', 180, 'Lush apricot-shaded Balti heritage village along the Shyok river.'),
        s('meal', 'Balti Walnut & Buckwheat Lunch, Turtuk', 34.8481, 76.8275, '13:30', 60, 'Traditional kisir pancakes with walnut dip.'),
      ]),
      d('Shyok River Route from Nubra to Pangong Tso (4,250m)', [
        s('transit', 'Scenic Shyok Riverbed Road via Agham & Durbuk', 33.9892, 78.2219, '08:00', 300, 'Direct valley link without backtracking over Leh.'),
        s('stay', 'Pangong Tso Lakeside Cottages, Spangmik / Man Merak', 33.9114, 78.4312, '14:30', 180, 'Watch the brackish lake shift through seven shades of cobalt and turquoise.'),
      ]),
      d('Pangong Sunrise & Return via Chang La & Hemis to Leh', [
        s('activity', 'Pangong Tso Shore Sunrise', 33.9125, 78.4328, '06:30', 60, 'Mirror-still morning water.'),
        s('activity', 'Hemis Monastery Stopover', 33.9128, 77.7078, '13:30', 75, 'Wealthiest Drukpa monastery tucked inside a rocky gorge.'),
        s('stay', 'Return to Leh & Farewell Dinner at Bon Appetit', 34.1678, 77.5795, '18:30', 90, 'Minimalist Ladakhi terrace dinner.'),
      ]),
      d('Morning Flight over the Himalaya from Leh (IXL)', [
        s('transit', 'Departure from Kushok Bakula Rimpochee Airport (IXL)', 34.1359, 77.5465, '08:00', 60, 'Window seat on left (DEL-bound) for Karakoram & Zanskar views.'),
      ]),
    ],
  },
  {
    slug: 'srinagar-gulmarg-pahalgam-6d',
    title: 'Kashmir: Srinagar Shikaras, Mughal Gardens & Pahalgam',
    summary: 'Dal Lake morning floating market, Nishat & Shalimar terraced chinar gardens, Gulmarg Gondola meadows, and Lidder riverside pines.',
    photoKey: 'ladakh',
    destinations: [
      { slug: 'india', name: 'India' },
      { slug: 'srinagar', name: 'Srinagar' },
    ],
    tripTypes: ['family', 'couple', 'nature'],
    budgetTier: 'premium',
    bestMonths: [4, 5, 6, 9, 10],
    cloneCount: 127,
    publishedAt: '2026-10-30T08:00:00.000Z',
    days: [
      d('Srinagar Arrival & Dal Lake Shikara Sunset', [
        s('stay', 'Cedar Houseboat Check-in, Nigeen / Dal Lake', 34.1106, 74.8352, '13:00', 60, 'Hand-carved walnut wood interiors with calm lotus views.'),
        s('activity', 'Shikara Ride past Char Chinar & Floating Gardens', 34.1158, 74.8614, '16:30', 105, 'Saffron kahwa on the water as Zabarwan hills turn gold.'),
      ]),
      d('Mughal Gardens & Old Srinagar Heritage', [
        s('activity', 'Nishat Bagh & Shalimar Bagh Terraced Chinar Lawns', 34.1422, 74.8794, '09:30', 150, '17th-century Mughal water channels stepping down to Dal Lake.'),
        s('meal', 'Ahdoos Kashmiri Wazwan / Nadru Yakhni Lunch, Residency Rd', 34.0736, 74.8178, '13:15', 75, 'Historic Srinagar bakery and dining room since 1918.'),
        s('activity', 'Pari Mahal Terrace & Shankaracharya Hill View', 34.0819, 74.8778, '16:00', 90, 'Seven-terraced astronomical garden above the lake.'),
      ]),
      d('Gulmarg Meadow of Flowers & Gondola', [
        s('transit', 'Tangmarg Pine Ascent to Gulmarg (2,650m)', 34.0484, 74.3805, '08:30', 105, 'Fir-lined ghat road.'),
        s('activity', 'Gulmarg Gondola Phase 1 (Kongdoori) & Meadow Walk', 34.0419, 74.3842, '10:30', 180, 'Pre-book Gondola slots online; sweeping Nanga Parbat horizon.'),
        s('activity', 'St Marys Victorian Chapel & Golf Meadow, Gulmarg', 34.0512, 74.3878, '15:00', 60, '1902 stone chapel set in undulating green turf.'),
      ]),
      d('Saffron Fields of Pampore to Pahalgam Lidder Valley', [
        s('activity', 'Pampore Saffron Fields & Avantipur 9th-Century Ruins', 33.9228, 75.0128, '10:00', 75, 'Carved Karkota-dynasty limestone temple pillars.'),
        s('stay', 'Pahalgam Lidder Riverside Resort Check-in', 34.0161, 75.315, '14:00', 90, 'Glacial river rushing past pine-clad slopes.'),
      ]),
      d('Aru & Betaab Valley Pine Meadows', [
        s('activity', 'Betaab Valley & Lidder Wooden Bridges', 34.0469, 75.3608, '09:30', 120, 'Crystal streams framed by deodars and snow ridges.'),
        s('activity', 'Aru Valley Alpine Pasture Walk', 34.0914, 75.2636, '13:30', 150, 'Tranquil meadow village 12 km above Pahalgam.'),
      ]),
      d('Return to Srinagar & Departure', [
        s('transit', 'Drive Pahalgam to Sheikh ul-Alam Airport (SXR)', 33.9871, 74.7742, '09:00', 150, 'Allow extra security buffer at Srinagar Airport.'),
      ]),
    ],
  },
  {
    slug: 'alleppey-kumarakom-backwaters-4d',
    title: 'Alleppey & Kumarakom Backwater Canals',
    summary: 'Narrow village canoe rides in Kuttanad below sea level, Kumarakom bird sanctuary dawn, Marari coconut beach, and toddy-shop seafood/veg meals.',
    photoKey: 'alleppey',
    destinations: [{ slug: 'alleppey', name: 'Alleppey' }],
    tripTypes: ['couple', 'family', 'food'],
    budgetTier: 'mid',
    bestMonths: [11, 12, 1, 2, 3],
    cloneCount: 158,
    publishedAt: '2026-10-31T08:00:00.000Z',
    days: [
      d('Kumarakom Vembanad Shore & Sunset Shikara', [
        s('stay', 'Kumarakom Heritage Nalukettu Lake Stay', 9.6175, 76.4301, '12:30', 90, 'Reconstructed traditional Kerala timber courtyard on Vembanad Lake.'),
        s('activity', 'Narrow-Canal Country Canoe Ride, Kumarakom', 9.6095, 76.4282, '16:30', 120, 'Glides quietly under low footbridges where big houseboats cannot enter.'),
      ]),
      d('Kumarakom Bird Sanctuary & Kettuvallam Day Cruise to Alleppey', [
        s('activity', 'Kumarakom Bird Sanctuary Morning Trail', 9.6272, 76.4286, '07:00', 105, 'Darters, kingfishers, and migratory herons along lagoon bunds.'),
        s('activity', 'Private Kettuvallam Backwater Cruise across Vembanad to Alleppey', 9.5011, 76.3522, '12:00', 300, 'Fresh karimeen pollichathu / avial sadya lunch cooked onboard while cruising Kuttanad paddies.'),
      ]),
      d('Alleppey Heritage Canal Quarter & Marari Beach', [
        s('activity', 'Alleppey Lighthouse & Revi Karunakaran Museum', 9.4928, 76.3186, '09:30', 90, '1862 coastal lighthouse and coir-trade history.'),
        s('meal', 'Cassia / Halais Kerala Sadya Lunch, Mullakkal', 9.4978, 76.3365, '12:45', 60, 'Banana-leaf feast with payasam.'),
        s('activity', 'Marari Beach Palm Shoreline Sunset', 9.6008, 76.2981, '16:00', 120, 'Serene fishing village beach 25 mins north of Alleppey.'),
      ]),
      d('Kainakary Morning Ferry & Return via Kochi', [
        s('activity', 'Public SWTD Canal Boat Ride through Kainakary', 9.5122, 76.3714, '08:00', 90, ' ₹20 local water-bus alongside school boats and duck-herders.'),
        s('transit', 'Drive to Ernakulam / Cochin Airport (COK)', 10.1518, 76.4019, '11:30', 120, 'Afternoon departure.'),
      ]),
    ],
  },
  {
    slug: 'munnar-tea-eravikulam-3d',
    title: 'Munnar Tea Estates & Eravikulam Mist Trails',
    summary: 'Rolling emerald Kannan Devan tea slopes, Nilgiri tahr sightings at Eravikulam, Lockhart Tea Factory tasting, and Top Station Western Ghats views.',
    photoKey: 'munnar',
    destinations: [{ slug: 'munnar', name: 'Munnar' }],
    tripTypes: ['couple', 'family', 'nature'],
    budgetTier: 'mid',
    bestMonths: [9, 10, 11, 12, 1, 2, 3],
    cloneCount: 149,
    publishedAt: '2026-11-01T08:00:00.000Z',
    days: [
      d('Ghat Waterfalls & Lockhart Tea Factory', [
        s('activity', 'Cheeyappara & Valara Cascades Stopover', 10.0561, 76.8342, '10:30', 45, 'Seven-tiered waterfall along the Kochi–Munnar ghat climb.'),
        s('stay', 'Tea Planter Bungalow Check-in, Devikulam / Chithirapuram', 10.0628, 77.1042, '13:00', 60, 'Misty estate views away from town bustle.'),
        s('activity', 'Lockhart Tea Museum & Orthodox Leaf Tasting (1879)', 10.0158, 77.1197, '15:00', 90, 'Working heritage factory explaining withering, rolling, and white tea.'),
      ]),
      d('Eravikulam National Park & Mattupetty Dam', [
        s('activity', 'Eravikulam (Rajamalai) National Park Morning Slot', 10.1419, 77.0422, '08:00', 150, 'Shola-grassland habitat of the endangered Nilgiri tahr.'),
        s('meal', 'Rapsy / Saravana Bhavan Kerala Meals, Munnar Bazaar', 10.0889, 77.0595, '12:30', 60, 'Warm Malabar parotta and vegetable stew.'),
        s('activity', 'Mattupetty Dam, Echo Point & Top Station Escarpment', 10.1244, 77.2458, '14:30', 150, '2,200m border viewpoint looking sheer over the Tamil Nadu plains.'),
      ]),
      d('Lakshmi Hills Sunrise Ridge & Spice Garden', [
        s('activity', 'Lakshmi Hills Tea-Ridge Morning Walk', 10.0714, 77.0512, '07:00', 120, 'Easy grassy ridge trail carpeted with tea bushes.'),
        s('activity', 'Cardamom & Black Pepper Plantation Walk, Adimali', 10.0142, 76.9547, '11:00', 60, 'Fresh green peppercorn, nutmeg, and vanilla vines.'),
        s('transit', 'Descent to Kochi / Aluva', 10.1518, 76.4019, '13:00', 180, 'Evening train or flight.'),
      ]),
    ],
  },
  {
    slug: 'kochi-munnar-alleppey-kerala-6d',
    title: 'Classic Kerala: Fort Kochi, Munnar & Alleppey',
    summary: 'Fort Kochi Chinese fishing nets and spice warehouses, two misty days in Munnar tea hills, and Kuttanad backwaters to Marari beach.',
    photoKey: 'alleppey',
    destinations: [
      { slug: 'kochi', name: 'Kochi' },
      { slug: 'munnar', name: 'Munnar' },
      { slug: 'alleppey', name: 'Alleppey' },
    ],
    tripTypes: ['family', 'couple', 'heritage', 'food'],
    budgetTier: 'mid',
    bestMonths: [10, 11, 12, 1, 2, 3],
    cloneCount: 176,
    publishedAt: '2026-11-02T08:00:00.000Z',
    days: [
      d('Fort Kochi Harbour, St Francis Church & Kathakali', [
        s('activity', 'Chinese Fishing Nets & St Francis Church, Fort Kochi', 9.9682, 76.2428, '10:30', 90, 'Oldest European church in India (1503) and cantilevered shore nets.'),
        s('meal', 'Kashi Art Cafe Courtyard Lunch, Burger Street', 9.9665, 76.2432, '13:00', 75, 'Contemporary gallery cafe in a restored Dutch-era townhouse.'),
        s('activity', 'Kerala Kathakali Centre Makeup & Performance', 9.9652, 76.2419, '17:00', 120, 'Arrive at 17:00 to watch the intricate natural-pigment face painting.'),
      ]),
      d('Mattancherry Palace, Jew Town & Ascent to Munnar', [
        s('activity', 'Mattancherry Dutch Palace Murals & Paradesi Synagogue', 9.9579, 76.2594, '09:30', 105, '16th-century Ramayana murals and hand-painted Canton porcelain floor tiles.'),
        s('transit', 'Scenic Ghat Climb Fort Kochi to Munnar', 10.0889, 77.0595, '12:30', 225, 'Climb from sea level into cool 1,600m tea estates.'),
      ]),
      d('Eravikulam Shola Grasslands & Tea Tasting', [
        s('activity', 'Eravikulam National Park Morning Trail', 10.1419, 77.0422, '08:30', 150, 'High Western Ghats views and Nilgiri tahr.'),
        s('activity', 'KDHP Tea Museum & Lockhart Viewpoint', 10.0967, 77.0508, '14:30', 120, 'Century-old Pelton wheel and estate tasting.'),
      ]),
      d('Munnar to Alleppey Backwaters', [
        s('transit', 'Descend via Spice Hills to Alleppey Jetty', 9.4981, 76.3388, '08:30', 240, 'Transition from mountain mist to coconut-lined canals.'),
        s('activity', 'Sunset Shikara Cruise through Kuttanad Paddies', 9.5045, 76.3589, '16:00', 150, 'Quiet village waterways at golden hour.'),
      ]),
      d('Kuttanad Canoe & Marari Coastal Evening', [
        s('activity', 'Morning Country Canoe & Coir-Spinning Visit', 9.5122, 76.3714, '08:00', 120, 'Watch local coir weaving along narrow bunds.'),
        s('stay', 'Mararikulam Beach Cottages Afternoon', 9.6008, 76.2981, '14:00', 180, 'Unwind beside the Arabian Sea.'),
      ]),
      d('Return to Cochin Airport (COK)', [
        s('transit', 'Coastal Highway Drive to Cochin Airport', 10.1518, 76.4019, '10:00', 105, 'Smooth NH66 transfer.'),
      ]),
    ],
  },
  {
    slug: 'hampi-vijayanagara-boulders-3d',
    title: 'Hampi Boulders, Coracles & Vijayanagara Ruins',
    summary: 'UNESCO Vijayanagara stone chariot at Vittala Temple, sunrise over Matanga Hill granite boulders, Tungabhadra river crossings, and Royal Enclosure.',
    photoKey: 'hampi',
    destinations: [{ slug: 'hampi', name: 'Hampi' }],
    tripTypes: ['heritage', 'adventure', 'solo', 'friends'],
    budgetTier: 'budget',
    bestMonths: [10, 11, 12, 1, 2],
    cloneCount: 152,
    publishedAt: '2026-11-03T08:00:00.000Z',
    days: [
      d('Sacred Centre: Virupaksha, Hemakuta Sunset & Bazaar', [
        s('activity', 'Virupaksha Temple & Hampi Bazaar Colonade', 15.335, 76.46, '10:00', 90, 'Living 7th-century temple with painted Ranga Mandapa ceiling.'),
        s('meal', 'Mango Tree Restaurant Banana-Leaf Thali', 15.3342, 76.4612, '12:45', 60, 'Classic Hampi institution near the river.'),
        s('activity', 'Kadalekalu Ganesha & Hemakuta Hill Sunset', 15.3328, 76.4589, '16:30', 90, 'Sheet-granite hill dotted with pre-Vijayanagara shrines.'),
      ]),
      d('Matanga Sunrise, Vittala Stone Chariot & Tungabhadra', [
        s('activity', 'Matanga Hill Dawn Panorama', 15.3347, 76.4689, '06:00', 90, '360-degree sunrise over boulder ridges, banana plantations, and Achyutaraya Temple.'),
        s('activity', 'Vijaya Vittala Temple Stone Chariot & Musical Pillars', 15.3418, 76.4751, '09:30', 150, 'Iconic Garuda shrine sculpted as a processional chariot.'),
        s('activity', 'Sanapur Lake / Tungabhadra Coracle Boat Ride', 15.3514, 76.4328, '16:00', 75, 'Round woven bamboo coracles spinning through boulder gorges.'),
      ]),
      d('Royal Enclosure: Lotus Mahal, Elephant Stables & Pushkarini', [
        s('activity', 'Zenana Enclosure (Lotus Mahal & 11-Domed Elephant Stables)', 15.3175, 76.4712, '09:00', 120, 'Indo-Islamic cusped arches cooled by lime-mortar water pipes.'),
        s('activity', 'Mahanavami Dibba, Stepped Tank & Hazara Rama Bas-Reliefs', 15.3139, 76.4658, '11:30', 90, 'Black-schist stepped pushkarini and 1,000 Ramayana panels.'),
        s('transit', 'Departure via Hosapete Junction (HPT)', 15.2689, 76.3909, '15:00', 45, 'Overnight Hampi Express to Bengaluru or Hubballi flight.'),
      ]),
    ],
  },
  {
    slug: 'coorg-coffee-trails-3d',
    title: 'Coorg Coffee Plantations & Mandalpatti Ridge',
    summary: 'Shade-grown Arabica estate walks, Dubare river elephants, Namdroling Golden Temple in Bylakuppe, and Kodava pandi/mushroom curry.',
    photoKey: 'munnar',
    destinations: [
      { slug: 'karnataka', name: 'Karnataka' },
      { slug: 'coorg', name: 'Coorg' },
    ],
    tripTypes: ['couple', 'family', 'food'],
    budgetTier: 'mid',
    bestMonths: [10, 11, 12, 1, 2, 3],
    cloneCount: 99,
    publishedAt: '2026-11-04T08:00:00.000Z',
    days: [
      d('Bylakuppe Golden Temple & Coffee Estate Check-in', [
        s('activity', 'Namdroling Monastery (Golden Temple), Bylakuppe', 12.4331, 75.9669, '11:00', 75, '18m gilded Buddha statues inside India second-largest Tibetan settlement.'),
        s('stay', 'Madikeri / Pollibetta Coffee Plantation Homestay', 12.4244, 75.7382, '14:00', 90, 'Silver-oak shaded Arabica and pepper estate.'),
        s('activity', 'Guided Bean-to-Cup Plantation Walk & Roasting', 12.425, 75.7395, '16:30', 75, 'Walk among cardamom, pepper vines, and coffee cherries.'),
      ]),
      d('Mandalpatti Mist Jeep, Abbey Falls & Kodava Cuisine', [
        s('activity', 'Mandalpatti Shola Peak Morning View (Pushpagiri Border)', 12.5389, 75.7022, '07:00', 150, '4x4 ridge ascent above a sea of Western Ghats clouds.'),
        s('meal', 'Coorg Cuisine Restaurant Akki Rotti & Kadambuttu Lunch, Madikeri', 12.4212, 75.7398, '13:00', 60, 'Steamed rice dumplings with wild bamboo-shoot or mushroom curry.'),
        s('activity', 'Abbey Falls & Raja Seat Sunset Valley View', 12.4572, 75.7169, '16:00', 105, 'Waterfall framed by spice estates followed by dusk over misty hills.'),
      ]),
      d('Dubare Kaveri Riverbank & Return to Mysuru/Bengaluru', [
        s('activity', 'Dubare Elephant Camp Morning Bathing Bank on Kaveri', 12.3719, 75.9058, '08:30', 105, 'Arrive at 08:30 boat crossing to observe retired forest-camp elephants.'),
        s('transit', 'Drive via Mysuru Expressway to Bengaluru', 12.9716, 77.5946, '12:00', 240, 'Smooth 10-lane Mysuru–Bengaluru corridor.'),
      ]),
    ],
  },
  {
    slug: 'pondicherry-auroville-coastal-3d',
    title: 'Pondicherry White Town & Auroville Break',
    summary: 'Bougainvillea-draped French Quarter streets, morning croissants, Sri Aurobindo Ashram handmade paper, Matrimandir viewing point, and Serenity surf.',
    photoKey: 'goa',
    destinations: [{ slug: 'pondicherry', name: 'Pondicherry' }],
    tripTypes: ['couple', 'friends', 'food', 'solo'],
    budgetTier: 'mid',
    bestMonths: [11, 12, 1, 2, 3],
    cloneCount: 132,
    publishedAt: '2026-11-05T08:00:00.000Z',
    days: [
      d('White Town Mustard Walls & Rock Beach Promenade', [
        s('meal', 'Baker Street / Cafe Des Arts Croissant Brunch, Rue Suffren', 11.9312, 79.8342, '10:30', 75, 'French bakery and vintage yellow courtyard.'),
        s('activity', 'Sri Aurobindo Ashram & Handmade Paper Factory', 11.9369, 79.8344, '14:00', 90, 'Silent flower-filled samadhi courtyard and cotton-rag paper workshop.'),
        s('activity', 'Goubert Avenue (Rock Beach) Car-Free Evening Walk', 11.9338, 79.8358, '17:30', 90, 'Sea breeze past Le Cafe and French War Memorial.'),
      ]),
      d('Auroville Matrimandir, Pottery & Franco-Tamil Dinner', [
        s('activity', 'Auroville Visitors Centre & Matrimandir Viewing Point', 12.0069, 79.8106, '09:30', 120, 'Shaded banyan forest trail to the golden geodesic meditation sphere.'),
        s('meal', 'Tanto Pizzeria / Bread & Chocolate Lunch, Auroville', 11.9958, 79.8256, '12:45', 75, 'Sourdough and bean-to-bar cacao bowls.'),
        s('activity', 'Serenity Beach Fishing Boats & Surf Break', 11.9694, 79.8439, '16:30', 75, 'Rock pier and gentle east-coast waves.'),
        s('meal', 'Villa Shanti Creole-Tamil Courtyard Dinner', 11.9298, 79.8335, '19:30', 90, 'Prawn/veg curry infused with Pondicherry Franco-Tamil spices.'),
      ]),
      d('Tamil Quarter Heritage Columns & ECR Return', [
        s('activity', 'Goubert Market & Vysial Street Tamil Heritage Walk', 11.9355, 79.8294, '08:30', 90, 'Thinai wooden-pillared verandas and flower sellers.'),
        s('transit', 'East Coast Road (ECR) Drive via Mahabalipuram to Chennai', 12.6208, 80.1945, '11:30', 150, 'Optional Shore Temple stop en route to MAA.'),
      ]),
    ],
  },
  {
    slug: 'ooty-coonoor-nilgiri-4d',
    title: 'Ooty & Coonoor Nilgiri Toy Train Escape',
    summary: 'Rack-and-pinion Nilgiri Mountain Railway from Coonoor, Sims Park botanicals, Highfield tea hills, Pykara shola lake, and homemade Nilgiri chocolates.',
    photoKey: 'munnar',
    destinations: [
      { slug: 'india', name: 'India' },
      { slug: 'ooty', name: 'Ooty' },
    ],
    tripTypes: ['family', 'couple'],
    budgetTier: 'mid',
    bestMonths: [3, 4, 5, 10, 11, 12],
    cloneCount: 88,
    publishedAt: '2026-11-06T08:00:00.000Z',
    days: [
      d('Ascend to Coonoor, Sims Park & Dolphin Nose', [
        s('stay', 'Coonoor Tea-Estate Heritage Bungalow Check-in', 11.353, 76.7959, '12:30', 60, 'Quieter, warmer sister hill town 19 km below Ooty.'),
        s('activity', 'Sims Park Tree Ferns & Rare Conifers', 11.3594, 76.8014, '14:30', 75, '1874 ravine garden with century-old rudraksha and Queensland kauri trees.'),
        s('activity', 'Lambs Rock & Dolphin Nose Catherine Falls View', 11.3672, 76.8519, '16:30', 75, 'Sheer drop overlooking the Coimbatore plains and Catherine Falls.'),
      ]),
      d('Nilgiri Mountain Railway to Ooty & Botanical Gardens', [
        s('transit', 'UNESCO Nilgiri Toy Train Coonoor to Udagamandalam (Ooty)', 11.3469, 76.7939, '10:30', 75, 'Blue-and-cream carriages winding past Wellington and Lovedale.'),
        s('meal', 'earl Secret / Nahar Sidewalk Cafe Lunch, Ooty', 11.4118, 76.7032, '13:00', 60, 'Conservatory dining in historic Ooty.'),
        s('activity', 'Government Botanical Gardens & St Stephen Church (1829)', 11.4189, 76.7114, '15:00', 105, '20-million-year-old fossilised tree trunk and timber beam roof.'),
      ]),
      d('Doddabetta Crest, Pykara Shola & Avalanche Valley', [
        s('activity', 'Doddabetta Peak (2,637m Highest Point in Nilgiris)', 11.4011, 76.7358, '08:30', 75, 'Clear morning view across the Mysore plateau.'),
        s('activity', 'Emerald & Avalanche Lake Shola Forest Drive', 11.3094, 76.6219, '11:30', 180, 'Unspoilt wattle, magnolia, and rhododendron watershed.'),
      ]),
      d('Toda Mund Craft Stop & Descent to Coimbatore', [
        s('activity', 'Toda Embroidery & King Star Homemade Chocolates', 11.4126, 76.7082, '09:30', 60, 'GI-tagged red-and-black geometric Toda needlework.'),
        s('transit', 'Drive via Coonoor Hairpins to Coimbatore (CJB)', 11.03, 77.0434, '11:30', 180, 'Afternoon flight or Shatabdi.'),
      ]),
    ],
  },
  {
    slug: 'gokarna-beach-trek-murudeshwar-3d',
    title: 'Gokarna Five-Beach Trail & Yana Rocks',
    summary: 'Headland hike connecting Belekan, Paradise, Half Moon, Om, and Kudle beaches, Mahabaleshwar temple town, and Yana limestone spires.',
    photoKey: 'goa',
    destinations: [
      { slug: 'karnataka', name: 'Karnataka' },
      { slug: 'gokarna', name: 'Gokarna' },
    ],
    tripTypes: ['friends', 'adventure', 'solo'],
    budgetTier: 'budget',
    bestMonths: [10, 11, 12, 1, 2, 3],
    cloneCount: 91,
    publishedAt: '2026-11-07T08:00:00.000Z',
    days: [
      d('Gokarna Temple Lanes & Kudle Sunset', [
        s('activity', 'Gokarna Car Street & Kotiteertha Tank Walk', 14.5479, 74.3188, '11:30', 75, 'Pilgrim town of red-tiled Konkani roofs.'),
        s('meal', 'Prema Restaurant Gadbad Ice Cream & Thali', 14.5448, 74.3175, '13:15', 60, 'Legendary vegetarian coastal lunch.'),
        s('activity', 'Kudle Beach Headland Sunset', 14.5267, 74.3164, '16:45', 90, 'West-facing crescent ringed by coconut hills.'),
      ]),
      d('The Five-Beach Coastal Headland Trek', [
        s('activity', 'Belekan -> Paradise -> Half Moon -> Om Beach Cliff Trail', 14.5139, 74.3319, '07:30', 210, 'Rocky laterite headland path above turquoise coves; carry 2L water.'),
        s('meal', 'Namaste Cafe Lunch on Om Beach', 14.5192, 74.3228, '12:30', 90, 'Rest feet in the sand facing the twin-crescent bay.'),
        s('activity', 'Mirjan Fort Moss-Clad Laterite Bastions', 14.4886, 74.4197, '16:00', 60, '16th-century pepper-queen fortress 22 km away.'),
      ]),
      d('Yana Karst Spires or Murudeshwar Coast & Departure', [
        s('activity', 'Yana Caves Twin Crystalline Limestone Monoliths', 14.5897, 74.5625, '09:00', 120, 'Bhairaveshwara Shikhara rising 120m out of evergreen Western Ghats forest.'),
        s('transit', 'Departure via Gokarna Road Station / Goa Dabolim', 14.5789, 74.3542, '14:00', 60, 'Konkan Railway or cab north to Goa.'),
      ]),
    ],
  },
  {
    slug: 'darjeeling-tea-kanchenjunga-4d',
    title: 'Darjeeling Heritage Tea Estates & Kanchenjunga Dawn',
    summary: 'Tiger Hill first light on Kanchenjunga, Batasia Loop steam DHR ride, Happy Valley first-flush tasting, and Glenary bakery views.',
    photoKey: 'darjeeling',
    destinations: [{ slug: 'darjeeling', name: 'Darjeeling' }],
    tripTypes: ['family', 'couple', 'heritage'],
    budgetTier: 'mid',
    bestMonths: [3, 4, 5, 10, 11],
    cloneCount: 138,
    publishedAt: '2026-11-08T08:00:00.000Z',
    days: [
      d('Kurseong Tea Ascent & Chowrasta Mall Promenade', [
        s('activity', 'Makaibari / Castleton Tea Lounge Stopover, Kurseong', 26.8794, 88.2758, '11:30', 60, 'Biodynamic Darjeeling tea tasting halfway up Hill Cart Road.'),
        s('meal', 'Glenary Bakery & Upstairs Dining Room, Nehru Rd', 27.0439, 88.2678, '14:00', 75, 'Cinnamon rolls and roast/au gratin facing snow peaks.'),
        s('activity', 'Observatory Hill Mahakal Shrine & Chowrasta Walk', 27.0475, 88.2689, '16:30', 75, 'Fluttering prayer flags where Hindu and Buddhist shrines share one hilltop.'),
      ]),
      d('Tiger Hill Dawn, Batasia Toy Train & Himalayan Mountaineering', [
        s('activity', 'Tiger Hill Sunrise over Kanchenjunga (8,586m)', 26.9964, 88.2856, '04:45', 120, 'Pink-gold dawn striking the world third-highest summit.'),
        s('meal', 'Keventer Rooftop Breakfast (Pork Platter / Eggs & Darjeeling Pot)', 27.0422, 88.2669, '08:30', 60, 'Iconic open terrace above Nehru Road.'),
        s('activity', 'Darjeeling Himalayan Railway Joyride to Ghoom & Batasia Loop', 27.0169, 88.2508, '10:40', 120, 'UNESCO steam/diesel spiral loop and Ghoom Monastery.'),
        s('activity', 'Himalayan Mountaineering Institute & Red Panda Conservation Zoo', 27.0581, 88.2544, '14:30', 120, 'Tenzing Norgay Everest archives and snow-leopard breeding centre.'),
      ]),
      d('Happy Valley Tea Estate, Ropeway & Tibetan Self-Help Centre', [
        s('activity', 'Happy Valley Tea Estate Factory Walk (1854)', 27.0508, 88.2589, '09:30', 90, 'One of the highest tea factories in the world at 2,100m.'),
        s('activity', 'Darjeeling Rangeet Valley Cable Car', 27.0658, 88.2522, '11:30', 75, 'Glides steeply over emerald tea bushes down to Tukvar.'),
        s('meal', 'Kunga Restaurant Tibetan Steamed Momos & Thukpa', 27.0419, 88.2665, '13:30', 60, 'Tiny 8-table family kitchen near Gandhi Road.'),
        s('activity', 'Japanese Peace Pagoda Evening Chants', 27.0281, 88.2597, '16:30', 60, 'White stupa overlooking the whole ridge.'),
      ]),
      d('Lamahatta Pine Eco-Garden & Descent to Bagdogra/NJP', [
        s('activity', 'Lamahatta Pine & Prayer-Flag Forest Walk', 27.0519, 88.3522, '09:00', 75, 'Quiet dhupi-pine garden via Peshok Tea Road.'),
        s('transit', 'Descent to Bagdogra (IXB) / New Jalpaiguri (NJP)', 26.6812, 88.3286, '11:00', 180, 'Afternoon flight or Vande Bharat.'),
      ]),
    ],
  },
  {
    slug: 'gangtok-tsomgo-sikkim-5d',
    title: 'Gangtok Monasteries & Tsomgo Glacial Lake Loop',
    summary: 'MG Marg car-free evenings, Rumtek Dharma Chakra Centre, Namgyal Tibetology scrolls, and high-altitude Tsomgo Lake.',
    photoKey: 'darjeeling',
    destinations: [
      { slug: 'gangtok', name: 'Gangtok' },
      { slug: 'sikkim', name: 'Sikkim' },
    ],
    tripTypes: ['family', 'couple', 'adventure'],
    budgetTier: 'mid',
    bestMonths: [3, 4, 5, 10, 11],
    cloneCount: 109,
    publishedAt: '2026-11-09T08:00:00.000Z',
    days: [
      d('Teesta Gorge Ascent & MG Marg Promenade', [
        s('transit', 'Teesta River Drive Bagdogra/NJP to Gangtok', 27.3389, 88.6065, '10:30', 240, 'Emerald Teesta canyon climb into Sikkim.'),
        s('activity', 'MG Marg Cobblestone Boulevard Stroll', 27.3292, 88.6125, '17:00', 90, 'Spotlessly clean pedestrian square lined with bakeries.'),
      ]),
      d('Rumtek Monastery, Tibetology & Do Drul Chorten', [
        s('activity', 'Namgyal Institute of Tibetology & Do Drul Chorten', 27.3156, 88.6047, '09:30', 105, '108 prayer wheels surrounding a gold-spired stupa in oak woods.'),
        s('meal', 'Nimtho Authentic Sikkimese Thali, MG Marg', 27.3298, 88.6128, '12:45', 60, 'Gundruk soup, ningro fern fiddleheads, and phagshapa/paneer.'),
        s('activity', 'Rumtek Dharma Chakra Monastery', 27.2886, 88.5614, '14:30', 120, 'Seat of the Karmapa housing the Golden Stupa reliquary.'),
      ]),
      d('Tsomgo (Changu) Glacial Lake & Baba Mandir Excursion', [
        s('activity', 'Tsomgo Glacial Lake (3,753m) Permit Drive', 27.3742, 88.7619, '08:00', 210, 'Carry ID photos a day prior for permit; alpine oval lake ringed by rhododendrons.'),
        s('activity', 'Kyongnosla Alpine Sanctuary View', 27.3689, 88.7258, '13:30', 60, 'Red panda and blood pheasant habitat on the return descent.'),
      ]),
      d('Enchey Monastery, Banjhakri Falls & Ropeway', [
        s('activity', 'Enchey 200-Year Monastery & Ganesh Tok Viewpoint', 27.3358, 88.6192, '09:00', 90, 'Perched on a pine ridge facing Kanchenjunga.'),
        s('activity', 'Gangtok Ropeway Aerial Ride (Deorali to Tashiling)', 27.3175, 88.6052, '11:30', 60, 'Bird-eye view of steeply stacked Gangtok rooftops.'),
        s('meal', 'Baker Cafe Cinnamon Coffee & Momos', 27.3289, 88.6122, '13:00', 60, 'Valley-window tables on MG Marg.'),
        s('activity', 'Directorate of Handicrafts & Handloom Lepcha Weaves', 27.3342, 88.6147, '15:00', 60, 'Traditional Sikkimese thangka and woven bags.'),
      ]),
      d('Return via Rangpo to Bagdogra / NJP', [
        s('transit', 'Morning Descent along NH10 to IXB / NJP', 26.6812, 88.3286, '08:30', 240, 'Buffer 4.5h for hill highway traffic.'),
      ]),
    ],
  },
  {
    slug: 'meghalaya-shillong-cherrapunji-6d',
    title: 'Meghalaya: Shillong, Cherrapunji Root Bridges & Dawki',
    summary: 'Bio-engineered Khasi Ficus elastica living root bridges in Nongriat, Nohkalikai plunge waterfall, crystal Umngot river at Shnongpdeng, and Mawphlang sacred forest.',
    photoKey: 'munnar',
    destinations: [
      { slug: 'shillong', name: 'Shillong' },
      { slug: 'cherrapunji', name: 'Cherrapunji' },
      { slug: 'meghalaya', name: 'Meghalaya' },
    ],
    tripTypes: ['adventure', 'nature', 'friends', 'family'],
    budgetTier: 'mid',
    bestMonths: [10, 11, 12, 1, 2, 3],
    cloneCount: 145,
    publishedAt: '2026-11-10T08:00:00.000Z',
    days: [
      d('Guwahati to Umiam Lake & Shillong Cafes', [
        s('activity', 'Umiam (Barapani) Pine-Ringed Lake Viewpoint', 25.6628, 91.9036, '11:30', 45, 'Fjord-like reservoir framed by Khasi pines.'),
        s('activity', 'Don Bosco Museum of Indigenous Northeast Cultures, Shillong', 25.5919, 91.8942, '14:00', 105, 'Seven-storey hexagonal museum with skywalk over Shillong.'),
        s('meal', 'Dylan Cafe / ML 05 Cafe Evening, Shillong', 25.5682, 91.8834, '17:30', 75, 'Celebrate Shillong acoustic music heritage.'),
      ]),
      d('Laitlum Canyons & Mawphlang Sacred Grove to Cherrapunji', [
        s('activity', 'Laitlum Grand Canyon Escarpment', 25.4472, 91.9089, '08:30', 90, 'Cloud-swept grass cliffs dropping into Rasong gorge.'),
        s('activity', 'Mawphlang Sacred Forest Guided Khasi Trail', 25.4469, 91.7536, '11:30', 90, '800-year-old Rudraksha and orchid grove where nothing may be removed.'),
        s('activity', 'Nohkalikai Plunge Waterfall (340m), Sohra (Cherrapunji)', 25.2758, 91.6869, '15:30', 60, 'India tallest plunge waterfall tumbling into a jade pool.'),
      ]),
      d('Nongriat Double-Decker Living Root Bridge Trek', [
        s('activity', 'Tyrna to Nongriat Double-Decker Root Bridge (3,500 Steps)', 25.2514, 91.6722, '07:30', 300, 'Two-tier living rubber-fig bridge woven over generations by Khasi villagers.'),
        s('stay', 'Rest & Khasi Dinner at Sohra / Cherrapunji', 25.2702, 91.7323, '16:30', 120, 'Warm jadoh / veg rice soup and recovery evening.'),
      ]),
      d('Wei Sawdong / Arwah Cave to Mawlynnong & Shnongpdeng (Dawki)', [
        s('activity', 'Arwah Lumshynna Limestone Fossil Cave, Sohra', 25.2842, 91.7219, '09:00', 75, 'Marine shell fossils embedded in cliffside caverns.'),
        s('activity', 'Riwai Single Living Root Bridge & Mawlynnong Bamboo Skywalk', 25.2019, 91.9161, '12:30', 90, 'Easily accessible root bridge (10-min walk) for all ages.'),
        s('activity', 'Umngot Crystal-Clear River Boating at Shnongpdeng (Dawki)', 25.2069, 92.0089, '15:30', 90, 'Upstream of Dawki bridge where boats appear suspended in mid-air.'),
      ]),
      d('Krang Suri Turquoise Cascade & Return to Shillong', [
        s('activity', 'Krang Suri Waterfall, Jaintia Hills', 25.3247, 92.1328, '10:00', 105, 'Curtain waterfall over blue-green pools with life-jacket swim zone.'),
        s('activity', 'Ward Lake & Police Bazar Evening, Shillong', 25.5758, 91.8861, '16:00', 90, 'Wooden arched bridge and local Lakadong turmeric spice shopping.'),
      ]),
      d('Descent to Guwahati Airport (GAU)', [
        s('transit', 'NH6 Descent Shillong to Guwahati Airport', 26.1061, 91.5859, '09:00', 180, 'Smooth four-lane highway back to Brahmaputra valley.'),
      ]),
    ],
  },
  {
    slug: 'andaman-havelock-neil-6d',
    title: 'Andaman Islands: Port Blair, Havelock & Neil',
    summary: 'Cellular Jail history, high-speed catamaran to Swaraj Dweep (Havelock), Radhanagar sunset, Elephant Beach reefs, and Shaheed Dweep natural coral arch.',
    photoKey: 'alleppey',
    destinations: [
      { slug: 'port-blair', name: 'Port Blair' },
      { slug: 'havelock', name: 'Havelock Island' },
      { slug: 'andaman-nicobar', name: 'Andaman & Nicobar Islands' },
    ],
    tripTypes: ['couple', 'family', 'adventure'],
    budgetTier: 'premium',
    bestMonths: [11, 12, 1, 2, 3, 4],
    cloneCount: 155,
    publishedAt: '2026-11-11T08:00:00.000Z',
    days: [
      d('Port Blair Arrival, Corbyn Cove & Cellular Jail', [
        s('activity', 'Cellular Jail National Memorial Galleries', 11.6739, 92.7481, '15:00', 90, 'Preserved radial wings chronicling India freedom movement.'),
        s('activity', 'Cellular Jail Sound & Light Show', 11.6739, 92.7481, '18:00', 60, 'Narrated under the historic peepal tree.'),
      ]),
      d('Catamaran to Havelock (Swaraj Dweep) & Radhanagar Beach', [
        s('transit', 'Morning High-Speed Ferry Haddo Wharf to Havelock', 11.9743, 92.9889, '08:00', 95, 'Air-conditioned catamaran across the Ritchie Archipelago.'),
        s('meal', 'Something Different Beachside Cafe Lunch, Havelock', 12.0119, 93.0056, '13:00', 75, 'Grilled catch and tropical platters.'),
        s('activity', 'Radhanagar Beach (Beach No. 7) Sunset', 11.9844, 92.9508, '15:45', 120, '2 km powder-white crescent backed by towering mahua forest.'),
      ]),
      d('Scuba / Snorkelling at Elephant Beach & Kalapathar', [
        s('activity', 'Morning Introductory Dive / Reef Snorkel off Nemo Reef or Elephant Beach', 12.0089, 92.9442, '07:30', 180, 'Calm shallow coral gardens ideal for first-timers.'),
        s('activity', 'Kalapathar Beach Black-Rock Tide Pools', 11.9756, 93.0158, '16:00', 75, 'Dead coral driftwood and emerald lagoons along the eastern shore.'),
      ]),
      d('Ferry to Neil Island (Shaheed Dweep) & Natural Bridge', [
        s('transit', 'Mid-morning Ferry Havelock to Neil Island', 11.8322, 93.0419, '10:30', 60, 'Flat bicycle-friendly coral island.'),
        s('activity', 'Howrah Natural Coral Bridge at Low Tide', 11.8378, 93.0289, '15:00', 75, 'Tide pools teeming with brittle stars, crabs, and brain coral.'),
        s('activity', 'Laxmanpur Beach Sunset Point', 11.8419, 93.0236, '17:00', 60, 'Dead-tree silhouettes facing Havelock across the channel.'),
      ]),
      d('Bharatpur Reef Lagoon & Return to Port Blair Chidiya Tapu', [
        s('activity', 'Bharatpur Beach Glass-Bottom Boat / Snorkel', 11.8392, 93.0464, '08:00', 90, 'Shallow turquoise lagoon beside Neil jetty.'),
        s('transit', 'Afternoon Ferry Neil to Port Blair', 11.6714, 92.7336, '13:30', 75, 'Return to South Andaman.'),
        s('activity', 'Chidiya Tapu Southernmost Sunset Point', 11.5081, 92.7061, '16:45', 60, 'Forested cape at the tip of South Andaman.'),
      ]),
      d('Departure from Veer Savarkar Airport (IXZ)', [
        s('transit', 'Morning Transfer to Port Blair Airport (IXZ)', 11.6412, 92.7297, '09:00', 45, 'Onward mainland flight.'),
      ]),
    ],
  },
  {
    slug: 'agra-taj-fatehpur-sikri-2d',
    title: 'Agra Sunrise Taj Mahal & Fatehpur Sikri Weekend',
    summary: 'East Gate dawn entry to the Taj Mahal (closed Fridays), Agra Red Fort marble pavilions, Mehtab Bagh Yamuna sunset, and Akbar sandstone capital.',
    photoKey: 'hampi',
    destinations: [{ slug: 'agra', name: 'Agra' }],
    tripTypes: ['heritage', 'couple', 'family'],
    budgetTier: 'mid',
    bestMonths: [10, 11, 12, 1, 2, 3],
    cloneCount: 164,
    publishedAt: '2026-11-12T08:00:00.000Z',
    days: [
      d('Agra Fort, Baby Taj & Mehtab Bagh Yamuna Sunset', [
        s('activity', 'Agra Fort (Jahangiri Mahal & Musamman Burj)', 27.1795, 78.0211, '10:30', 120, 'UNESCO red-sandstone citadel looking downriver to the Taj.'),
        s('meal', 'Pinch of Spice / Peshawri Mughlai & Veg Lunch', 27.1619, 78.0419, '13:15', 75, 'Refined North Indian dining.'),
        s('activity', 'Tomb of Itimad-ud-Daulah (Baby Taj)', 27.1928, 78.0308, '15:00', 60, 'Jewel-box pietra dura inlay predating the Taj Mahal.'),
        s('activity', 'Mehtab Bagh Charbagh Sunset across Yamuna', 27.18, 78.0422, '17:00', 75, 'Symmetrical dusk view of the Taj northern marble facade.'),
      ]),
      d('Taj Mahal Sunrise & Fatehpur Sikri', [
        s('activity', 'Taj Mahal East Gate Sunrise Entry (Note: Closed Fridays)', 27.1751, 78.0421, '06:00', 150, 'Cool marble, translucent dawn light, and minimal crowds.'),
        s('meal', 'Deviram Bedai & Jalebi Breakfast + Panchhi Petha Stop', 27.1758, 78.0089, '09:30', 60, 'Classic Agra spiced lentil puri breakfast.'),
        s('activity', 'Fatehpur Sikri (Buland Darwaza, Panch Mahal & Salim Chishti)', 27.0945, 77.6679, '11:30', 150, 'Akbar intact 1571 sandstone court city 37 km west.'),
        s('transit', 'Gatimaan / Vande Bharat Departure from Agra Cantt (AGC)', 27.1578, 77.9897, '16:30', 60, '100-minute express return to New Delhi.'),
      ]),
    ],
  },
  {
    slug: 'amritsar-golden-temple-food-3d',
    title: 'Amritsar Harmandir Sahib, Partition Museum & Kulcha Trail',
    summary: 'Palki Sahib ceremony at the Golden Temple, world-largest community Langar, Town Hall Partition Museum, Gobindgarh, and tandoori Amritsari kulchas.',
    photoKey: 'varanasi',
    destinations: [{ slug: 'amritsar', name: 'Amritsar' }],
    tripTypes: ['pilgrimage', 'food', 'family', 'heritage'],
    budgetTier: 'budget',
    bestMonths: [10, 11, 12, 1, 2, 3],
    cloneCount: 144,
    publishedAt: '2026-11-13T08:00:00.000Z',
    days: [
      d('Heritage Street, Jallianwala Bagh & Illuminated Golden Temple', [
        s('meal', 'Kesar Da Dhaba Slow-Simmered Dal Makhani & Lachha Paratha (1916)', 31.6242, 74.8756, '13:00', 75, 'Pure-veg Chowk Passian institution cooked in brass degs for 12 hours.'),
        s('activity', 'Jallianwala Bagh Memorial', 31.6206, 74.8801, '15:00', 60, 'Solemn garden memorial adjacent to the Heritage Walk.'),
        s('activity', 'Sri Harmandir Sahib (Golden Temple) Evening Darshan & Guru Ka Langar', 31.62, 74.8765, '18:30', 150, 'Gilded sanctum mirrored in the Amrit Sarovar; cover head and wash feet.'),
      ]),
      d('Partition Museum, Amritsari Kulcha & Attari–Wagah Retreat', [
        s('meal', 'All India Famous / Bhai Kulwant Singh Amritsari Kulcha, Bazar Mai Sewan', 31.6219, 74.8794, '09:00', 60, 'Crisp layered potato-cauliflower kulcha with tangy chole.'),
        s('activity', 'The Partition Museum at Town Hall', 31.6258, 74.8797, '10:30', 120, 'Deeply moving people-history archive of 1947.'),
        s('activity', 'Attari–Wagah Border Beating Retreat Ceremony', 31.6047, 74.5739, '15:30', 180, 'Arrive early for seated gallery before sunset flag lowering.'),
      ]),
      d('Durgiana Temple, Phulkari Bazaars & Departure', [
        s('activity', 'Gobindgarh Fort Toshakhana & Durgiana Temple', 31.6269, 74.8606, '09:30', 105, 'Maharaja Ranjit Singh brick bastion and silver-door temple.'),
        s('meal', 'Gian Di Lassi (Peda Lassi) & Katra Jaimal Singh Phulkari', 31.6278, 74.8772, '12:00', 60, 'Hand-embroidered Punjab dupattas and malai lassi.'),
        s('transit', 'Departure via Amritsar Junction (ASR) / Sri Guru Ram Dass Jee Airport (ATQ)', 31.7096, 74.7973, '14:30', 45, 'Shatabdi / afternoon flight.'),
      ]),
    ],
  },
  {
    slug: 'ayodhya-prayagraj-pilgrim-3d',
    title: 'Ayodhya Ram Mandir & Prayagraj Triveni Sangam Yatra',
    summary: 'Accessible Shri Ram Janmabhoomi Path darshan, Saryu Naya Ghat evening aarti, Hanuman Garhi, and boat ride to Prayagraj Triveni Sangam.',
    photoKey: 'varanasi',
    destinations: [
      { slug: 'ayodhya', name: 'Ayodhya' },
      { slug: 'uttar-pradesh', name: 'Uttar Pradesh' },
    ],
    tripTypes: ['pilgrimage', 'family'],
    budgetTier: 'budget',
    bestMonths: [10, 11, 12, 1, 2, 3],
    cloneCount: 135,
    publishedAt: '2026-11-14T08:00:00.000Z',
    days: [
      d('Ayodhya Arrival, Kanak Bhawan & Saryu Naya Ghat Aarti', [
        s('stay', 'Check-in near Ram Path, Ayodhya', 26.7922, 82.1998, '12:00', 60, 'Central location close to e-bus and golf-cart shuttles.'),
        s('activity', 'Hanuman Garhi & Kanak Bhawan Courtyard', 26.7947, 82.2019, '15:00', 105, 'Bundela-gifted palace temple with devotional bhajans.'),
        s('activity', 'Saryu River Naya Ghat (Lata Mangeshkar Chowk) Sandhya Aarti', 26.8092, 82.2097, '18:00', 75, 'Evening lamps along the stepped riverfront.'),
      ]),
      d('Shri Ram Janmabhoomi Mandir Morning Darshan & Drive to Prayagraj', [
        s('activity', 'Shri Ram Janmabhoomi Mandir Darshan (Janmabhoomi Path)', 26.7956, 82.1944, '07:30', 150, 'Free lockers, wheelchairs, and battery carts available along the Nagara sandstone corridor.'),
        s('meal', 'Makhan-Malai & Satvik Bhojanalaya Lunch, Ram Path', 26.7918, 82.2028, '12:00', 60, 'Pure vegetarian pilgrim meal.'),
        s('transit', 'Highway Drive Ayodhya to Prayagraj', 25.4358, 81.8463, '14:00', 210, 'Smooth NH330 south to the Ganga–Yamuna confluence.'),
      ]),
      d('Triveni Sangam Boat Dip, Anand Bhawan & Departure', [
        s('activity', 'Triveni Sangam Morning Boat from Arail / Sangam Nose', 25.4269, 81.8869, '07:00', 120, 'Visible meeting line of green Yamuna and golden Ganga waters.'),
        s('activity', 'Anand Bhawan Museum & Alfred Park (Chandrashekhar Azad Park)', 25.4608, 81.8628, '10:30', 90, 'Historic freedom-movement residence and planetarium grounds.'),
        s('transit', 'Departure via Prayagraj Junction (PRYJ) / Airport (IXD)', 25.4447, 81.8278, '14:00', 45, 'Vande Bharat connections to Delhi and Varanasi.'),
      ]),
    ],
  },
  {
    slug: 'rann-of-kutch-white-desert-3d',
    title: 'Rann of Kutch Salt Desert & Bhuj Craft Villages',
    summary: 'Dhordo gleaming white salt flats at sunset and moonrise, Kalo Dungar panoramic ridge, Ajrakhpur natural indigo block-printers, and Nirona Rogan art.',
    photoKey: 'udaipur',
    destinations: [
      { slug: 'india', name: 'India' },
      { slug: 'rann-of-kutch', name: 'Rann of Kutch' },
    ],
    tripTypes: ['heritage', 'family', 'couple'],
    budgetTier: 'mid',
    bestMonths: [11, 12, 1, 2],
    cloneCount: 101,
    publishedAt: '2026-11-15T08:00:00.000Z',
    days: [
      d('Bhuj Palaces to Nirona Rogan Art & White Rann Sunset', [
        s('activity', 'Aina Mahal & Prag Mahal, Bhuj', 23.2547, 69.6692, '09:30', 90, '18th-century Kutch mirror hall and Italian Gothic clocktower.'),
        s('activity', 'Nirona Village: Khatri Family Rogan Painting & Copper Bell Craft', 23.4389, 69.5186, '12:30', 90, 'Castor-oil pigment stylus art practised by one master lineage.'),
        s('activity', 'Dhordo White Rann Salt Desert Sunset & Starlight Walk', 23.8289, 69.5214, '17:00', 120, 'Obtain online Rann permit; surreal crystalline horizon.'),
      ]),
      d('White Rann Sunrise, Kalo Dungar & Hodka Bhungas', [
        s('activity', 'White Rann Dawn Salt Flats', 23.8289, 69.5214, '06:30', 75, 'Pastel pink sky reflected on hard salt crust.'),
        s('activity', 'Kalo Dungar (Black Hill, 462m Highest Point in Kutch)', 23.9328, 69.8219, '11:00', 90, 'Sweeping vista over the Great Rann and India Bridge.'),
        s('stay', 'Hodka / Shaam-e-Sarhad Mud-Mirror Bhunga Stay', 23.7258, 69.6894, '16:00', 120, 'Circular earthquake-resilient Kutchi mud cottages with lippan mirrorwork.'),
      ]),
      d('Ajrakhpur Natural Indigo Studios & Living Museum (LLDC)', [
        s('activity', 'LLDC (Living and Learning Design Centre) Embroidery Museum, Ajrakhpur', 23.2358, 69.8042, '10:00', 120, 'World-class museum of Rabari, Ahir, and Mutwa needlework plus live Ajrakh indigo printing.'),
        s('meal', 'Hotel Prince / Kutchi Dabeli & Gujarati Thali, Bhuj', 23.2489, 69.6669, '13:00', 60, 'Invented-in-Kutch dabeli and farsan.'),
        s('transit', 'Departure via Bhuj Airport (BHJ) / Bhuj Station', 23.2878, 69.6702, '15:00', 45, 'Evening train to Ahmedabad/Mumbai.'),
      ]),
    ],
  },
  {
    slug: 'mumbai-art-deco-street-food-3d',
    title: 'Mumbai Art Deco Precinct, Colaba & Irani Cafes',
    summary: 'UNESCO Victorian Gothic & Art Deco Oval Maiden ensemble, Elephanta rock-cut caves, Kala Ghoda galleries, Bandra villages, and classic berry pulao.',
    photoKey: 'goa',
    destinations: [{ slug: 'mumbai', name: 'Mumbai' }],
    tripTypes: ['food', 'heritage', 'friends', 'solo'],
    budgetTier: 'mid',
    bestMonths: [11, 12, 1, 2],
    cloneCount: 123,
    publishedAt: '2026-11-16T08:00:00.000Z',
    days: [
      d('Gateway Dawn, Kala Ghoda Art District & Marine Drive Art Deco', [
        s('activity', 'Gateway of India & CSMVS (Prince of Wales Museum)', 18.9269, 72.8326, '09:30', 135, 'Indo-Saracenic dome housing Chola bronzes and Indus Valley artefacts.'),
        s('meal', 'Britannia & Co. Berry Pulao Lunch, Ballard Estate (Closed Sun)', 18.9369, 72.8402, '12:30', 75, '1923 Zoroastrian Irani cafe famous for barberry rice and caramel custard.'),
        s('activity', 'Kala Ghoda Galleries & Keneseth Eliyahoo Synagogue', 18.9283, 72.8322, '14:30', 90, 'Jehangir Art Gallery and Tiffany-blue synagogue interior.'),
        s('activity', 'Oval Maidan UNESCO Victorian & Art Deco Walk to Marine Drive', 18.9308, 72.8267, '17:00', 90, 'World second-largest Art Deco skyline facing the Arabian Sea.'),
      ]),
      d('Elephanta Caves Ferry & Bandra Ranwar Village', [
        s('activity', 'Morning Launch from Gateway to Elephanta Caves (Closed Mon)', 18.9633, 72.9315, '09:00', 210, '6th-century monolithic Trimurti Sadashiva carved into basalt island rock.'),
        s('meal', 'Swati Snacks Panki & Pav Bhaji Lunch, Tardeo', 18.9692, 72.8142, '13:45', 60, 'Spotless vegetarian Gujarati-Mumbai classics cooked on banana leaves.'),
        s('activity', 'Ranwar & Chuim East-Indian Villages + Bandstand, Bandra', 19.0544, 72.8258, '16:30', 105, '19th-century wooden cottages, street murals, and Mount Mary steps.'),
      ]),
      d('Banganga Tank, Dhobi Ghat View & Departure', [
        s('activity', 'Banganga Sacred Tank & Malabar Hill Hanging Gardens', 18.9453, 72.7936, '09:00', 90, 'Freshwater stepped tank tucked amid Walkeshwar high-rises.'),
        s('meal', 'Kyani & Co. / Yazdani Bakery Brun Maska & Chai, Fort', 18.9347, 72.8342, '11:30', 45, 'Wood-fired heritage bakery.'),
        s('transit', 'Departure via CSMIA Terminal 2 (BOM) / CSMT', 19.0896, 72.8656, '14:00', 60, 'Allow 60m on Coastal Road + Western Express.'),
      ]),
    ],
  },
  {
    slug: 'delhi-old-new-heritage-3d',
    title: "Old & New Delhi: Chandni Chowk, Humayun's Tomb & Lodhi Art",
    summary: "Jama Masjid morning rooftops, Paranthe Wali Gali, Sunder Nursery Mughal gardens, Humayun's Tomb, Qutub Complex, and Lodhi Art District.",
    photoKey: 'delhi',
    destinations: [{ slug: 'delhi', name: 'Delhi' }],
    tripTypes: ['heritage', 'food', 'family', 'solo'],
    budgetTier: 'mid',
    bestMonths: [10, 11, 12, 2, 3],
    cloneCount: 131,
    publishedAt: '2026-11-17T08:00:00.000Z',
    days: [
      d('Shahjahanabad (Old Delhi) & Agrasen Ki Baoli', [
        s('activity', 'Jama Masjid Courtyard & Khari Baoli Spice Rooftop', 28.6507, 77.2334, '08:30', 120, 'Asia largest wholesale spice market and 1656 sandstone mosque.'),
        s('activity', 'Red Fort (Lal Qila) Lahori Gate & Diwan-i-Khas', 28.6562, 77.241, '11:00', 90, 'Shah Jahan riverside imperial palace.'),
        s('meal', 'Karim / Haveli Dharampura Old Delhi Lunch', 28.6528, 77.2325, '13:00', 75, 'Restored 1887 haveli or historic Matia Mahal culinary lane.'),
        s('activity', 'Agrasen Ki Baoli & Kartavya Path (India Gate) Evening', 28.6261, 77.225, '17:00', 90, '60m deep medieval stepwell followed by illuminated Lutyens vista.'),
      ]),
      d("Humayun's Tomb, Sunder Nursery & Lodhi Gardens", [
        s('activity', "Humayun's Tomb & Isa Khan Enclosure", 28.5933, 77.2507, '09:00', 105, '1570 garden-tomb prototype for the Taj Mahal.'),
        s('activity', 'Sunder Nursery Heritage Park & Lotus Ponds', 28.5969, 77.2458, '11:00', 90, '90-acre restored Mughal arboretum seamlessly connected to Humayun Tomb.'),
        s('meal', 'FabCafe by the Lake / Carnatic Cafe, Lodhi Colony', 28.5847, 77.2278, '13:00', 60, 'Malleshwaram dosa or lakeside lunch.'),
        s('activity', 'Lodhi Gardens 15th-Century Tombs & Lodhi Open-Air Murals', 28.5931, 77.2197, '16:00', 105, 'Bara Gumbad and India first public street-art district.'),
      ]),
      d('Mehrauli Qutub Minar, Crafts Museum & Dilli Haat', [
        s('activity', 'Qutub Minar & Quwwat-ul-Islam Iron Pillar', 28.5245, 77.1855, '09:00', 105, '72.5m fluted victory tower and rust-free 4th-century Gupta pillar.'),
        s('activity', 'National Crafts Museum & Cafe Lota Lunch, Pragati Maidan', 28.6136, 77.2422, '12:30', 120, 'Regional Indian dishes (ammini kozhukattai, bhutta kebab) beside textile galleries.'),
        s('activity', 'Dilli Haat INA State Craft Stalls', 28.5733, 77.2075, '15:30', 75, 'Direct-from-artisan Madhubani, Pashmina, and terracotta stalls.'),
      ]),
    ],
  },
  {
    slug: 'grand-north-india-heritage-11d',
    title: 'Grand North India: Delhi, Agra, Jaipur, Udaipur & Varanasi (11D)',
    summary: 'Comprehensive 11-day cultural arc across the Golden Triangle, Lake Pichola in Udaipur, and sunrise boat rides on the Ganges in Varanasi.',
    photoKey: 'delhi',
    destinations: [
      { slug: 'delhi', name: 'Delhi' },
      { slug: 'agra', name: 'Agra' },
      { slug: 'jaipur', name: 'Jaipur' },
      { slug: 'udaipur', name: 'Udaipur' },
      { slug: 'varanasi', name: 'Varanasi' },
    ],
    tripTypes: ['heritage', 'family', 'couple'],
    budgetTier: 'premium',
    bestMonths: [10, 11, 12, 1, 2, 3],
    cloneCount: 114,
    publishedAt: '2026-11-18T08:00:00.000Z',
    days: [
      d('Arrive New Delhi: Humayun Tomb & Lodhi Gardens', [
        s('activity', "Humayun's Tomb & Sunder Nursery", 28.5933, 77.2507, '14:00', 120, 'Gentle garden walk on arrival afternoon.'),
        s('activity', 'Lodhi Gardens Sunset', 28.5931, 77.2197, '17:00', 75, 'Sayyid and Lodi domes in landscaped lawns.'),
      ]),
      d('Old Delhi Spice Walk & Qutub Minar', [
        s('activity', 'Jama Masjid & Chandni Chowk Rickshaw Loop', 28.6507, 77.2334, '09:00', 150, 'Historic bazaar lanes.'),
        s('activity', 'Qutub Minar UNESCO Complex', 28.5245, 77.1855, '15:00', 90, '12th-century sandstone calligraphy.'),
      ]),
      d('Gatimaan Express to Agra & Mehtab Bagh', [
        s('transit', 'Morning Express Train Delhi to Agra Cantt', 27.1578, 77.9897, '08:10', 100, 'Fastest rail link.'),
        s('activity', 'Agra Fort & Mehtab Bagh Sunset', 27.1795, 78.0211, '14:00', 180, 'Yamuna riverfront views of the Taj.'),
      ]),
      d('Taj Mahal Sunrise & Fatehpur Sikri to Jaipur', [
        s('activity', 'Taj Mahal Dawn Entry', 27.1751, 78.0421, '06:00', 135, 'Unforgettable sunrise marble glow.'),
        s('activity', 'Fatehpur Sikri & Chand Baori Abhaneri Stepwell en route to Jaipur', 27.0072, 76.6064, '11:30', 180, '3,500 symmetrical steps at Abhaneri.'),
      ]),
      d('Jaipur Amber Fort & Nahargarh', [
        s('activity', 'Amber Fort & Anokhi Block-Print Museum', 26.9855, 75.8513, '08:30', 180, 'Hill fort and hand-carved wooden blocks.'),
        s('activity', 'Nahargarh Fort Dusk', 26.9373, 75.8155, '17:00', 90, 'Pink City skyline.'),
      ]),
      d('Jaipur City Palace, Hawa Mahal & Jantar Mantar', [
        s('activity', 'Hawa Mahal, City Palace & Jantar Mantar', 26.9258, 75.8237, '09:00', 180, 'Walled city royal core.'),
        s('meal', 'Suvarna Mahal / LMB Dinner', 26.8981, 75.8083, '19:30', 90, 'Rajasthani culinary evening.'),
      ]),
      d('Fly / Train Jaipur to Udaipur & Lake Pichola', [
        s('transit', 'Morning Hop Jaipur to Udaipur', 24.5854, 73.7125, '09:30', 90, 'Quick hop south to Mewar.'),
        s('activity', 'Lake Pichola Sunset Boat & Gangaur Ghat', 24.5681, 73.6784, '16:30', 90, 'Waterfront palaces.'),
      ]),
      d('Udaipur City Palace & Sajjangarh', [
        s('activity', 'Udaipur City Palace & Jagdish Temple', 24.5764, 73.6835, '09:30', 150, 'Balconies above the lake.'),
        s('activity', 'Saheliyon Ki Bari & Monsoon Palace', 24.6031, 73.6869, '15:30', 150, 'Fountains and ridge sunset.'),
      ]),
      d('Fly to Varanasi & Evening Ganga Aarti', [
        s('transit', 'Flight Udaipur to Varanasi (via Delhi)', 25.4524, 82.8593, '10:30', 210, 'Arrive Kashi afternoon.'),
        s('activity', 'Dashashwamedh Sandhya Ganga Aarti from Boat', 25.3068, 83.0105, '17:45', 90, 'Chants and brass lamps on the river.'),
      ]),
      d('Sunrise Ghat Boat, Kashi Vishwanath & Sarnath', [
        s('activity', 'Assi to Manikarnika Sunrise Boat & Vishwanath Corridor', 25.3109, 83.0107, '06:00', 180, 'Morning ghats and temple darshan.'),
        s('activity', 'Sarnath Dhamek Stupa & Ashoka Pillar Museum', 25.3809, 83.0245, '15:00', 120, 'Peaceful deer park.'),
      ]),
      d('Banaras Silk Weavers & Departure', [
        s('activity', 'Morning Kachori Breakfast & Silk Loom Visit', 25.3137, 83.0112, '08:30', 90, 'Final morning in Kashi.'),
        s('transit', 'Depart Varanasi Airport (VNS)', 25.4524, 82.8593, '12:30', 60, 'Homeward flight.'),
      ]),
    ],
  },

  // ================================================================ INTERNATIONAL (13)
  {
    slug: 'vietnam-7d',
    aliases: ['vietnam-hanoi-halong-hoian-7d'],
    title: 'Vietnam North to Central: Hanoi, Ha Long & Hoi An',
    summary: 'Hanoi Old Quarter egg coffee, overnight karst cruise in Ha Long / Lan Ha Bay, Marble Mountains in Da Nang, and lantern-lit Hoi An.',
    photoKey: 'ha-long-bay',
    destinations: [
      { slug: 'vietnam', name: 'Vietnam' },
      { slug: 'hanoi', name: 'Hanoi' },
      { slug: 'ha-long', name: 'Ha Long' },
      { slug: 'hoi-an', name: 'Hoi An' },
    ],
    tripTypes: ['couple', 'friends', 'food', 'heritage'],
    budgetTier: 'mid',
    bestMonths: [2, 3, 4, 10, 11],
    cloneCount: 182,
    publishedAt: '2026-10-14T08:00:00.000Z',
    days: [
      d('Arrive Hanoi: Hoan Kiem Lake & Old Quarter 36 Streets', [
        s('activity', 'Hoan Kiem Lake & Ngoc Son Temple Red Bridge', 21.0285, 105.8542, '14:00', 90, 'Gentle lakeside walk beneathancient banyan trees.'),
        s('meal', 'Cafe Giang Original Egg Coffee & Bun Cha Ta (Veg Chay options)', 21.0332, 105.8519, '16:30', 75, 'Whipped egg-yolk espresso invented in 1946.'),
        s('activity', 'Thang Long Water Puppet Theatre', 21.0319, 105.8531, '18:30', 60, 'Traditional Red River delta folk puppetry on water.'),
      ]),
      d('Temple of Literature, Ba Dinh & Train Street', [
        s('activity', 'Temple of Literature (1070 Vietnam First University)', 21.0287, 105.8356, '09:00', 90, 'Five courtyards of stone stelae carried by carved tortoises.'),
        s('activity', 'One Pillar Pagoda & Tran Quoc West Lake Pagoda', 21.0478, 105.8369, '11:30', 90, '6th-century pagoda on a West Lake peninsula.'),
        s('meal', 'Uu Dam Chay / Hanoi Banh Mi 25 Lunch', 21.0358, 105.8478, '13:30', 60, 'Refined Vietnamese Buddhist vegetarian cuisine or crisp banh mi.'),
        s('activity', 'Phung Hung Mural Street & Licensed Cafe Trackside', 21.0322, 105.8442, '16:30', 75, 'Evening coffee along historic railway arches.'),
      ]),
      d('Ha Long / Lan Ha Bay Overnight Limestone Cruise', [
        s('transit', 'Expressway Shuttle Hanoi to Tuan Chau Marina', 20.9302, 106.9885, '08:30', 150, '2.5h highway to the Gulf of Tonkin.'),
        s('stay', 'Board Overnight Junk Boat: Kayaking Dark & Bright Cave', 20.8419, 107.0928, '12:30', 360, 'Paddle emerald lagoons ringed by 1,600 limestone karsts.'),
      ]),
      d('Bay Tai Chi Dawn & Fly Hanoi to Da Nang -> Hoi An', [
        s('activity', 'Sung Sot Cave / Morning Tai Chi on Sundeck', 20.8436, 107.0912, '06:30', 120, 'Early mist among karst towers before 11:00 disembarkation.'),
        s('transit', 'Afternoon Flight Noi Bai (HAN) to Da Nang (DAD) & Cab to Hoi An', 15.8801, 108.338, '16:00', 150, '40-min coastal transfer south to Hoi An.'),
      ]),
      d('Hoi An Ancient Town, Japanese Bridge & Thu Bon Lanterns', [
        s('activity', 'Hoi An UNESCO Merchant Houses & Japanese Covered Bridge', 15.8775, 108.3267, '09:00', 150, 'Tan Ky House, Fujian Assembly Hall, and yellow silk lanes.'),
        s('meal', 'Morning Glory / Minh Hien Chay Cao Lau Lunch', 15.8768, 108.3282, '12:45', 75, 'Hoi An smoky ash-noodles and white rose dumplings.'),
        s('activity', 'Thu Bon River Sampan & Silk Lantern Evening', 15.8759, 108.3265, '18:00', 90, 'Pedestrian-only lantern glow reflected on the river.'),
      ]),
      d('Tra Que Herb Village Cycling & An Bang Beach', [
        s('activity', 'Bicycle Ride through Rice Paddies to Tra Que Organic Herb Village', 15.9036, 108.3372, '08:30', 150, 'Flat country lanes scented with Thai basil, perilla, and mint.'),
        s('activity', 'Cam Thanh Coconut Palm Basket Boat & An Bang Beach Sunset', 15.9139, 108.3408, '15:30', 150, 'Relaxed Cham-island horizon swim and seafood/tofu grill.'),
      ]),
      d('Da Nang Marble Mountains & Departure (DAD)', [
        s('activity', 'Marble Mountains (Ngu Hanh Son) Huyen Khong Cave', 16.0033, 108.2636, '09:00', 105, 'Sunbeams piercing natural skylights inside limestone pagoda caves; lift available.'),
        s('transit', 'Departure via Da Nang International Airport (DAD)', 16.0544, 108.2022, '12:30', 45, 'Easy connection home.'),
      ]),
    ],
  },
  {
    slug: 'hanoi-halong-short-break-4d',
    title: 'Hanoi Old Quarter & Ha Long Bay Short Break',
    summary: 'Compact 4-day Northern Vietnam escape pairing Hanoi street-food culture and West Lake temples with an overnight Ha Long karst cruise.',
    photoKey: 'ha-noi',
    destinations: [
      { slug: 'hanoi', name: 'Hanoi' },
      { slug: 'ha-long', name: 'Ha Long' },
    ],
    tripTypes: ['couple', 'friends', 'food'],
    budgetTier: 'budget',
    bestMonths: [3, 4, 10, 11],
    cloneCount: 111,
    publishedAt: '2026-10-13T08:00:00.000Z',
    days: [
      d('Hanoi Old Quarter & Hoan Kiem', [
        s('activity', 'Hoan Kiem Lake & St Joseph Cathedral', 21.0288, 105.8489, '14:00', 105, 'Neo-Gothic cathedral square and coconut coffee.'),
        s('meal', 'Old Quarter Guided Street-Food / Chay Tasting Walk', 21.0342, 105.8506, '18:00', 120, 'Pho, banh cuon steamed rolls, and che dessert.'),
      ]),
      d('Imperial Citadel, Temple of Literature & West Lake', [
        s('activity', 'Thang Long Imperial Citadel & Temple of Literature', 21.0342, 105.84, '09:00', 150, 'Millennium-old Vietnamese dynastic court.'),
        s('activity', 'Vietnam Museum of Ethnology', 21.0403, 105.7986, '14:30', 120, 'Full-scale Bahnar communal longhouses in landscaped gardens.'),
      ]),
      d('Overnight Cruise on Ha Long Bay', [
        s('transit', 'Morning Transfer to Tuan Chau Harbour', 20.9302, 106.9885, '08:30', 150, 'Expressway east.'),
        s('stay', 'Overnight Cruise: Luon Lagoon Kayaking & Titop Viewpoint', 20.8586, 107.0819, '12:30', 300, '400 steps to Titop summit over emerald waters.'),
      ]),
      d('Morning Karst Cruise & Return to Hanoi (HAN)', [
        s('activity', 'Brunch Cruise past Fighting Cock Islet', 20.8489, 107.0658, '07:30', 180, 'Disembark by 11:00.'),
        s('transit', 'Direct Shuttle to Noi Bai Airport (HAN)', 21.2187, 105.8042, '12:00', 165, 'Evening departure.'),
      ]),
    ],
  },
  {
    slug: 'bali-ubud-uluwatu-6d',
    title: 'Bali: Ubud Rice Terraces, Kintamani & Uluwatu Cliffs',
    summary: 'Subak UNESCO Tegallalang rice terraces, Tirta Empul water temple, Campuhan ridge dawn walk, Mount Batur caldera view, and Uluwatu Kecak cliffs.',
    photoKey: 'bali',
    destinations: [
      { slug: 'bali', name: 'Bali' },
      { slug: 'ubud', name: 'Ubud' },
    ],
    tripTypes: ['couple', 'friends', 'nature', 'heritage'],
    budgetTier: 'mid',
    bestMonths: [4, 5, 6, 7, 8, 9, 10],
    cloneCount: 191,
    publishedAt: '2026-10-12T08:00:00.000Z',
    days: [
      d('Arrive Denpasar -> Ubud Forest Sanctuary & Palace', [
        s('stay', 'Ubud Jungle / Rice-Field Villa Check-in', -8.5069, 115.2625, '13:30', 90, 'Cultural heart of Bali.'),
        s('activity', 'Sacred Monkey Forest Sanctuary & Ubud Royal Palace', -8.5186, 115.2589, '15:30', 120, 'Mossy banyan ravine temples and Legong dance courtyard.'),
      ]),
      d('Campuhan Ridge Dawn, Tegallalang & Tirta Empul', [
        s('activity', 'Campuhan Ridge Walk at Sunrise', -8.5036, 115.2547, '06:45', 90, 'Lush alang-alang grass spine between two river gorges before midday heat.'),
        s('activity', 'Tegallalang UNESCO Subak Rice Terraces', -8.4312, 115.2792, '09:30', 90, '9th-century cooperative water-temple irrigation steps.'),
        s('activity', 'Tirta Empul Holy Spring Temple & Gunung Kawi Rock Shrines', -8.4156, 115.3153, '13:30', 120, 'Crystal spring spouts and 11th-century cliffside candis.'),
      ]),
      d('Kintamani Mount Batur Caldera & Tukad Cepung Waterfall', [
        s('activity', 'Kintamani Rim Coffee overlooking Mt Batur & Lake Batur', -8.2828, 115.3653, '08:30', 120, 'Volcanic crater panorama without the 2am hike if preferred.'),
        s('activity', 'Penglipuran Traditional Bamboo-Gate Village & Tukad Cepung', -8.4222, 115.3594, '12:30', 150, 'Sunlit canyon waterfall inside a rock cavern.'),
      ]),
      d('Jatiluwih / Tanah Lot Sea Temple to Uluwatu', [
        s('activity', 'Pura Ulun Danu / Taman Ayun Mengwi Royal Water Temple', -8.5419, 115.1725, '09:30', 75, 'Multi-tiered meru shrines ringed by lotus moats.'),
        s('activity', 'Tanah Lot Offshore Rock Temple', -8.6212, 115.0868, '12:00', 75, 'Surf crashing around a 16th-century sea shrine.'),
        s('stay', 'Bukit Peninsula Check-in, Uluwatu / Bingin', -8.8142, 115.0884, '15:30', 90, 'Limestone cliff coast.'),
      ]),
      d('Padang Padang Cove & Uluwatu Cliff Kecak Fire Dance', [
        s('activity', 'Padang Padang (Labuan Sait) & Melasti Limestone Beach', -8.8111, 115.1039, '10:00', 150, 'Turquoise reef lagoon accessed through a hollow rock cleft.'),
        s('activity', 'Uluwatu Temple & Sunset Kecak Chant on 70m Sea Cliff', -8.8291, 115.0849, '16:30', 150, 'Book 18:00 Kecak amphitheatre ticket immediately on entry.'),
      ]),
      d('Jimbaran Morning Bay & Departure (DPS)', [
        s('meal', 'Suka Espresso / Bukit Brunch, Uluwatu', -8.8158, 115.1047, '09:30', 60, 'Specialty Indonesian arabica.'),
        s('transit', 'Transfer to Ngurah Rai International Airport (DPS)', -8.7467, 115.1668, '12:00', 45, 'Short Bukit-to-DPS toll road hop.'),
      ]),
    ],
  },
  {
    slug: 'bangkok-chiang-mai-thailand-6d',
    title: 'Thailand Twin-City: Bangkok Canals & Chiang Mai Old City',
    summary: 'Chao Phraya ferry hops between Wat Pho and Wat Arun, Thonburi longtail khlongs, Talad Noi street food, and Lanna temples in Chiang Mai.',
    photoKey: 'ha-noi',
    destinations: [
      { slug: 'bangkok', name: 'Bangkok' },
      { slug: 'chiang-mai', name: 'Chiang Mai' },
    ],
    tripTypes: ['food', 'friends', 'couple', 'heritage'],
    budgetTier: 'mid',
    bestMonths: [11, 12, 1, 2],
    cloneCount: 159,
    publishedAt: '2026-10-11T08:00:00.000Z',
    days: [
      d('Bangkok Rattanakosin Island: Wat Pho, Grand Palace & Wat Arun', [
        s('activity', 'Grand Palace & Wat Phra Kaew (Emerald Buddha)', 13.75, 100.4913, '08:30', 120, 'Shoulders and knees covered; dazzling gilded chedis.'),
        s('activity', 'Wat Pho Reclining Buddha & Thai Massage Pavilion', 13.7465, 100.4928, '11:00', 90, '46m gold-leaf reclining Buddha with mother-of-pearl soles.'),
        s('activity', 'Cross-River Ferry to Wat Arun Porcelain Spire Sunset', 13.7437, 100.4889, '16:30', 90, 'Khmer-style prang encrusted with colourful Chinese porcelain.'),
      ]),
      d('Thonburi Khlongs, Jim Thompson House & Chinatown (Yaowarat)', [
        s('activity', 'Morning Longtail Boat through Thonburi Khlong Bang Luang', 13.7314, 100.4636, '09:00', 120, 'Wooden stilt houses and Artist House away from skyscrapers.'),
        s('activity', 'Jim Thompson Teakwood House & Silk Garden', 13.7492, 100.5283, '14:00', 90, 'Six traditional Ayutthaya teak houses beside Saen Saep canal.'),
        s('meal', 'Talad Noi & Yaowarat Night Street-Food Walk', 13.7397, 100.5108, '18:30', 120, 'Wok-hei noodles, mango sticky rice, and toasted buns.'),
      ]),
      d('Lumphini Morning & Fly to Chiang Mai Moat City', [
        s('transit', 'Short Flight Bangkok (BKK/DMK) to Chiang Mai (CNX)', 18.7668, 98.9626, '11:00', 90, '75-minute hop to Northern Thailand.'),
        s('activity', 'Wat Chedi Luang & Wat Phra Singh inside Old Moat', 18.7869, 98.9866, '15:30', 120, 'Towering 15th-century ruined brick chedi and Lanna woodcarving.'),
        s('meal', 'Khao Soi Khun Yai / Goodsouls Plant Kitchen', 18.7953, 98.9861, '18:30', 60, 'Northern coconut curry noodles.'),
      ]),
      d('Doi Suthep Mountain Temple & Nimman Craft Lanes', [
        s('activity', 'Wat Phra That Doi Suthep (Naga Staircase)', 18.8048, 98.9216, '08:00', 150, '306 dragon-flanked steps to a golden Lanna chedi overlooking Chiang Mai.'),
        s('activity', 'Baan Kang Wat Artist Village & Wat Umong Forest Tunnels', 18.7764, 98.9489, '13:30', 150, '13th-century mossy meditation tunnels and ceramics collective.'),
      ]),
      d('Ethical Elephant Sanctuary or Doi Inthanon Cloud Forest', [
        s('activity', 'Doi Inthanon Kew Mae Pan Cloud Trail & Twin Pagodas', 18.5875, 98.4869, '08:00', 300, 'Thailand highest peak (2,565m) with waterfalls and Karen hill coffee.'),
      ]),
      d('Warorot Market & Departure from Chiang Mai (CNX)', [
        s('activity', 'Warorot Riverside Flower & Tea Market', 18.7903, 99.0011, '09:00', 75, 'Dried longan, northern oolong tea, and celadon ceramics.'),
        s('transit', 'Depart Chiang Mai Airport (CNX)', 18.7668, 98.9626, '12:00', 30, '15 minutes from the Old City.'),
      ]),
    ],
  },
  {
    slug: 'phuket-krabi-phi-phi-5d',
    title: 'Andaman Sea: Phuket Old Town, Phi Phi & Krabi Karsts',
    summary: 'Sino-Portuguese shophouses on Thalang Road, early boat to Phi Phi Leh lagoons, Railay limestone cliffs, and Hong Island.',
    photoKey: 'goa',
    destinations: [
      { slug: 'phuket', name: 'Phuket' },
      { slug: 'thailand', name: 'Thailand' },
    ],
    tripTypes: ['couple', 'friends', 'adventure'],
    budgetTier: 'mid',
    bestMonths: [11, 12, 1, 2, 3, 4],
    cloneCount: 129,
    publishedAt: '2026-10-10T08:00:00.000Z',
    days: [
      d('Phuket Old Town Sino-Portuguese Shophouses & Promthep', [
        s('activity', 'Thalang Road & Soi Romanee Heritage Walk, Old Phuket', 7.8848, 98.3892, '14:00', 120, 'Pastel 19th-century tin-era arcades and Peranakan cafes.'),
        s('meal', 'Raya / One Chun Southern Thai Crab & Veg Yellow Curry', 7.8856, 98.3911, '17:30', 75, 'Historic townhouse kitchen.'),
      ]),
      d('Freedom / Kata Noi Cove & Ferry across Phang Nga to Phi Phi', [
        s('activity', 'Kata Noi Morning Swim', 7.8064, 98.2992, '08:30', 105, 'Clear granite-headland bay.'),
        s('transit', 'Rassada Pier Ferry to Koh Phi Phi Don', 7.7407, 98.7784, '13:30', 120, 'Car-free twin-bay island.'),
        s('activity', 'Phi Phi Viewpoint 2 Sunset Climb', 7.7453, 98.7842, '17:00', 75, 'Iconic hourglass isthmus between Ton Sai and Loh Dalum.'),
      ]),
      d('Dawn Longtail to Pileh Lagoon & Ferry to Railay (Krabi)', [
        s('activity', 'Sunrise Longtail to Pileh Lagoon & Maya Bay Boardwalk', 7.6778, 98.7664, '06:30', 180, 'Dawn departure beats speedboats; conservation boardwalk protects coral.'),
        s('transit', 'Afternoon Ferry Phi Phi to Railay / Ao Nang (Krabi)', 8.0119, 98.8375, '14:30', 95, 'Arrive beneath towering vertical limestone walls.'),
      ]),
      d('Railay Phra Nang Cave Beach & Hong Island Lagoon', [
        s('activity', 'Phra Nang Cave Beach & Limestone Overhangs, Railay', 8.0053, 98.8378, '08:30', 120, 'Boat-access-only peninsula with stalactite sea cliffs.'),
        s('activity', 'Koh Hong Emerald Lagoon & 360° Skywalk', 8.0789, 98.6789, '13:00', 180, 'Enclosed tidal chamber entered through a narrow cliff gap.'),
      ]),
      d('Tiger Cave Temple Foothills & Depart Krabi (KBV)', [
        s('activity', 'Wat Tham Suea Rainforest Valley Shrine', 8.1267, 98.9244, '09:00', 90, 'Ancient giant trees at the base (or 1,260 steps for energetic climbers).'),
        s('transit', 'Departure from Krabi International Airport (KBV)', 8.0986, 98.9862, '12:30', 30, 'Afternoon flight.'),
      ]),
    ],
  },
  {
    slug: 'kyoto-arashiyama-nara-5d',
    title: 'Kyoto Shrine Paths, Arashiyama Bamboo & Nara Day Trip',
    summary: 'Early-morning Fushimi Inari vermilion gates, Higashiyama stone lanes, Kinkaku-ji pond reflections, Arashiyama bamboo & Okochi Sanso, plus Nara deer park.',
    photoKey: 'kyoto',
    destinations: [{ slug: 'kyoto', name: 'Kyoto' }],
    tripTypes: ['heritage', 'couple', 'family', 'solo'],
    budgetTier: 'premium',
    bestMonths: [3, 4, 5, 10, 11],
    cloneCount: 204,
    publishedAt: '2026-10-09T08:00:00.000Z',
    days: [
      d('Southern Higashiyama: Kiyomizu-dera, Ninenzaka & Gion', [
        s('activity', 'Kiyomizu-dera Wooden Stage overlooking Kyoto', 34.9949, 135.785, '09:00', 90, 'Built without a single nail above Otowa hillside maples.'),
        s('activity', 'Sannenzaka & Ninenzaka Preserved Machiya Lanes to Yasaka Shrine', 34.9986, 135.7808, '11:00', 90, 'Flagstone slopes lined with ceramics and matcha houses.'),
        s('meal', 'Nishiki Market Tasting & Tofu Yudofu Lunch', 35.005, 135.7649, '13:15', 75, 'Kyoto five-block covered kitchen.'),
        s('activity', 'Gion Hanamikoji & Shirakawa Canal Evening Walk', 35.0037, 135.7756, '17:30', 75, 'Respectful dusk stroll along willow-lined stone bridges.'),
      ]),
      d('Fushimi Inari Dawn Torii & Philosopher Path', [
        s('activity', 'Fushimi Inari Taisha Thousand Torii Trail at 07:00', 34.9671, 135.7727, '07:00', 135, 'Climb past Yotsutsuji intersection for quiet cedar forest shrines.'),
        s('activity', 'Nanzen-ji Aqueduct & Philosopher Path to Ginkaku-ji (Silver Pavilion)', 35.027, 135.7982, '11:30', 150, 'Cherry-tree canal walk ending at raked white-sand Zen cones.'),
      ]),
      d('Arashiyama Bamboo Grove, Tenryu-ji & Kinkaku-ji', [
        s('activity', 'Arashiyama Bamboo Grove & Okochi Sanso Villa Garden', 35.017, 135.6713, '07:45', 135, 'Include Okochi Sanso mossy hilltop villa with complimentary matcha.'),
        s('activity', 'Tenryu-ji Zen Sogenchi Pond Garden', 35.0157, 135.6738, '10:30', 75, '14th-century borrowed-scenery garden.'),
        s('activity', 'Kinkaku-ji (Golden Pavilion) & Ryoan-ji Rock Garden', 35.0394, 135.7292, '14:30', 120, 'Gold-leaf pavilion mirrored in Kyoko-chi pond.'),
      ]),
      d('Nara Todai-ji Great Buddha & Uji Matcha Day Trip', [
        s('activity', 'Nara Park & Todai-ji Daibutsuden (15m Bronze Buddha)', 34.689, 135.8398, '09:30', 135, '45-min JR Nara Line train; monumental 8th-century timber hall.'),
        s('activity', 'Kasuga Taisha 3,000 Stone & Bronze Lanterns', 34.6814, 135.8484, '12:30', 75, 'Mossy forest path of donated lanterns.'),
        s('activity', 'Byodo-in Phoenix Hall & Uji Matcha Street Stopover', 34.8893, 135.8077, '15:15', 90, 'Depicted on the ¥10 coin; Japan oldest tea-growing town.'),
      ]),
      d('Nijo Castle Nightingale Floors & Departure', [
        s('activity', 'Nijo Castle Ninomaru Palace', 35.0142, 135.7482, '09:00', 105, 'Squeaking "nightingale" corridor floorboards and Kano tiger screens.'),
        s('transit', 'Haruka Express from Kyoto Station to Kansai (KIX) / Shinkansen', 34.9858, 135.7588, '12:30', 75, 'Direct airport rail.'),
      ]),
    ],
  },
  {
    slug: 'tokyo-neighbourhoods-fuji-6d',
    title: 'Tokyo Neighbourhoods, TeamLab & Lake Kawaguchiko Fuji',
    summary: 'Asakusa Senso-ji incense, Meiji cedar forest to Shimokitazawa indie lanes, Yanaka old Tokyo, TeamLab digital art, and a clear-day Mt Fuji lake excursion.',
    photoKey: 'kyoto',
    destinations: [{ slug: 'tokyo', name: 'Tokyo' }],
    tripTypes: ['friends', 'family', 'food', 'solo'],
    budgetTier: 'premium',
    bestMonths: [3, 4, 5, 10, 11],
    cloneCount: 171,
    publishedAt: '2026-10-08T08:00:00.000Z',
    days: [
      d('Asakusa Old Edo, Ueno Park & Akihabara', [
        s('activity', 'Senso-ji Temple & Kaminarimon Gate, Asakusa', 35.7148, 139.7967, '09:30', 90, 'Tokyo oldest Buddhist temple (645 CE) and Nakamise craft stalls.'),
        s('activity', 'Tokyo National Museum & Ueno Park', 35.7188, 139.7765, '12:00', 120, 'Samurai blades, ukiyo-e woodblocks, and Horyu-ji treasures.'),
        s('activity', 'Yanaka Ginza Nostalgic Shopping Street', 35.7278, 139.7656, '16:00', 90, 'Pre-war wooden Shitamachi neighbourhood untouched by skyscrapers.'),
      ]),
      d('Meiji Shrine Forest, Harajuku, Shibuya Sky & Shimokitazawa', [
        s('activity', 'Meiji Jingu Forested Torii Approach', 35.6764, 139.6993, '09:00', 90, '100,000 donated trees creating a tranquil sanctuary beside Harajuku.'),
        s('meal', 'Afuri Yuzu Ramen / T Tantan Vegan Ramen Lunch', 35.6469, 139.7089, '12:30', 60, 'Citrus-bright broth or sesame vegan ramen.'),
        s('activity', 'Shimokitazawa Vintage & Kissaten Coffee Lanes', 35.6616, 139.6683, '14:30', 105, 'Low-rise creative district of record shops and hand-drip coffee.'),
        s('activity', 'Shibuya Scramble & Shibuya Sky Open-Air Rooftop', 35.6585, 139.7022, '17:30', 90, '360-degree twilight grid stretching to Tokyo Bay.'),
      ]),
      d('Lake Kawaguchiko & Chureito Pagoda Mt Fuji Day Trip', [
        s('transit', 'Fuji Excursion Limited Express Shinjuku to Kawaguchiko', 35.4982, 138.7686, '07:30', 115, 'Direct rail to the Fuji Five Lakes.'),
        s('activity', 'Arakurayama Sengen Park (Chureito Pagoda) & Oishi Park', 35.5012, 138.8014, '10:30', 180, 'Five-storey pagoda framing snow-capped Mount Fuji.'),
      ]),
      d('Tsukiji Outer Market, TeamLab Planets & Ginza', [
        s('meal', 'Tsukiji Outer Market Tamagoyaki & Matcha Morning Walk', 35.6655, 139.7707, '09:00', 90, 'Knife smiths, dashi stalls, and rolled omelettes.'),
        s('activity', 'teamLab Planets Immersive Water & Light Museum, Toyosu', 35.6491, 139.7898, '11:30', 120, 'Barefoot mirror-and-orchid installations.'),
        s('activity', 'Hamarikyu Tidal Gardens & Ginza Itoya Stationery', 35.6601, 139.7636, '15:00', 120, 'Edo shogunate duck-pond teahouse set against Shiodome towers.'),
      ]),
      d('Kiyosumi Gardens, Daikanyama T-Site & Shinjuku', [
        s('activity', 'Kiyosumi Strolling Stone Garden & Roastery Coffee', 35.6803, 139.7978, '09:30', 90, 'Stepping-stone iso-watari pond in Tokyo specialty-coffee hub.'),
        s('activity', 'Daikanyama Tsutaya Books & Meguro River Walk', 35.6489, 139.6997, '13:30', 120, 'Architectural pavilion bookstore amid leafy hillside cafes.'),
        s('activity', 'Tokyo Metropolitan Government North Observatory, Shinjuku', 35.6896, 139.6917, '18:00', 60, 'Free 45th-floor night view.'),
      ]),
      d('Souvenir Packing & Narita / Haneda Departure', [
        s('transit', 'Narita Express / Monorail to HND or NRT', 35.5494, 139.7798, '10:30', 60, 'Punctual rail transfer.'),
      ]),
    ],
  },
  {
    slug: 'singapore-family-gardens-4d',
    title: 'Singapore Bayfront Gardens, Heritage Quarters & Sentosa',
    summary: 'Step-free Cloud Forest & Supertree Grove, UNESCO Botanic Gardens orchids, Tiong Bahru & Kampong Gelam shophouses, Maxwell hawker food, and Sentosa.',
    photoKey: 'bali',
    destinations: [{ slug: 'singapore', name: 'Singapore' }],
    tripTypes: ['family', 'food', 'couple'],
    budgetTier: 'premium',
    bestMonths: [2, 3, 4, 5, 6, 7],
    cloneCount: 147,
    publishedAt: '2026-10-07T08:00:00.000Z',
    days: [
      d('Marina Bay Promenade, Cloud Forest & Garden Rhapsody', [
        s('activity', 'Gardens by the Bay: Cloud Forest & Flower Dome', 1.2816, 103.8636, '14:00', 150, 'Cooled conservatory mist waterfall and Mediterranean flora.'),
        s('meal', 'Satay by the Bay / Lau Pa Sat Hawker Dinner', 1.2795, 103.8504, '18:00', 75, 'Cast-iron Victorian market with Indian veg, Malay, and Peranakan stalls.'),
        s('activity', 'Supertree Grove OCBC Skyway & 19:45 Garden Rhapsody Light Show', 1.2819, 103.8639, '19:30', 60, 'Free musical canopy show.'),
      ]),
      d('Chinatown, Little India & Kampong Gelam Shophouses', [
        s('activity', 'Buddha Tooth Relic Temple & Chinatown Heritage Lanes', 1.2814, 103.8443, '09:30', 90, 'Tang-style roof garden and Maxwell Road.'),
        s('meal', 'Maxwell Food Centre Hainanese Rice / Komala Vilas Dosai', 1.2803, 103.8448, '12:00', 60, 'Iconic hawker lunch.'),
        s('activity', 'National Gallery Singapore (Former Supreme Court & City Hall)', 1.2902, 103.8515, '14:00', 120, 'Southeast Asia largest modern art collection.'),
        s('activity', 'Kampong Gelam Sultan Mosque & Haji Lane Murals', 1.3023, 103.8591, '17:00', 90, 'Malay-Arab heritage quarter.'),
      ]),
      d('Sentosa Island Aquarium & Palawan Beach', [
        s('activity', 'Mount Faber Cable Car into Sentosa & S.E.A. Aquarium', 1.2583, 103.8205, '09:30', 180, 'Harbour aerial crossing and Open Ocean habitat.'),
        s('activity', 'Palawan Suspension Bridge & Siloso Skywalk', 1.2494, 103.8219, '15:30', 120, 'Family-friendly coastal tram loop.'),
      ]),
      d('UNESCO Botanic Gardens & Jewel Changi Rain Vortex', [
        s('activity', 'Singapore Botanic Gardens & National Orchid Garden', 1.3138, 103.8159, '08:30', 120, '165-year-old tropical garden and UNESCO World Heritage site.'),
        s('activity', 'Jewel Changi HSBC Rain Vortex & Canopy Park before Flight', 1.3602, 103.9898, '13:30', 120, '40m indoor waterfall right at Changi terminals.'),
      ]),
    ],
  },
  {
    slug: 'dubai-creek-desert-marina-5d',
    title: 'Dubai: Al Fahidi Creek Abras, Desert Reserve & Downtown',
    summary: 'Wind-tower lanes of Old Dubai, 1-AED wooden abra across the Creek, Museum of the Future, Burj Khalifa twilight, and Dubai Desert Conservation Reserve.',
    photoKey: 'lisbon',
    destinations: [{ slug: 'dubai', name: 'Dubai' }],
    tripTypes: ['family', 'couple', 'friends'],
    budgetTier: 'premium',
    bestMonths: [11, 12, 1, 2, 3],
    cloneCount: 151,
    publishedAt: '2026-10-06T08:00:00.000Z',
    days: [
      d('Al Fahidi Historical Neighbourhood & Dubai Creek Abra', [
        s('activity', 'Al Fahidi Wind-Tower Courtyard Walk & Al Shindagha Museum', 25.2636, 55.3002, '14:30', 120, 'Coral-and-gypsum barjeel houses recounting pearl-diving history.'),
        s('activity', 'Wooden Abra Crossing to Deira Spice & Gold Souks', 25.2669, 55.2989, '17:00', 90, '1-AED heritage water-taxi scented with frankincense and saffron.'),
        s('meal', 'Arabian Tea House Courtyard Dinner, Bastakiya', 25.2631, 55.2998, '19:00', 75, 'Hummus, falafel, and Emirati regag bread under bougainvillea.'),
      ]),
      d('Downtown Dubai: Museum of the Future & Burj Khalifa', [
        s('activity', 'Museum of the Future Calligraphy Torus', 25.2192, 55.2819, '10:00', 120, 'Book timed tickets 2 weeks ahead; Arabic poetry stainless-steel facade.'),
        s('activity', 'Dubai Mall Aquarium Tunnel & Souk Al Bahar', 25.1972, 55.2794, '14:00', 120, 'Air-conditioned bridge facing the Burj lake.'),
        s('activity', 'Burj Khalifa At The Top (Levels 124/125) & Fountain Show', 25.1972, 55.2744, '17:30', 105, 'Desert-to-Gulf twilight transition.'),
      ]),
      d('Jumeirah Mosque, Alserkal Art District & Desert Conservation', [
        s('activity', 'Jumeirah Mosque Open Doors Cultural Tour (10:00)', 25.2336, 55.2656, '09:45', 75, 'Warm Q&A with Emirati coffee and dates.'),
        s('activity', 'Alserkal Avenue Contemporary Galleries & Mirzam Chocolate', 25.1419, 55.2258, '12:00', 90, 'Warehouse art spaces and bean-to-bar spiced chocolate.'),
        s('activity', 'Dubai Desert Conservation Reserve Oryx Drive & Bedouin Camp', 24.8325, 55.6478, '15:30', 300, 'Protected Arabian oryx dunes without destructive quad-biking.'),
      ]),
      d('Palm Viewpoint & Dubai Marina Walk', [
        s('activity', 'The View at The Palm (Level 52) via Palm Monorail', 25.1136, 55.1394, '10:30', 90, 'Clear aerial geometry of the Palm fronds.'),
        s('activity', 'Madinat Jumeirah Waterways & JBR Beach Sunset', 25.1328, 55.1856, '16:00', 120, 'Burj Al Arab view along the shoreline.'),
        s('activity', 'Dubai Marina Promenade Evening Walk', 25.0772, 55.1392, '19:00', 90, '7 km waterfront loop.'),
      ]),
      d('Dubai Frame & Departure via DXB', [
        s('activity', 'Dubai Frame Skydeck (Old Dubai North, New Skyline South)', 25.2355, 55.3003, '09:30', 75, '150m golden picture frame in Zabeel Park.'),
        s('transit', 'Metro Red Line / Cab to Dubai International (DXB)', 25.2532, 55.3657, '12:30', 30, '15 minutes from Zabeel.'),
      ]),
    ],
  },
  {
    slug: 'lisbon-alfama-belem-sintra-4d',
    title: 'Lisbon Tram 28 Hills, Belém & Sintra Palaces',
    summary: 'Azulejo-tiled Alfama alleys, Miradouro da Graça Tagus views, Jerónimos limestone cloisters with warm pastéis de Belém, and misty Sintra.',
    photoKey: 'lisbon',
    destinations: [{ slug: 'lisbon', name: 'Lisbon' }],
    tripTypes: ['couple', 'heritage', 'food', 'solo'],
    budgetTier: 'mid',
    bestMonths: [4, 5, 6, 9, 10],
    cloneCount: 142,
    publishedAt: '2026-10-05T08:00:00.000Z',
    days: [
      d('Baixa Pombaline Grid, Castelo de São Jorge & Alfama Fado', [
        s('activity', 'Praça do Comércio & Santa Justa / Carmo Convent Ruins', 38.7121, -9.1402, '10:00', 105, 'Open-sky Gothic arches left standing since the 1755 earthquake.'),
        s('activity', 'Castelo de São Jorge & Miradouro de Santa Luzia', 38.7139, -9.1334, '14:30', 120, 'Terracotta rooftops tumbling down to the Tagus estuary.'),
        s('activity', 'Alfama Moorish Lanes & Intimate Tasca Fado Dinner', 38.7117, -9.1303, '19:30', 120, '12-string Portuguese guitar in candlelit stone vaults.'),
      ]),
      d('Belém Maritime Monuments & LX Factory', [
        s('activity', 'Jerónimos Monastery Manueline Cloisters (Closed Mon)', 38.6979, -9.2067, '09:30', 105, 'Carved rope-and-coral limestone columns.'),
        s('meal', 'Pastéis de Belém Cinnamon Custard Tarts (Since 1837)', 38.6975, -9.2032, '11:30', 45, 'Sit inside the vast blue-and-white tiled rooms rather than queuing outside.'),
        s('activity', 'Belém Tower & MAAT Riverside Promenade', 38.6916, -9.216, '13:30', 90, 'Walkable Tagus riverfront linking 1519 stone bastion to undulating contemporary brick.'),
        s('activity', 'LX Factory Ler Devagar Bookstore, Alcântara', 38.7035, -9.1788, '16:30', 75, 'Former textile printing press turned creative lane.'),
      ]),
      d('Sintra Romanticist Palaces & Quinta da Regaleira Day Trip', [
        s('transit', 'Rossio Station Commuter Train to Sintra (40 mins)', 38.7989, -9.3869, '08:30', 45, 'Leave cars behind; Sintra hills are bus/foot friendly.'),
        s('activity', 'Quinta da Regaleira Initiation Well & Mossy Grottoes', 38.7963, -9.396, '09:45', 120, 'Spiral inverted tower descending nine Dantean tiers into underground tunnels.'),
        s('activity', 'Park and National Palace of Pena Terraces', 38.7876, -9.3906, '14:00', 150, 'Ochre-and-terracotta hilltop palace overlooking the Atlantic.'),
      ]),
      d('National Azulejo Tile Museum & Príncipe Real', [
        s('activity', 'Museu Nacional do Azulejo (Madre de Deus Convent)', 38.7249, -9.1137, '09:30', 90, 'Five centuries of tin-glazed ceramic tiles including a 23m pre-1755 Lisbon panorama.'),
        s('meal', 'Jardim do Príncipe Real Cedar Kiosk Lunch', 38.7163, -9.1488, '12:30', 60, '150-year-old umbrella cedar canopy.'),
        s('transit', 'Metro Red Line to Humberto Delgado Airport (LIS)', 38.7756, -9.1354, '15:00', 30, '20 mins from central Lisbon.'),
      ]),
    ],
  },
  {
    slug: 'paris-museums-montmartre-5d',
    title: 'Paris: Seine Left Bank, Louvre, Marais & Montmartre',
    summary: 'Timed Louvre & Musée d’Orsay Impressionists, Sainte-Chapelle stained glass, Le Marais courtyards, Canal Saint-Martin bakeries, and Montmartre dawn.',
    photoKey: 'lisbon',
    destinations: [{ slug: 'paris', name: 'Paris' }],
    tripTypes: ['couple', 'heritage', 'food', 'family'],
    budgetTier: 'premium',
    bestMonths: [4, 5, 6, 9, 10],
    cloneCount: 168,
    publishedAt: '2026-10-04T08:00:00.000Z',
    days: [
      d('Île de la Cité, Sainte-Chapelle & Latin Quarter', [
        s('activity', 'Sainte-Chapelle 13th-Century Stained-Glass Jewel Box', 48.8554, 2.345, '10:30', 75, '15-metre lancet windows bathing the upper chapel in violet light.'),
        s('activity', 'Notre-Dame Exterior Parvis, Shakespeare & Company & Luxembourg Gardens', 48.8462, 2.3372, '13:30', 150, 'Medici Fountain and Left Bank bookstalls.'),
        s('activity', 'Pont Neuf Sunset Seine Cruise (Vedettes du Pont Neuf)', 48.8571, 2.3414, '18:30', 60, 'Illuminated bridges from Eiffel to Île Saint-Louis.'),
      ]),
      d('Louvre Masterworks, Tuileries & Palais-Royal', [
        s('activity', 'Musée du Louvre (Carrousel Underground Entry, Closed Tue)', 48.8606, 2.3376, '09:00', 180, 'Focus on Winged Victory, Denon Italian gallery, and Richelieu sculpture courts.'),
        s('meal', 'Rue Sainte-Anne Japanese-French Bistro / Angelina Tuileries', 48.8658, 2.3352, '13:00', 75, 'Bustling culinary street two blocks north.'),
        s('activity', 'Jardin du Palais-Royal & Covered Passages (Galerie Vivienne)', 48.8662, 2.3398, '15:30', 90, '1823 mosaic-floored glass arcades.'),
      ]),
      d('Musée d’Orsay, Rodin Sculpture Garden & Eiffel Champ de Mars', [
        s('activity', 'Musée d’Orsay Impressionist Top-Floor Clock Gallery (Closed Mon)', 48.86, 2.3266, '09:30', 150, 'Monet, Van Gogh, and Degas inside an airy 1900 Beaux-Arts station.'),
        s('activity', 'Musée Rodin Rose Garden (Hôtel Biron)', 48.8553, 2.3158, '13:30', 90, 'The Thinker and Gates of Hell outdoors.'),
        s('activity', 'Trocadéro Esplanade & Eiffel Tower Twilight Sparkle', 48.8584, 2.2945, '17:30', 120, 'Top-of-the-hour 5-minute sparkle after dusk.'),
      ]),
      d('Montmartre Cobblestones & Le Marais Place des Vosges', [
        s('activity', 'Sacré-Cœur Basilica, Place du Tertre & Rue de l’Abreuvoir', 48.8867, 2.3431, '08:30', 135, 'Climb before 09:00 to have Montmartre winding ivy lanes to yourself.'),
        s('meal', 'Marché des Enfants Rouges (1615) / L’As du Fallafel, Le Marais', 48.8628, 2.3622, '13:00', 75, 'Paris oldest covered food market.'),
        s('activity', 'Place des Vosges Arcades & Musée Carnavalet (Free)', 48.8556, 2.3655, '15:00', 120, 'Symmetrical 1612 brick square and Paris history mansion.'),
      ]),
      d('Canal Saint-Martin Croissants & RER B Departure', [
        s('meal', 'Du Pain et des Idées Escargot Pastry along Canal Saint-Martin', 48.8712, 2.3629, '09:00', 60, 'Pistachio-chocolate pastry beside iron footbridges.'),
        s('transit', 'RER B / RoissyBus to Charles de Gaulle (CDG)', 49.0097, 2.5479, '11:30', 55, 'Direct rail from Châtelet–Les Halles.'),
      ]),
    ],
  },
  {
    slug: 'rome-ancient-trastevere-vatican-4d',
    title: 'Rome: Colosseum Forum, Trastevere Lanes & Vatican',
    summary: 'Palatine Hill overlooking the Roman Forum, Pantheon oculus rainlight, Borghese Bernini marbles, Vatican Sistine mornings, and Trastevere trattorias.',
    photoKey: 'lisbon',
    destinations: [{ slug: 'rome', name: 'Rome' }],
    tripTypes: ['heritage', 'food', 'couple', 'family'],
    budgetTier: 'premium',
    bestMonths: [4, 5, 6, 9, 10],
    cloneCount: 161,
    publishedAt: '2026-10-03T08:00:00.000Z',
    days: [
      d('Centro Storico Evening Walk: Pantheon, Navona & Trevi', [
        s('activity', 'Pantheon Unreinforced Concrete Dome (125 CE)', 41.8986, 12.4769, '14:30', 60, '9m open oculus casting a moving sunbeam across porphyry floors.'),
        s('activity', 'Piazza Navona Bernini Four Rivers & Trevi Fountain', 41.8992, 12.4731, '16:30', 90, 'Baroque fountains built atop Domitian stadium.'),
        s('meal', 'Roscioli / Armando al Pantheon Cacio e Pepe Dinner', 41.8942, 12.4744, '19:30', 90, 'Classic Pecorino Romano and black pepper tonnarelli.'),
      ]),
      d('Colosseum, Palatine Hill & Monti Quarter', [
        s('activity', 'Colosseum Arena, Roman Forum & Palatine Umbrella Pines', 41.8902, 12.4922, '08:30', 210, 'Combined timed ticket; climb Farnese Gardens for sweeping Forum view.'),
        s('meal', 'Forno da Milvio / Rione Monti Artichoke Pizza al Taglio', 41.8953, 12.4942, '13:00', 60, 'Crisp Roman slice by weight.'),
        s('activity', 'Basilica di San Clemente Three-Level Underground Excavations', 41.8893, 12.4975, '15:30', 75, '12th-century mosaics atop a 4th-century church atop a 1st-century Mithraeum.'),
      ]),
      d('Vatican Museums, St Peter Basilica & Trastevere', [
        s('activity', 'Vatican Museums, Raphael Rooms & Sistine Chapel (Closed Sun)', 41.9065, 12.4536, '08:00', 180, 'First-entry timed slot; shoulders and knees covered.'),
        s('activity', 'St Peter Basilica & Castel Sant’Angelo Tiber Bridge', 41.9022, 12.4539, '11:45', 90, 'Michelangelo Pietà and Bernini bronze baldachin.'),
        s('activity', 'Santa Maria in Trastevere & Gianicolo Terrace Sunset', 41.8895, 12.4696, '17:00', 120, '12th-century gold mosaics followed by supplì and trattoria dinner.'),
      ]),
      d('Galleria Borghese Bernini Sculptures & Fiumicino Departure', [
        s('activity', 'Galleria Borghese & Villa Borghese Pincio Terrace', 41.9142, 12.4922, '09:00', 120, 'Mandatory 2-hour timed slot for Bernini Apollo and Daphne.'),
        s('transit', 'Leonardo Express Termini to Fiumicino Airport (FCO)', 41.8003, 12.2389, '13:00', 32, 'Non-stop 32-minute airport rail.'),
      ]),
    ],
  },
  {
    slug: 'istanbul-bosphorus-peninsula-5d',
    title: 'Istanbul: Sultanahmet, Grand Bazaar & Kadıköy Ferry',
    summary: 'Hagia Sophia Byzantine mosaics, Iznik tiles of the Blue Mosque, Basilica Cistern columns, public ferry across the Bosphorus to Asian-side Kadıköy, and Karaköy.',
    photoKey: 'lisbon',
    destinations: [{ slug: 'istanbul', name: 'Istanbul' }],
    tripTypes: ['heritage', 'food', 'couple', 'friends'],
    budgetTier: 'mid',
    bestMonths: [4, 5, 9, 10, 11],
    cloneCount: 154,
    publishedAt: '2026-10-02T08:00:00.000Z',
    days: [
      d('Historic Peninsula: Hagia Sophia, Blue Mosque & Cistern', [
        s('activity', 'Sultan Ahmed (Blue Mosque) Six-Minaret Courtyard', 41.0054, 28.9768, '09:00', 60, '20,000 handmade Iznik tulip tiles; free entry outside prayer windows.'),
        s('activity', 'Hagia Sophia Upper Gallery Byzantine Mosaics', 41.0086, 28.9802, '10:30', 90, '537 CE pendentive dome and Deesis gold mosaic.'),
        s('meal', 'Tarihi Sultanahmet Köftecisi / Hocapaşa Pide Lunch', 41.0128, 28.9769, '12:45', 60, 'Pedestrian Hocapaşa alley.'),
        s('activity', 'Basilica Cistern (Yerebatan Sarnıcı) Medusa Columns', 41.0084, 28.9779, '14:30', 60, '336 marble columns rising out of lit subterranean water.'),
      ]),
      d('Topkapı Palace, Süleymaniye Hill & Spice Bazaar', [
        s('activity', 'Topkapı Palace Courtyards & Harem Tilework (Closed Tue)', 41.0115, 28.9833, '09:30', 180, 'Four garden courts commanding the Golden Horn and Marmara.'),
        s('activity', 'Süleymaniye Mosque (Mimar Sinan Masterpiece)', 41.0161, 28.9639, '14:00', 75, 'Serene hilltop terrace looking across the Golden Horn.'),
        s('activity', 'Grand Bazaar Old Bedesten & Mısır Çarşısı (Spice Bazaar)', 41.0165, 28.9706, '16:00', 105, 'Vaulted 15th-century merchant lanes descending to Eminönü.'),
      ]),
      d('Cross Continents: Public Ferry to Kadıköy & Moda (Asian Side)', [
        s('transit', 'Eminönü Şehir Hatları Ferry across the Bosphorus to Kadıköy', 40.9928, 29.0231, '09:30', 30, 'Simit sesame bread and tulip-glass tea with seagulls alongside.'),
        s('meal', 'Çiya Sofrası Regional Anatolian Lunch & Kadıköy Produce Market', 40.9896, 29.0258, '12:00', 90, 'Forgotten southeastern Turkish dishes, olive bars, and tahini halva.'),
        s('activity', 'Moda Coastal Park Sunset facing Sultanahmet Minarets', 40.9792, 29.0247, '16:30', 90, 'Locals picnicking along the Sea of Marmara.'),
      ]),
      d('Galata Tower, Istiklal Passages & Bosphorus Cruise', [
        s('activity', 'Galata Tower Medieval Genoese Panorama & Serdar-ı Ekrem Lanes', 41.0256, 28.9741, '09:00', 90, '360-degree view from the Golden Horn to Princes Islands.'),
        s('activity', 'Istanbul Modern (Renzo Piano Waterfront) at Galataport', 41.0261, 28.9831, '11:30', 90, 'Contemporary Turkish art right on the Bosphorus.'),
        s('activity', 'Afternoon Bosphorus Strait Cruise up to Rumeli Fortress & Ortaköy', 41.0475, 29.0269, '15:30', 135, 'Ottoman wooden yalı mansions lining Europe and Asia.'),
      ]),
      d('Balat Colorful Houses, Chora Mosaics & Departure (IST)', [
        s('activity', 'Fener & Balat Historic Steep Streets + Kariye (Chora) Mosaics', 41.0312, 28.9392, '09:00', 120, '14th-century Palaeologan frescoes and colourful bay-windowed timber houses.'),
        s('transit', 'M11 Metro / Havaist Transfer to Istanbul Airport (IST)', 41.2753, 28.7519, '12:30', 55, 'Allow generous buffer at mega-terminal.'),
      ]),
    ],
  },
];

export interface MaterializedTemplate {
  card: ExploreCard;
  detail: ExploreDetail;
  aliases: string[];
}

export function materializeTemplates(): MaterializedTemplate[] {
  return TEMPLATE_SPECS.map((spec) => {
    const coverImage = LOCAL_PHOTO_CREDITS[spec.photoKey] ?? null;
    const days: ExploreDay[] = spec.days.map((day, dIdx) => ({
      dayNumber: dIdx + 1,
      title: day.title,
      items: day.stops.map((st, sIdx) => ({
        id: `tpl:${spec.slug}:d${dIdx + 1}:s${sIdx + 1}`,
        kind: st.kind,
        title: st.title,
        notes: st.notes,
        lat: st.lat,
        lng: st.lng,
        startTime: st.startTime,
        durationMins: st.durationMins,
        placeRefId: `itinbee:poi:${spec.slug}:${slugifyId(st.title)}`,
      })),
    }));
    const stopCount = days.reduce(
      (acc, day) => acc + day.items.filter((i) => i.kind !== 'note').length,
      0
    );
    const card: ExploreCard = {
      slug: spec.slug,
      title: spec.title,
      summary: spec.summary,
      coverImage,
      durationDays: days.length,
      stopCount,
      destinations: spec.destinations,
      tripTypes: spec.tripTypes,
      budgetTier: spec.budgetTier,
      bestMonths: spec.bestMonths,
      origin: 'template',
      cloneCount: spec.cloneCount,
      publishedAt: spec.publishedAt,
    };
    const detail: ExploreDetail = {
      ...card,
      days,
      mapAttribution: '© OpenStreetMap contributors',
    };
    return {
      card,
      detail,
      aliases: spec.aliases ?? [],
    };
  });
}

export interface TemplatePoiEntry {
  placeRefId: string;
  title: string;
  kind: ItemKind;
  lat: number;
  lng: number;
  durationMins: number;
  notes: string;
  destinationSlugs: string[];
}

let cachedTemplatePois: TemplatePoiEntry[] | null = null;

/**
 * Returns all unique verified stops across the 48 curated templates ( excluding pure transit transfers ),
 * so Grounding, Stage B Planner, and Ask Itinbee Assist always have rich, real-world geocoded POIs
 * for every major destination even offline before Destination Packs finish building.
 */
export function getTemplatePoiCatalog(): TemplatePoiEntry[] {
  if (cachedTemplatePois) return cachedTemplatePois;
  const seen = new Map<string, TemplatePoiEntry>();
  for (const spec of TEMPLATE_SPECS) {
    const destSlugs = spec.destinations.map((d) => d.slug);
    for (const day of spec.days) {
      for (const st of day.stops) {
        if (st.kind === 'transit') continue;
        const normKey = `${st.title.toLowerCase().replace(/[^a-z0-9]+/g, '')}:${st.lat.toFixed(2)}`;
        if (seen.has(normKey)) {
          const existing = seen.get(normKey)!;
          for (const ds of destSlugs) {
            if (!existing.destinationSlugs.includes(ds)) existing.destinationSlugs.push(ds);
          }
          continue;
        }
        seen.set(normKey, {
          placeRefId: `itinbee:poi:${spec.slug}:${slugifyId(st.title)}`,
          title: st.title,
          kind: st.kind,
          lat: st.lat,
          lng: st.lng,
          durationMins: st.durationMins,
          notes: st.notes,
          destinationSlugs: [...destSlugs],
        });
      }
    }
  }
  cachedTemplatePois = [...seen.values()];
  return cachedTemplatePois;
}

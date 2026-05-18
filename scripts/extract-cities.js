#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const citiesMdPath = resolve(__dirname, '../docs/cities.md');
const geojsonPath = process.argv[2] || '/tmp/cities.geojson';
const outputPath = resolve(__dirname, '../src/lib/data/cities.json');

// ---------------------------------------------------------------------------
// 1. Parse cities.md
// ---------------------------------------------------------------------------
console.log('Parsing cities.md...');
const md = readFileSync(citiesMdPath, 'utf-8');
const lines = md.split('\n');

const cities = [];
for (let i = 0; i < lines.length; i++) {
	if (lines[i].trim() !== '|-') continue;

	const nameLine = lines[i + 1];
	if (!nameLine || !nameLine.startsWith('|')) continue;

	const countryLine = lines[i + 2];
	if (!countryLine) continue;

	const popLine = lines[i + 3];
	if (!popLine) continue;

	const continentLine = lines[i + 4];
	if (!continentLine) continue;

	// --- City name ---
	let cityName = nameLine.replace(/^\|/, '').trim();
	// Remove bold/italic markers
	cityName = cityName.replace(/'{2,5}/g, '');
	// Extract from wiki link: [[Target|Display]] or [[Target]]
	const linkMatch = cityName.match(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/);
	if (linkMatch) {
		cityName = linkMatch[2] || linkMatch[1];
		cityName = cityName.replace(/'{2,5}/g, '').trim();
	}

	// --- Country ---
	const countryMatch = countryLine.match(/\{\{[Ff]lagu?\|([^}]+)\}\}/);
	const country = countryMatch ? countryMatch[1] : '';

	// --- Population ---
	const popMatch = popLine.match(/align="right"\s*\|?\s*([\d,]+)/);
	const population = popMatch ? parseInt(popMatch[1].replace(/,/g, ''), 10) : 0;

	// --- Continent ---
	let continent = continentLine.replace(/^\|/, '').trim();
	if (continent === 'Asia/Europe') continent = 'Europe';

	// --- Filters ---
	const validContinents = [
		'North America',
		'South America',
		'Europe',
		'Asia',
		'Africa',
		'Oceania'
	];
	if (!validContinents.includes(continent)) continue;
	if (population < 1000000) continue;
	if (!cityName || !country) continue;

	cities.push({ name: cityName, country, population, continent });
}

console.log(`Parsed ${cities.length} cities from cities.md`);

// ---------------------------------------------------------------------------
// 2. Population tiers
// ---------------------------------------------------------------------------
function getTier(pop) {
	if (pop >= 10000000) return '>10M';
	if (pop >= 5000000) return '10-5M';
	if (pop >= 2500000) return '5M-2.5M';
	return '2.5M-1M';
}

// ---------------------------------------------------------------------------
// 3. Load GeoJSON
// ---------------------------------------------------------------------------
console.log(`Loading GeoJSON from ${geojsonPath}...`);
const geojson = JSON.parse(readFileSync(geojsonPath, 'utf-8'));
console.log(`Loaded ${geojson.features.length} city features from GeoJSON`);

const geoByName = {};
for (const feature of geojson.features) {
	const name = feature.properties.NAME;
	if (!name) continue;
	if (!geoByName[name]) geoByName[name] = [];
	geoByName[name].push(feature);
}

// ---------------------------------------------------------------------------
// 4. Centroid helper
// ---------------------------------------------------------------------------
function computeCentroid(geometry) {
	let coords = [];
	if (geometry.type === 'Polygon') {
		coords = geometry.coordinates[0];
	} else if (geometry.type === 'MultiPolygon') {
		let maxLen = 0;
		for (const poly of geometry.coordinates) {
			if (poly[0].length > maxLen) {
				maxLen = poly[0].length;
				coords = poly[0];
			}
		}
	}
	if (coords.length === 0) return null;
	let sumLon = 0,
		sumLat = 0;
	for (const [lon, lat] of coords) {
		sumLon += lon;
		sumLat += lat;
	}
	return [sumLon / coords.length, sumLat / coords.length];
}

// ---------------------------------------------------------------------------
// 5. Normalize helpers
// ---------------------------------------------------------------------------

/** Normalize a city name: strip diacritics, normalize curly quotes to ASCII */
function normalizeKey(name) {
	return name
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[\u2018\u2019\u201A\u201B]/g, "'");
}

// ---------------------------------------------------------------------------
// 6. Name overrides: normalized cities.md name -> GeoJSON NAME
//    GeoJSON uses UPPERCASE names, often with old or local romanizations.
//    Keys here use ASCII apostrophes; normalizeKey() handles curly->ASCII.
// ---------------------------------------------------------------------------
const NAME_OVERRIDES_RAW = {
	// --- India (GeoJSON uses old British-era names) ---
	Mumbai: 'BOMBAY',
	Chennai: 'MADRAS',
	Kolkata: 'CALCUTTA',
	Bangalore: 'BANGALORE',
	Hyderabad: 'HYDERABAD',
	Ahmedabad: 'AHMADABAD',
	Nashik: 'NASIK',
	Visakhapatnam: 'VISHAKHAPATNAM',
	Thiruvananthapuram: 'TRIVANDRUM',
	Prayagraj: 'ALLAHABAD',
	Guwahati: 'GAUHATI',
	Solapur: 'SHOLAPUR',
	Varanasi: 'BENARES',
	Thane: 'THANA',
	'Kalyan-Dombivli': 'KALYAN',
	'Pimpri-Chinchwad': 'PIMPRI',
	'Hubli-Dharwad': 'HUBLI',
	Jalandhar: 'JULLUNDUR',
	Bhubaneswar: 'BHUBAHESHWAR',
	Tiruchirappalli: 'TIRUCHCHIRAPPALLI',

	// --- China ---
	"Xi'an": "XI'AN",
	"Tai'an": "TAI'AN",
	"Huai'an": 'QINGJIANG',
	Changchun: 'CHANGCHUNG',
	Daqing: 'DAGING',
	Dalian: 'DALIMAN',
	Hohhot: 'HU-HO-HAO-TE',
	Zibo: 'ZHANGDIAN',
	Dazhou: 'DA XIAN',
	Pingdingshan: 'BINGDINGSHAN',
	Wanzhou: 'WAN XIAN',
	Zhenjiang: 'ZHENJIANG (WALLED)',
	Zaozhuang: 'ZAOZHUANG (WALLED)',
	Shenzhen: 'XIXIANG',

	// --- Middle East ---
	Tehran: 'TEHRAN/ SHAR-E RAY',
	Riyadh: 'AR RIYAD',
	Jeddah: 'JIDDAH',
	Mecca: 'MAKKAH (MECCA)',
	Medina: 'AL MADINAH (MEDINA)',
	Dubai: 'DUBAYY',
	'Abu Dhabi': 'ABU ZABY',
	Dammam: 'AD DAMMAM',
	Doha: 'AD DAWHAH',
	Damascus: 'DIMASHQ (DAMASCUS)',
	Aleppo: 'HALAB (ALEPPO)',
	Mosul: 'AL MAWSIL (MOSEL)',
	Basra: 'AL BASRAH',
	Erbil: 'IRBIL',
	Beirut: 'BAYRUT (BEIRUT)',
	Sharjah: 'ASH SHARIQAH',
	Sanaa: 'SANA',
	Baghdad: 'BAGHDAD',
	Jerusalem: 'AL QUDS (JERUSALEM)',

	// --- Iran ---
	Isfahan: 'ESFAHAN',
	Mashhad: 'MASHHAD',

	// --- Russia and former USSR ---
	Moscow: 'MOSKVA',
	'Saint Petersburg': 'LENINGRAD',
	Yekaterinburg: 'SVERDLOVSK',
	'Nizhny Novgorod': 'GORKIY',
	Kharkiv: 'KHARKOV',
	Odesa: 'ODESSA',
	'Rostov-on-Don': 'ROSTOV-NA-DONU',
	Kyiv: 'KIYEV (KIEV)',
	Almaty: 'ALMA-ATA',
	Astana: 'TSELINOGRAD',
	Shymkent: 'CHIMKENT',
	Bishkek: 'FRUNZE',
	Ashgabat: 'ASHKHABAD',
	Tbilisi: 'TIFLIS',
	Yerevan: 'YEREVAN',

	// --- Southeast Asia ---
	Delhi: 'NEW DELHI',
	Yangon: 'RANGOON',
	Dhaka: 'DACCA',
	Hanoi: 'HA NOI',
	Vientiane: 'VIEN CHANG',
	Jakarta: 'DJAKARTA',
	Surabaya: 'SURABAJA',
	Makassar: 'MAKASAR',
	Taipei: 'TAI-PEI',
	Taichung: 'TAI-CHUNG',
	Tainan: 'TAI-NAN',
	Kaohsiung: 'KAO-HSIUNG',
	Bangkok: 'THON BURI',

	// --- Africa ---
	'Addis Ababa': 'ADIS ABEBA',
	Cairo: 'EL-QAHIRA (CAIRO)',
	Giza: 'EL-GIZA',
	Alexandria: 'EL- ISKANDARIYA (ALEXANDRIA)',
	Accra: 'AKRA',
	Algiers: 'ALGER',
	Tangier: 'TANGER',
	Fes: 'FES',
	Marrakesh: 'MARRAKECH',
	Ouagadougou: 'QUAGADOUGOU',
	Khartoum: 'AL KHURTUM',
	'Khartoum Bahri': 'AL KHURTUM BAHRI',
	Omdurman: 'OMDURMAN',
	"N'Djamena": 'NDJAMENA',
	'Mbuji-Mayi': 'BAKWANGA',
	Havana: 'LA HABANA (HAVANA)',
	eThekwini: 'DURBAN',
	Tshwane: 'PRETORIA',
	Mogadishu: 'MUGDISHO',
	Hargeisa: 'HARGEYSA',
	Ekurhuleni: 'GERMISTON',
	Kananga: 'LULUABOURG',

	// --- Europe ---
	Rome: 'ROMA',
	Milan: 'MILANO',
	Vienna: 'WIEN (VIENNA)',
	Warsaw: 'WARSZAWA',
	Prague: 'PRAHA',
	Bucharest: 'BUCURESTI',
	Belgrade: 'BEOGRAD',
	Sofia: 'SOFIYA',
	Cologne: 'KOLN',
	Mersin: 'ICEL',

	// --- South America ---
	'Sao Paulo': 'SAO PAULO',
	Bogota: 'BOGOTA',
	Brasilia: 'BRASILIA',
	Medellin: 'MEDELLIN',
	Goiania: 'GOIANIA',
	Belem: 'BELEM',
	'Sao Luis': 'SAO LUIS',
	Cordoba: 'CORDOBA',
	'Santa Cruz de la Sierra': 'SANTA CRUZ',

	// --- Mexico ---
	'Ciudad Juarez': 'CIUDAD JUAREZ',
	Nezahualcoyotl: 'XOCHIACA',
	'Ecatepec de Morelos': 'ESCALERA',
	Monterrey: 'SAN NICOLAS HIDALGO',

	// --- Pakistan ---
	Faisalabad: 'LYALLPUR',
	Chittagong: 'CHITTAGONG',

	// --- Other ---
	Iribarren: 'BARQUISIMETO',
	Kobe: 'KOBE OSAKA',
	Osaka: 'KOBE OSAKA',
	'Phnom Penh': 'PHNOM PENH',
	Urumqi: 'URUMQI',
	Izmir: 'IZMIR',
	Suwon: 'SUWEON',
	'Davao City': 'DAVAO',
	'Zamboanga City': 'ZAMBOANGA',
	'Port-au-Prince': 'PORT-AU-PRINCE',
	'Guatemala City': 'GUATEMALA',
	'Hong Kong': 'KOWLOON',
	Kyoto: 'KYOTO',
	Hue: 'HUE',
	'New York City': 'NEW YORK',
	'Ho Chi Minh City': 'HO CHI MINH CITY',
};

// Build a normalized override map
const NAME_OVERRIDES = {};
for (const [key, value] of Object.entries(NAME_OVERRIDES_RAW)) {
	NAME_OVERRIDES[normalizeKey(key)] = value;
}

// Expected coordinates [lat, lon] for disambiguation when multiple GeoJSON matches exist.
// These are used to pick the closest feature from several candidates.
const EXPECTED_COORDS_RAW = {
	// --- Major world cities ---
	Shanghai: [31.23, 121.47],
	Moscow: [55.76, 37.62],
	Seoul: [37.57, 126.98],
	Istanbul: [41.01, 28.98],
	Lagos: [6.45, 3.40],
	Cairo: [30.04, 31.24],
	Lima: [-12.05, -77.04],
	Tokyo: [35.68, 139.69],

	// --- United States ---
	'New York City': [40.71, -74.01],
	'Los Angeles': [33.94, -118.25],
	Houston: [29.76, -95.37],
	Chicago: [41.88, -87.63],
	Phoenix: [33.45, -112.07],
	Philadelphia: [39.95, -75.17],
	'San Antonio': [29.42, -98.49],
	'San Diego': [32.72, -117.16],
	Dallas: [32.78, -96.80],
	Jacksonville: [30.33, -81.66],
	'Fort Worth': [32.76, -97.33],

	// --- Europe ---
	Berlin: [52.52, 13.41],
	Hamburg: [53.55, 10.00],
	Paris: [48.86, 2.35],
	Rome: [41.90, 12.50],
	Milan: [45.46, 9.19],
	Warsaw: [52.23, 21.01],
	Budapest: [47.50, 19.05],
	Madrid: [40.42, -3.70],
	Barcelona: [41.39, 2.17],
	'Saint Petersburg': [59.93, 30.32],
	Sofia: [42.70, 23.32],
	Alexandria: [31.20, 29.92],

	// --- Canada ---
	Toronto: [43.65, -79.38],
	Montreal: [45.50, -73.57],
	Calgary: [51.05, -114.07],
	Edmonton: [53.55, -113.49],
	Ottawa: [45.42, -75.70],

	// --- India ---
	Mumbai: [19.08, 72.88],
	Chennai: [13.08, 80.27],
	Kolkata: [22.57, 88.36],
	Hyderabad: [17.39, 78.49],
	Bangalore: [12.97, 77.59],
	Lucknow: [26.85, 80.95],
	Bhopal: [23.26, 77.41],
	Agra: [27.18, 78.02],
	Varanasi: [25.32, 83.01],
	Patna: [25.61, 85.14],
	Aurangabad: [19.88, 75.34],
	Visakhapatnam: [17.69, 83.20],
	Kota: [25.18, 75.86],
	Salem: [11.65, 78.16],

	// --- Indonesia ---
	Surabaya: [-7.25, 112.75],
	Semarang: [-6.97, 110.42],

	// --- Philippines ---
	Manila: [14.60, 120.98],

	// --- South America ---
	Santiago: [-33.45, -70.67],
	Rosario: [-32.95, -60.65],
	Cordoba: [-31.42, -64.18],
	Montevideo: [-34.88, -56.16],
	Guayaquil: [-2.19, -79.89],
	Trujillo: [-8.11, -79.04],
	Cartagena: [10.39, -75.51],
	'Santa Cruz de la Sierra': [-17.78, -63.18],
	Goiania: [-16.68, -49.26],
	Recife: [-8.05, -34.87],
	'Porto Alegre': [-30.03, -51.23],

	// --- Central America and Caribbean ---
	'Guatemala City': [14.63, -90.53],
	Havana: [23.13, -82.38],
	Tegucigalpa: [14.07, -87.19],
	'Santo Domingo': [18.47, -69.90],

	// --- Middle East ---
	Baghdad: [33.31, 44.37],
	Mosul: [36.34, 43.12],
	Sharjah: [25.36, 55.39],
	Medina: [24.47, 39.61],
	Ahvaz: [31.32, 48.67],

	// --- Russia ---
	Novosibirsk: [55.04, 82.93],
	Krasnoyarsk: [56.01, 92.85],
	Krasnodar: [45.04, 38.98],
	Omsk: [54.99, 73.37],
	Voronezh: [51.67, 39.18],
	Odesa: [46.48, 30.73],
	Yekaterinburg: [56.84, 60.60],
	'Nizhny Novgorod': [56.33, 44.00],
	Bishkek: [42.87, 74.59],

	// --- East Asia ---
	Sapporo: [43.06, 141.35],
	Busan: [35.18, 129.08],
	Daegu: [35.87, 128.60],
	Fukuoka: [33.59, 130.40],
	Sendai: [38.27, 140.87],
	Hanoi: [21.03, 105.85],
	Hue: [16.46, 107.60],
	'Da Nang': [16.07, 108.22],
	Taoyuan: [24.99, 121.31],
	Bangkok: [13.76, 100.52],
	Yangon: [16.87, 96.20],

	// --- China ---
	Nanjing: [32.06, 118.80],
	Changsha: [28.23, 112.94],
	Baoding: [38.85, 115.49],
	Taiyuan: [37.87, 112.55],
	Lanzhou: [36.06, 103.83],
	Guilin: [25.27, 110.29],
	Datong: [40.09, 113.29],
	Huainan: [32.63, 116.98],
	Nanchong: [30.80, 106.08],
	Dongguan: [23.02, 113.75],
	Nanning: [22.82, 108.32],
	Linyi: [35.10, 118.36],
	Fuzhou: [26.07, 119.30],
	Huizhou: [23.11, 114.42],
	Xuzhou: [34.26, 117.19],
	Yantai: [37.46, 121.45],
	Liuzhou: [24.33, 109.41],
	Shaoxing: [30.00, 120.58],
	Jining: [35.40, 116.59],
	Jilin: [43.84, 126.55],
	Jieyang: [23.55, 116.37],
	Xiamen: [24.48, 118.09],
	Shijiazhuang: [38.04, 114.50],
	Urumqi: [43.83, 87.62],
	Zibo: [36.81, 118.06],
	Fuyang: [32.90, 115.81],
	Anyang: [36.10, 114.35],
	Hengyang: [26.89, 112.57],
	Yibin: [28.75, 104.63],
	Changde: [29.04, 111.69],
	Shangqiu: [34.45, 115.66],
	Jinzhou: [41.11, 121.14],
	Wanzhou: [30.81, 108.41],
	Dazhou: [31.21, 107.47],
	Pingdingshan: [33.74, 113.30],
	Shenzhen: [22.54, 114.06],
	Guangzhou: [23.13, 113.26],
	"Xi'an": [34.26, 108.94],
	"Tai'an": [36.19, 117.09],

	// --- Africa ---
	Giza: [30.01, 31.21],
	Kananga: [-5.90, 22.42],
	Lubumbashi: [-11.66, 27.47],
	Kisangani: [0.52, 25.20],
	Bukavu: [-2.51, 28.86],
	Tshikapa: [-5.40, 20.80],
	'Dar es Salaam': [-6.79, 39.28],
	Mwanza: [-2.52, 32.90],
	Lilongwe: [-13.97, 33.79],

	// --- Other ---
	Baku: [40.41, 49.87],
	Pyongyang: [39.02, 125.75],
	Kobe: [34.69, 135.20],
	Osaka: [34.69, 135.50],
	Leon: [21.12, -101.68],
	Auckland: [-36.85, 174.76],
};

// Build normalized expected coords map
const EXPECTED_COORDS = {};
for (const [key, value] of Object.entries(EXPECTED_COORDS_RAW)) {
	EXPECTED_COORDS[normalizeKey(key)] = value;
}

// ---------------------------------------------------------------------------
// 7. Fallback coordinates for cities not in GeoJSON
// ---------------------------------------------------------------------------
const FALLBACK_COORDS = {
	'Chongqing::China': [29.56, 106.55],
	'New Taipei City::Taiwan': [25.01, 121.47],
	'Abuja::Nigeria': [9.07, 7.49],
	'Yokohama::Japan': [35.44, 139.64],
	'Quezon City::Philippines': [14.65, 121.05],
	'Gazipur::Bangladesh': [24.00, 90.42],
	'Wenzhou::China': [27.99, 120.70],
	'Bekasi::Indonesia': [-6.24, 106.99],
	'Manaus::Brazil': [-3.12, -60.03],
	'Zhuhai::China': [22.28, 113.57],
	'Tangerang::Indonesia': [-6.18, 106.63],
	'Depok::Indonesia': [-6.40, 106.82],
	'Monrovia::Liberia': [6.30, -10.80],
	'Caloocan::Philippines': [14.65, 120.97],
	'Navi Mumbai::India': [19.04, 73.02],
	'Zunyi::China': [27.69, 106.91],
	'Kunshan::China': [31.38, 120.95],
	'Nouakchott::Mauritania': [18.09, -15.98],
	'Putian::China': [25.44, 119.01],
	'Kawasaki::Japan': [35.52, 139.70],
	'Yiwu::China': [29.32, 120.08],
	'Quanzhou::China': [24.91, 118.59],
	'Cixi::China': [30.17, 121.25],
	'Jinjiang::China': [24.82, 118.57],
	'South Tangerang::Indonesia': [-6.29, 106.72],
	'Taizhou::China': [28.66, 121.43],
	'Shangrao::China': [28.45, 117.97],
	'Zhangjiakou::China': [40.78, 114.87],
	'Jiangyin::China': [31.91, 120.26],
	'Saitama::Japan': [35.86, 139.65],
	'Taguig::Philippines': [14.52, 121.05],
	'Guarulhos::Brazil': [-23.46, -46.53],
	'Shubra El Kheima::Egypt': [30.13, 31.24],
	'Zapopan::Mexico': [20.72, -103.38],
	'Vasai-Virar::India': [19.43, 72.82],
	'Mira-Bhayandar::India': [19.30, 72.85],
	'Batam::Indonesia': [1.05, 104.03],
	'Nelson Mandela Bay::South Africa': [-33.80, 25.49],
	'Bandar Lampung::Indonesia': [-5.45, 105.26],
	'Naypyidaw::Myanmar': [19.76, 96.13],
	'Bobo-Dioulasso::Burkina Faso': [11.18, -4.30],
	'Luzhou::China': [28.87, 105.44],
	'Yueyang::China': [29.37, 113.09],
	'Touba::Senegal': [14.85, -15.88],
	'Suqian::China': [33.96, 118.28],
	"Lu\u2019an::China": [31.73, 116.47],
	"Lu'an::China": [31.73, 116.47],
	'Bhiwandi::India': [19.30, 73.06],
	'Yongin::South Korea': [37.24, 127.18],
	'Zhangjiagang::China': [31.87, 120.54],
	'Changzhi::China': [36.19, 113.12],
	'Goyang::South Korea': [37.66, 126.84],
	'Jinhua::China': [29.11, 119.64],
	'Zhaoqing::China': [23.05, 112.46],
	'Matola::Mozambique': [-25.96, 32.46],
	'Changwon::South Korea': [35.23, 128.68],
	'Santo Domingo Este::Dominican Republic': [18.49, -69.86],
	'Yuyao::China': [30.05, 121.15],
	"Rui\u2019an::China": [27.78, 120.63],
	"Rui'an::China": [27.78, 120.63],
};

// ---------------------------------------------------------------------------
// 8. Match & merge (dots only — no geometry in output)
// ---------------------------------------------------------------------------
const matched = [];
const unmatchedCities = [];

function distanceSq(lat1, lon1, lat2, lon2) {
	return (lat1 - lat2) ** 2 + (lon1 - lon2) ** 2;
}

function pickBestFeature(candidates, normalizedName) {
	if (candidates.length === 1) return candidates[0];

	const expected = EXPECTED_COORDS[normalizedName];
	if (expected) {
		let best = null;
		let bestDist = Infinity;
		for (const f of candidates) {
			const c = computeCentroid(f.geometry);
			if (!c) continue;
			// c is [lon, lat], expected is [lat, lon]
			const d = distanceSq(expected[0], expected[1], c[1], c[0]);
			if (d < bestDist) {
				bestDist = d;
				best = f;
			}
		}
		if (best) return best;
	}

	console.warn(
		`  Multiple GeoJSON matches for "${normalizedName}" (${candidates.length}) — using first`
	);
	return candidates[0];
}

for (const city of cities) {
	const normalizedName = normalizeKey(city.name);
	const fallbackKey = `${city.name}::${city.country}`;

	// Check fallback coords first (for cities not in GeoJSON)
	if (FALLBACK_COORDS[fallbackKey]) {
		const [lat, lon] = FALLBACK_COORDS[fallbackKey];
		matched.push({
			name: city.name,
			country: city.country,
			population: city.population,
			continent: city.continent,
			populationTier: getTier(city.population),
			lat,
			lon
		});
		continue;
	}

	// Determine GeoJSON name via override or direct uppercase
	let geoName;
	if (NAME_OVERRIDES[normalizedName]) {
		geoName = NAME_OVERRIDES[normalizedName];
	} else {
		geoName = normalizedName.toUpperCase();
	}

	const candidates = geoByName[geoName];

	if (!candidates || candidates.length === 0) {
		unmatchedCities.push(city);
		continue;
	}

	const feature = pickBestFeature(candidates, normalizedName);

	const centroid = computeCentroid(feature.geometry);
	if (!centroid) {
		unmatchedCities.push(city);
		continue;
	}

	matched.push({
		name: city.name,
		country: city.country,
		population: city.population,
		continent: city.continent,
		populationTier: getTier(city.population),
		lat: parseFloat(centroid[1].toFixed(4)),
		lon: parseFloat(centroid[0].toFixed(4))
	});
}

// ---------------------------------------------------------------------------
// 9. Output (simple JSON array — no GeoJSON geometry)
// ---------------------------------------------------------------------------
console.log(`\nMatched: ${matched.length} cities`);
if (unmatchedCities.length > 0) {
	console.warn(`\nUnmatched (${unmatchedCities.length}):`);
	for (const c of unmatchedCities) {
		console.warn(`  ${c.name} (${c.country}, pop ${c.population.toLocaleString()})`);
	}
}

const json = JSON.stringify(matched);
writeFileSync(outputPath, json);

console.log(`\nWrote ${matched.length} features to ${outputPath}`);
console.log(`File size: ${(json.length / 1024 / 1024).toFixed(2)} MB`);

for (const tier of ['>10M', '10-5M', '5M-2.5M', '2.5M-1M']) {
	const count = matched.filter((f) => f.populationTier === tier).length;
	console.log(`  ${tier}: ${count} cities`);
}

for (const cont of ['Asia', 'Africa', 'Europe', 'North America', 'South America', 'Oceania']) {
	const count = matched.filter((f) => f.continent === cont).length;
	console.log(`  ${cont}: ${count} cities`);
}

import citiesData from './cities.json';

export type CityContinent = 'North America' | 'South America' | 'Europe' | 'Asia' | 'Africa' | 'Oceania';
export type PopulationTier = '>25M' | '15-25M' | '5-15M' | '2-5M';

export interface CityData {
	name: string;
	country: string;
	population: number;
	continent: CityContinent;
	populationTier: PopulationTier;
	lat: number;
	lon: number;
}

export const cities: CityData[] = citiesData as unknown as CityData[];

export const CITY_CONTINENTS: CityContinent[] = [
	'North America',
	'South America',
	'Europe',
	'Asia',
	'Africa',
	'Oceania'
];

export const POPULATION_TIERS: PopulationTier[] = ['>25M', '15-25M', '5-15M', '2-5M'];

export const POPULATION_TIER_LABELS: Record<PopulationTier, string> = {
	'>25M': '>25M',
	'15-25M': '15-25M',
	'5-15M': '5-15M',
	'2-5M': '2-5M'
};

export const CONTINENT_COLORS: Record<CityContinent, string> = {
	'North America': '#2dd4bf',
	'South America': '#fbbf24',
	'Europe': '#60a5fa',
	'Asia': '#fb7185',
	'Africa': '#4ade80',
	'Oceania': '#c084fc'
};

/** Unique key for a city (name + country to handle duplicates) */
export function cityKey(name: string, country: string): string {
	return `${name}::${country}`;
}

export interface CityEntry {
	name: string;
	country: string;
	key: string;
	population: number;
	continent: CityContinent;
	populationTier: PopulationTier;
	lat: number;
	lon: number;
}

export function getCityList(): CityEntry[] {
	return cities.map((c) => ({
		name: c.name,
		country: c.country,
		key: cityKey(c.name, c.country),
		population: c.population,
		continent: c.continent as CityContinent,
		populationTier: c.populationTier as PopulationTier,
		lat: c.lat,
		lon: c.lon
	}));
}

/** Find cities with duplicate names in a given set of city keys */
export function findDuplicateNames(cityKeys: Set<string>, allCities: CityEntry[]): Set<string> {
	const activeCities = allCities.filter((c) => cityKeys.has(c.key));
	const nameCounts: Record<string, number> = {};
	for (const c of activeCities) {
		nameCounts[c.name] = (nameCounts[c.name] || 0) + 1;
	}
	const dupes = new Set<string>();
	for (const [name, count] of Object.entries(nameCounts)) {
		if (count > 1) dupes.add(name);
	}
	return dupes;
}

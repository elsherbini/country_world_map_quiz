import citiesGeoJSON from './cities.json';
import type { FeatureCollection, Geometry } from 'geojson';

export type CityContinent = 'North America' | 'South America' | 'Europe' | 'Asia' | 'Africa' | 'Oceania';
export type PopulationTier = '>10M' | '10-5M' | '5M-2.5M' | '2.5M-1M';

export interface CityProperties {
	name: string;
	country: string;
	population: number;
	continent: CityContinent;
	populationTier: PopulationTier;
	lat: number;
	lon: number;
	[key: string]: unknown;
}

export type CitiesFC = FeatureCollection<Geometry, CityProperties>;

export const cities: CitiesFC = citiesGeoJSON as unknown as CitiesFC;

export const CITY_CONTINENTS: CityContinent[] = [
	'North America',
	'South America',
	'Europe',
	'Asia',
	'Africa',
	'Oceania'
];

export const POPULATION_TIERS: PopulationTier[] = ['>10M', '10-5M', '5M-2.5M', '2.5M-1M'];

export const POPULATION_TIER_LABELS: Record<PopulationTier, string> = {
	'>10M': '>10M',
	'10-5M': '10-5M',
	'5M-2.5M': '5M-2.5M',
	'2.5M-1M': '2.5M-1M'
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
	return cities.features.map((f) => ({
		name: f.properties.name,
		country: f.properties.country,
		key: cityKey(f.properties.name, f.properties.country),
		population: f.properties.population,
		continent: f.properties.continent as CityContinent,
		populationTier: f.properties.populationTier as PopulationTier,
		lat: f.properties.lat,
		lon: f.properties.lon
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

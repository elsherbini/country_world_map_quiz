import citiesData from './cities.json';
import { getRegion, REGION_LABELS, type Region } from './countries';

export interface CityData {
	name: string;
	country: string;
	code: string;       // ISO_A3
	population: number;
	isCapital: boolean;
	lat: number;
	lon: number;
}

export const cities: CityData[] = citiesData as unknown as CityData[];

/** Regions available in Cities mode: the 8 non-subnational world regions. */
export const CITY_REGIONS: Region[] = [
	'north-america', 'south-america', 'europe', 'asia',
	'africa', 'oceania', 'small-islands', 'city-states'
];

export { REGION_LABELS };

export function cityKey(name: string, country: string): string {
	return `${name}::${country}`;
}

export interface CityEntry {
	name: string;
	country: string;
	code: string;
	key: string;
	region: Region;
	population: number;
	isCapital: boolean;
	lat: number;
	lon: number;
}

export function getCityList(): CityEntry[] {
	return cities.map((c) => ({
		name: c.name,
		country: c.country,
		code: c.code,
		key: cityKey(c.name, c.country),
		region: getRegion(c.code),
		population: c.population,
		isCapital: c.isCapital,
		lat: c.lat,
		lon: c.lon
	}));
}

/** Distinct countries present in the dataset, with code + region, sorted by name. */
export function getCityCountries(): { code: string; name: string; region: Region }[] {
	const seen = new Map<string, { code: string; name: string; region: Region }>();
	for (const c of cities) {
		if (!seen.has(c.code)) seen.set(c.code, { code: c.code, name: c.country, region: getRegion(c.code) });
	}
	return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Find cities with duplicate names in a given set of city keys */
export function findDuplicateNames(cityKeys: Set<string>, allCities: CityEntry[]): Set<string> {
	const active = allCities.filter((c) => cityKeys.has(c.key));
	const counts: Record<string, number> = {};
	for (const c of active) counts[c.name] = (counts[c.name] || 0) + 1;
	const dupes = new Set<string>();
	for (const [name, n] of Object.entries(counts)) if (n > 1) dupes.add(name);
	return dupes;
}

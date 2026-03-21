import countriesGeoJSON from './countries.json';
import type { FeatureCollection, Geometry } from 'geojson';

export interface CountryProperties {
	NAME: string;
	ISO_A3: string;
	ISO_A3_EH: string;
	CONTINENT: string;
	POP_EST: number;
	[key: string]: unknown;
}

export type CountriesFC = FeatureCollection<Geometry, CountryProperties>;

export const countries: CountriesFC = countriesGeoJSON as unknown as CountriesFC;

// Get a list of all country entries with name and code
export function getCountryList(): { name: string; code: string }[] {
	return countries.features
		.map((f) => ({
			name: f.properties.NAME,
			code: f.properties.ISO_A3_EH !== '-99' ? f.properties.ISO_A3_EH : f.properties.ISO_A3
		}))
		.filter((c) => c.code !== '-99')
		.sort((a, b) => a.name.localeCompare(b.name));
}

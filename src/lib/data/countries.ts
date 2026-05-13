import countriesGeoJSON from './countries.json';
import type { FeatureCollection, Geometry } from 'geojson';
import { subdivisions } from './subdivisions';

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

// Get a list of all country entries with name, code, and region
export function getCountryList(): { name: string; code: string; region: Region }[] {
	return countries.features
		.map((f) => ({
			name: f.properties.NAME,
			code: f.properties.ISO_A3_EH !== '-99' ? f.properties.ISO_A3_EH : f.properties.ISO_A3,
			region: getRegion(
				f.properties.ISO_A3_EH !== '-99' ? f.properties.ISO_A3_EH : f.properties.ISO_A3
			)
		}))
		.filter((c) => c.code !== '-99')
		.sort((a, b) => a.name.localeCompare(b.name));
}

export type Region =
	| 'north-america'
	| 'south-america'
	| 'europe'
	| 'asia'
	| 'africa'
	| 'oceania'
	| 'small-islands'
	| 'city-states'
	| 'us-states'
	| 'china-provinces'
	| 'india-states'
	| 'canada-provinces'
	| 'mexico-states'
	| 'france-regions'
	| 'spain-communities'
	| 'italy-regions'
	| 'germany-states';

export const REGION_LABELS: Record<Region, string> = {
	'north-america': 'North America',
	'south-america': 'South America',
	europe: 'Europe',
	asia: 'Asia',
	africa: 'Africa',
	oceania: 'Oceania',
	'small-islands': 'Small Islands',
	'city-states': 'City-states',
	'us-states': 'US States',
	'china-provinces': 'Chinese Provinces',
	'india-states': 'Indian States',
	'canada-provinces': 'Canadian Provinces',
	'mexico-states': 'Mexican States',
	'france-regions': 'French Regions',
	'spain-communities': 'Spanish Communities',
	'italy-regions': 'Italian Regions',
	'germany-states': 'German States'
};

// TODO: Remove once MapAttackMap and map-attack page are updated
export const REGION_COLORS: Record<Region, string> = {
	'north-america': '#2dd4bf',
	'south-america': '#fbbf24',
	europe: '#60a5fa',
	asia: '#fb7185',
	africa: '#4ade80',
	oceania: '#c084fc',
	'small-islands': '#22d3ee',
	'city-states': '#fb923c',
	'us-states': '#4ade80',
	'china-provinces': '#4ade80',
	'india-states': '#4ade80',
	'canada-provinces': '#4ade80',
	'mexico-states': '#4ade80',
	'france-regions': '#4ade80',
	'spain-communities': '#4ade80',
	'italy-regions': '#4ade80',
	'germany-states': '#4ade80'
};

export const ALL_REGIONS: Region[] = [
	'north-america',
	'south-america',
	'europe',
	'asia',
	'africa',
	'oceania',
	'small-islands',
	'city-states',
	'us-states',
	'china-provinces',
	'india-states',
	'canada-provinces',
	'mexico-states',
	'france-regions',
	'spain-communities',
	'italy-regions',
	'germany-states'
];

const REGION_OVERRIDES: Record<string, Region> = {
	// Caribbean large islands -> North America
	CUB: 'north-america',
	HTI: 'north-america',
	DOM: 'north-america',
	JAM: 'north-america',
	BHS: 'north-america',
	PRI: 'north-america',
	// European islands / microstates -> Europe
	AND: 'europe',
	LIE: 'europe',
	ISL: 'europe',
	CYP: 'europe',
	MLT: 'europe',
	// Asian islands -> Asia
	SGP: 'asia',
	BRN: 'asia',
	TLS: 'asia',
	// African islands -> Africa
	CPV: 'africa',
	// City-states
	VAT: 'city-states',
	MCO: 'city-states',
	SMR: 'city-states',
	HKG: 'city-states',
	MAC: 'city-states',
	// Small island nations (Oceania except AUS/NZL/PNG)
	VUT: 'small-islands',
	FSM: 'small-islands',
	MHL: 'small-islands',
	MNP: 'small-islands',
	GUM: 'small-islands',
	ASM: 'small-islands',
	TON: 'small-islands',
	WSM: 'small-islands',
	PLW: 'small-islands',
	NIU: 'small-islands',
	COK: 'small-islands',
	NRU: 'small-islands',
	KIR: 'small-islands',
	TUV: 'small-islands',
	PYF: 'small-islands',
	NCL: 'small-islands',
	WLF: 'small-islands',
	PCN: 'small-islands',
	NFK: 'small-islands',
	FJI: 'small-islands',
	SLB: 'small-islands',
	// Caribbean small islands
	VIR: 'small-islands',
	AIA: 'small-islands',
	CYM: 'small-islands',
	BMU: 'small-islands',
	VGB: 'small-islands',
	TCA: 'small-islands',
	MSR: 'small-islands',
	SPM: 'small-islands',
	MAF: 'small-islands',
	BLM: 'small-islands',
	ABW: 'small-islands',
	CUW: 'small-islands',
	SXM: 'small-islands',
	TTO: 'small-islands',
	BRB: 'small-islands',
	GRD: 'small-islands',
	VCT: 'small-islands',
	LCA: 'small-islands',
	KNA: 'small-islands',
	DMA: 'small-islands',
	ATG: 'small-islands',
	// Indian Ocean / Seven seas / Atlantic islands
	SGS: 'small-islands',
	IOT: 'small-islands',
	SHN: 'small-islands',
	SYC: 'small-islands',
	MUS: 'small-islands',
	MDV: 'small-islands',
	COM: 'small-islands',
	MYT: 'small-islands',
	ATF: 'small-islands',
	HMD: 'small-islands',
	STP: 'small-islands',
	FLK: 'small-islands',
	// European crown dependencies / territories
	FRO: 'small-islands',
	ALA: 'small-islands',
	JEY: 'small-islands',
	GGY: 'small-islands',
	IMN: 'small-islands',
	// Greenland
	GRL: 'small-islands',
	// Antarctica
	ATA: 'small-islands'
};

const CONTINENT_TO_REGION: Record<string, Region> = {
	'North America': 'north-america',
	'South America': 'south-america',
	Europe: 'europe',
	Asia: 'asia',
	Africa: 'africa',
	Oceania: 'oceania',
	'Seven seas (open ocean)': 'small-islands',
	Antarctica: 'small-islands'
};

export function getRegion(code: string): Region {
	if (REGION_OVERRIDES[code]) return REGION_OVERRIDES[code];
	const feature = countries.features.find((f) => {
		const c = f.properties.ISO_A3_EH !== '-99' ? f.properties.ISO_A3_EH : f.properties.ISO_A3;
		return c === code;
	});
	if (!feature) return 'small-islands';
	return CONTINENT_TO_REGION[feature.properties.CONTINENT] ?? 'small-islands';
}

/** Maps subnational region to parent country ISO alpha-2 code */
export const SUBNATIONAL_PARENT_ISO_A2: Partial<Record<Region, string>> = {
	'us-states': 'US',
	'china-provinces': 'CN',
	'india-states': 'IN',
	'canada-provinces': 'CA',
	'mexico-states': 'MX',
	'france-regions': 'FR',
	'spain-communities': 'ES',
	'italy-regions': 'IT',
	'germany-states': 'DE'
};

/** Maps parent country ISO alpha-2 code to subnational region */
const ISO_A2_TO_SUBNATIONAL_REGION: Record<string, Region> = {
	US: 'us-states',
	CN: 'china-provinces',
	IN: 'india-states',
	CA: 'canada-provinces',
	MX: 'mexico-states',
	FR: 'france-regions',
	ES: 'spain-communities',
	IT: 'italy-regions',
	DE: 'germany-states'
};

/** All subnational region keys */
export const SUBNATIONAL_REGIONS: Region[] = [
	'us-states',
	'china-provinces',
	'india-states',
	'canada-provinces',
	'mexico-states',
	'france-regions',
	'spain-communities',
	'italy-regions',
	'germany-states'
];

/** Get subnational region for a subdivision by its parent country ISO alpha-2 code */
export function getSubnationalRegion(isoA2: string): Region | undefined {
	return ISO_A2_TO_SUBNATIONAL_REGION[isoA2];
}

const ISO_A2_TO_A3: Record<string, string> = {
	US: 'USA',
	CN: 'CHN',
	IN: 'IND',
	CA: 'CAN',
	MX: 'MEX',
	FR: 'FRA',
	ES: 'ESP',
	IT: 'ITA',
	DE: 'DEU'
};

export function getSubdivisionList(): { name: string; code: string; region: Region; parentCountryCode: string }[] {
	return subdivisions.features
		.map((f) => {
			const region = getSubnationalRegion(f.properties.iso_a2);
			if (!region) return null;
			return {
				name: f.properties.name,
				code: f.properties.iso_3166_2,
				region,
				parentCountryCode: ISO_A2_TO_A3[f.properties.iso_a2] ?? f.properties.iso_a2
			};
		})
		.filter((x): x is NonNullable<typeof x> => x !== null)
		.sort((a, b) => a.name.localeCompare(b.name));
}

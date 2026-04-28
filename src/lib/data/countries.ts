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
	| 'city-states';

export const REGION_LABELS: Record<Region, string> = {
	'north-america': 'North America',
	'south-america': 'South America',
	europe: 'Europe',
	asia: 'Asia',
	africa: 'Africa',
	oceania: 'Oceania',
	'small-islands': 'Small Islands',
	'city-states': 'City-states'
};

export const ALL_REGIONS: Region[] = [
	'north-america',
	'south-america',
	'europe',
	'asia',
	'africa',
	'oceania',
	'small-islands',
	'city-states'
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

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
	| 'islands-caribbean'
	| 'islands-oceania'
	| 'islands-europe'
	| 'islands-africa'
	| 'islands-atlantic-antarctic'
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
	'islands-caribbean': 'Islands: Caribbean',
	'islands-oceania': 'Islands: Oceania',
	'islands-europe': 'Islands: Europe',
	'islands-africa': 'Islands: Africa',
	'islands-atlantic-antarctic': 'Islands: Atlantic & Antarctic',
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
	'islands-caribbean': '#22d3ee',
	'islands-oceania': '#a78bfa',
	'islands-europe': '#93c5fd',
	'islands-africa': '#86efac',
	'islands-atlantic-antarctic': '#94a3b8',
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
	'islands-caribbean',
	'islands-oceania',
	'islands-europe',
	'islands-africa',
	'islands-atlantic-antarctic',
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

/** Regions available in Flag Attack: world countries + US states (for now). */
export const FLAG_REGIONS: Region[] = [
	'north-america',
	'south-america',
	'europe',
	'asia',
	'africa',
	'oceania',
	'islands-caribbean',
	'islands-oceania',
	'islands-europe',
	'islands-africa',
	'islands-atlantic-antarctic',
	'city-states',
	'us-states'
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
	XKX: 'europe',        // Kosovo
	GIB: 'europe',        // Gibraltar
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
	// Maldives: sovereign South Asian island state -> mainland Asia (like SGP/BRN/BHR)
	MDV: 'asia',
	// Islands: Oceania (Pacific, excluding AUS/NZL/PNG)
	VUT: 'islands-oceania',
	FSM: 'islands-oceania',
	MHL: 'islands-oceania',
	MNP: 'islands-oceania',
	GUM: 'islands-oceania',
	ASM: 'islands-oceania',
	TON: 'islands-oceania',
	WSM: 'islands-oceania',
	PLW: 'islands-oceania',
	NIU: 'islands-oceania',
	COK: 'islands-oceania',
	NRU: 'islands-oceania',
	KIR: 'islands-oceania',
	TUV: 'islands-oceania',
	PYF: 'islands-oceania',
	NCL: 'islands-oceania',
	WLF: 'islands-oceania',
	PCN: 'islands-oceania',
	NFK: 'islands-oceania',
	FJI: 'islands-oceania',
	SLB: 'islands-oceania',
	// French overseas departments
	GUF: 'south-america', // French Guiana (mainland)
	MTQ: 'islands-caribbean', // Martinique
	REU: 'islands-africa', // Réunion
	MYT: 'islands-africa', // Mayotte
	// Islands: Caribbean
	VIR: 'islands-caribbean',
	AIA: 'islands-caribbean',
	CYM: 'islands-caribbean',
	VGB: 'islands-caribbean',
	TCA: 'islands-caribbean',
	MSR: 'islands-caribbean',
	MAF: 'islands-caribbean',
	BLM: 'islands-caribbean',
	ABW: 'islands-caribbean',
	CUW: 'islands-caribbean',
	SXM: 'islands-caribbean',
	TTO: 'islands-caribbean',
	BRB: 'islands-caribbean',
	GRD: 'islands-caribbean',
	VCT: 'islands-caribbean',
	LCA: 'islands-caribbean',
	KNA: 'islands-caribbean',
	DMA: 'islands-caribbean',
	ATG: 'islands-caribbean',
	// Islands: Africa (Indian Ocean + Gulf of Guinea + South Atlantic)
	SYC: 'islands-africa',
	MUS: 'islands-africa',
	COM: 'islands-africa',
	STP: 'islands-africa',
	SHN: 'islands-africa',
	IOT: 'islands-africa',
	// Islands: Atlantic & Antarctic
	BMU: 'islands-atlantic-antarctic',
	SPM: 'islands-atlantic-antarctic',
	FLK: 'islands-atlantic-antarctic',
	SGS: 'islands-atlantic-antarctic',
	ATF: 'islands-atlantic-antarctic',
	HMD: 'islands-atlantic-antarctic',
	ATA: 'islands-atlantic-antarctic',
	// Islands: Europe (crown dependencies / autonomous territories)
	FRO: 'islands-europe',
	ALA: 'islands-europe',
	JEY: 'islands-europe',
	GGY: 'islands-europe',
	IMN: 'islands-europe'
};

const CONTINENT_TO_REGION: Record<string, Region> = {
	'North America': 'north-america',
	'South America': 'south-america',
	Europe: 'europe',
	Asia: 'asia',
	Africa: 'africa',
	Oceania: 'oceania',
	'Seven seas (open ocean)': 'islands-atlantic-antarctic',
	Antarctica: 'islands-atlantic-antarctic'
};

export function getRegion(code: string): Region {
	if (REGION_OVERRIDES[code]) return REGION_OVERRIDES[code];
	const feature = countries.features.find((f) => {
		const c = f.properties.ISO_A3_EH !== '-99' ? f.properties.ISO_A3_EH : f.properties.ISO_A3;
		return c === code;
	});
	if (!feature) return 'islands-atlantic-antarctic';
	return CONTINENT_TO_REGION[feature.properties.CONTINENT] ?? 'islands-atlantic-antarctic';
}

/** Regions that replaced the former single `small-islands` region. */
export const ISLAND_REGIONS: Region[] = [
	'islands-caribbean',
	'islands-oceania',
	'islands-europe',
	'islands-africa',
	'islands-atlantic-antarctic'
];

/**
 * Merge a stored region-toggle map over `defaults`, migrating the legacy
 * `small-islands` key: its value is copied onto every island region that the
 * stored map does not already set, then the key is dropped.
 */
export function migrateRegions(
	defaults: Record<Region, boolean>,
	stored: unknown
): Record<Region, boolean> {
	const src = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
	const out: Record<string, boolean> = { ...defaults };
	for (const [k, v] of Object.entries(src)) {
		if (k in defaults && typeof v === 'boolean') out[k] = v;
	}
	const legacy = src['small-islands'];
	if (typeof legacy === 'boolean') {
		for (const r of ISLAND_REGIONS) {
			if (r in defaults && typeof src[r] !== 'boolean') out[r] = legacy;
		}
	}
	return out as Record<Region, boolean>;
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

/**
 * Resolve a target code to a flagcdn SVG URL.
 * - Subdivisions (e.g. "US-CA") -> https://flagcdn.com/us-ca.svg
 * - Countries (ISO_A3, e.g. "FRA") -> look up alpha-2 -> https://flagcdn.com/fr.svg
 * Returns null when no valid alpha-2 exists (e.g. Somaliland, N. Cyprus).
 */
export function getFlagUrl(code: string): string | null {
	if (code.includes('-')) {
		return `https://flagcdn.com/${code.toLowerCase()}.svg`;
	}
	const feature = countries.features.find((f) => {
		const c = f.properties.ISO_A3_EH !== '-99' ? f.properties.ISO_A3_EH : f.properties.ISO_A3;
		return c === code;
	});
	if (!feature) return null;
	const p = feature.properties as Record<string, unknown>;
	const a2raw = p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2;
	const a2 = typeof a2raw === 'string' ? a2raw : '';
	if (!a2 || a2 === '-99') return null;
	return `https://flagcdn.com/${a2.toLowerCase()}.svg`;
}

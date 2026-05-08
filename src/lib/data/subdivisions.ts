import subdivisionsGeoJSON from './subdivisions.json';
import type { FeatureCollection, Geometry } from 'geojson';

export interface SubdivisionProperties {
	name: string;
	iso_3166_2: string;
	iso_a2: string;
	admin: string;
	type_en: string;
	[key: string]: unknown;
}

export type SubdivisionsFC = FeatureCollection<Geometry, SubdivisionProperties>;

export const subdivisions: SubdivisionsFC = subdivisionsGeoJSON as unknown as SubdivisionsFC;

/** Get all subdivision features for a given parent country ISO alpha-2 code */
export function getSubdivisionFeatures(parentIsoA2: string) {
	return subdivisions.features.filter((f) => f.properties.iso_a2 === parentIsoA2);
}

/** Check if a code is a subdivision code (contains a hyphen, e.g. "US-TX") */
export function isSubdivisionCode(code: string): boolean {
	return code.includes('-');
}

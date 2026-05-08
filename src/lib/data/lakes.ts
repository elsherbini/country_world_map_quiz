import lakesGeoJSON from './lakes.json';
import type { FeatureCollection, Geometry } from 'geojson';

export interface LakeProperties {
	name: string;
	scalerank: number;
	[key: string]: unknown;
}

export type LakesFC = FeatureCollection<Geometry, LakeProperties>;

export const lakes: LakesFC = lakesGeoJSON as unknown as LakesFC;

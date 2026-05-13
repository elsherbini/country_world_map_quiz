#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';

const TARGET_COUNTRIES = ['US', 'CN', 'IN', 'CA', 'MX', 'FR', 'ES', 'IT', 'DE'];

const EXCLUDE_CODES = [
	'US-DC',     // District of Columbia
	'CN-X01~',   // Paracel Islands
	'MX-X01~'    // null entry
];

// Countries where we merge sub-features by region property
const MERGE_BY_REGION = {
	FR: 'Region',
	IT: 'Region',
	ES: 'Autonomous Community'
};

const inputPath = process.argv[2] || '/tmp/ne_10m_admin_1_states_provinces.geojson';
const outputPath = process.argv[3] || 'src/lib/data/subdivisions.json';

console.log(`Reading ${inputPath}...`);
const data = JSON.parse(readFileSync(inputPath, 'utf-8'));

const filtered = data.features.filter((f) => {
	const iso_a2 = f.properties.iso_a2;
	const iso_3166_2 = f.properties.iso_3166_2;
	return TARGET_COUNTRIES.includes(iso_a2) && !EXCLUDE_CODES.includes(iso_3166_2);
});

/** Merge multiple Polygon/MultiPolygon geometries into one MultiPolygon */
function mergeGeometries(geometries) {
	const allPolygons = [];
	for (const geom of geometries) {
		if (geom.type === 'Polygon') {
			allPolygons.push(geom.coordinates);
		} else if (geom.type === 'MultiPolygon') {
			allPolygons.push(...geom.coordinates);
		}
	}
	return { type: 'MultiPolygon', coordinates: allPolygons };
}

const features = [];

for (const code of TARGET_COUNTRIES) {
	const countryFeatures = filtered.filter((f) => f.properties.iso_a2 === code);

	if (MERGE_BY_REGION[code]) {
		// Group by region and merge
		const groups = {};
		for (const f of countryFeatures) {
			const region = f.properties.region;
			if (!region) continue;
			if (!groups[region]) groups[region] = [];
			groups[region].push(f);
		}

		for (const [regionName, regionFeatures] of Object.entries(groups)) {
			const first = regionFeatures[0];
			features.push({
				type: 'Feature',
				properties: {
					name: regionName,
					iso_3166_2: first.properties.iso_3166_2,
					iso_a2: code,
					admin: first.properties.admin,
					type_en: MERGE_BY_REGION[code]
				},
				geometry: mergeGeometries(regionFeatures.map((f) => f.geometry))
			});
		}
	} else {
		// Keep individual features
		for (const f of countryFeatures) {
			features.push({
				type: 'Feature',
				properties: {
					name: f.properties.name,
					iso_3166_2: f.properties.iso_3166_2,
					iso_a2: f.properties.iso_a2,
					admin: f.properties.admin,
					type_en: f.properties.type_en
				},
				geometry: f.geometry
			});
		}
	}
}

const output = {
	type: 'FeatureCollection',
	features
};

const json = JSON.stringify(output);
writeFileSync(outputPath, json);

console.log(`Wrote ${features.length} features to ${outputPath}`);
console.log(`File size: ${(json.length / 1024 / 1024).toFixed(2)} MB`);

for (const code of TARGET_COUNTRIES) {
	const count = features.filter((f) => f.properties.iso_a2 === code).length;
	console.log(`  ${code}: ${count} subdivisions`);
}

if (EXCLUDE_CODES.length > 0) {
	console.log(`Excluded: ${EXCLUDE_CODES.join(', ')}`);
}

const mergedCountries = Object.keys(MERGE_BY_REGION);
if (mergedCountries.length > 0) {
	console.log(`Merged by region: ${mergedCountries.join(', ')}`);
}

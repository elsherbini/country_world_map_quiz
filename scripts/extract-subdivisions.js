#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';

const TARGET_COUNTRIES = ['US', 'CN', 'IN', 'CA', 'MX', 'GB', 'FR', 'ES', 'IT', 'DE'];

const EXCLUDE_CODES = [
	'US-DC',    // District of Columbia
	'CN-X01~'   // Paracel Islands
];

const inputPath = process.argv[2] || '/tmp/ne_10m_admin_1_states_provinces.geojson';
const outputPath = process.argv[3] || 'src/lib/data/subdivisions.json';

console.log(`Reading ${inputPath}...`);
const data = JSON.parse(readFileSync(inputPath, 'utf-8'));

const filtered = data.features.filter((f) => {
	const iso_a2 = f.properties.iso_a2;
	const iso_3166_2 = f.properties.iso_3166_2;
	return TARGET_COUNTRIES.includes(iso_a2) && !EXCLUDE_CODES.includes(iso_3166_2);
});

const stripped = filtered.map((f) => ({
	type: 'Feature',
	properties: {
		name: f.properties.name,
		iso_3166_2: f.properties.iso_3166_2,
		iso_a2: f.properties.iso_a2,
		admin: f.properties.admin,
		type_en: f.properties.type_en
	},
	geometry: f.geometry
}));

const output = {
	type: 'FeatureCollection',
	features: stripped
};

const json = JSON.stringify(output);
writeFileSync(outputPath, json);

console.log(`Wrote ${stripped.length} features to ${outputPath}`);
console.log(`File size: ${(json.length / 1024 / 1024).toFixed(2)} MB`);

for (const code of TARGET_COUNTRIES) {
	const count = stripped.filter((f) => f.properties.iso_a2 === code).length;
	console.log(`  ${code}: ${count} subdivisions`);
}

if (EXCLUDE_CODES.length > 0) {
	console.log(`Excluded: ${EXCLUDE_CODES.join(', ')}`);
}

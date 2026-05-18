#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';

const inputPath = 'src/lib/data/countries.json';
const data = JSON.parse(readFileSync(inputPath, 'utf-8'));

const findByIso = (iso) =>
	data.features.find((f) => f.properties.ISO_A3_EH === iso);

function polyBbox(poly) {
	let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90;
	for (const ring of poly) {
		for (const [lon, lat] of ring) {
			if (lon < minLon) minLon = lon;
			if (lat < minLat) minLat = lat;
			if (lon > maxLon) maxLon = lon;
			if (lat > maxLat) maxLat = lat;
		}
	}
	return { minLon, minLat, maxLon, maxLat };
}

function bboxInside(inner, outer) {
	return (
		inner.minLon >= outer.minLon &&
		inner.maxLon <= outer.maxLon &&
		inner.minLat >= outer.minLat &&
		inner.maxLat <= outer.maxLat
	);
}

const featuresBefore = data.features.length;

// 1. Move Crimea from Russia to Ukraine
const russia = findByIso('RUS');
const ukraine = findByIso('UKR');
const crimeaBox = { minLon: 32, maxLon: 37, minLat: 44, maxLat: 46.5 };

const russiaPolys = russia.geometry.coordinates;
const crimeaPolys = russiaPolys.filter((poly) => bboxInside(polyBbox(poly), crimeaBox));

if (crimeaPolys.length === 0) {
	console.warn('WARN: no Crimea polygon found in RUS — already moved or source changed');
} else {
	russia.geometry.coordinates = russiaPolys.filter(
		(poly) => !bboxInside(polyBbox(poly), crimeaBox)
	);
	ukraine.geometry.coordinates = ukraine.geometry.coordinates.concat(crimeaPolys);
	console.log(`Moved ${crimeaPolys.length} polygon(s) from RUS to UKR (Crimea)`);
}

// 2. Merge Greenland into Denmark
const denmark = findByIso('DNK');
const greenlandIdx = data.features.findIndex((f) => f.properties.ISO_A3_EH === 'GRL');

if (greenlandIdx === -1) {
	console.warn('WARN: no GRL feature found — already merged');
} else {
	const greenland = data.features[greenlandIdx];
	const greenlandPolyCount = greenland.geometry.coordinates.length;
	denmark.geometry.coordinates = denmark.geometry.coordinates.concat(
		greenland.geometry.coordinates
	);
	data.features.splice(greenlandIdx, 1);
	console.log(`Merged ${greenlandPolyCount} polygon(s) from GRL into DNK and removed GRL feature`);
}

console.log(`Features: ${featuresBefore} -> ${data.features.length}`);

const json = JSON.stringify(data);
writeFileSync(inputPath, json);
console.log(`Wrote ${inputPath} (${(json.length / 1024 / 1024).toFixed(2)} MB)`);

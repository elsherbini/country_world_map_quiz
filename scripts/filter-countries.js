#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';

const inputPath = 'src/lib/data/countries.json';
const data = JSON.parse(readFileSync(inputPath, 'utf-8'));

const REMOVE_NAMES = ['Indian Ocean Ter.', 'Ashmore and Cartier Is.'];

const before = data.features.length;
data.features = data.features.filter(
	(f) => !REMOVE_NAMES.includes(f.properties.NAME)
);
const after = data.features.length;

console.log(`Removed ${before - after} features: ${REMOVE_NAMES.join(', ')}`);
console.log(`${after} features remaining`);

const json = JSON.stringify(data);
writeFileSync(inputPath, json);
console.log(`Wrote ${inputPath} (${(json.length / 1024 / 1024).toFixed(2)} MB)`);

import { getCountryList, getRegion, type Region, ALL_REGIONS } from '$lib/data/countries';

export interface CountryState {
	bucket: number; // 1-7, 8 = retired
	stage: number; // 0=world, 1=1M km², 2=100k km², 3=random
	skipped: boolean;
}

export interface GameData {
	countries: Record<string, CountryState>;
	regions: Record<Region, boolean>;
}

const STORAGE_KEY = 'geography-game';
const BUCKET_WEIGHTS = [0, 64, 32, 16, 8, 4, 2, 1]; // index 0 unused, buckets 1-7
const MAX_BUCKET = 7;
const MIN_BUCKET_1_COUNT = 5;

function defaultRegions(): Record<Region, boolean> {
	return Object.fromEntries(ALL_REGIONS.map((r) => [r, true])) as Record<Region, boolean>;
}

export function loadGameData(): GameData {
	if (typeof window === 'undefined') return { countries: {}, regions: defaultRegions() };
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return { countries: {}, regions: defaultRegions() };
	try {
		const parsed = JSON.parse(raw);
		return {
			countries: parsed.countries ?? {},
			regions: parsed.regions ?? defaultRegions()
		};
	} catch {
		return { countries: {}, regions: defaultRegions() };
	}
}

export function saveGameData(data: GameData): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getCountryState(data: GameData, code: string): CountryState | undefined {
	return data.countries[code];
}

function ensureMinBucket1(data: GameData): void {
	const allCountries = getCountryList();
	const bucket1Count = Object.entries(data.countries).filter(
		([code, c]) => c.bucket === 1 && !c.skipped && data.regions[getRegion(code)]
	).length;

	if (bucket1Count < MIN_BUCKET_1_COUNT) {
		const unseenCodes = allCountries
			.filter((c) => !data.countries[c.code] && data.regions[c.region])
			.map((c) => c.code);

		const needed = MIN_BUCKET_1_COUNT - bucket1Count;
		const toAdd = shuffle(unseenCodes).slice(0, needed);

		for (const code of toAdd) {
			data.countries[code] = { bucket: 1, stage: 0, skipped: false };
		}
	}
}

export function selectNextCountry(data: GameData): string | null {
	ensureMinBucket1(data);
	saveGameData(data);

	const eligible = Object.entries(data.countries).filter(
		([code, state]) =>
			!state.skipped &&
			state.bucket >= 1 &&
			state.bucket <= MAX_BUCKET &&
			data.regions[getRegion(code)]
	);

	if (eligible.length === 0) return null;

	const totalWeight = eligible.reduce(
		(sum, [, state]) => sum + BUCKET_WEIGHTS[state.bucket],
		0
	);

	let r = Math.random() * totalWeight;
	for (const [code, state] of eligible) {
		r -= BUCKET_WEIGHTS[state.bucket];
		if (r <= 0) return code;
	}

	return eligible[eligible.length - 1][0];
}

export function recordHit(data: GameData, code: string): void {
	const state = data.countries[code];
	if (!state) return;
	if (state.bucket < MAX_BUCKET) {
		state.bucket += 1;
	} else {
		state.bucket = 8; // retired
	}
	if (state.stage < 3) {
		state.stage += 1;
	}
	saveGameData(data);
}

export function recordMiss(data: GameData, code: string): void {
	const state = data.countries[code];
	if (!state) return;
	state.bucket = 1;
	saveGameData(data);
}

export function toggleSkip(data: GameData, code: string): void {
	if (!data.countries[code]) {
		data.countries[code] = { bucket: 1, stage: 0, skipped: true };
	} else {
		data.countries[code].skipped = !data.countries[code].skipped;
	}
	saveGameData(data);
}

export function toggleRegion(data: GameData, region: Region): void {
	data.regions[region] = !data.regions[region];
	saveGameData(data);
}

export function resetCountry(data: GameData, code: string): void {
	delete data.countries[code];
	saveGameData(data);
}

export function resetAllCountries(data: GameData): void {
	data.countries = {};
	data.regions = defaultRegions();
	saveGameData(data);
}

export function getZoomStage(data: GameData, code: string): number {
	const state = data.countries[code];
	if (!state) return 0;
	const stage = state.stage;
	if (stage === 3) {
		return Math.floor(Math.random() * 3); // random 0, 1, or 2
	}
	return stage;
}

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

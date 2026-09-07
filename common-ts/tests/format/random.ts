/** Deterministic LCG, so a failure is always reproducible from the seed. */
export function makeRandom(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};
}

/**
 * A Dev Tool to help with performance analysis.
 *
 * The stopwatch class should function as a "timer" for a variety of unique keys. Any time a caller calls the "tick" method, with a key, the stopwatch will log the time since the last tick for that key.
 */
import { logger } from './logger';

export class Stopwatch {
	private _lastTick: { [key: string]: number } = {};
	constructor() {}

	/**
	 * Logs the time since the last tick for the given key.
	 * @param key The key to log the time for.
	 */
	public tick(key: string, message?: string) {
		const now = Date.now();
		const lastTick = this._lastTick[key];
		if (lastTick) {
			logger.debug(
				`⏱️ :: ${message ? ` ${message} ` : ''} \n${key} => ${now - lastTick}ms`
			);
		}
		this._lastTick[key] = now;
	}

	blankTick(key: string) {
		const now = Date.now();
		this._lastTick[key] = now;
	}
}

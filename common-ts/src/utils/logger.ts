/** Controls which @velocity-exchange/common logs are emitted. Default: `'warn'`. */
export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
	silent: 0,
	error: 1,
	warn: 2,
	info: 3,
	debug: 4,
};

let currentLevel: LogLevel = 'warn';

/**
 * Set the minimum log level for this package.
 * Call once at app startup, e.g. `setLogLevel('silent')` in your UI entry file.
 */
export function setLogLevel(level: LogLevel): void {
	currentLevel = level;
}

/** Returns the current minimum log level. */
export function getLogLevel(): LogLevel {
	return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
	return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[currentLevel];
}

export const logger = {
	debug: (...args: unknown[]) => {
		if (shouldLog('debug')) console.debug(...args);
	},
	info: (...args: unknown[]) => {
		if (shouldLog('info')) console.info(...args);
	},
	warn: (...args: unknown[]) => {
		if (shouldLog('warn')) console.warn(...args);
	},
	error: (...args: unknown[]) => {
		if (shouldLog('error')) console.error(...args);
	},
};

import { VelocityEnv } from '@velocity-exchange/sdk';
import { ENUM_UTILS } from '.';
import { Serializer } from '../serializableTypes';
import { PnlSnapshotOrderOption, SnapshotEpochResolution } from '../types';
import { ONE_DAY_MS } from '../constants';
import { logger } from './logger';

export type DownloadFile = {
	key: string;
	requestParams: DownloadRequestParams;
	lastModifiedTs: number;
	downloadUrl?: string;
};

export type DownloadRequestParams = {
	fileType: DownloadRecordType;
	requestedDate: string;
	fromDate: string;
	toDate: string;
	user: string;
	programId: string;
	authority: string;
	isEmulationMode: boolean;
	marketSymbol?: string;
};

export type DownloadRecordType =
	| 'trades'
	| 'market-trades'
	| 'funding-rates'
	| 'funding-payments'
	| 'deposits'
	| 'liquidations'
	| 'settle-pnl-records'
	| 'if-stake-records'
	| 'swap-records'
	| 'rewards';

export type DownloadPeriod =
	| 'week'
	| 'month'
	| '3mo'
	| 'ytd'
	| 'year'
	| 'custom';

// # Redis key for download requests is the downloadRequestParams with colon delimeters.
// # Stringifies the keys alphabetically so we don't have mismatches for identical requests
export const getFileRedisKeyFromParams = (
	downloadRequestParams: DownloadRequestParams
): string => {
	return Object.keys(downloadRequestParams)
		.sort((a, b) => a.localeCompare(b))
		.map(
			(sortedKey) =>
				downloadRequestParams[sortedKey as keyof DownloadRequestParams]
		)
		.filter((val) => val !== undefined)
		.join(':');
};

// # Converts a date object into the string format used for S3 files
export const dateToS3DateString = (date: Date): string => {
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();

	return `${year}${month < 10 ? '0' + month : month}${
		day < 10 ? '0' + day : day
	}`;
};

// # Converts a string date in S3 file format into a Date object
export const s3DateStringToDate = (dateStr: string): Date => {
	return new Date(
		parseFloat(dateStr.slice(0, 4)),
		parseFloat(dateStr.slice(4, 6)) - 1,
		parseFloat(dateStr.slice(6, 8))
	);
};

// # Get the from and to dates in S3 file format for a download request
// # For custom opts, month number should be the index (ie: January is index 0)
export const getDateRangeFromSelection = (
	downloadPeriod: DownloadPeriod,
	customOpts?: { day?: number; month?: number; year: number }
): { from: string; to: string } => {
	let from: string | undefined, to: string | undefined;
	const now = new Date();

	switch (downloadPeriod) {
		case 'week':
			from = dateToS3DateString(new Date(now.getTime() - 7 * ONE_DAY_MS));
			to = dateToS3DateString(now);
			break;
		case 'month':
			from = dateToS3DateString(new Date(now.getFullYear(), now.getMonth(), 1));
			to = dateToS3DateString(now);
			break;
		case '3mo': {
			const fromDate = new Date();
			fromDate.setMonth(now.getMonth() - 3);
			from = dateToS3DateString(fromDate);
			to = dateToS3DateString(now);
			break;
		}
		case 'ytd':
			from = dateToS3DateString(new Date(now.getFullYear(), 0, 1));
			to = dateToS3DateString(now);
			break;
		case 'year':
			from = dateToS3DateString(new Date(now.getTime() - 365 * ONE_DAY_MS));
			to = dateToS3DateString(now);
			break;
		case 'custom':
			if (!customOpts || customOpts.year == undefined) {
				logger.error(
					'Requested custom date range without providing customOpts'
				);
				break;
			}

			if (customOpts.day == undefined && customOpts.month == undefined) {
				// request a full year
				from = dateToS3DateString(new Date(customOpts.year, 0, 1));
				to = dateToS3DateString(new Date(customOpts.year, 11, 31));
			} else if (
				customOpts.day == undefined &&
				customOpts.month !== undefined
			) {
				// request a month
				from = dateToS3DateString(
					new Date(customOpts.year, customOpts.month, 1)
				);

				// if December, to date should be 12/31
				if (customOpts.month === 11) {
					to = dateToS3DateString(
						new Date(customOpts.year, customOpts.month, 31)
					);
				} else {
					to = dateToS3DateString(
						new Date(customOpts.year, customOpts.month + 1, 0)
					);
				}
			} else if (
				customOpts.month !== undefined &&
				customOpts.day !== undefined
			) {
				// request a day
				from = dateToS3DateString(
					new Date(customOpts.year, customOpts.month, customOpts.day)
				);
				to = from;
			} else {
				logger.error('Requested a custom day range without providing a month');
				break;
			}
			break;
	}

	return { from: from ?? '', to: to ?? '' };
};

const getLeaderboardFilename = (
	orderBy: PnlSnapshotOrderOption,
	resolution: SnapshotEpochResolution
) => `${orderBy}_${ENUM_UTILS.toStr(resolution)}_leaderboard.json`;

export const S3_LEADERBOARD_CLIENT = {
	getFileName: (
		orderBy: PnlSnapshotOrderOption,
		resolution: SnapshotEpochResolution
	) => {
		return getLeaderboardFilename(orderBy, resolution);
	},
	getLeaderboardValue: async (
		env: VelocityEnv,
		leaderboardBucketName: string,
		orderBy: PnlSnapshotOrderOption,
		resolution: SnapshotEpochResolution
	) => {
		const leadboardLocation =
			env === 'mainnet-beta' ? 's3.eu-west-1' : 's3.us-east-1';

		const s3Url = `https://${leaderboardBucketName}.${leadboardLocation}.amazonaws.com/${getLeaderboardFilename(
			orderBy,
			resolution
		)}`;

		const result = await (await fetch(s3Url, { cache: 'no-cache' })).json();

		const deserializedResult =
			Serializer.Deserialize.UISerializableLeaderboardResult(result);

		return deserializedResult;
	},
};

const S3_BUCKET_UTILS = {
	S3_LEADERBOARD_CLIENT,
};

export default S3_BUCKET_UTILS;

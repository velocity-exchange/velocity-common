import type { CollateralEvents } from './events/collateral';
import type { TradeEvents } from './events/trade';
import type { VaultEvents } from './events/vault';
import type { IfStakingEvents } from './events/ifStaking';
import type { EarnEvents } from './events/earn';
import type { AmplifyEvents } from './events/amplify';
import type { OnboardingEvents } from './events/onboarding';
import type { SurveyEvents } from './events/survey';
import type { PnlEvents } from './events/pnl';
import type { SystemEvents } from './events/system';

/**
 * Marker type for events that require no properties.
 * We use {} rather than Record<string, never> because Record<string, never>
 * collapses optional fields to never under intersection with platform extensions.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export type NoProperties = {};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PostHogEventMap
	extends
		CollateralEvents,
		TradeEvents,
		VaultEvents,
		IfStakingEvents,
		EarnEvents,
		AmplifyEvents,
		OnboardingEvents,
		SurveyEvents,
		PnlEvents,
		SystemEvents {}

export type PostHogEvent = keyof PostHogEventMap;

/**
 * Extracts event names whose property type has no required keys (i.e., empty `{}`).
 * These events can be captured without passing a properties argument.
 */
type EmptyEventsOf<TMap extends PostHogEventMap> = {
	[K in keyof TMap]: keyof TMap[K] extends never ? K : never;
}[keyof TMap];

/**
 * Typed capture function. Overloads are ordered so that:
 * 1. Events with no properties can be called with just the event name
 * 2. Events with properties require the properties argument
 *
 * TypeScript resolves overloads top-to-bottom — the zero-argument overload
 * must come first, otherwise it would never match.
 */
export type CaptureEvent<TMap extends PostHogEventMap = PostHogEventMap> = {
	<E extends EmptyEventsOf<TMap> & string>(event: E): void;
	<E extends keyof TMap & string>(event: E, properties: TMap[E]): void;
};

/**
 * Extend the shared event map with platform-specific overrides and new events.
 *
 * @typeParam TOverrides - Properties to intersect onto existing events (use optional fields)
 * @typeParam TNew - Entirely new platform-specific events
 *
 * @example
 * ```ts
 * type WebEventMap = ExtendEventMap<
 *   { collateral_deposit_submitted: { source?: string } },
 *   { web_only_event: { detail: string } }
 * >;
 * ```
 */
export type ExtendEventMap<
	TOverrides extends Partial<Record<PostHogEvent, object>> = NoProperties,
	TNew extends Record<string, object> = NoProperties,
> = {
	[K in PostHogEvent]: K extends keyof TOverrides
		? PostHogEventMap[K] & TOverrides[K]
		: PostHogEventMap[K];
} & TNew;

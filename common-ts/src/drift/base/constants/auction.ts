export const DEFAULT_LIMIT_AUCTION_DURATION = 60;

/**
 * Default market/oracle auction duration (in slots) used when the caller does not
 * supply one. Mirrors the DLOB server's default so the network-free fallback tiers
 * (L2, vAMM) produce a non-null duration — a null/0 duration on a signed-message
 * order is rejected by the swift server with `InvalidOrderAuction`.
 */
export const DEFAULT_MARKET_AUCTION_DURATION = 20;

/**
 * The format layer renders en-US only, and never consults Intl, so a locale
 * change anywhere else in the process cannot move the separators it prints.
 */
export const DECIMAL_SEPARATOR = '.';
export const GROUP_SEPARATOR = ',';

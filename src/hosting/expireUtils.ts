import { FirebaseError } from "../error";
import { HostingOptions } from "./options";

/**
 * A regex to test for valid duration strings.
 */
export const DURATION_REGEX = /^(\d+)([hdm])$/;

/**
 * Basic durations in milliseconds.
 */
export enum Duration {
  MINUTE = 60 * 1000,
  HOUR = 60 * 60 * 1000,
  DAY = 24 * 60 * 60 * 1000,
}

const DURATIONS: { [d: string]: Duration } = {
  m: Duration.MINUTE,
  h: Duration.HOUR,
  d: Duration.DAY,
};

/**
 * The maximum TTL duration for a channel: 30 days (represented in milliseconds).
 */
export const MAX_DURATION = 30 * Duration.DAY;

/**
 * The default TTL duration for a channel: 7 days (represented in milliseconds).
 */
export const DEFAULT_DURATION = 7 * Duration.DAY;

/**
 * calculateChannelExpireTTL returns the ms duration from the provided flag.
 * This will throw an error if the duration is greater than 30d.
 * @param flag string duration (e.g. "1d").
 * @return a duration in milliseconds.
 */
export function calculateChannelExpireTTL(flag: NonNullable<HostingOptions["expires"]>): number {
  const match = DURATION_REGEX.exec(flag);
  if (!match) {
    throw new FirebaseError(
      `"expires" flag must be a duration string (e.g. 24h or 7d) at most 30d`,
    );
  }
  const d = parseInt(match[1], 10) * DURATIONS[match[2]];
  if (isNaN(d)) {
    throw new FirebaseError(`Failed to parse provided expire time "${flag}"`);
  }
  if (d > MAX_DURATION) {
    throw new FirebaseError(`"expires" flag may not be longer than 30d`);
  }
  return d;
}

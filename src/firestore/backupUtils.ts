import { FirebaseError } from "../error";
import { FirestoreOptions } from "./options";

/**
 * A regex to test for valid duration strings.
 */
export const DURATION_REGEX = /^(\d+)([hdmw])$/;

/**
 * Basic durations in seconds.
 */
export enum Duration {
  MINUTE = 60,
  HOUR = 60 * 60,
  DAY = 24 * 60 * 60,
  WEEK = 7 * 24 * 60 * 60,
}

const DURATIONS: { [d: string]: Duration } = {
  m: Duration.MINUTE,
  h: Duration.HOUR,
  d: Duration.DAY,
  w: Duration.WEEK,
};

/**
 * calculateRetention returns the duration in seconds from the provided flag.
 * @param flag string duration (e.g. "1d").
 * @return a duration in seconds.
 */
export function calculateRetention(flag: NonNullable<FirestoreOptions["retention"]>): number {
  const match = DURATION_REGEX.exec(flag);
  if (!match) {
    throw new FirebaseError(`"retention" flag must be a duration string (e.g. 24h, 2w, or 7d)`);
  }
  const d = parseInt(match[1], 10) * DURATIONS[match[2]];
  if (isNaN(d)) {
    throw new FirebaseError(`Failed to parse provided retention time "${flag}"`);
  }

  return d;
}

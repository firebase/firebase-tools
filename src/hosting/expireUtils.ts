/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { FirebaseError } from "../error";

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
export function calculateChannelExpireTTL(flag?: string): number {
  const match = DURATION_REGEX.exec(flag || "");
  if (!match) {
    throw new FirebaseError(
      `"expires" flag must be a duration string (e.g. 24h or 7d) at most 30d`
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

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

import { envOverride } from "../utils";
import { Constants } from "../emulator/constants";

/**
 * Get base URL for RealtimeDatabase. Preference order: emulator host env override, realtime URL env override, and then specified host.
 * @param options command options.
 */
export function realtimeOriginOrEmulatorOrCustomUrl(host: string): string {
  return envOverride(
    Constants.FIREBASE_DATABASE_EMULATOR_HOST,
    envOverride("FIREBASE_REALTIME_URL", host),
    addHttpIfRequired
  );
}

/**
 * Get base URL for RealtimeDatabase. Preference order: realtime URL env override, and then the specified host.
 * @param options command options.
 */
export function realtimeOriginOrCustomUrl(host: string): string {
  return envOverride("FIREBASE_REALTIME_URL", host);
}

function addHttpIfRequired(val: string) {
  if (val.startsWith("http")) {
    return val;
  }
  return `http://${val}`;
}

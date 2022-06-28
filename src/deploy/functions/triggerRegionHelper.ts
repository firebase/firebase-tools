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

import * as backend from "./backend";
import { serviceForEndpoint } from "./services";

/**
 * Ensures the trigger regions are set and correct
 * @param want the list of function specs we want to deploy
 * @param have the list of function specs we have deployed
 */
export async function ensureTriggerRegions(want: backend.Backend): Promise<void> {
  const regionLookups: Array<Promise<void>> = [];

  for (const ep of backend.allEndpoints(want)) {
    if (ep.platform === "gcfv1" || !backend.isEventTriggered(ep)) {
      continue;
    }
    regionLookups.push(serviceForEndpoint(ep).ensureTriggerRegion(ep));
  }
  await Promise.all(regionLookups);
}

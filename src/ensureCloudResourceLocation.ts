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

import { FirebaseError } from "./error";

/**
 * Simple helper function that returns an error with a helpful
 * message on event of cloud resource location that is not set.
 * This was made into its own file because this error gets thrown
 * in several places: in init for Firestore, Storage, and for scheduled
 * function deployments.
 * @param location cloud resource location, like "us-central1"
 * @throws { FirebaseError } if location is not set
 */
export function ensureLocationSet(location: string, feature: string): void {
  if (!location) {
    throw new FirebaseError(
      `Cloud resource location is not set for this project but the operation ` +
        `you are attempting to perform in ${feature} requires it. ` +
        `Please see this documentation for more details: https://firebase.google.com/docs/projects/locations`
    );
  }
}

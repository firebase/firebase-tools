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

import * as clc from "cli-color";
import { FirebaseError } from "./error";
import { getDefaultDatabaseInstance } from "./getDefaultDatabaseInstance";

/**
 * Error message to be returned when the default database instance is found to be missing.
 */
export const MISSING_DEFAULT_INSTANCE_ERROR_MESSAGE = `It looks like you haven't created a Realtime Database instance in this project before. Please run ${clc.bold.underline(
  "firebase init database"
)} to create your default Realtime Database instance.`;

/**
 * Ensures that the supplied options have an instance set. If not, tries to fetch the default instance.
 * @param options command options
 * @return void promise.
 */
export async function requireDatabaseInstance(options: any): Promise<void> {
  if (options.instance) {
    return;
  }
  let instance;
  try {
    instance = await getDefaultDatabaseInstance(options);
  } catch (err: any) {
    throw new FirebaseError(`Failed to get details for project: ${options.project}.`, {
      original: err,
    });
  }
  if (instance === "") {
    throw new FirebaseError(MISSING_DEFAULT_INSTANCE_ERROR_MESSAGE);
  }
  options.instance = instance;
}

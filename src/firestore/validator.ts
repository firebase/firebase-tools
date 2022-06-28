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
import { FirebaseError } from "../error";

/**
 * Throw an error if 'obj' does not have a value for the property 'prop'.
 */
export function assertHas(obj: any, prop: string): void {
  const objString = clc.cyan(JSON.stringify(obj));
  if (!obj[prop]) {
    throw new FirebaseError(`Must contain "${prop}": ${objString}`);
  }
}

/**
 * throw an error if 'obj' does not have a value for exactly one of the
 * properties in 'props'.
 */
export function assertHasOneOf(obj: any, props: string[]): void {
  const objString = clc.cyan(JSON.stringify(obj));
  let count = 0;
  props.forEach((prop) => {
    if (obj[prop]) {
      count++;
    }
  });

  if (count !== 1) {
    throw new FirebaseError(`Must contain exactly one of "${props.join(",")}": ${objString}`);
  }
}

/**
 * Throw an error if the value of the property 'prop' on 'obj' is not one of
 * the values in the the array 'valid'.
 */
export function assertEnum(obj: any, prop: string, valid: any[]): void {
  const objString = clc.cyan(JSON.stringify(obj));
  if (valid.indexOf(obj[prop]) < 0) {
    throw new FirebaseError(`Field "${prop}" must be one of  ${valid.join(", ")}: ${objString}`);
  }
}
